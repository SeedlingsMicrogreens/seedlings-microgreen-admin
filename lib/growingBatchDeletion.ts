import type { GrowingBatch, GrowingBatchItem } from "@/types/growingBatch";
export type GrowingBatchDeletionDependencies = {
  inventoryAdjustmentCount: number;
  fulfilmentAllocationCount: number;
};

function hasStartedPhase(item: GrowingBatchItem) {
  return Object.values(item.phases ?? {}).some(phase =>
    phase.status === "in_progress" ||
    phase.status === "completed" ||
    Boolean(phase.startedAt) ||
    Boolean(phase.endedAt)
  );
}

function hasOperationalBatchItemData(item: GrowingBatchItem) {
  return item.status !== "not_started" ||
    hasStartedPhase(item) ||
    item.actualReadyDate !== undefined ||
    item.actualHarvestGrams !== undefined ||
    item.actualYieldGrams !== undefined ||
    item.wastageGrams !== undefined ||
    item.batchStockGrams !== undefined ||
    item.batchWasteGrams !== undefined ||
    Math.max(0, Math.round(Number(item.soldQuantityGrams ?? 0))) > 0;
}

export function validateGrowingBatchCanBeDeleted(
  batch: Omit<GrowingBatch, "status"> & { status: string },
  dependencies: GrowingBatchDeletionDependencies = { inventoryAdjustmentCount: 0, fulfilmentAllocationCount: 0 },
) {
  const status = batch.status as string;
  const isNotStarted = status === "not_started" || status === "planned";
  if (!isNotStarted || batch.delivered) {
    throw new Error("Only a Not Started batch can be deleted.");
  }
  if (batch.stockAdjusted || batch.stockAdjustedAt || batch.closedAt || batch.deliveredAt) {
    throw new Error("This batch has operational history and cannot be deleted.");
  }
  if ((batch.items ?? []).some(hasOperationalBatchItemData)) {
    throw new Error("This batch has already started production or harvesting and cannot be deleted.");
  }
  if (dependencies.inventoryAdjustmentCount > 0) {
    throw new Error("This batch has inventory or harvest history and cannot be deleted.");
  }
  if (dependencies.fulfilmentAllocationCount > 0) {
    throw new Error("This batch is linked to packing or fulfilment records and cannot be deleted.");
  }
}
