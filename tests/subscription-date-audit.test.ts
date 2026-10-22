import assert from "node:assert/strict";
import test from "node:test";

import { auditSubscriptionDates, type AuditSubscription } from "../lib/subscriptionDateAudit";

const subscription: AuditSubscription = {
  id: "sub-1",
  status: "active",
  deliveryDay: 6,
  startDate: "2026-10-20",
  totalDeliveries: 4,
  deliveriesGenerated: 3,
  nextDeliveryDate: "2026-11-12",
  endDate: "2026-11-11",
};

test("reports the one-day-per-step drift against the first stored Saturday", () => {
  const audit = auditSubscriptionDates(
    subscription,
    [
      { id: "sub-1_1", subscriptionId: "sub-1", deliveryNumber: 1, deliveryDate: "2026-10-24", status: "delivered" },
      { id: "sub-1_2", subscriptionId: "sub-1", deliveryNumber: 2, deliveryDate: "2026-10-30", status: "delivered" },
    ],
    [{ id: "order-3", sourceSubscriptionId: "sub-1", sourceSubscriptionDeliveryNumber: 3, scheduledDeliveryDate: "2026-11-05", status: "confirmed" }],
  );

  assert.equal(audit.anchor, "2026-10-24");
  assert.equal(audit.anchorSource, "stored delivery #1");
  assert.equal(audit.needsReview, false);
  assert.deepEqual(
    audit.findings.map(f => [`${f.collection}/${f.documentId}.${f.field}`, f.current, f.expected, f.offsetDays]),
    [
      ["subscriptionDeliveries/sub-1_2.deliveryDate", "2026-10-30", "2026-10-31", -1],
      ["orders/order-3.scheduledDeliveryDate", "2026-11-05", "2026-11-07", -2],
      ["subscriptions/sub-1.nextDeliveryDate", "2026-11-12", "2026-11-14", -2],
      ["subscriptions/sub-1.endDate", "2026-11-11", "2026-11-14", -3],
    ],
  );
});

test("a correct schedule produces no findings", () => {
  const audit = auditSubscriptionDates(
    { ...subscription, nextDeliveryDate: "2026-11-14", endDate: "2026-11-14" },
    [{ id: "sub-1_1", subscriptionId: "sub-1", deliveryNumber: 1, deliveryDate: "2026-10-24" }],
    [{ id: "order-2", sourceSubscriptionId: "sub-1", sourceSubscriptionDeliveryNumber: 2, scheduledDeliveryDate: "2026-10-31" }],
  );
  assert.deepEqual(audit.findings, []);
  assert.equal(audit.needsReview, false);
});

test("a shifted first delivery falls back to the start date and is flagged for review", () => {
  const audit = auditSubscriptionDates(
    { ...subscription, deliveriesGenerated: 1, nextDeliveryDate: "2026-10-30", endDate: "2026-11-13" },
    [{ id: "sub-1_1", subscriptionId: "sub-1", deliveryNumber: 1, deliveryDate: "2026-10-23", status: "delivered" }],
    [],
  );
  assert.equal(audit.anchor, "2026-10-24");
  assert.equal(audit.anchorSource, "start date");
  assert.equal(audit.needsReview, true);
  assert.deepEqual(audit.findings.map(f => [f.field, f.expected]), [["deliveryDate", "2026-10-24"], ["nextDeliveryDate", "2026-10-31"], ["endDate", "2026-11-14"]]);
});

test("finished fixed-length and ongoing weekly subscriptions expect no next or end date respectively", () => {
  const finished = auditSubscriptionDates(
    { ...subscription, deliveriesGenerated: 4, nextDeliveryDate: "", endDate: "2026-11-14" },
    [{ id: "sub-1_1", subscriptionId: "sub-1", deliveryNumber: 1, deliveryDate: "2026-10-24" }],
    [],
  );
  assert.deepEqual(finished.findings, []);

  const weekly = auditSubscriptionDates(
    { ...subscription, totalDeliveries: 0, deliveriesGenerated: 1, nextDeliveryDate: "2026-10-31", endDate: "" },
    [{ id: "sub-1_1", subscriptionId: "sub-1", deliveryNumber: 1, deliveryDate: "2026-10-24" }],
    [],
  );
  assert.deepEqual(weekly.findings, []);
});

test("records without a usable anchor or delivery number are noted, not guessed", () => {
  const audit = auditSubscriptionDates(
    { id: "sub-2", deliveryDay: 6 },
    [{ id: "sub-2_x", subscriptionId: "sub-2", deliveryDate: "2026-10-30" }],
    [],
  );
  assert.equal(audit.anchorSource, "none");
  assert.equal(audit.needsReview, true);
  assert.deepEqual(audit.findings, []);
  assert.equal(audit.notes.length, 2);
});

test("a stored non-Saturday delivery day is reported and dates are judged against Saturday", () => {
  const audit = auditSubscriptionDates(
    { ...subscription, deliveryDay: 5, deliveriesGenerated: 1, nextDeliveryDate: "2026-10-30", endDate: "2026-11-13" },
    [{ id: "sub-1_1", subscriptionId: "sub-1", deliveryNumber: 1, deliveryDate: "2026-10-23" }],
    [],
  );
  assert.equal(audit.deliveryDay, 6);
  assert.equal(audit.anchor, "2026-10-24");
  assert.ok(audit.findings.some(f => f.field === "deliveryDay" && f.current === "5" && f.expected === "6"));
});
