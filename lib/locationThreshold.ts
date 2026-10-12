import type { Location, LocationThresholdUnit, LocationType } from "../types/location";

export type LocationThreshold = {
  thresholdGrams: number;
  thresholdValue: number;
  thresholdUnit: LocationThresholdUnit;
};

export type LocationThresholdFormValues = {
  thresholdValue: string;
  thresholdUnit: LocationThresholdUnit | "";
};

export type LocationFormData = {
  name: string;
  type: LocationType;
  active: boolean;
  notes: string;
  thresholdValue: string;
  thresholdUnit: LocationThresholdUnit | "";
};

export function locationThresholdFormValues(
  location: Pick<Location, "thresholdValue" | "thresholdUnit">,
): LocationThresholdFormValues {
  return {
    thresholdValue: location.thresholdValue === undefined ? "" : String(location.thresholdValue),
    thresholdUnit: location.thresholdUnit ?? "",
  };
}

export function createLocationThreshold(value: string, unit: string): LocationThreshold {
  if (!value.trim()) {
    throw new Error("Threshold value is required.");
  }
  const thresholdValue = Number(value);
  if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
    throw new Error("Threshold value must be a number greater than zero.");
  }
  if (!unit.trim()) throw new Error("Threshold unit is required.");
  if (unit !== "gms" && unit !== "kg") {
    throw new Error("Threshold unit must be gms or kg.");
  }

  const thresholdGrams = unit === "kg" ? thresholdValue * 1000 : thresholdValue;
  if (!Number.isFinite(thresholdGrams)) {
    throw new Error("Threshold is too large to convert to grams.");
  }

  return {
    thresholdGrams,
    thresholdValue,
    thresholdUnit: unit,
  };
}

export function buildLocationRecordData(form: LocationFormData) {
  const name = form.name.trim();
  if (!name) throw new Error("Location name is required.");

  return {
    name,
    type: form.type,
    active: form.active,
    notes: form.notes,
    ...createLocationThreshold(form.thresholdValue, form.thresholdUnit),
  };
}

export function formatLocationThreshold(value?: number, unit?: LocationThresholdUnit): string {
  if (value === undefined || unit === undefined) return "—";
  return `${value} ${unit}`;
}
