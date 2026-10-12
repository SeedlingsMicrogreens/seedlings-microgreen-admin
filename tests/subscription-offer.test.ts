import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildSubscriptionOfferFromForm,
  previewSubscriptionOffer,
  validateSubscriptionOffer,
} from "../lib/subscriptionOffer";
import type { SubscriptionOfferInput } from "../lib/subscriptionOffer";
import type { SubscriptionFrequency, SubscriptionPlan } from "../types/subscriptionPlan";

const frequencies: SubscriptionFrequency[] = ["monthly", "quarterly", "half_yearly", "yearly"];

function plan(
  id: string,
  frequency: SubscriptionFrequency,
  deliveriesPerTerm: number,
  active = true,
): SubscriptionPlan {
  return {
    id,
    salableProductId: `product-${id}`,
    salableProductName: `Product ${id}`,
    name: `Plan ${id}`,
    frequency,
    deliveriesPerTerm,
    skipsAllowed: 0,
    price: 100,
    deliveryChargeMode: "included",
    deliveryCharge: 0,
    active,
  };
}

test("validates configurable bonus delivery counts for every supported frequency", () => {
  const configuration = validateSubscriptionOffer({
    frequencies,
    extraDeliveriesByFrequency: {
      monthly: 2,
      quarterly: 4,
      half_yearly: 8,
      yearly: 16,
    },
  });
  assert.deepEqual(configuration, {
    frequencies,
    extraDeliveriesByFrequency: {
      monthly: 2,
      quarterly: 4,
      half_yearly: 8,
      yearly: 16,
    },
  });
});

test("requires at least one unique supported frequency and exact frequency/count keys", () => {
  const valid: SubscriptionOfferInput = {
    frequencies: ["monthly"],
    extraDeliveriesByFrequency: { monthly: 1 },
  };
  assert.throws(() => validateSubscriptionOffer({ ...valid, frequencies: [] }), /at least one/);
  assert.throws(() => validateSubscriptionOffer({
    frequencies: ["monthly", "monthly"],
    extraDeliveriesByFrequency: { monthly: 1 },
  }), /more than once/);
  const unsupported = { ...valid };
  Reflect.set(unsupported, "frequencies", ["weekly"]);
  assert.throws(() => validateSubscriptionOffer(unsupported), /supported/);
  assert.throws(() => validateSubscriptionOffer({
    frequencies: ["monthly", "yearly"],
    extraDeliveriesByFrequency: { monthly: 1 },
  }), /only for selected frequencies/);
  assert.throws(() => validateSubscriptionOffer({
    frequencies: ["monthly"],
    extraDeliveriesByFrequency: { monthly: 1, yearly: 2 },
  }), /only for selected frequencies/);
});

test("rejects missing, non-finite, non-positive and fractional extra delivery values", () => {
  for (const value of [undefined, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateSubscriptionOffer({
      frequencies: ["monthly"],
      extraDeliveriesByFrequency: { monthly: value },
    }), /positive whole number/);
  }
});

test("builds the persisted configuration from editable form inputs", () => {
  assert.deepEqual(buildSubscriptionOfferFromForm(
    ["quarterly", "yearly"],
    { monthly: "", quarterly: "3", half_yearly: "", yearly: "12" },
  ), {
    frequencies: ["quarterly", "yearly"],
    extraDeliveriesByFrequency: { quarterly: 3, yearly: 12 },
  });
  assert.throws(() => buildSubscriptionOfferFromForm(
    ["monthly"],
    { monthly: "" },
  ), /positive whole number/);
});

test("previews use each active matching plan's configured deliveries per term", () => {
  const configuration = validateSubscriptionOffer({
    frequencies: ["monthly", "quarterly"],
    extraDeliveriesByFrequency: { monthly: 2, quarterly: 3 },
  });
  assert.deepEqual(previewSubscriptionOffer([
    plan("monthly-4", "monthly", 4),
    plan("monthly-6", "monthly", 6),
    plan("quarterly", "quarterly", 12),
    plan("inactive", "monthly", 99, false),
    plan("unselected", "yearly", 48),
  ], configuration), [
    {
      planId: "monthly-4",
      planName: "Plan monthly-4",
      frequency: "monthly",
      regularDeliveries: 4,
      extraDeliveries: 2,
      totalDeliveries: 6,
    },
    {
      planId: "monthly-6",
      planName: "Plan monthly-6",
      frequency: "monthly",
      regularDeliveries: 6,
      extraDeliveries: 2,
      totalDeliveries: 8,
    },
    {
      planId: "quarterly",
      planName: "Plan quarterly",
      frequency: "quarterly",
      regularDeliveries: 12,
      extraDeliveries: 3,
      totalDeliveries: 15,
    },
  ]);
});

test("returns no preview rows when no active plan matches a selected frequency", () => {
  const configuration = validateSubscriptionOffer({
    frequencies: ["yearly"],
    extraDeliveriesByFrequency: { yearly: 2 },
  });
  assert.deepEqual(previewSubscriptionOffer([
    plan("monthly", "monthly", 4),
    plan("inactive-yearly", "yearly", 48, false),
  ], configuration), []);
});

test("Offers UI loads plans, restores subscription settings, previews, and routes validation to toast", () => {
  const page = readFileSync("app/offers/page.tsx", "utf8");
  const service = readFileSync("lib/offerService.ts", "utf8");
  assert.match(page, /listCollection<SubscriptionPlan>\("subscriptionPlans"\)/);
  assert.match(page, /subscriptionFrequencies: item\.subscriptionOffer\?\.frequencies/);
  assert.match(page, /Calculated Delivery Preview/);
  assert.match(page, /formatDiscount\(item\)\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(page, /No active subscription plans are configured for this frequency/);
  assert.match(page, /showError\(validationError, "Invalid subscription offer configuration\."\)/);
  assert.match(service, /validateSubscriptionOffer/);
  assert.match(service, /updateData\.subscriptionOffer = deleteField\(\)/);
});
