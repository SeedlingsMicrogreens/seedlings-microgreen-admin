import type { Offer, OfferType } from "@/types/offer";

export const OFFER_DATE_RANGE_ERROR = "Offer start date must be on or before the end date.";
export const OFFER_DATE_OVERLAP_ERROR =
  "An offer of this type already exists for the selected date range. Please choose a non-overlapping date range.";

type OfferDateRecord = {
  id?: string;
  type: Offer["type"];
  startDate: unknown;
  endDate: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeOfferDate(value: unknown): string | null {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
        ? value
        : null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  if (isRecord(value)) {
    if (typeof value.toDate === "function") {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime())
        ? date.toISOString().slice(0, 10)
        : null;
    }
    if (typeof value.seconds === "number") {
      const date = new Date(value.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    }
  }

  return null;
}

export function validateOfferDateRange(startValue: unknown, endValue: unknown) {
  const startDate = normalizeOfferDate(startValue);
  const endDate = normalizeOfferDate(endValue);
  if (!startDate || !endDate || startDate > endDate) {
    throw new Error(OFFER_DATE_RANGE_ERROR);
  }
  return { startDate, endDate };
}

export function findOfferDateOverlap(
  candidate: { id?: string; type: OfferType; startDate: unknown; endDate: unknown },
  existingOffers: OfferDateRecord[],
) {
  const candidateRange = validateOfferDateRange(candidate.startDate, candidate.endDate);

  return existingOffers.find(existing => {
    if (existing.id === candidate.id || existing.type !== candidate.type) return false;
    const existingRange = validateOfferDateRange(existing.startDate, existing.endDate);
    return candidateRange.startDate <= existingRange.endDate &&
      candidateRange.endDate >= existingRange.startDate;
  });
}

export function assertNoOfferDateOverlap(
  candidate: { id?: string; type: OfferType; startDate: unknown; endDate: unknown },
  existingOffers: OfferDateRecord[],
) {
  if (findOfferDateOverlap(candidate, existingOffers)) {
    throw new Error(OFFER_DATE_OVERLAP_ERROR);
  }
}
