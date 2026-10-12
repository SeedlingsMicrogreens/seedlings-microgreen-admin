import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildSubscriptionPlanSellingOptions,
  calculateSubscriptionPlanPrice,
  current100gSellingPrice,
  normalizeSubscriptionPlanSellingOption,
  normalizeSubscriptionPlanSellingOptions,
} from "../lib/subscriptionPlanPricing";
import type { SalesProductSellingOption } from "../types/salesProduct";
import type { SubscriptionPlanSellingOption } from "../types/subscriptionPlan";

const productOptions: SalesProductSellingOption[] = [
  { id: "100g", weightGrams: 100, mrp: 120, price: 90, active: true },
  { id: "200g", weightGrams: 200, mrp: 210, price: 175.25, active: true },
];

test("preserves an existing Subscription Plan Price even when discounted below the maximum price", () => {
  const saved: SubscriptionPlanSellingOption[] = [
    { id: "100g", weightGrams: 100, planPrice: 300, maximumPlanPrice: 360 },
  ];
  assert.deepEqual(
    buildSubscriptionPlanSellingOptions(productOptions, 4, saved, saved),
    [
      { id: "100g", weightGrams: 100, planPrice: 300, maximumPlanPrice: 360 },
      { id: "200g", weightGrams: 200, planPrice: 701, maximumPlanPrice: 701 },
    ],
  );
});

test("preserves a user-edited discounted Subscription Plan Price", () => {
  const saved: SubscriptionPlanSellingOption[] = [
    { id: "100g", weightGrams: 100, planPrice: 333.33 },
  ];
  const submitted: SubscriptionPlanSellingOption[] = [
    { id: "100g", weightGrams: 100, planPrice: 250 },
  ];
  const result = buildSubscriptionPlanSellingOptions(productOptions, 4, submitted, saved);
  assert.equal(result[0].planPrice, 250);
  assert.equal(result[0].maximumPlanPrice, 360);
});

test("calculates Add prices and maximums per matching selling option, not MRP", () => {
  assert.deepEqual(buildSubscriptionPlanSellingOptions(productOptions, 4), [
    { id: "100g", weightGrams: 100, planPrice: 360, maximumPlanPrice: 360 },
    { id: "200g", weightGrams: 200, planPrice: 701, maximumPlanPrice: 701 },
  ]);
});

test("recalculates Update maximums from current delivery and Product price values", () => {
  const saved: SubscriptionPlanSellingOption[] = [
    { id: "100g", weightGrams: 100, planPrice: 300, maximumPlanPrice: 360 },
  ];
  const submitted: SubscriptionPlanSellingOption[] = [
    { id: "100g", weightGrams: 100, planPrice: 300, maximumPlanPrice: 360 },
  ];
  assert.deepEqual(buildSubscriptionPlanSellingOptions(productOptions, 6, submitted, saved), [
    { id: "100g", weightGrams: 100, planPrice: 300, maximumPlanPrice: 540 },
    { id: "200g", weightGrams: 200, planPrice: 1051.5, maximumPlanPrice: 1051.5 },
  ]);
});

test("recalculates the matching packaging maximum when its Product selling price changes", () => {
  const saved: SubscriptionPlanSellingOption[] = [
    { id: "100g", weightGrams: 100, planPrice: 250, maximumPlanPrice: 360 },
    { id: "200g", weightGrams: 200, planPrice: 500, maximumPlanPrice: 701 },
  ];
  const changedProductOptions = [
    { ...productOptions[0], price: 110 },
    productOptions[1],
  ];
  assert.deepEqual(
    buildSubscriptionPlanSellingOptions(changedProductOptions, 4, saved, saved),
    [
      { id: "100g", weightGrams: 100, planPrice: 250, maximumPlanPrice: 440 },
      { id: "200g", weightGrams: 200, planPrice: 500, maximumPlanPrice: 701 },
    ],
  );
});

test("rounds maximum price to two currency decimal places", () => {
  assert.equal(calculateSubscriptionPlanPrice(3, 10.335), 31.01);
});

test("automatically populated missing prices use current values while existing discounts remain untouched", () => {
  const submitted = [
    { id: "100g", weightGrams: 100, planPrice: 360 },
    { id: "200g", weightGrams: 200, planPrice: 701 },
  ];
  assert.deepEqual(
    buildSubscriptionPlanSellingOptions(
      productOptions.map(option => ({ ...option, price: option.price + 1 })),
      5,
      submitted,
      [{ id: "100g", weightGrams: 100, planPrice: 250 }],
      ["100g", "200g"],
    ),
    [
      { id: "100g", weightGrams: 100, planPrice: 250, maximumPlanPrice: 455 },
      { id: "200g", weightGrams: 200, planPrice: 881.25, maximumPlanPrice: 881.25 },
    ],
  );
});

