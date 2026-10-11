import type { InventoryAdjustment } from "@/types/catalog";

type AdjustmentQuantityFields = Pick<
  InventoryAdjustment,
  "type" | "quantity" | "previousStock" | "newStock"
>;

const STOCK_ADDITION_TYPES = new Set<InventoryAdjustment["type"]>([
  "add",
  "receive",
  "harvest",
  "fulfilment_reversal",
]);

const STOCK_REMOVAL_TYPES = new Set<InventoryAdjustment["type"]>([
  "remove",
  "packaging",
  "fulfilment",
  "batch_waste",
]);

export function adjustmentsForBatch(
  adjustments: InventoryAdjustment[],
  batchId: string | null | undefined,
): InventoryAdjustment[] {
  return batchId ? adjustments.filter(adjustment => adjustment.growingBatchId === batchId) : [];
}

export function formatAdjustmentQuantity(adjustment: AdjustmentQuantityFields): string {
  const quantity = Number(adjustment.quantity ?? 0);
  const magnitude = Math.abs(quantity);
  const stockChange = Number(adjustment.newStock ?? 0) - Number(adjustment.previousStock ?? 0);
  const direction = STOCK_ADDITION_TYPES.has(adjustment.type)
    ? 1
    : STOCK_REMOVAL_TYPES.has(adjustment.type)
      ? -1
      : Math.sign(stockChange || quantity);

  if (direction === 0) return `${magnitude.toLocaleString()} gms`;
  return `${direction > 0 ? "+" : "-"}${magnitude.toLocaleString()} gms`;
}
