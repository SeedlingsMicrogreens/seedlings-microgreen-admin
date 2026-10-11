import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canAutoCloseBatch, isBatchClosed, itemRemainingStockGrams, packingStatusFromItems, planBatchClosure,
  productTotalsToRestore, restoreBatchItemStock, reverseOrderItemPacking, statusBeforePacked,
} from "../lib/batchAccounting";
import { validateGrowingBatchCanBeDeleted } from "../lib/growingBatchDeletion";
import type { GrowingBatch, GrowingBatchItem } from "../types/growingBatch";
import type { OrderItem } from "../types/order";
import type { PackingItem } from "../types/fulfilment";

const item = (o: Partial<GrowingBatchItem>): GrowingBatchItem => ({
  id: "i1", productId: "p1", productName: "Radish", expectedYieldGrams: 200, status: "completed_harvested",
  actualYieldGrams: 185, ...o,
} as GrowingBatchItem);

const deletableBatch = (
  o: Omit<Partial<GrowingBatch>, "status"> & { status?: string } = {},
  itemOverrides: Partial<GrowingBatchItem> = {},
): GrowingBatch => ({
  id: "b1",
  batchNumber: "B1",
  startDate: "2026-10-11",
  harvestDate: "2026-10-18",
  status: "not_started",
  createdByUid: "u1",
  items: [{
    id: "i1",
    productId: "p1",
    productName: "Radish",
    trayCount: 1,
    startDate: "2026-10-11",
    growingCycleDays: 7,
    expectedReadyDate: "2026-10-18",
    expectedYieldGramsPerTray: 200,
    minimumYieldGramsPerTray: 150,
    expectedLossGramsPerTray: 10,
    expectedYieldGrams: 200,
    expectedLossGrams: 10,
    expectedUsableYieldGrams: 190,
    status: "not_started",
    phases: {
      soaking: { status: "not_started" },
      darkPeriod: { status: "not_started" },
      lightPeriod: { status: "not_started" },
    },
    ...itemOverrides,
  }],
  ...o,
} as GrowingBatch);

test("auto-close: harvested below planned and fully sold closes", () => {
  assert.equal(canAutoCloseBatch([item({ soldQuantityGrams: 185, batchStockGrams: 0 })]), true);
});
test("auto-close: not fully sold stays open (planned 200, harvested 185, sold 180)", () => {
  assert.equal(canAutoCloseBatch([item({ soldQuantityGrams: 180, batchStockGrams: 0 })]), false);
});
test("auto-close: sold >= planned but < harvested stays open", () => {
  assert.equal(canAutoCloseBatch([item({ actualYieldGrams: 230, soldQuantityGrams: 200, batchStockGrams: 30 })]), false);
});
test("auto-close: missing or zero harvested never closes", () => {
  assert.equal(canAutoCloseBatch([item({ actualYieldGrams: undefined, soldQuantityGrams: 0 })]), false);
  assert.equal(canAutoCloseBatch([item({ actualYieldGrams: 0, soldQuantityGrams: 0 })]), false);
});
test("auto-close: unharvested item or leftover stock blocks closure", () => {
  const sold = item({ soldQuantityGrams: 185, batchStockGrams: 0 });
  assert.equal(canAutoCloseBatch([sold, item({ id: "i2", status: "in_progress", actualYieldGrams: undefined })]), false);
  assert.equal(canAutoCloseBatch([item({ soldQuantityGrams: 185, batchStockGrams: 10 })]), false);
});

test("remaining stock: persisted value wins, fallback is harvested - sold, never negative", () => {
  assert.equal(itemRemainingStockGrams(item({ batchStockGrams: 40 })), 40);
  assert.equal(itemRemainingStockGrams(item({ actualYieldGrams: 200 })), 200);
  assert.equal(itemRemainingStockGrams(item({ actualYieldGrams: 100, soldQuantityGrams: 150 })), 0);
  assert.equal(itemRemainingStockGrams(item({ batchStockGrams: -5 })), 0);
});

test("not started batch deletion guard allows a clean unstarted batch", () => {
  assert.doesNotThrow(() => validateGrowingBatchCanBeDeleted(deletableBatch()));
  assert.doesNotThrow(() => validateGrowingBatchCanBeDeleted(deletableBatch({ status: "planned" })));
});

test("not started batch deletion guard rejects active lifecycle states", () => {
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({ status: "in_progress" })), /Only a Not Started batch/);
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({ status: "completed_harvested" })), /Only a Not Started batch/);
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({ status: "closed" })), /Only a Not Started batch/);
});

test("not started batch deletion guard rejects started production, harvest and stock data", () => {
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({}, { status: "in_progress" })), /already started/);
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({}, { phases: { soaking: { status: "in_progress", startedAt: "2026-10-11T00:00:00.000Z" }, darkPeriod: { status: "not_started" }, lightPeriod: { status: "not_started" } } })), /already started/);
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({}, { phases: { soaking: { status: "completed", endedAt: "2026-10-11T00:00:00.000Z" }, darkPeriod: { status: "not_started" }, lightPeriod: { status: "not_started" } } })), /already started/);
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({}, { actualYieldGrams: 10 })), /already started/);
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({}, { batchStockGrams: 0 })), /already started/);
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({}, { soldQuantityGrams: 1 })), /already started/);
});

