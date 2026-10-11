import type { GrowingBatch, GrowingBatchItem } from "@/types/growingBatch";
import type { FulfilmentAllocation, PackingItem } from "@/types/fulfilment";
import type { OrderItem, OrderStatus } from "@/types/order";
import { requiredItemGrams } from "./packingMath";

const grams = (value: unknown) => {
  const n = Math.round(Number(value ?? 0));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

/** Closed means status "closed" or a legacy record that was closed with delivered=true. */
export function isBatchClosed(batch: Pick<GrowingBatch, "status" | "delivered">) {
  return batch.status === "closed" || batch.delivered === true;
}

/** Remaining stock: persisted batchStockGrams, otherwise harvested minus sold. */
export function itemRemainingStockGrams(item: Pick<GrowingBatchItem, "batchStockGrams" | "actualYieldGrams" | "soldQuantityGrams">) {
  if (item.batchStockGrams !== undefined && item.batchStockGrams !== null) return grams(item.batchStockGrams);
  return Math.max(0, grams(item.actualYieldGrams) - grams(item.soldQuantityGrams));
}

/**
 * A batch closes automatically only when every harvested item is fully sold
 * against its actual harvested quantity and no stock is left to reconcile.
 */
export function canAutoCloseBatch(items: GrowingBatchItem[]) {
  if (!items.length) return false;
  if (items.some(item => item.status !== "completed_harvested" && item.status !== "failed")) return false;
  const harvestedItems = items.filter(item => item.status === "completed_harvested");
  if (!harvestedItems.length) return false;
  return harvestedItems.every(item => {
    const harvested = grams(item.actualYieldGrams);
    return harvested > 0 && grams(item.soldQuantityGrams) >= harvested && itemRemainingStockGrams(item) === 0;
  });
}

/** Plans the final reconciliation: all remaining stock becomes waste. */
export function planBatchClosure(items: GrowingBatchItem[], previousWasteByProductId: Map<string, number>) {
  const wasteByProductId = new Map<string, number>();
  const updatedItems = items.map(item => {
    if (item.status !== "completed_harvested" && item.status !== "failed") return item;
    const remaining = itemRemainingStockGrams(item);
    if (remaining > 0) wasteByProductId.set(item.productId, (wasteByProductId.get(item.productId) ?? 0) + remaining);
    return {
      ...item,
      batchStockGrams: 0,
      batchWasteGrams: (previousWasteByProductId.get(item.productId) ?? 0) + remaining,
    };
  });
  return { updatedItems, wasteByProductId };
}

export function productTotalsToRestore(fulfilment: { allocations?: FulfilmentAllocation[]; items?: PackingItem[] }) {
  const totals = new Map<string, number>();
  const allocations = fulfilment.allocations ?? [];
  if (allocations.length) {
    for (const a of allocations) totals.set(a.productId, (totals.get(a.productId) ?? 0) + grams(a.quantityGrams));
  } else {
    for (const item of fulfilment.items ?? []) {
      for (const c of item.components ?? []) totals.set(c.productId, (totals.get(c.productId) ?? 0) + grams(c.totalGrams));
    }
  }
  return totals;
}

/** Adds allocated grams back to their originating batch items, capped at the harvested quantity. */
export function restoreBatchItemStock(items: GrowingBatchItem[], restoreByItemId: Map<string, number>) {
  return items.map(item => {
    const add = restoreByItemId.get(item.id);
    if (!add) return item;
    const harvested = grams(item.actualYieldGrams);
    return { ...item, batchStockGrams: Math.min(harvested, itemRemainingStockGrams(item) + add) };
  });
}

/** Removes only the cancelled fulfilment's packed quantities from the order items. */
export function reverseOrderItemPacking(orderItems: OrderItem[], fulfilmentItems: PackingItem[]) {
  const next = [...orderItems];
  for (const line of fulfilmentItems) {
    const item = next[line.orderItemIndex];
    if (!item) continue;
    next[line.orderItemIndex] = {
      ...item,
      packedGrams: Math.max(0, grams(item.packedGrams) - grams(line.packedGrams)),
      packedBoxes: Math.max(0, grams(item.packedBoxes) - grams(line.boxesPacked)),
    };
  }
  return next;
}

export function packingStatusFromItems(items: OrderItem[]): "pending" | "partial" | "packed" {
  const packedAny = items.some(item => grams(item.packedGrams) > 0);
  if (!packedAny) return "pending";
  const all = items.every(item => {
    const required = requiredItemGrams(item);
    return required <= 0 || grams(item.packedGrams) >= required;
  });
  return all ? "packed" : "partial";
}

/** Status the order had before its latest transition into "packed". */
export function statusBeforePacked(history: Array<{ status?: string }> | undefined): OrderStatus {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.status === "packed") {
      for (let j = i - 1; j >= 0; j -= 1) {
        const s = list[j]?.status;
        if (s && s !== "packed") return s as OrderStatus;
      }
      break;
    }
  }
  return "confirmed";
}
