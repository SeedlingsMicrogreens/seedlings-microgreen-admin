import assert from "node:assert/strict";
import test from "node:test";

import "./support/firebaseClientTestEnv";
import { resolveSubscriptionDeliveryTransition } from "../lib/subscriptionCompletion";
import { updateSubscriptionDeliveryStatusInTransaction } from "../lib/subscriptionDeliveryService";
import type { Order } from "../types/order";

const base = {
  subscriptionStatus: "active" as const,
  frequency: "monthly" as const,
  totalDeliveries: 4,
  deliveryLabel: "Subscription order ORD-1",
};

test("intermediate deliveries count once and leave the subscription active", () => {
  const result = resolveSubscriptionDeliveryTransition({ ...base, currentDeliveryStatus: "out_for_delivery", nextDeliveryStatus: "delivered", completedDeliveries: 1 });
  assert.deepEqual(result, { updateDelivery: true, completedDeliveries: 2, subscriptionStatus: "active" });
});

test("the final required delivery completes the subscription", () => {
  const result = resolveSubscriptionDeliveryTransition({ ...base, currentDeliveryStatus: "out_for_delivery", nextDeliveryStatus: "delivered", completedDeliveries: 3 });
  assert.deepEqual(result, { updateDelivery: true, completedDeliveries: 4, subscriptionStatus: "completed" });
  const twelve = resolveSubscriptionDeliveryTransition({ ...base, totalDeliveries: 12, currentDeliveryStatus: "out_for_delivery", nextDeliveryStatus: "delivered", completedDeliveries: 11 });
  assert.equal(twelve.subscriptionStatus, "completed");
});

test("a repeated Delivered request does not count again", () => {
  const retry = resolveSubscriptionDeliveryTransition({ ...base, currentDeliveryStatus: "delivered", nextDeliveryStatus: "delivered", completedDeliveries: 2 });
  assert.deepEqual(retry, { updateDelivery: false, completedDeliveries: 2, subscriptionStatus: "active" });
  // A parent whose saved count already reached the total is completed by the retry.
  const repair = resolveSubscriptionDeliveryTransition({ ...base, currentDeliveryStatus: "delivered", nextDeliveryStatus: "delivered", completedDeliveries: 4 });
  assert.deepEqual(repair, { updateDelivery: false, completedDeliveries: 4, subscriptionStatus: "completed" });
});

test("packing, handover, failed and cancelled do not count or complete", () => {
  for (const nextDeliveryStatus of ["packed", "out_for_delivery", "failed", "cancelled"] as const) {
    const result = resolveSubscriptionDeliveryTransition({ ...base, currentDeliveryStatus: "pending", nextDeliveryStatus, completedDeliveries: 3 });
    assert.deepEqual(result, { updateDelivery: true, completedDeliveries: 3, subscriptionStatus: "active" }, nextDeliveryStatus);
  }
});

test("a delivered occurrence cannot be overwritten by a later status", () => {
  for (const nextDeliveryStatus of ["out_for_delivery", "failed", "cancelled"] as const) {
    assert.throws(
      () => resolveSubscriptionDeliveryTransition({ ...base, currentDeliveryStatus: "delivered", nextDeliveryStatus, completedDeliveries: 2 }),
      /already delivered/,
    );
  }
});

test("ongoing weekly subscriptions never complete; invalid saved totals fail clearly", () => {
  const weekly = resolveSubscriptionDeliveryTransition({ ...base, frequency: "weekly", totalDeliveries: 0, currentDeliveryStatus: "out_for_delivery", nextDeliveryStatus: "delivered", completedDeliveries: 30 });
  assert.deepEqual(weekly, { updateDelivery: true, completedDeliveries: 31, subscriptionStatus: "active" });
  for (const totalDeliveries of [0, -1, 2.5, undefined, "four"]) {
    assert.throws(
      () => resolveSubscriptionDeliveryTransition({ ...base, totalDeliveries, currentDeliveryStatus: "out_for_delivery", nextDeliveryStatus: "delivered", completedDeliveries: 0 }),
      /total deliveries .* is invalid/,
      String(totalDeliveries),
    );
  }
});

test("paused or cancelled parents keep their status until the total is reached", () => {
  const paused = resolveSubscriptionDeliveryTransition({ ...base, subscriptionStatus: "paused", currentDeliveryStatus: "out_for_delivery", nextDeliveryStatus: "delivered", completedDeliveries: 1 });
  assert.equal(paused.subscriptionStatus, "paused");
});

// --- Transaction-level behavior with a fake Firestore transaction ---

