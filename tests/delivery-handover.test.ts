import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runHandoverWithOutcomeCheck, validateOrderForHandover } from "../lib/deliveryHandover";
import type { Order } from "../types/order";

const packedOrder = { id: "order-1", orderNumber: "ORD-1", status: "packed" } as Order;

test("handover accepts only an existing fully packed order", () => {
  assert.equal(validateOrderForHandover(packedOrder, packedOrder.id), packedOrder);
  assert.throws(() => validateOrderForHandover(undefined, "order-1"), /Order no longer exists/);
  assert.throws(
    () => validateOrderForHandover({ ...packedOrder, status: "preparing" }, packedOrder.id),
    /ORD-1 is no longer packed/,
  );
});

test("a retried concurrent handover rejects the order after its first status transition", () => {
  assert.doesNotThrow(() => validateOrderForHandover(packedOrder, packedOrder.id));
  assert.throws(
    () => validateOrderForHandover({ ...packedOrder, status: "out_for_delivery" }, packedOrder.id),
    /ORD-1 is no longer packed/,
  );
});

test("successful and slow transaction responses return normally without rechecking the commit", async () => {
  let verificationCount = 0;
  let commitCount = 0;
  const result = await runHandoverWithOutcomeCheck(
    Promise.resolve().then(async () => {
      commitCount += 1;
      await new Promise(resolve => setTimeout(resolve, 25));
      return "assignment-1";
    }),
    async () => {
      verificationCount += 1;
      return true;
    },
  );

  assert.equal(result, "assignment-1");
  assert.equal(commitCount, 1);
  assert.equal(verificationCount, 0);
});

test("network failure before commit preserves the error and does not repeat the transaction", async () => {
  const networkError = new TypeError("Failed to fetch");
  let commitCount = 0;
  let verificationCount = 0;
  await assert.rejects(
    runHandoverWithOutcomeCheck(
      Promise.resolve().then(async () => {
        commitCount += 1;
        throw networkError;
      }),
      async () => {
        verificationCount += 1;
        return false;
      },
    ),
    error => error === networkError,
  );
  assert.equal(commitCount, 1);
  assert.equal(verificationCount, 1);
});

test("known validation failures are rethrown without unnecessary verification reads", async () => {
  const validationError = new Error("Source subscription not found.");
  let verificationCount = 0;
  await assert.rejects(
    runHandoverWithOutcomeCheck(
      Promise.resolve().then(async () => {
        throw validationError;
      }),
      async () => {
        verificationCount += 1;
        return false;
      },
    ),
    error => error === validationError,
  );
  assert.equal(verificationCount, 0);
});

test("a possibly committed request is treated as success after persisted status verification", async () => {
  const lostResponseError = new TypeError("Failed to fetch");
  let commitCount = 0;
  let verificationCount = 0;
  const result = await runHandoverWithOutcomeCheck(
    Promise.resolve().then(async () => {
      commitCount += 1;
      throw lostResponseError;
    }),
    async () => {
      verificationCount += 1;
      return true;
    },
  );
  assert.equal(result, undefined);
  assert.equal(commitCount, 1);
  assert.equal(verificationCount, 1);
});

test("an unverifiable handover outcome tells the operator to refresh before retrying", async () => {
  await assert.rejects(
    runHandoverWithOutcomeCheck(
      Promise.resolve().then(async () => {
        throw new TypeError("Failed to fetch");
      }),
      async () => {
        throw new TypeError("Failed to fetch");
      },
    ),
    /outcome could not be confirmed\. Refresh Delivery Operations before trying again/,
  );
});

test("successful handover preserves its order, assignment, fulfilment and subscription updates", () => {
  const deliveryService = readFileSync("lib/deliveryService.ts", "utf8");
  const batchService = readFileSync("lib/growingBatchService.ts", "utf8");
  const subscriptionService = readFileSync("lib/subscriptionDeliveryService.ts", "utf8");

  assert.match(deliveryService, /const nextStatus: OrderStatus = "out_for_delivery"/);
  assert.match(deliveryService, /deliveryUserId: deliveryUser\.id/);
  assert.match(deliveryService, /status: "out_for_delivery",\s+assignedByUid/);
  assert.match(deliveryService, /status: "out_for_delivery",\s+updatedAt: serverTimestamp\(\)/);
  assert.match(batchService, /soldQuantityRecordedAt: serverTimestamp\(\)/);
  assert.match(subscriptionService, /status: "out_for_delivery"/);
  assert.match(subscriptionService, /deliveriesGenerated: Math\.max\(currentGenerated, deliveryNumber\)/);
  assert.match(deliveryService, /void sendTransactionNotification/);
  assert.match(deliveryService, /\.catch\(error => console\.error\("Customer out-for-delivery notification failed after handover committed", error\)\)/);
});

test("handover reads and prepares batch and subscription data before its first transaction write", () => {
  const service = readFileSync("lib/deliveryService.ts", "utf8");
  const transactionBody = service.slice(
    service.indexOf("export async function assignOrderToDelivery"),
    service.indexOf("export async function updateDeliveryAssignmentStatus"),
  );
  const batchPreparation = transactionBody.indexOf("prepareBatchHandoverSalesInTransaction");
  const subscriptionPreparation = transactionBody.indexOf("prepareSubscriptionDeliveryAtHandoverInTransaction");
  const batchApplication = transactionBody.indexOf("applyBatchHandoverSalesInTransaction");
  const orderRead = transactionBody.indexOf("transaction.get(orderRef)");
  const transactionWrite = transactionBody.indexOf("transaction.update(orderRef");

  assert.ok(orderRead >= 0);
  assert.ok(batchPreparation > orderRead);
  assert.ok(batchPreparation >= 0);
  assert.ok(subscriptionPreparation > batchPreparation);
  assert.ok(batchApplication > subscriptionPreparation);
  assert.ok(transactionWrite > batchApplication);

  const batchService = readFileSync("lib/growingBatchService.ts", "utf8");
  const batchPrepareBody = batchService.slice(
    batchService.indexOf("export async function prepareBatchHandoverSalesInTransaction"),
    batchService.indexOf("export function applyBatchHandoverSalesInTransaction"),
  );
  const batchApplyBody = batchService.slice(
    batchService.indexOf("export function applyBatchHandoverSalesInTransaction"),
    batchService.indexOf("export async function recordBatchHandoverSalesInTransaction"),
  );
  const subscriptionService = readFileSync("lib/subscriptionDeliveryService.ts", "utf8");
  const subscriptionPrepareBody = subscriptionService.slice(
    subscriptionService.indexOf("export async function prepareSubscriptionDeliveryAtHandoverInTransaction"),
    subscriptionService.indexOf("export function applySubscriptionDeliveryAtHandoverInTransaction"),
  );
  const subscriptionApplyBody = subscriptionService.slice(
    subscriptionService.indexOf("export function applySubscriptionDeliveryAtHandoverInTransaction"),
    subscriptionService.indexOf("export async function createSubscriptionDeliveryAtHandoverInTransaction"),
  );
  assert.doesNotMatch(batchPrepareBody, /transaction\.(?:set|update|delete)\s*\(/);
  assert.doesNotMatch(batchApplyBody, /transaction\.get\s*\(/);
  assert.doesNotMatch(subscriptionPrepareBody, /transaction\.(?:set|update|delete)\s*\(/);
  assert.doesNotMatch(subscriptionApplyBody, /transaction\.get\s*\(/);
});
