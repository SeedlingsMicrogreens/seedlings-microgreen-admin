import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { adjustmentsForBatch, formatAdjustmentQuantity } from "../lib/inventoryAdjustmentDisplay";
import type { InventoryAdjustment } from "../types/catalog";

const adjustment = (overrides: Partial<InventoryAdjustment> = {}): InventoryAdjustment => ({
  id: "adjustment-1",
  productId: "product-1",
  productName: "Radish",
  type: "batch_waste",
  quantity: 200,
  previousStock: 500,
  newStock: 300,
  reason: "Waste",
  createdByUid: "admin-1",
  growingBatchId: "batch-1",
  ...overrides,
});

test("batch history is empty without a selected batch and excludes unrelated records", () => {
  const records = [
    adjustment(),
    adjustment({ id: "other-batch", growingBatchId: "batch-2" }),
    adjustment({ id: "product-level", growingBatchId: undefined }),
  ];

  assert.deepEqual(adjustmentsForBatch(records, ""), []);
  assert.deepEqual(adjustmentsForBatch(records, null), []);
  assert.deepEqual(adjustmentsForBatch(records, "batch-1"), [records[0]]);
});

test("addition and removal quantities show one direction sign regardless of stored sign", () => {
  assert.equal(formatAdjustmentQuantity(adjustment({
    type: "harvest",
    quantity: 100,
    previousStock: 0,
    newStock: 100,
  })), "+100 gms");
  assert.equal(formatAdjustmentQuantity(adjustment({ quantity: -200 })), "-200 gms");
  assert.equal(formatAdjustmentQuantity(adjustment({
    type: "harvest",
    quantity: -100,
    previousStock: 0,
    newStock: 100,
  })), "+100 gms");
});

test("unclassified legacy adjustments use stock change or stored quantity direction", () => {
  assert.equal(formatAdjustmentQuantity(adjustment({
    type: "legacy",
    quantity: 200,
    previousStock: 500,
    newStock: 300,
  })), "-200 gms");
  assert.equal(formatAdjustmentQuantity(adjustment({
    type: "legacy",
    quantity: -200,
    previousStock: 500,
    newStock: 500,
  })), "-200 gms");
});

test("inventory page gates the history section and keeps the requested columns", () => {
  const page = readFileSync("app/inventory/page.tsx", "utf8");
  const historyStart = page.indexOf("Adjustment history · ");
  const historyEnd = page.indexOf("</div>}", historyStart);
  const historySection = page.slice(historyStart, historyEnd);

  assert.ok(page.includes("{selectedBatch && <div className=\"col-12\">"));
  assert.match(
    historySection,
    /<th>Before \(gms\)<\/th><th>Qty \(gms\)<\/th><th>After \(gms\)<\/th>/,
  );
  assert.ok(!historySection.toLowerCase().includes("created by"));
});
