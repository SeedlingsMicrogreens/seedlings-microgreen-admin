import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { growingBatchBusinessDate, growingBatchBusinessDayBounds, growingBatchNumberForSequence, growingBatchSequence, nextGrowingBatchSequence } from "../lib/growingBatchNumber";
import { normalizeIndianMobileNumber } from "../lib/deliveryIdentity";

test("growing batch date and sequence use Asia/Kolkata local dates", () => {
  assert.equal(growingBatchBusinessDate(new Date("2026-10-14T18:29:59.000Z")).date, "2026-10-14");
  assert.equal(growingBatchBusinessDate(new Date("2026-10-14T18:30:00.000Z")).date, "2026-10-15");
  assert.equal(growingBatchNumberForSequence("14102026", 1), "B-14102026-001");
  assert.equal(growingBatchNumberForSequence("14102026", 2), "B-14102026-002");
  assert.equal(growingBatchNumberForSequence("15102026", 1), "B-15102026-001");
  assert.equal(growingBatchSequence("B-14102026-002", "14102026"), 2);
  assert.equal(growingBatchSequence("B-13102026-099", "14102026"), undefined);
  assert.equal(nextGrowingBatchSequence(undefined, 0), 1);
  assert.equal(nextGrowingBatchSequence(1, 0), 2);
  assert.equal(nextGrowingBatchSequence(undefined, 2), 3);
  const bounds = growingBatchBusinessDayBounds("2026-10-14");
  assert.equal(bounds.start.toISOString(), "2026-10-13T18:30:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-10-14T18:30:00.000Z");
});

test("delivery mobile numbers normalize to one Indian E.164 identifier", () => {
  assert.equal(normalizeIndianMobileNumber("9876543210"), "+919876543210");
  assert.equal(normalizeIndianMobileNumber("09876543210"), "+919876543210");
  assert.equal(normalizeIndianMobileNumber("+91 98765-43210"), "+919876543210");
  assert.throws(() => normalizeIndianMobileNumber("1234567890"), /valid Indian mobile number/);
  assert.throws(() => normalizeIndianMobileNumber("+1 4155552671"), /valid Indian mobile number/);
});

test("signed-in Firestore transaction allocates batches and delivery form keeps Auth UID internal", () => {
  const batchService = readFileSync("lib/growingBatchService.ts", "utf8");
  const authorization = readFileSync("lib/server/adminAuthorization.ts", "utf8");
  const deliveryRoute = readFileSync("app/api/admin/delivery-users/route.ts", "utf8");
  const deliveryPage = readFileSync("app/delivery/page.tsx", "utf8");
  assert.match(batchService, /runTransaction\(db/);
  assert.match(batchService, /growingBatchNumberCounters/);
  assert.match(batchService, /transaction\.get\(counterRef\)/);
  assert.match(batchService, /existingMaximum/);
  assert.match(batchService, /transaction\.set\(ref,\s*\{\s*batchNumber/);
  assert.doesNotMatch(batchService, /postAdminApi/);
  assert.match(authorization, /verifyIdToken\(token\)/);
  assert.match(deliveryRoute, /createUser\(\{ uid: phoneNumber, phoneNumber/);
  assert.match(deliveryRoute, /getUserByPhoneNumber\(mobileNumber\)/);
  assert.match(deliveryRoute, /A delivery user already exists for this mobile number/);
  assert.match(deliveryRoute, /The legacy account was left untouched/);
  assert.match(deliveryRoute, /authUid,\s*name,/);
  assert.match(deliveryPage, /saveDeliveryUserRecord/);
  assert.doesNotMatch(deliveryPage, /name="authUid"/);
});
