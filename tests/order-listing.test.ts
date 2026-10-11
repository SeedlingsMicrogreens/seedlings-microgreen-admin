import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTIVE_ORDER_STATUSES,
  defaultDeliveredDateRange,
  deliveredDateBounds,
  isActiveOrder,
  orderTimestampToDate,
} from "../lib/orderListing";
import type { OrderStatus, PaymentStatus } from "../types/order";

test("active order status list excludes unconfirmed and terminal states", () => {
  assert.deepEqual(ACTIVE_ORDER_STATUSES, [
    "confirmed",
    "preparing",
    "packed",
    "ready_for_handover",
    "handed_to_delivery",
    "out_for_delivery",
  ]);

  for (const status of ACTIVE_ORDER_STATUSES) {
    assert.equal(isActiveOrder({ status, paymentStatus: "paid" }), true);
    assert.equal(isActiveOrder({ status, paymentStatus: "partially_paid" }), true);
  }
  for (const status of ["pending_payment", "paid", "delivered", "cancelled"] as OrderStatus[]) {
    assert.equal(isActiveOrder({ status, paymentStatus: "paid" }), false);
  }
  for (const paymentStatus of ["pending", "failed", "refunded"] as PaymentStatus[]) {
    assert.equal(isActiveOrder({ status: "confirmed", paymentStatus }), false);
  }
});

test("delivered default covers seven local calendar dates including today", () => {
  assert.deepEqual(defaultDeliveredDateRange(new Date(2026, 9, 11, 23, 30)), {
    startDate: "2026-10-05",
    endDate: "2026-10-11",
  });
});

test("delivered date bounds are inclusive across both boundary dates", () => {
  const { start, endExclusive } = deliveredDateBounds("2026-10-05", "2026-10-11");
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 9);
  assert.equal(start.getDate(), 5);
  assert.equal(start.getHours(), 0);
  assert.equal(endExclusive.getFullYear(), 2026);
  assert.equal(endExclusive.getMonth(), 9);
  assert.equal(endExclusive.getDate(), 12);
  assert.equal(endExclusive.getHours(), 0);
});

test("invalid and reversed delivered date ranges are rejected", () => {
  assert.throws(() => deliveredDateBounds("2026-02-30", "2026-03-01"), /valid Start Date/);
  assert.throws(() => deliveredDateBounds("2026-10-12", "2026-10-11"), /Start Date must be/);
  assert.throws(() => deliveredDateBounds("", "2026-10-11"), /valid Start Date/);
});

test("delivered timestamp normalization supports Date and Firestore Timestamp values", () => {
  const expected = new Date(2026, 9, 11, 12);
  assert.equal(orderTimestampToDate(expected), expected);
  assert.deepEqual(orderTimestampToDate({ toDate: () => expected }), expected);
  assert.equal(orderTimestampToDate("2026-10-11T12:00:00.000Z"), null);
});

test("order listing service queries only active statuses and constrains delivered results by completion date", () => {
  const service = readFileSync("lib/orderListingService.ts", "utf8");
  assert.match(service, /where\("status", "in", \[\.\.\.ACTIVE_ORDER_STATUSES\]\)/);
  assert.match(service, /where\("updatedAt", ">=", Timestamp\.fromDate\(start\)\)/);
  assert.match(service, /where\("updatedAt", "<", Timestamp\.fromDate\(endExclusive\)\)/);
  assert.match(service, /assignment\.status !== "delivered"/);
  assert.match(service, /order\.status === "delivered"/);
  assert.match(service, /where\(documentId\(\), "in"/);
});

test("Orders page exposes Delivered range controls and keeps the empty state clear", () => {
  const page = readFileSync("app/orders/page.tsx", "utf8");
  assert.match(page, /Start Date/);
  assert.match(page, /End Date/);
  assert.match(page, /Apply \/ Search/);
  assert.match(page, /No delivered orders found for this date range\./);
  assert.match(page, /deliveredAtByOrderId/);
});