type Docs = Record<string, Record<string, unknown>>;

function fakeTransaction(docs: Docs) {
  const updates: { path: string; data: Record<string, unknown> }[] = [];
  return {
    updates,
    transaction: {
      get: async (ref: { path: string; id: string }) => ({
        id: ref.id,
        ref,
        exists: () => ref.path in docs,
        data: () => docs[ref.path],
      }),
      update: (ref: { path: string }, data: Record<string, unknown>) => {
        updates.push({ path: ref.path, data });
        docs[ref.path] = { ...docs[ref.path], ...data };
      },
    },
  };
}

const order = {
  id: "order-4",
  orderNumber: "ORD-4",
  orderType: "subscription",
  sourceSubscriptionId: "sub-1",
  sourceSubscriptionDeliveryNumber: 4,
} as Order;

function subscriptionDocs(overrides: Record<string, unknown> = {}): Docs {
  return {
    "subscriptions/sub-1": { status: "active", frequency: "monthly", totalDeliveries: 4, completedDeliveries: 3, ...overrides },
    "subscriptionDeliveries/sub-1_4": { subscriptionId: "sub-1", orderId: "order-4", deliveryNumber: 4, status: "out_for_delivery" },
  };
}

test("marking the final delivery delivered completes the parent; a retry changes nothing more", async () => {
  const docs = subscriptionDocs();
  const first = fakeTransaction(docs);
  await updateSubscriptionDeliveryStatusInTransaction(first.transaction as never, order, "delivered", "uid");
  assert.equal(docs["subscriptionDeliveries/sub-1_4"].status, "delivered");
  assert.equal(docs["subscriptions/sub-1"].status, "completed");
  assert.equal(docs["subscriptions/sub-1"].completedDeliveries, 4);

  const retry = fakeTransaction(docs);
  await updateSubscriptionDeliveryStatusInTransaction(retry.transaction as never, order, "delivered", "uid");
  assert.equal(docs["subscriptions/sub-1"].completedDeliveries, 4);
  assert.ok(!retry.updates.some(update => update.path === "subscriptionDeliveries/sub-1_4"), "delivery record untouched on retry");
  assert.ok(!retry.updates.some(update => "status" in update.data), "no status write on retry");
});

test("an intermediate delivery leaves the parent active", async () => {
  const docs = subscriptionDocs({ completedDeliveries: 1 });
  await updateSubscriptionDeliveryStatusInTransaction(fakeTransaction(docs).transaction as never, order, "delivered", "uid");
  assert.equal(docs["subscriptions/sub-1"].status, "active");
  assert.equal(docs["subscriptions/sub-1"].completedDeliveries, 2);
});

test("a record stored under another ID is found by orderId", async () => {
  const docs: Docs = {
    "subscriptions/sub-1": { status: "active", frequency: "monthly", totalDeliveries: 4, completedDeliveries: 3 },
    "subscriptionDeliveries/website-abc": { subscriptionId: "sub-1", orderId: "order-4", deliveryNumber: 4, status: "out_for_delivery" },
  };
  const { transaction } = fakeTransaction(docs);
  const websiteRef = { path: "subscriptionDeliveries/website-abc", id: "website-abc" };
  const deliveryId = await updateSubscriptionDeliveryStatusInTransaction(
    transaction as never, order, "delivered", "uid", undefined, [websiteRef as never],
  );
  assert.equal(deliveryId, "website-abc");
  assert.equal(docs["subscriptions/sub-1"].status, "completed");
});

test("a missing or mismatched delivery record fails instead of silently skipping progress", async () => {
  const missing = subscriptionDocs();
  delete missing["subscriptionDeliveries/sub-1_4"];
  await assert.rejects(
    updateSubscriptionDeliveryStatusInTransaction(fakeTransaction(missing).transaction as never, order, "delivered", "uid"),
    /delivery record was not found/,
  );

  const mismatched = subscriptionDocs();
  mismatched["subscriptionDeliveries/sub-1_4"] = { ...mismatched["subscriptionDeliveries/sub-1_4"], orderId: "another-order" };
  await assert.rejects(
    updateSubscriptionDeliveryStatusInTransaction(fakeTransaction(mismatched).transaction as never, order, "delivered", "uid"),
    /delivery record was not found/,
  );
});

test("one-time orders are not affected", async () => {
  const { transaction, updates } = fakeTransaction({});
  const result = await updateSubscriptionDeliveryStatusInTransaction(transaction as never, { id: "o", orderType: "one_time" } as Order, "delivered", "uid");
  assert.equal(result, null);
  assert.deepEqual(updates, []);
});