test("rejects invalid deliveries, invalid selling prices, and duplicate options", () => {
  assert.throws(() => calculateSubscriptionPlanPrice(0, 20), /positive whole number/);
  assert.throws(() => calculateSubscriptionPlanPrice(1.5, 20), /positive whole number/);
  assert.throws(() => calculateSubscriptionPlanPrice(2, Number.NaN), /greater than zero/);
  assert.throws(() => calculateSubscriptionPlanPrice(2, -1), /greater than zero/);
  assert.throws(() => buildSubscriptionPlanSellingOptions([
    ...productOptions,
    { ...productOptions[0], id: "duplicate" },
  ], 4), /duplicate IDs or packaging sizes/);
  assert.throws(() => buildSubscriptionPlanSellingOptions(productOptions, 4, [
    { id: "100g", weightGrams: 100, planPrice: -1 },
  ]), /valid non-negative number/);
});

test("reads legacy minimum/reference fields as maximumPlanPrice and canonicalizes new writes", () => {
  const legacy = {
    id: "100g",
    weightGrams: 100,
    planPrice: 250,
    minimumPlanPrice: 360,
  } as SubscriptionPlanSellingOption;
  assert.deepEqual(normalizeSubscriptionPlanSellingOption(legacy), {
    id: "100g",
    weightGrams: 100,
    planPrice: 250,
    maximumPlanPrice: 360,
  });
  assert.deepEqual(normalizeSubscriptionPlanSellingOptions([legacy]), [{
    id: "100g",
    weightGrams: 100,
    planPrice: 250,
    maximumPlanPrice: 360,
  }]);

  const rewritten = buildSubscriptionPlanSellingOptions(productOptions.slice(0, 1), 4, [legacy], [legacy]);
  assert.deepEqual(rewritten, [{
    id: "100g",
    weightGrams: 100,
    planPrice: 250,
    maximumPlanPrice: 360,
  }]);
  assert.equal("minimumPlanPrice" in rewritten[0], false);
});

test("create/update services recalculate maxima using fresh Product and Plan records", () => {
  const service = readFileSync("lib/subscriptionPlanService.ts", "utf8");
  assert.match(service, /getDoc\(doc\(db, "salesProducts", input\.salableProductId\)\)/);
  assert.match(service, /getDoc\(doc\(db, "subscriptionPlans", id\)\)/);
  assert.match(service, /buildSubscriptionPlanSellingOptions\(/);
  assert.match(service, /product\.sellingOptions \?\? \[\]/);
  assert.match(service, /current\.sellingOptions \?\? \[\]/);
  assert.match(service, /current100gSellingPrice\(product\.sellingOptions \?\? \[\]\)/);
  assert.match(service, /maximumPlanPrice,/);
});

test("100g selling price and maximum stay current while discounted plan prices remain valid", () => {
  assert.equal(current100gSellingPrice(productOptions), 90);
  assert.equal(calculateSubscriptionPlanPrice(4, current100gSellingPrice(productOptions)), 360);
  assert.equal(buildSubscriptionPlanSellingOptions(productOptions, 4, [
    { id: "100g", weightGrams: 100, planPrice: 200 },
  ])[0].planPrice, 200);
});

test("Subscription Masters displays read-only current 100g price and maximum prices", () => {
  const page = readFileSync("app/subscription-masters/page.tsx", "utf8");
  assert.match(page, /function currentProduct100gPrice\(product\?:SalesProduct\)/);
  assert.match(page, /buildSubscriptionPlanSellingOptions\(activeProductOptions, value\.deliveriesPerTerm/);
  assert.match(page, /normalizeSubscriptionPlanSellingOptions\(plan\.sellingOptions\)/);
  assert.match(page, /maximumPlanPrice/);
  assert.match(page, /aria-readonly="true"/);
  assert.match(page, /discounted plan prices are allowed/i);
  assert.doesNotMatch(page, /referencePlanPrice/);
  assert.match(page, /onError=\{error=>\{void showError\(error,"Unable to save subscription plan\."\)\}\}/);
});
