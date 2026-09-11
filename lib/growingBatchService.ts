import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { auditEvent } from "./firestore";
import type { Product } from "@/types/catalog";
import type { GrowingBatch, GrowingBatchItem, GrowingBatchStatus } from "@/types/growingBatch";

function dateFromValue(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}
export function addDays(date: string, days: number) {
  const d = dateFromValue(date); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10);
}
export function buildBatchItem(product: Product, startDate: string, trayCount: number): Omit<GrowingBatchItem,"id"> {
  const trays=Math.max(1,Math.round(trayCount));
  const cycle=Math.max(1,Math.round(Number(product.growingCycleDays??0)));
  const yieldPerTray=Math.max(0,Math.round(Number(product.expectedYieldGramsPerTray??product.expectedYieldGramsPerBatch??0)));
  const minPerTray=Math.max(0,Math.round(Number(product.minimumYieldGramsPerTray??product.minimumBatchYieldGrams??0)));
  const lossPerTray=Math.max(0,Math.round(Number(product.expectedLossGramsPerTray??0)));
  const expected=yieldPerTray*trays, loss=lossPerTray*trays;
  return {
    productId:product.id, productName:product.name, trayCount:trays, startDate,
    growingCycleDays:cycle, expectedReadyDate:addDays(startDate,cycle),
    expectedYieldGramsPerTray:yieldPerTray, minimumYieldGramsPerTray:minPerTray,
    expectedLossGramsPerTray:lossPerTray, expectedYieldGrams:expected,
    expectedLossGrams:loss, expectedUsableYieldGrams:Math.max(0,expected-loss),
    status:"growing",
  };
}
export async function createGrowingBatch(data:{
  batchNumber:string; startDate:string; locationId?:string; locationName?:string; notes?:string;
  items:Omit<GrowingBatchItem,"id">[]; uid:string; email?:string;
}) {
  if(!data.batchNumber.trim()) throw new Error("Batch number is required.");
  if(!data.items.length) throw new Error("Add at least one product to the batch.");
  const ref=doc(collection(db,"growingBatches"));
  const items=data.items.map((item,index)=>({...item,id:`${ref.id}-${index+1}`}));
  await runTransaction(db,async transaction=>{
    transaction.set(ref,{
      batchNumber:data.batchNumber.trim(),startDate:data.startDate,
      locationId:data.locationId??"",locationName:data.locationName??"",
      notes:data.notes?.trim()||"",status:"growing" as GrowingBatchStatus,items,
      createdByUid:data.uid,createdByEmail:data.email??"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
  });
  await auditEvent("create", "growingBatches", ref.id, `Created growing batch ${data.batchNumber.trim()}`);
  return ref.id;
}
export async function harvestGrowingBatchItem(
  batch:GrowingBatch,itemId:string,actualYieldGrams:number,actualReadyDate:string,
  wastageGrams:number,notes:string|undefined,uid:string,email?:string
){
  if(!Number.isInteger(actualYieldGrams)||actualYieldGrams<0) throw new Error("Actual harvest must be a whole number of grams.");
  if(!Number.isInteger(wastageGrams)||wastageGrams<0) throw new Error("Actual loss must be a whole number of grams.");
  if(wastageGrams>actualYieldGrams) throw new Error("Actual loss cannot be greater than the harvested quantity.");
  const netUsableYieldGrams=actualYieldGrams-wastageGrams;
  const batchItem=batch.items.find(x=>x.id===itemId);
  if(!batchItem) throw new Error("Batch item no longer exists.");
  if(["harvested","failed"].includes(batchItem.status)) throw new Error("This batch item cannot be harvested.");
  const productRef=doc(db,"products",batchItem.productId), batchRef=doc(db,"growingBatches",batch.id);
  const adjustmentRef=doc(collection(db,"inventoryAdjustments"));
  await runTransaction(db,async transaction=>{
    const [productSnap,batchSnap]=await Promise.all([transaction.get(productRef),transaction.get(batchRef)]);
    if(!productSnap.exists()) throw new Error(`Product "${batchItem.productName}" no longer exists.`);
    if(!batchSnap.exists()) throw new Error("Growing batch no longer exists.");
    const product=productSnap.data() as Product, latest=batchSnap.data() as GrowingBatch;
    const latestItem=latest.items.find(x=>x.id===itemId);
    if(!latestItem||["harvested","failed"].includes(latestItem.status)) throw new Error("This batch item was already processed.");
    const previousStock=Number(product.stockGrams??product.stock??0), newStock=previousStock+netUsableYieldGrams;
    const updatedItems=latest.items.map(x=>x.id===itemId?{...x,actualReadyDate,actualHarvestGrams:actualYieldGrams,actualYieldGrams:netUsableYieldGrams,wastageGrams,notes:notes?.trim()||x.notes||"",status:"harvested" as const}:x);
    const statuses=updatedItems.map(x=>x.status);
    const batchStatus:GrowingBatchStatus=statuses.every(x=>x==="harvested"||x==="failed")?"completed":statuses.some(x=>x==="harvested")?"partially_harvested":latest.status;
    transaction.update(productRef,{stockGrams:newStock,stock:newStock,status:product.status==="out_of_stock"&&newStock>0?"active":product.status,updatedAt:serverTimestamp()});
    transaction.update(batchRef,{items:updatedItems,status:batchStatus,updatedAt:serverTimestamp()});
    transaction.set(adjustmentRef,{productId:batchItem.productId,productName:batchItem.productName,type:"harvest",quantity:netUsableYieldGrams,unit:"g",previousStock,newStock,actualHarvestGrams:actualYieldGrams,wastageGrams,reason:`Harvested ${latest.batchNumber}`,growingBatchId:batch.id,growingBatchItemId:itemId,createdByUid:uid,createdByEmail:email??"",createdAt:serverTimestamp()});
  });
  await auditEvent("harvest", "growingBatches", batch.id, `Harvested ${batchItem.productName}: ${netUsableYieldGrams} g usable`);
}


/**
 * Reconcile a harvested batch into batch-wise stock.
 * Harvest already adds the actual usable grams to the product's aggregate stock.
 * This operation therefore applies only the difference between the harvested
 * quantity and the admin's final batch stock quantity, then marks the batch
 * as adjusted so it no longer appears in the Inventory batch selector.
 */
export async function adjustGrowingBatchStock(
  batch: GrowingBatch,
  quantities: Record<string, number>,
  uid: string,
  email?: string,
) {
  if (batch.stockAdjusted) throw new Error("This batch has already been adjusted in batch-wise stock.");
  if (batch.delivered) throw new Error("This batch has already been marked as delivered.");

  const selectedItems = (batch.items ?? []).filter(item => item.status === "harvested" || item.status === "failed");
  if (!selectedItems.length) throw new Error("This batch has no harvested items to add to batch-wise stock.");

  for (const item of selectedItems) {
    const value = Number(quantities[item.id] ?? 0);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Stock quantity for ${item.productName} must be a whole number of grams and cannot be negative.`);
    }
  }

  const batchRef = doc(db, "growingBatches", batch.id);
  await runTransaction(db, async transaction => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error("Growing batch no longer exists.");
    const latest = batchSnap.data() as GrowingBatch;
    if (latest.stockAdjusted) throw new Error("This batch was already adjusted. Refresh and try again.");
    if (latest.delivered) throw new Error("This batch has already been marked as delivered.");

    const latestItems = latest.items ?? [];
    const productIds = [...new Set(selectedItems.map(item => item.productId))];
    const productRefs = productIds.map(id => doc(db, "products", id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    if (productSnaps.some(snap => !snap.exists())) throw new Error("One or more production products no longer exist. Refresh and retry.");

    const productStates = new Map(productIds.map((id, index) => [id, {
      ref: productRefs[index],
      product: productSnaps[index].data() as Product,
      previous: Number(productSnaps[index].data()?.stockGrams ?? productSnaps[index].data()?.stock ?? 0),
    }]));

    const updatedItems = latestItems.map(item => {
      if (!selectedItems.some(selected => selected.id === item.id)) return item;
      const desired = Number(quantities[item.id] ?? 0);
      return { ...item, batchStockGrams: desired };
    });

    for (const item of selectedItems) {
      const state = productStates.get(item.productId);
      if (!state) throw new Error(`Product ${item.productName} is missing.`);
      const harvestedContribution = Number(item.actualYieldGrams ?? 0);
      const desiredContribution = Number(quantities[item.id] ?? 0);
      const delta = desiredContribution - harvestedContribution;
      const nextStock = state.previous + delta;
      if (nextStock < 0) {
        throw new Error(`${item.productName}: aggregate stock would become negative. Current stock is ${state.previous.toLocaleString()}g, while this batch adjustment removes ${Math.abs(delta).toLocaleString()}g.`);
      }
      state.previous = nextStock;
    }

    // Apply each product's final aggregate stock once, even when a batch contains
    // multiple items for the same production product.
    for (const state of productStates.values()) {
      const current = state.product;
      const nextStock = state.previous;
      transaction.update(state.ref, {
        stockGrams: nextStock,
        stock: nextStock,
        status: nextStock === 0 && current.status === "active"
          ? "out_of_stock"
          : current.status === "out_of_stock" && nextStock > 0
            ? "active"
            : current.status,
        updatedAt: serverTimestamp(),
      });
      const adjustmentRef = doc(collection(db, "inventoryAdjustments"));
      const productItems = selectedItems.filter(item => item.productId === current.id);
      const detail = productItems.map(item => `${item.productName}: ${Number(quantities[item.id] ?? 0)}g`).join(", ");
      transaction.set(adjustmentRef, {
        productId: current.id,
        productName: current.name,
        type: "batch_stock",
        quantity: productItems.reduce((sum, item) => sum + Number(quantities[item.id] ?? 0), 0),
        unit: "g",
        previousStock: nextStock - productItems.reduce((sum, item) => sum + (Number(quantities[item.id] ?? 0) - Number(item.actualYieldGrams ?? 0)), 0),
        newStock: nextStock,
        reason: `Batch-wise stock reconciliation: ${latest.batchNumber} (${detail})`,
        growingBatchId: batch.id,
        createdByUid: uid,
        createdByEmail: email ?? "",
        createdAt: serverTimestamp(),
      });
    }

    transaction.update(batchRef, {
      items: updatedItems,
      stockAdjusted: true,
      stockAdjustedAt: serverTimestamp(),
      stockAdjustedByUid: uid,
      stockAdjustedByEmail: email ?? "",
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent("batch_stock_adjustment", "growingBatches", batch.id, `Batch-wise stock reconciled for ${batch.batchNumber}`);
}

export async function markGrowingBatchDelivered(
  batch: GrowingBatch,
  uid: string,
  email?: string,
) {
  if (batch.delivered) throw new Error("This batch is already marked as delivered.");
  const batchRef = doc(db, "growingBatches", batch.id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(batchRef);
    if (!snapshot.exists()) throw new Error("Growing batch no longer exists.");
    const latest = snapshot.data() as GrowingBatch;
    if (latest.delivered) throw new Error("This batch is already marked as delivered.");
    transaction.update(batchRef, {
      delivered: true,
      deliveredAt: serverTimestamp(),
      deliveredByUid: uid,
      deliveredByEmail: email ?? "",
      updatedAt: serverTimestamp(),
    });
  });
  await auditEvent("batch_delivered", "growingBatches", batch.id, `Marked batch ${batch.batchNumber} as delivered`);
}
