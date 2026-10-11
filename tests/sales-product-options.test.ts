import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createDefault100gSellingOption,
  ensureDefault100gSellingOption,
  validateRequired100gSellingOption,
  validateSingleComponentShare,
} from "../lib/salesProductOptions";
import { componentShareGrams } from "../lib/packingMath";
import type { SalesProduct, SalesProductSellingOption } from "../types/salesProduct";

test("default salable option is a real 100g form value and does not duplicate saved values", () => {
  const defaultOption = createDefault100gSellingOption("new-100", 12, 10);
  assert.deepEqual(defaultOption, { id: "new-100", weightGrams: 100, mrp: 12, price: 10, active: true });

  const existing: SalesProductSellingOption[] = [
    { id: "saved-200", weightGrams: 200, mrp: 24, price: 20, active: true },
  ];
  const initialized = ensureDefault100gSellingOption(existing, defaultOption);
  assert.deepEqual(initialized, [...existing, defaultOption]);
  assert.deepEqual(
    ensureDefault100gSellingOption([...existing, defaultOption], createDefault100gSellingOption("duplicate")),
    [...existing, defaultOption],
  );
});

test("valid complete 100g option is accepted; missing or incomplete option is rejected", () => {
  const valid = createDefault100gSellingOption("option-100", 12, 10);
  assert.equal(validateRequired100gSellingOption([valid]), valid);
  for (const options of [
    [],
    [createDefault100gSellingOption("missing-price", 0, 0)],
    [createDefault100gSellingOption("bad-discount", 10, 12)],
    [{ ...valid, id: "" }],
  ]) {
    assert.throws(() => validateRequired100gSellingOption(options), /A 100gms salable option is required/);
  }
  assert.throws(
    () => validateRequired100gSellingOption([{ ...valid, weightGrams: 200 }]),
    /A 100gms salable option is required/,
  );
});

test("Single component stores 100 numerically as a 100% share, not package grams", () => {
  const component = { productId: "microgreen-1", quantityGrams: 100, percentage: 100 };
  assert.doesNotThrow(() => validateSingleComponentShare("single", [component]));
  assert.throws(
    () => validateSingleComponentShare("single", [{ ...component, percentage: undefined }]),
    /must use exactly one Microgreen at 100%/,
  );

  const salable = {
    id: "single-1",
    type: "single",
    components: [component],
  } as SalesProduct;
  assert.equal(componentShareGrams(salable, component, 250), 250);
  assert.doesNotThrow(() => validateSingleComponentShare("multiple", [{ quantityGrams: 0, percentage: 100 }]));
});

test("form keeps price/purchase review-only and maps Single quantity as percent", () => {
  const page = readFileSync("app/sales-products/page.tsx", "utf8");
  assert.match(page, /Quantity \(%\) \*/);
  assert.match(page, /value=\{100\} readOnly/);
  assert.match(page, /value=\{form\.mrp\} readOnly/);
  assert.match(page, /value=\{form\.sellingPrice\} readOnly/);
  assert.match(page, /checked=\{form\.oneTimePurchase\} disabled/);
  assert.match(page, /checked=\{form\.subscriptionPurchase\} disabled/);
  assert.match(page, /quantityGrams: 100, percentage: 100/);
  assert.match(page, /ensureDefault100gSellingOption/);
  assert.match(page, /validateRequired100gSellingOption\(sellingOptions\)/);
});

test("Sales Product create and update service paths both enforce the 100g option", () => {
  const service = readFileSync("lib/salesProductService.ts", "utf8");
  assert.match(service, /createSalesProduct[\s\S]*?validateRequired100gSellingOption\(data\.sellingOptions\)/);
  assert.match(service, /updateSalesProduct[\s\S]*?validateRequired100gSellingOption\(data\.sellingOptions \?\? current\.sellingOptions\)/);
});
