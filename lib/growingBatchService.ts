import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp, type Transaction, type DocumentReference, type DocumentSnapshot } from "firebase/firestore";
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

export async function updateGrowingBatchBeforeStart(data: {
  batch: GrowingBatch;
  harvestDate: string;
  locationId?: string;
  locationName?: string;
  notes?: string;
  items: Array<{ product: Product; trayCount: number; existingItemId?: string }>;
  uid: string;
  email?: string;
}) {
  if (!data.harvestDate) throw new Error("Harvest date is required.");
  if (data.batch.status !== "not_started" || data.batch.delivered) {
    throw new Error("Only a Not Started batch can be edited.");
  }

  const normalizedItems = data.items
    .map(row => ({ ...row, trayCount: Math.round(Number(row.trayCount || 0)) }))
    .filter(row => row.trayCount > 0);
  if (!normalizedItems.length) throw new Error("Add at least one microgreen to the batch.");

  const batchRef = doc(db, "growingBatches", data.batch.id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(batchRef);
    if (!snapshot.exists()) throw new Error("Growing batch no longer exists.");
    const latest = { id: snapshot.id, ...(snapshot.data() as Omit<GrowingBatch, "id">) };
    if (latest.status !== "not_started" || latest.delivered) {
      throw new Error("Only a Not Started batch can be edited. Refresh and try again.");
    }

    const oldByProduct = new Map((latest.items ?? []).map(item => [item.productId, item]));
    const usedIds = new Set<string>();
    const items = normalizedItems.map((row, index) => {
      const built = buildBatchItem(row.product, data.harvestDate, row.trayCount);
      const existing = row.existingItemId ? oldByProduct.get(row.product.id) : undefined;
      let itemId = existing?.id;
      if (!itemId || usedIds.has(itemId)) {
        itemId = `${latest.id}-${index + 1}`;
        let suffix = 1;
        while (usedIds.has(itemId)) itemId = `${latest.id}-${index + 1}-${suffix++}`;
      }
      usedIds.add(itemId);
      return { ...built, id: itemId };
    });
    const startDate = items.map(item => item.startDate).sort()[0] || data.harvestDate;

    transaction.update(batchRef, {
      harvestDate: data.harvestDate,
      startDate,
      locationId: data.locationId ?? "",
      locationName: data.locationName ?? "",
      notes: data.notes?.trim() || "",
      items,
      status: "not_started" as GrowingBatchStatus,
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent("update", "growingBatches", data.batch.id, `Updated Not Started growing batch ${data.batch.batchNumber}`);
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
 * Update only the sold quantity for harvested batch items.
 * This does not change product aggregate inventory or batch stock.
 */
export async function updateGrowingBatchSoldQuantity(
  batch: GrowingBatch,
  uid: string,
  email?: string,
  wasteQuantities: Record<string, number> = {},
) {
  const debug = (step: string, details: Record<string, unknown> = {}) => {
    console.error("[WASTE-DEBUG]", step, { batchId: batch?.id, batchNumber: batch?.batchNumber, ...details });
  };
  debug("START", { uid, wasteQuantities });
  if (batch.delivered || batch.status === "closed") {
    throw new Error("This batch is already closed.");
  }

  if (!batch.id) { debug("VALIDATION_FAILED", { reason: "missing batch.id" }); throw new Error("Growing batch ID is missing. Refresh and select the batch again."); }
  debug("BATCH_REF", { batchId: batch.id });
  const batchRef = doc(db, "growingBatches", batch.id);

  // Firestore Web transactions support document reads, not query reads.
  // Fetch existing waste history before starting the transaction so the
  // transaction only performs transaction-safe document reads/writes.
  debug("WASTE_HISTORY_QUERY", { growingBatchId: batch.id });
  const wasteQuery = query(
    collection(db, "inventoryAdjustments"),
    where("growingBatchId", "==", batch.id),
  );
  const wasteAdjustmentsSnapshot = await getDocs(wasteQuery);
  debug("WASTE_HISTORY_READ", { count: wasteAdjustmentsSnapshot.size });
  const cumulativeWasteByProductId = new Map<string, number>();
  wasteAdjustmentsSnapshot.forEach(adjustment => {
    const data = adjustment.data();
    if (data.isWaste === true || data.type === "batch_waste") {
      const productId = String(data.productId ?? "");
      if (productId) {
        cumulativeWasteByProductId.set(
          productId,
          (cumulativeWasteByProductId.get(productId) ?? 0) + Math.max(0, Math.round(Number(data.quantity ?? 0))),
        );
      }
    }
  });

  try {
    await runTransaction(db, async transaction => {
      debug("TRANSACTION_START", { batchRefPath: batchRef.path });
    const snapshot = await transaction.get(batchRef);
    if (!snapshot.exists()) throw new Error("Growing batch no longer exists.");
    const latest = snapshot.data() as GrowingBatch;
    if (latest.delivered || latest.status === "closed") {
      throw new Error("This batch was already closed. Refresh and try again.");
    }

    const harvestedItems = (latest.items ?? []).filter(
      item => item.status === "completed_harvested" || item.status === "failed",
    );
    if (!harvestedItems.length) throw new Error("This batch has no harvested items.");

    const invalidItem = harvestedItems.find(item => !item.id || !item.productId);
    if (invalidItem) {
      throw new Error(`${invalidItem.productName || "A batch item"} is missing its product reference. Refresh the batch and retry.`);
    }
    const productIds = [...new Set(harvestedItems.map(item => item.productId).filter((id): id is string => Boolean(id)))];
    debug("PRODUCT_IDS", { productIds, harvestedItems: harvestedItems.map(item => ({ id: item.id, productId: item.productId, productName: item.productName })) });
    if (!productIds.length) throw new Error("No product references were found for this batch. Refresh and retry.");
    const productRefs = productIds.map(id => {
      if (!id) throw new Error("Invalid empty product ID while creating Product reference.");
      const ref = doc(db, "products", id);
      debug("PRODUCT_REF", { productId: id, path: ref.path });
      return ref;
    });
    const productSnaps: DocumentSnapshot[] = [];
    for (const ref of productRefs) {
      productSnaps.push(await transaction.get(ref));
    }
    if (productSnaps.some(snap => !snap.exists())) {
      throw new Error("One or more production products no longer exist. Refresh and retry.");
    }

    const productStates = new Map(productIds.map((id, index) => [id, {
      ref: productRefs[index],
      product: productSnaps[index].data() as Product,
      previous: Number(productSnaps[index].data()?.stockGrams ?? productSnaps[index].data()?.stock ?? 0),
    }]));

    const wasteByProductId = new Map<string, number>();
    const updatedItems = (latest.items ?? []).map(item => {
      if (!harvestedItems.some(selected => selected.id === item.id)) return item;

      const harvested = Math.max(0, Math.round(Number(item.actualYieldGrams ?? 0)));
      const sold = Math.max(0, Math.round(Number(item.soldQuantityGrams ?? 0)));
      const currentStock = Math.max(0, Math.round(Number(item.batchStockGrams ?? Math.max(0, harvested - sold))));
      const enteredWaste = Number(wasteQuantities[item.id] ?? 0);

      if (!Number.isInteger(enteredWaste) || enteredWaste < 0) {
        throw new Error(`Waste adjustment for ${item.productName} must be a whole number of grams and cannot be negative.`);
      }
      if (enteredWaste > currentStock) {
        throw new Error(`${item.productName}: Waste adjustment (${enteredWaste}g) cannot exceed remaining Stock (${currentStock}g).`);
      }

      if (enteredWaste > 0) {
        wasteByProductId.set(item.productId, (wasteByProductId.get(item.productId) ?? 0) + enteredWaste);
      }

      const previousTotalWaste = cumulativeWasteByProductId.get(item.productId) ?? 0;
      const nextTotalWaste = previousTotalWaste + enteredWaste;

      return {
        ...item,
        soldQuantityGrams: sold,
        batchStockGrams: currentStock - enteredWaste,
        // Cumulative waste adjusted for this batch item.
        batchWasteGrams: nextTotalWaste,
      };
    });

    for (const [productId, enteredWaste] of wasteByProductId) {
      const state = productStates.get(productId);
      if (!state) throw new Error(`Product ${productId} is missing.`);
      const nextStock = state.previous - enteredWaste;
      if (nextStock < 0) {
        throw new Error(`${state.product.name}: this waste adjustment would make aggregate stock negative.`);
      }

      transaction.update(state.ref, {
        stockGrams: nextStock,
        stock: nextStock,
        status: nextStock === 0 && state.product.status === "active"
          ? "out_of_stock"
          : state.product.status === "out_of_stock" && nextStock > 0
            ? "active"
            : state.product.status,
        updatedAt: serverTimestamp(),
      });

      const adjustmentRef = doc(collection(db, "inventoryAdjustments"));
      const batchItemForProduct = harvestedItems.find(item => item.productId === productId);
      transaction.set(adjustmentRef, {
        productId,
        productName: state.product.name,
        type: "batch_waste",
        quantity: enteredWaste,
        unit: "g",
        previousStock: state.previous,
        newStock: nextStock,
        reason: `Waste adjusted for batch ${latest.batchNumber}.`,
        growingBatchId: batch.id,
        ...(batchItemForProduct?.id ? { growingBatchItemId: batchItemForProduct.id } : {}),
        isWaste: true,
        createdByUid: uid,
        createdByEmail: email ?? "",
        createdAt: serverTimestamp(),
      });
    }

    debug("BATCH_UPDATE", { path: batchRef.path, updatedItems: updatedItems.map(item => ({ id: item.id, productId: item.productId, stock: item.batchStockGrams, waste: item.batchWasteGrams })) });
    transaction.update(batchRef, { items: updatedItems, updatedAt: serverTimestamp() });
    debug("TRANSACTION_CALLBACK_COMPLETE");
  });
    debug("TRANSACTION_COMMITTED");
  } catch (error) {
    debug("FAILED", { errorName: error instanceof Error ? error.name : typeof error, errorMessage: error instanceof Error ? error.message : String(error), errorStack: error instanceof Error ? error.stack : undefined });
    throw error;
  }

  await auditEvent(
    "batch_reconciliation_adjustment",
    "growingBatches",
    batch.id,
    `Adjusted waste for ${batch.batchNumber}; entered waste was deducted from Product stock and recorded in Adjustment History.`,
  );
}

/**
 * Close a harvested batch from Inventory.
 * Closing reconciles each harvested item's remaining batch stock to its sold
 * quantity, then marks the batch closed. Product aggregate stock is adjusted
 * by the same delta so inventory stays consistent with the batch record.
 */
export async function closeGrowingBatchFromInventory(
  batch: GrowingBatch,
  uid: string,
  email?: string,
  _wasteQuantities: Record<string, number> = {},
) {
  if (batch.delivered || batch.status === "closed") {
    throw new Error("This batch is already closed.");
  }
  if (!batch.id) throw new Error("Growing batch ID is missing. Refresh and select the batch again.");

  const batchRef = doc(db, "growingBatches", batch.id);

  // Waste history is read outside the transaction because Firestore Web
  // transactions support document reads, not query reads. This history is
  // used only to preserve cumulative Total Waste per batch item/product.
  const wasteQuery = query(
    collection(db, "inventoryAdjustments"),
    where("growingBatchId", "==", batch.id),
  );
  const wasteHistorySnapshot = await getDocs(wasteQuery);
  const cumulativeWasteByProductId = new Map<string, number>();
  wasteHistorySnapshot.forEach(adjustment => {
    const data = adjustment.data();
    if (data.isWaste === true || data.type === "batch_waste") {
      const productId = String(data.productId ?? "");
      if (productId) {
        cumulativeWasteByProductId.set(
          productId,
          (cumulativeWasteByProductId.get(productId) ?? 0) + Math.max(0, Math.round(Number(data.quantity ?? 0))),
        );
      }
    }
  });

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(batchRef);
    if (!snapshot.exists()) throw new Error("Growing batch no longer exists.");
    const latest = snapshot.data() as GrowingBatch;
    if (latest.delivered || latest.status === "closed") {
      throw new Error("This batch was already closed. Refresh and retry.");
    }

    const harvestedItems = (latest.items ?? []).filter(
      item => item.status === "completed_harvested" || item.status === "failed",
    );
    if (!harvestedItems.length) throw new Error("This batch has no harvested items to close.");

    // Close Batch is the final reconciliation action: whatever Stock remains
    // for every harvested microgreen is automatically treated as Waste.
    const wasteByProductId = new Map<string, number>();
    const updatedItems = (latest.items ?? []).map(item => {
      if (!harvestedItems.some(selected => selected.id === item.id)) return item;

      const currentStock = Math.max(0, Math.round(Number(item.batchStockGrams ?? 0)));
      const previousWaste = cumulativeWasteByProductId.get(item.productId) ?? 0;
      const finalWaste = previousWaste + currentStock;

      if (currentStock > 0) {
        wasteByProductId.set(
          item.productId,
          (wasteByProductId.get(item.productId) ?? 0) + currentStock,
        );
      }

      return {
        ...item,
        batchStockGrams: 0,
        batchWasteGrams: finalWaste,
      };
    });

    const productIds = [...wasteByProductId.keys()];
    const productRefs = productIds.map(productId => doc(db, "products", productId));
    const productSnaps: DocumentSnapshot[] = [];
    for (const ref of productRefs) {
      productSnaps.push(await transaction.get(ref));
    }

    for (let index = 0; index < productIds.length; index += 1) {
      const productId = productIds[index];
      const productSnap = productSnaps[index];
      if (!productSnap.exists()) {
        throw new Error(`Product ${productId} no longer exists. Refresh and retry.`);
      }

      const product = productSnap.data() as Product;
      const waste = wasteByProductId.get(productId) ?? 0;
      const previousStock = Math.max(0, Math.round(Number(product.stockGrams ?? product.stock ?? 0)));
      const newStock = previousStock - waste;
      if (newStock < 0) {
        throw new Error(`${product.name}: closing this batch would make aggregate stock negative.`);
      }

      transaction.update(productRefs[index], {
        stockGrams: newStock,
        stock: newStock,
        status: newStock === 0 && product.status === "active"
          ? "out_of_stock"
          : product.status === "out_of_stock" && newStock > 0
            ? "active"
            : product.status,
        updatedAt: serverTimestamp(),
      });

      const adjustmentRef = doc(collection(db, "inventoryAdjustments"));
      transaction.set(adjustmentRef, {
        productId,
        productName: product.name,
        type: "batch_waste",
        quantity: waste,
        unit: "g",
        previousStock,
        newStock,
        reason: `Remaining stock automatically adjusted as waste while closing batch ${latest.batchNumber}.`,
        growingBatchId: batch.id,
        isWaste: true,
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
      delivered: true,
      deliveredAt: serverTimestamp(),
      deliveredByUid: uid,
      deliveredByEmail: email ?? "",
      status: "closed" as GrowingBatchStatus,
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent(
    "batch_close",
    "growingBatches",
    batch.id,
    `Closed batch ${batch.batchNumber}; all remaining batch stock was automatically adjusted as waste.`,
  );
}

export async function recordBatchHandoverSalesInTransaction(
  transaction: Transaction,
  fulfilmentRefs: DocumentReference[],
  uid: string,
  email?: string,
) {
  if (!fulfilmentRefs.length) return { updatedBatchIds: [] as string[], closedBatchIds: [] as string[] };

  const fulfilmentSnapshots = await Promise.all(fulfilmentRefs.map(ref => transaction.get(ref)));
  const allocationsByBatch = new Map<string, Map<string, number>>();
  const batchIds = new Set<string>();
  const recordableFulfilments: { ref: DocumentReference; index: number }[] = [];

  fulfilmentSnapshots.forEach((snapshot, index) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data() as { allocations?: Array<{ growingBatchId?: string; growingBatchItemId?: string; quantityGrams?: number }>; soldQuantityRecordedAt?: unknown };
    if (data.soldQuantityRecordedAt) return;
    recordableFulfilments.push({ ref: fulfilmentRefs[index], index });
    for (const allocation of data.allocations ?? []) {
      if (!allocation.growingBatchId || !allocation.growingBatchItemId) continue;
      const qty = Math.max(0, Math.round(Number(allocation.quantityGrams ?? 0)));
      if (!qty) continue;
      batchIds.add(allocation.growingBatchId);
      const itemMap = allocationsByBatch.get(allocation.growingBatchId) ?? new Map<string, number>();
      itemMap.set(allocation.growingBatchItemId, (itemMap.get(allocation.growingBatchItemId) ?? 0) + qty);
      allocationsByBatch.set(allocation.growingBatchId, itemMap);
    }
  });

  if (!batchIds.size) {
    for (const { ref } of recordableFulfilments) {
      transaction.update(ref, { soldQuantityRecordedAt: serverTimestamp(), soldQuantityRecordedByUid: uid, soldQuantityRecordedByEmail: email ?? "", updatedAt: serverTimestamp() });
    }
    return { updatedBatchIds: [] as string[], closedBatchIds: [] as string[] };
  }

  const batchRefs = [...batchIds].map(id => doc(db, "growingBatches", id));
  const batchSnapshots = await Promise.all(batchRefs.map(ref => transaction.get(ref)));
  const latestBatches = new Map<string, GrowingBatch>();
  batchSnapshots.forEach(snapshot => {
    if (snapshot.exists()) latestBatches.set(snapshot.id, { id: snapshot.id, ...(snapshot.data() as Omit<GrowingBatch, "id">) });
  });

  const updatedBatchStates = new Map<string, GrowingBatch>();
  const updatedBatchIds: string[] = [];
  const closedBatchIds: string[] = [];

  for (const [batchId, itemMap] of allocationsByBatch) {
    const batch = latestBatches.get(batchId);
    if (!batch || batch.delivered || batch.status === "closed") continue;
    const updatedItems = (batch.items ?? []).map(item => {
      const sold = Math.max(0, Math.round(Number(item.soldQuantityGrams ?? 0)));
      const add = itemMap.get(item.id) ?? 0;
      return add > 0 ? { ...item, soldQuantityGrams: sold + add } : item;
    });
    const updatedBatch = { ...batch, items: updatedItems };
    updatedBatchStates.set(batchId, updatedBatch);
    updatedBatchIds.push(batchId);
    transaction.update(doc(db, "growingBatches", batchId), { items: updatedItems, updatedAt: serverTimestamp() });
  }

  for (const [batchId, batch] of updatedBatchStates) {
    const canAutoClose = batch.items.length > 0 && batch.items.every(item => {
      const planned = Number(item.expectedYieldGrams ?? 0);
      const sold = Number(item.soldQuantityGrams ?? 0);
      return Number.isFinite(planned) && planned > 0 && sold >= planned;
    });
    if (canAutoClose) {
      transaction.update(doc(db, "growingBatches", batchId), {
        status: "closed" as GrowingBatchStatus,
        delivered: true,
        deliveredAt: serverTimestamp(),
        deliveredByUid: uid,
        deliveredByEmail: email ?? "",
        updatedAt: serverTimestamp(),
      });
      closedBatchIds.push(batchId);
    }
  }

  for (const { ref } of recordableFulfilments) {
    transaction.update(ref, {
      soldQuantityRecordedAt: serverTimestamp(),
      soldQuantityRecordedByUid: uid,
      soldQuantityRecordedByEmail: email ?? "",
      updatedAt: serverTimestamp(),
    });
  }

  return { updatedBatchIds, closedBatchIds };
}

export async function recordBatchHandoverSales(
  fulfilmentIds: string[],
  uid: string,
  email?: string,
) {
  if (!fulfilmentIds.length) return { updatedBatchIds: [] as string[], closedBatchIds: [] as string[] };
  const fulfilmentRefs = fulfilmentIds.map(id => doc(db, "fulfilments", id));
  const result = { updatedBatchIds: [] as string[], closedBatchIds: [] as string[] };
  await runTransaction(db, async transaction => {
    const updated = await recordBatchHandoverSalesInTransaction(transaction, fulfilmentRefs, uid, email);
    result.updatedBatchIds.push(...updated.updatedBatchIds);
    result.closedBatchIds.push(...updated.closedBatchIds);
  });
  for (const batchId of result.updatedBatchIds) await auditEvent("batch_handover_sales", "growingBatches", batchId, `Updated sold quantity from handover for batch ${batchId}`);
  for (const batchId of result.closedBatchIds) await auditEvent("batch_auto_close", "growingBatches", batchId, `Automatically closed batch ${batchId} after sold quantity reached planned quantity`);
  return result;
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
