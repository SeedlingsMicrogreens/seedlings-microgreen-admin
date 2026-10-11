import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { soldPercentOfHarvested } from "../lib/growingBatchListing";

test("sold percent is based on harvested quantity", () => {
  assert.equal(soldPercentOfHarvested(0, 185), 0);
  assert.equal(soldPercentOfHarvested(100, 185), 54.1);
  assert.equal(soldPercentOfHarvested(200, 230), 87);
});

test("sold percent is safe and capped", () => {
  assert.equal(soldPercentOfHarvested(50, 0), 0);
  assert.equal(soldPercentOfHarvested(50, Number.NaN), 0);
  assert.equal(soldPercentOfHarvested(300, 200), 100);
});

test("Sold column follows Harvested in the listing", () => {
  const src = readFileSync("app/growing-batches/page.tsx", "utf8");
  assert.ok(src.includes("<th>Harvested</th><th>Sold</th>"));
});

test("Delete Batch is available only on the Not Started details screen", () => {
  const src = readFileSync("app/growing-batches/page.tsx", "utf8");
  const detailsIndex = src.indexOf("function BatchDetails(");
  assert.notEqual(detailsIndex, -1);
  assert.equal(src.slice(0, detailsIndex).includes("Delete Batch"), false);
  assert.match(src.slice(detailsIndex), /batch\.status === "not_started" && !batch\.delivered && <button[^>]*>[\s\S]*?Delete Batch/);
});
