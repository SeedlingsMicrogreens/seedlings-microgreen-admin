import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertNoOfferDateOverlap,
  findOfferDateOverlap,
  normalizeOfferDate,
  OFFER_DATE_OVERLAP_ERROR,
  validateOfferDateRange,
} from "../lib/offerDateValidation";
import type { Offer, OfferType } from "../types/offer";

const offer = (
  id: string,
  type: OfferType,
  startDate: string,
  endDate: string,
): Offer => ({
  id,
  name: id,
  locationType: "all",
  type,
  startDate,
  endDate,
  active: true,
});

test("normalizes date strings and Firestore Timestamp-compatible values", () => {
  assert.equal(normalizeOfferDate("2026-10-11"), "2026-10-11");
  assert.equal(normalizeOfferDate("invalid"), null);
  assert.equal(normalizeOfferDate(new Date("2026-10-11T23:00:00.000Z")), "2026-10-11");
  assert.equal(normalizeOfferDate({ toDate: () => new Date("2026-10-11T23:00:00.000Z") }), "2026-10-11");
  assert.equal(normalizeOfferDate({ seconds: 1791676800 }), "2026-10-11");
});

test("validates date order and rejects malformed or reversed ranges", () => {
  assert.deepEqual(validateOfferDateRange("2026-10-10", "2026-10-20"), {
    startDate: "2026-10-10",
    endDate: "2026-10-20",
  });
  assert.throws(() => validateOfferDateRange("", "2026-10-20"), /start date must be on or before/);
  assert.throws(() => validateOfferDateRange("2026-10-21", "2026-10-20"), /start date must be on or before/);
  assert.throws(() => validateOfferDateRange("not-a-date", "2026-10-20"), /start date must be on or before/);
});

test("rejects same-type overlap including identical ranges and inclusive boundaries", () => {
  const existing = offer("old", "price", "2026-10-10", "2026-10-20");
  for (const candidate of [
    { type: "price" as const, startDate: "2026-10-15", endDate: "2026-10-25" },
    { type: "price" as const, startDate: "2026-10-10", endDate: "2026-10-20" },
    { type: "price" as const, startDate: "2026-10-20", endDate: "2026-10-30" },
    { type: "price" as const, startDate: "2026-10-01", endDate: "2026-10-10" },
  ]) {
    assert.throws(
      () => assertNoOfferDateOverlap(candidate, [existing]),
      error => error instanceof Error && error.message === OFFER_DATE_OVERLAP_ERROR,
    );
  }
});

test("allows non-overlapping ranges and overlapping ranges of different types", () => {
  const existing = offer("old", "price", "2026-10-10", "2026-10-20");
  assert.doesNotThrow(() => assertNoOfferDateOverlap({
    type: "price",
    startDate: "2026-10-21",
    endDate: "2026-10-30",
  }, [existing]));
  assert.doesNotThrow(() => assertNoOfferDateOverlap({
    type: "deliveryCharge",
    startDate: "2026-10-15",
    endDate: "2026-10-25",
  }, [existing]));
});

test("updates exclude themselves but detect another overlapping same-type offer", () => {
  const current = offer("current", "price", "2026-10-10", "2026-10-20");
  assert.equal(findOfferDateOverlap({
    id: current.id,
    type: "price",
    startDate: current.startDate,
    endDate: current.endDate,
  }, [current]), undefined);
  assert.throws(() => assertNoOfferDateOverlap({
    id: current.id,
    type: "price",
    startDate: "2026-10-15",
    endDate: "2026-10-25",
  }, [current, offer("other", "price", "2026-10-24", "2026-10-30")]), /already exists/);
});

test("Offers UI and service both check before writing and use the centralized error toast", () => {
  const page = readFileSync("app/offers/page.tsx", "utf8");
  const service = readFileSync("lib/offerService.ts", "utf8");
  assert.match(page, /assertNoOfferDateOverlap/);
  assert.match(page, /showError\(validationError/);
  assert.match(page, /await showError\(e, "Unable to save offer\."\)/);
  assert.match(service, /runTransaction\(db, async transaction =>/);
  assert.match(service, /assertNoOfferDateOverlap/);
  assert.match(service, /offerTypeLockRef/);
  assert.match(service, /transaction\.set\(offerRef/);
  assert.match(service, /transaction\.update\(offerRef/);
});
