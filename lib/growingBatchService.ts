import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { auditEvent } from "./firestore";
import type { Product } from "@/types/catalog";
import type {
  GrowingBatch,
  GrowingBatchItem,
  GrowingBatchPhaseStatus,
  GrowingBatchStatus,
} from "@/types/growingBatch";

function dateFromValue(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

export function addDays(date: string, days: number) {
  const d = dateFromValue(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function phaseDays(product: Product, phaseName: string) {
  const phase = product.growingPhases?.find(p =>
    p.phase.toLowerCase().replace(/[^a-z]/g, "") === phaseName.toLowerCase().replace(/[^a-z]/g, "")
  );
  return Math.max(0, Math.round(Number(phase?.noOfDays ?? 0)));
}

export function calculateGrowingPhaseDates(product: Product, harvestDate: string) {
  const lightDays = phaseDays(product, "Light Period");
  const darkDays = phaseDays(product, "Dark Period");
  const soakingDays = product.soakingRequired === false ? 0 : phaseDays(product, "Soaking");

  const lightStart = addDays(harvestDate, -lightDays);
  const darkStart = addDays(lightStart, -darkDays);
  const soakingStart = addDays(darkStart, -soakingDays);
  const soakingApplicable = product.soakingRequired !== false;

  return {
    soaking: { date: soakingStart, status: (soakingApplicable ? "not_started" : "na") as GrowingBatchPhaseStatus },
    darkPeriod: { date: darkStart, status: "not_started" as GrowingBatchPhaseStatus },
    lightPeriod: { date: lightStart, status: "not_started" as GrowingBatchPhaseStatus },
    startDate: soakingApplicable ? soakingStart : darkStart,
  };
}

export function buildBatchItem(product: Product, harvestDate: string, trayCount: number): Omit<GrowingBatchItem, "id"> {
  const trays = Math.max(1, Math.round(trayCount));
  const cycle = Math.max(1, Math.round(Number(product.growingCycleDays ?? 0)));
  const yieldPerTray = Math.max(0, Math.round(Number(product.expectedYieldGramsPerTray ?? product.expectedYieldGramsPerBatch ?? 0)));
  const minPerTray = Math.max(0, Math.round(Number(product.minimumYieldGramsPerTray ?? product.minimumBatchYieldGrams ?? 0)));
  const lossPerTray = Math.max(0, Math.round(Number(product.expectedLossGramsPerTray ?? 0)));
  const expected = yieldPerTray * trays;
  const loss = lossPerTray * trays;
  const phases = calculateGrowingPhaseDates(product, harvestDate);

  return {
    productId: product.id,
    productName: product.name,
    trayCount: trays,
    startDate: phases.startDate,
    growingCycleDays: cycle,
    expectedReadyDate: harvestDate,
    expectedYieldGramsPerTray: yieldPerTray,
    minimumYieldGramsPerTray: minPerTray,
    expectedLossGramsPerTray: lossPerTray,
    expectedYieldGrams: expected,
    expectedLossGrams: loss,
    expectedUsableYieldGrams: Math.max(0, expected - loss),
    phases: {
      soaking: phases.soaking,
      darkPeriod: phases.darkPeriod,
      lightPeriod: phases.lightPeriod,
    },
    status: "not_started",
  };
}

export async function createGrowingBatch(data: {
  batchNumber: string;
  harvestDate: string;
  startDate?: string;
  locationId?: string;
  locationName?: string;
  notes?: string;
  items: Omit<GrowingBatchItem, "id">[];
  uid: string;
  email?: string;
}) {
  if (!data.batchNumber.trim()) throw new Error("Batch number is required.");
  if (!data.harvestDate) throw new Error("Harvest date is required.");
  if (!data.items.length) throw new Error("Add at least one microgreen to the batch.");

  const ref = doc(collection(db, "growingBatches"));
  const items = data.items.map((item, index) => ({ ...item, id: `${ref.id}-${index + 1}` }));
  const startDate = data.startDate || items.map(i => i.startDate).sort()[0] || data.harvestDate;

  await runTransaction(db, async transaction => {
    transaction.set(ref, {
      batchNumber: data.batchNumber.trim(),
      startDate,
      harvestDate: data.harvestDate,
      locationId: data.locationId ?? "",
      locationName: data.locationName ?? "",
      notes: data.notes?.trim() || "",
      status: "not_started" as GrowingBatchStatus,
      items,
      createdByUid: data.uid,
      createdByEmail: data.email ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent("create", "growingBatches", ref.id, `Created growing batch ${data.batchNumber.trim()}`);
  return ref.id;
}

const phaseKeys = ["soaking", "darkPeriod", "lightPeriod"] as const;
type PhaseKey = typeof phaseKeys[number];

function phaseStatus(item: GrowingBatchItem, key: PhaseKey) {
  return item.phases?.[key]?.status ?? "not_started";
}

function previousApplicablePhase(item: GrowingBatchItem, key: PhaseKey): PhaseKey | null {
  const index = phaseKeys.indexOf(key);
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = phaseKeys[i];
    if (phaseStatus(item, candidate) !== "na") return candidate;
  }
  return null;
}

function canStartPhase(item: GrowingBatchItem, key: PhaseKey) {
  if (phaseStatus(item, key) !== "not_started") return false;
  const previous = previousApplicablePhase(item, key);
  return !previous || phaseStatus(item, previous) === "completed";
}

function phaseDateStamp(date = new Date()) {
  return date.toISOString();
}

export async function startGrowingBatchItemPhase(
  batch: GrowingBatch,
  itemId: string,
  phaseKey: PhaseKey,
  uid: string,
  email?: string,
) {
  const batchRef = doc(db, "growingBatches", batch.id);

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(batchRef);
    if (!snap.exists()) throw new Error("Growing batch no longer exists.");
    const latest = snap.data() as GrowingBatch;
    const item = latest.items.find(x => x.id === itemId);
    if (!item) throw new Error("Batch microgreen no longer exists.");
    if (item.status === "completed_harvested") throw new Error("This microgreen has already been harvested.");
    if (phaseStatus(item, phaseKey) === "na") throw new Error("This phase is not applicable.");
    if (!canStartPhase(item, phaseKey)) {
      throw new Error("Complete the previous growing phase before starting this phase.");
    }

    const phases = {
      soaking: { ...(item.phases?.soaking ?? { status: "not_started" as GrowingBatchPhaseStatus }) },
      darkPeriod: { ...(item.phases?.darkPeriod ?? { status: "not_started" as GrowingBatchPhaseStatus }) },
      lightPeriod: { ...(item.phases?.lightPeriod ?? { status: "not_started" as GrowingBatchPhaseStatus }) },
    };
    phases[phaseKey] = {
      ...phases[phaseKey],
      status: "in_progress",
      startedAt: phaseDateStamp(),
    };

    transaction.update(batchRef, {
      items: latest.items.map(x => x.id === itemId
        ? { ...x, phases, status: "in_progress" as const }
        : x
      ),
      status: "in_progress" as GrowingBatchStatus,
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent("phase_start", "growingBatches", batch.id, `Started ${phaseKey} for batch item ${itemId}`);
}

export async function completeGrowingBatchItemPhase(
  batch: GrowingBatch,
  itemId: string,
  phaseKey: PhaseKey,
  uid: string,
  email?: string,
) {
  const batchRef = doc(db, "growingBatches", batch.id);

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(batchRef);
    if (!snap.exists()) throw new Error("Growing batch no longer exists.");
    const latest = snap.data() as GrowingBatch;
    const item = latest.items.find(x => x.id === itemId);
    if (!item) throw new Error("Batch microgreen no longer exists.");
    if (item.status === "completed_harvested") throw new Error("This microgreen has already been harvested.");
    if (phaseStatus(item, phaseKey) !== "in_progress") {
      throw new Error("Start this phase before completing it.");
    }

    const phases = {
      soaking: { ...(item.phases?.soaking ?? { status: "not_started" as GrowingBatchPhaseStatus }) },
      darkPeriod: { ...(item.phases?.darkPeriod ?? { status: "not_started" as GrowingBatchPhaseStatus }) },
      lightPeriod: { ...(item.phases?.lightPeriod ?? { status: "not_started" as GrowingBatchPhaseStatus }) },
    };
    phases[phaseKey] = {
      ...phases[phaseKey],
      status: "completed",
      endedAt: phaseDateStamp(),
    };

    transaction.update(batchRef, {
      items: latest.items.map(x => x.id === itemId ? { ...x, phases } : x),
      status: "in_progress" as GrowingBatchStatus,
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent("phase_complete", "growingBatches", batch.id, `Completed ${phaseKey} for batch item ${itemId}`);
}

/**
 * Legacy single-step phase action retained for compatibility with older callers.
 * New UI uses explicit Start and End actions.
 */
export async function advanceGrowingBatchItemPhase(
  batch: GrowingBatch,
  itemId: string,
  uid: string,
  email?: string,
) {
  const item = batch.items.find(x => x.id === itemId);
  if (!item) throw new Error("Batch microgreen no longer exists.");
  const key = phaseKeys.find(candidate => phaseStatus(item, candidate) !== "na" && phaseStatus(item, candidate) !== "completed");
  if (!key) throw new Error("All growing phases are already complete. Harvest this microgreen.");
  if (phaseStatus(item, key) === "not_started") {
    await startGrowingBatchItemPhase(batch, itemId, key, uid, email);
  } else {
    await completeGrowingBatchItemPhase(batch, itemId, key, uid, email);
  }
}

export async function harvestGrowingBatch(
  batch: GrowingBatch,
  actualHarvestByItemId: Record<string, number>,
  uid: string,
  email?: string,
) {
  const batchRef = doc(db, "growingBatches", batch.id);
  const items = batch.items ?? [];
  if (!items.length) throw new Error("This batch has no microgreens to harvest.");

  for (const item of items) {
    if (item.status === "completed_harvested") throw new Error(`${item.productName} has already been harvested.`);
    const phases = item.phases;
    if (!phases || (phases.soaking.status !== "na" && phases.soaking.status !== "completed") || phases.darkPeriod.status !== "completed" || phases.lightPeriod.status !== "completed") {
      throw new Error(`Complete all applicable growing phases for ${item.productName} before harvesting.`);
    }
    const actual = Number(actualHarvestByItemId[item.id]);
    if (!Number.isInteger(actual) || actual < 0) {
      throw new Error(`Actual harvested quantity for ${item.productName} must be a whole number of grams.`);
    }
    const expected = Number(item.expectedYieldGrams ?? 0);
    if (actual > expected) {
      throw new Error(`Actual harvested quantity for ${item.productName} cannot be greater than Expected (${expected.toLocaleString()} gms).`);
    }
  }

  await runTransaction(db, async transaction => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error("Growing batch no longer exists.");
    const latest = batchSnap.data() as GrowingBatch;
    const latestItems = latest.items ?? [];
    const productIds = [...new Set(latestItems.map(item => item.productId))];
    const productRefs = productIds.map(id => doc(db, "products", id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    if (productSnaps.some(snap => !snap.exists())) throw new Error("One or more production products no longer exist. Refresh and retry.");

    const productStates = new Map(productIds.map((id, index) => {
      const product = productSnaps[index].data() as Product;
      return [id, {
        ref: productRefs[index],
        product,
        previousStock: Number(product.stockGrams ?? product.stock ?? 0),
        added: 0,
      }];
    }));

    const updatedItems = latestItems.map(item => {
      const actualHarvested = Number(actualHarvestByItemId[item.id]);
      const expected = Number(item.expectedYieldGrams ?? 0);
      // Expected is the planned quantity before loss. Actual Harvested is the
      // final usable quantity entered by the admin. Loss is the difference.
      const loss = Math.max(0, expected - actualHarvested);
      const actualUsable = actualHarvested;
      const state = productStates.get(item.productId);
      if (!state) throw new Error(`Product ${item.productName} is missing.`);
      state.added += actualUsable;
      return {
        ...item,
        actualReadyDate: latest.harvestDate || item.expectedReadyDate,
        actualHarvestGrams: actualHarvested,
        actualYieldGrams: actualUsable,
        wastageGrams: loss,
        status: "completed_harvested" as const,
      };
    });

    for (const [productId, state] of productStates.entries()) {
      const newStock = state.previousStock + state.added;
      transaction.update(state.ref, {
        stockGrams: newStock,
        stock: newStock,
        status: state.product.status === "out_of_stock" && newStock > 0 ? "active" : state.product.status,
        updatedAt: serverTimestamp(),
      });
      const adjustmentRef = doc(collection(db, "inventoryAdjustments"));
      transaction.set(adjustmentRef, {
        // Firestore product documents do not necessarily store their document id
        // inside the document. Use the product document id used for this state.
        productId,
        productName: state.product.name,
        type: "harvest",
        quantity: state.added,
        unit: "g",
        previousStock: state.previousStock,
        newStock,
        reason: `Harvested ${latest.batchNumber}`,
        growingBatchId: batch.id,
        createdByUid: uid,
        createdByEmail: email ?? "",
        createdAt: serverTimestamp(),
      });
    }

    transaction.update(batchRef, {
      items: updatedItems,
      status: "completed_harvested" as GrowingBatchStatus,
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent("harvest", "growingBatches", batch.id, `Completed harvest for ${batch.batchNumber}`);
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
  if (batchItem.status === "completed_harvested" || batchItem.status === "failed") throw new Error("This batch item cannot be harvested.");
  if (batchItem.phases?.lightPeriod?.status !== "completed") {
    throw new Error("Complete the Light Period before harvesting.");
  }
  const productRef=doc(db,"products",batchItem.productId), batchRef=doc(db,"growingBatches",batch.id);
  const adjustmentRef=doc(collection(db,"inventoryAdjustments"));
  await runTransaction(db,async transaction=>{
    const [productSnap,batchSnap]=await Promise.all([transaction.get(productRef),transaction.get(batchRef)]);
    if(!productSnap.exists()) throw new Error(`Product "${batchItem.productName}" no longer exists.`);
    if(!batchSnap.exists()) throw new Error("Growing batch no longer exists.");
    const product=productSnap.data() as Product, latest=batchSnap.data() as GrowingBatch;
    const latestItem=latest.items.find(x=>x.id===itemId);
    if (!latestItem || latestItem.status === "completed_harvested" || latestItem.status === "failed") throw new Error("This batch item was already processed.");
    if (latestItem.phases?.lightPeriod?.status !== "completed") throw new Error("Complete the Light Period before harvesting.");
    const previousStock=Number(product.stockGrams??product.stock??0), newStock=previousStock+netUsableYieldGrams;
    const updatedItems = latest.items.map(x => x.id === itemId
      ? {
          ...x,
          actualReadyDate,
          actualHarvestGrams: actualYieldGrams,
          actualYieldGrams: netUsableYieldGrams,
          wastageGrams,
          notes: notes?.trim() || x.notes || "",
          status: "completed_harvested" as const,
          phases: x.phases
            ? { ...x.phases, lightPeriod: { ...x.phases.lightPeriod, status: "completed" as const } }
            : x.phases,
        }
      : x
    );
    const allHarvested = updatedItems.every(x => x.status === "completed_harvested" || x.status === "failed");
    const anyStarted = updatedItems.some(x => x.status === "in_progress" || x.status === "completed_harvested");
    const batchStatus: GrowingBatchStatus = allHarvested
      ? "completed_harvested"
      : anyStarted
        ? "in_progress"
        : "not_started";
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

  const selectedItems = (batch.items ?? []).filter(item => item.status === "completed_harvested" || item.status === "failed");
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
      status: "closed" as GrowingBatchStatus,
      deliveredAt: serverTimestamp(),
      deliveredByUid: uid,
      deliveredByEmail: email ?? "",
      updatedAt: serverTimestamp(),
    });
  });
  await auditEvent("batch_delivered", "growingBatches", batch.id, `Marked batch ${batch.batchNumber} as delivered`);
}
