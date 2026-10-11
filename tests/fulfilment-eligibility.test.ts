import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FULFILMENT_ORDER_QUERY_STATUSES,
  isPackableOrder,
  isPaidFulfilmentOrder,
  isPendingFulfilmentOrder,
  isSubscriptionDeliveryPackable,
  orderPackagingPlan,
  validateAuthoritativePackLines,
} from "../lib/fulfilmentEligibility";
import type { Order } from "../types/order";
import type { Subscription } from "../types/subscription";
import type { SubscriptionDelivery } from "../types/subscriptionDelivery";

const order = (overrides: Partial<Order> = {}): Order => ({
  id: "order-1",
  orderNumber: "ORD-1",
  customerId: "customer-1",
  items: [{
    productId: "salable-1",
    productName: "Radish",
    quantity: 1,
    unitPrice: 100,
    lineTotal: 100,
    weightGrams: 200,
    sellingOptionLabel: "200g box",
    packedGrams: 0,
    packedBoxes: 0,
  }],
  subtotal: 100,
  deliveryFee: 0,
  discount: 0,
  total: 100,
  paymentStatus: "paid",
  status: "confirmed",
  packingStatus: "pending",
  ...overrides,
});

const activeSubscription: Subscription = {
  id: "subscription-1",
  subscriptionNumber: "SUB-1",
  customerId: "customer-1",
  productId: "salable-1",
  productName: "Radish",
  sellingOptionId: "option-1",
  sellingOptionLabel: "200g box",
  weightGrams: 200,
  unitPrice: 100,
  quantity: 1,
  frequency: "weekly",
  totalDeliveries: 0,
  deliveriesGenerated: 1,
  nextDeliveryDate: "2026-10-12",
  deliveryDay: 1,
  startDate: "2026-10-05",
  endDate: "2027-10-05",
  status: "active",
};

const pendingDelivery: SubscriptionDelivery = {
  id: "subscription-1_1",
  subscriptionId: "subscription-1",
  orderId: "order-1",
  deliveryNumber: 1,
  customerId: "customer-1",
  productId: "salable-1",
  productName: "Radish",
  deliveryDate: "2026-10-12",
  status: "pending",
};

test("fulfilment query scopes order statuses and excludes unconfirmed or unsuccessful payments", () => {
  assert.deepEqual(FULFILMENT_ORDER_QUERY_STATUSES, [
    "confirmed",
    "preparing",
    "packed",
    "ready_for_handover",
    "handed_to_delivery",
    "out_for_delivery",
  ]);
  assert.equal(isPaidFulfilmentOrder(order()), true);
  assert.equal(isPackableOrder(order()), true);
  assert.equal(isPaidFulfilmentOrder(order({ paymentStatus: "pending" })), false);
  assert.equal(isPaidFulfilmentOrder(order({ paymentStatus: "failed" })), false);
  assert.equal(isPaidFulfilmentOrder(order({ paymentStatus: "refunded" })), false);
  assert.equal(isPaidFulfilmentOrder(order({ status: "pending_payment" })), false);
  assert.equal(isPaidFulfilmentOrder(order({ status: "cancelled" })), false);
  assert.equal(isPaidFulfilmentOrder(order({ status: "delivered" })), false);
  assert.equal(isPaidFulfilmentOrder(order({ requiresCustomerContact: true })), false);
  assert.equal(isPackableOrder(order({ status: "packed" })), false);
});

test("subscription packing requires the active parent and that order's pending scheduled delivery", () => {
  const subscriptionOrder = order({ orderType: "subscription", sourceSubscriptionId: activeSubscription.id });
  assert.equal(isPendingFulfilmentOrder(subscriptionOrder, [pendingDelivery], [activeSubscription]), true);
  assert.equal(isPendingFulfilmentOrder(subscriptionOrder, [{ ...pendingDelivery, status: "packed" }], [activeSubscription]), false);
  assert.equal(isPendingFulfilmentOrder(subscriptionOrder, [{ ...pendingDelivery, status: "failed" }], [activeSubscription]), false);
  assert.equal(isPendingFulfilmentOrder(subscriptionOrder, [], [activeSubscription]), false);
  assert.equal(isPendingFulfilmentOrder(subscriptionOrder, [pendingDelivery], [{ ...activeSubscription, status: "paused" }]), false);
  assert.equal(isSubscriptionDeliveryPackable(subscriptionOrder, activeSubscription, pendingDelivery), true);
  assert.equal(isSubscriptionDeliveryPackable(subscriptionOrder, activeSubscription, { ...pendingDelivery, status: "cancelled" }), false);
  assert.equal(isSubscriptionDeliveryPackable(subscriptionOrder, activeSubscription, { ...pendingDelivery, orderId: "another-order" }), false);
});

test("packaging plan uses the order's saved package size and remaining box count", () => {
  const partialOrder = order({
    items: [{
      productId: "salable-1",
      productName: "Radish",
      quantity: 3,
      unitPrice: 100,
      lineTotal: 300,
      weightGrams: 600,
      sellingOptionLabel: "200g box",
      packedGrams: 200,
      packedBoxes: 1,
    }],
  });
  const plan = orderPackagingPlan(partialOrder.items);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.lines, [{ orderItemIndex: 0, boxGrams: 200, boxesPacked: 2 }]);
  assert.deepEqual(validateAuthoritativePackLines(partialOrder, plan.lines), plan.lines);
});

test("packing service validator rejects altered packaging, box count, omissions and ineligible orders", () => {
  const confirmed = order();
  assert.throws(
    () => validateAuthoritativePackLines(confirmed, [{ orderItemIndex: 0, boxGrams: 100, boxesPacked: 2 }]),
    /match the confirmed order/,
  );
  assert.throws(
    () => validateAuthoritativePackLines(confirmed, [{ orderItemIndex: 0, boxGrams: 200, boxesPacked: 2 }]),
    /match the confirmed order/,
  );
  assert.throws(() => validateAuthoritativePackLines(confirmed, []), /match the remaining boxes/);
  assert.throws(
    () => validateAuthoritativePackLines(order({ paymentStatus: "refunded" }), [{ orderItemIndex: 0, boxGrams: 200, boxesPacked: 1 }]),
    /fully paid, confirmed active/,
  );
  assert.throws(
    () => validateAuthoritativePackLines(order({ status: "cancelled" }), [{ orderItemIndex: 0, boxGrams: 200, boxesPacked: 1 }]),
    /fully paid, confirmed active/,
  );
});

test("Fulfilment UI and service wire server eligibility and read-only authoritative packaging", () => {
  const page = readFileSync("app/fulfilment/page.tsx", "utf8");
  const service = readFileSync("lib/fulfilmentService.ts", "utf8");
  assert.match(page, /listFulfilmentOrders\(\)/);
  assert.match(page, /isPendingFulfilmentOrder\(order, subscriptionDeliveries, subscriptions\)/);
  assert.match(page, /item\.sellingOptionLabel \|\| packLabel\(draft\.boxGrams\)/);
  assert.doesNotMatch(page, /updateDraft|onChange=\{e => updateDraft/);
  assert.match(service, /where\("status", "in", \[\.\.\.FULFILMENT_ORDER_QUERY_STATUSES\]\)/);
  assert.match(service, /validateAuthoritativePackLines\(currentOrder, lines\)/);
  assert.match(service, /Only an active subscription's pending scheduled delivery can be packed/);
});