test("not started batch deletion guard rejects operational dependencies", () => {
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch({ stockAdjusted: true })), /operational history/);
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch(), { inventoryAdjustmentCount: 1, fulfilmentAllocationCount: 0 }), /inventory or harvest history/);
  assert.throws(() => validateGrowingBatchCanBeDeleted(deletableBatch(), { inventoryAdjustmentCount: 0, fulfilmentAllocationCount: 1 }), /packing or fulfilment records/);
});

test("manual close: entirely unpacked batch records full harvested quantity as waste", () => {
  const { updatedItems, wasteByProductId } = planBatchClosure([item({ actualYieldGrams: 200 })], new Map());
  assert.equal(wasteByProductId.get("p1"), 200);
  assert.equal(updatedItems[0].batchStockGrams, 0);
  assert.equal(updatedItems[0].batchWasteGrams, 200);
});
test("manual close: partial packing wastes only the unallocated remainder", () => {
  const { wasteByProductId, updatedItems } = planBatchClosure([item({ actualYieldGrams: 200, batchStockGrams: 120 })], new Map());
  assert.equal(wasteByProductId.get("p1"), 120);
  assert.equal(updatedItems[0].batchWasteGrams, 120);
});
test("manual close: fully packed batch deducts nothing, and retry adds no waste", () => {
  const first = planBatchClosure([item({ actualYieldGrams: 200, batchStockGrams: 0 })], new Map());
  assert.equal(first.wasteByProductId.size, 0);
  const again = planBatchClosure(first.updatedItems, new Map());
  assert.equal(again.wasteByProductId.size, 0);
  const after = planBatchClosure([item({ batchStockGrams: 50 })], new Map([["p1", 20]]));
  assert.equal(after.updatedItems[0].batchWasteGrams, 70);
  assert.equal(after.updatedItems[0].batchStockGrams, 0);
  assert.equal(planBatchClosure(after.updatedItems, new Map([["p1", 70]])).wasteByProductId.size, 0);
});

const alloc = [
  { growingBatchId: "b1", growingBatchNumber: "B1", growingBatchItemId: "i1", productId: "p1", productName: "Radish", quantityGrams: 60 },
  { growingBatchId: "b2", growingBatchNumber: "B2", growingBatchItemId: "j1", productId: "p1", productName: "Radish", quantityGrams: 40 },
];
test("cancel packing: product total and originating batch items are restored", () => {
  assert.equal(productTotalsToRestore({ allocations: alloc }).get("p1"), 100);
  const b1 = restoreBatchItemStock([item({ batchStockGrams: 100 })], new Map([["i1", 60]]));
  assert.equal(b1[0].batchStockGrams, 160);
  const other = restoreBatchItemStock([item({ id: "other", batchStockGrams: 5 })], new Map([["i1", 60]]));
  assert.equal(other[0].batchStockGrams, 5);
  assert.equal(restoreBatchItemStock([item({ batchStockGrams: 180 })], new Map([["i1", 60]]))[0].batchStockGrams, 185);
});
test("cancel packing: legacy fulfilment without allocations falls back to components", () => {
  const items = [{ components: [{ productId: "p9", totalGrams: 30 }] }] as unknown as PackingItem[];
  assert.equal(productTotalsToRestore({ allocations: [], items }).get("p9"), 30);
});
test("cancel packing: order resets, partial cancels keep other packing, status reverts", () => {
  const orderItems = [{ weightGrams: 100, packedGrams: 100, packedBoxes: 2 }, { weightGrams: 50, packedGrams: 50, packedBoxes: 1 }] as OrderItem[];
  const cancelled = [{ orderItemIndex: 0, packedGrams: 100, boxesPacked: 2 }] as PackingItem[];
  const rebuilt = reverseOrderItemPacking(orderItems, cancelled);
  assert.equal(rebuilt[0].packedGrams, 0);
  assert.equal(rebuilt[1].packedGrams, 50);
  assert.equal(packingStatusFromItems(rebuilt), "partial");
  assert.equal(packingStatusFromItems(reverseOrderItemPacking(rebuilt, [{ orderItemIndex: 1, packedGrams: 50, boxesPacked: 1 }] as PackingItem[])), "pending");
  assert.equal(statusBeforePacked([{ status: "paid" }, { status: "confirmed" }, { status: "packed" }]), "confirmed");
  assert.equal(statusBeforePacked([{ status: "preparing" }, { status: "packed" }]), "preparing");
  assert.equal(statusBeforePacked(undefined), "confirmed");
});

test("legacy delivered=true batches are still treated as closed; new closures use status only", () => {
  assert.equal(isBatchClosed({ status: "completed_harvested", delivered: true }), true);
  assert.equal(isBatchClosed({ status: "closed" }), true);
  assert.equal(isBatchClosed({ status: "completed_harvested" }), false);
});

test("service wiring: closure never writes delivered, cancel is guarded and uses allocations", () => {
  const svc = readFileSync("lib/growingBatchService.ts", "utf8");
  assert.ok(!/delivered:\s*true/.test(svc));
  assert.ok(!/deliveredAt:/.test(svc));
  assert.ok(svc.includes("canAutoCloseBatch(updatedItems)"));
  const ful = readFileSync("lib/fulfilmentService.ts", "utf8");
  assert.ok(ful.includes("restoreBatchItemStock"));
  assert.ok(ful.includes("This packing operation has already been cancelled."));
  assert.ok(ful.includes("!isBatchClosed(batch)"));
  assert.ok(!readFileSync("app/inventory/page.tsx", "utf8").includes("batch.delivered"));
});
