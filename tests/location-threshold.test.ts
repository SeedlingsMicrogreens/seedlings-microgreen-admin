import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLocationRecordData,
  createLocationThreshold,
  formatLocationThreshold,
  locationThresholdFormValues,
} from "../lib/locationThreshold";

test("normalizes kg to grams while preserving the user's numeric value and unit", () => {
  assert.deepEqual(createLocationThreshold("0.004", "kg"), {
    thresholdGrams: 4,
    thresholdValue: 0.004,
    thresholdUnit: "kg",
  });
  assert.deepEqual(createLocationThreshold("25", "gms"), {
    thresholdGrams: 25,
    thresholdValue: 25,
    thresholdUnit: "gms",
  });
});

test("rejects blank, non-finite, non-positive, and unsupported threshold inputs", () => {
  assert.throws(() => createLocationThreshold("", "gms"), /Threshold value is required/);
  assert.throws(() => createLocationThreshold("  ", "gms"), /Threshold value is required/);
  for (const invalidValue of ["0", "-1", "Infinity", "not-a-number"]) {
    assert.throws(() => createLocationThreshold(invalidValue, "gms"), /must be a number greater than zero/);
  }
  assert.throws(() => createLocationThreshold("1", ""), /Threshold unit is required/);
  assert.throws(() => createLocationThreshold("1", "pounds"), /Threshold unit must be gms or kg/);
  assert.throws(() => createLocationThreshold("1e308", "kg"), /too large to convert/);
});

test("requires location name and prevents building incomplete write data", () => {
  const baseForm = {
    name: "  ",
    type: "rack" as const,
    active: true,
    notes: "",
    thresholdValue: "10",
    thresholdUnit: "gms" as const,
  };
  assert.throws(() => buildLocationRecordData(baseForm), /Location name is required/);
  assert.throws(
    () => buildLocationRecordData({ ...baseForm, name: "Rack A", thresholdValue: "" }),
    /Threshold value is required/,
  );
  assert.throws(
    () => buildLocationRecordData({ ...baseForm, name: "Rack A", thresholdUnit: "" }),
    /Threshold unit is required/,
  );
});

test("loads saved values and unit into edit form without inventing legacy thresholds", () => {
  assert.deepEqual(locationThresholdFormValues({ thresholdValue: 0.004, thresholdUnit: "kg" }), {
    thresholdValue: "0.004",
    thresholdUnit: "kg",
  });
  assert.deepEqual(locationThresholdFormValues({}), {
    thresholdValue: "",
    thresholdUnit: "",
  });
  assert.equal(formatLocationThreshold(0.004, "kg"), "0.004 kg");
  assert.equal(formatLocationThreshold(), "—");
});

test("Rack Locations form persists thresholds on create and update without changing value on unit selection", () => {
  const page = readFileSync("app/locations/page.tsx", "utf8");
  assert.match(page, /thresholdUnit: event\.target\.value as LocationThresholdUnit \| ""/);
  assert.match(page, /thresholdValue: event\.target\.value/);
  assert.match(page, /data = buildLocationRecordData\(form\)/);
  assert.match(page, /await showError\(validationError, "Unable to validate rack location\."\)/);
  assert.match(page, /await showError\(saveError, "Unable to save rack location\."\)/);
  assert.match(page, /<form onSubmit=\{save\} noValidate>/);
  assert.ok(page.indexOf("data = buildLocationRecordData(form)") < page.indexOf('updateRecord("locations", editing, data)'));
  assert.ok(page.indexOf("data = buildLocationRecordData(form)") < page.indexOf('createRecord("locations", data)'));
  assert.match(page, /updateRecord\("locations", editing, data\)/);
  assert.match(page, /createRecord\("locations", data\)/);
  assert.match(page, /<th>Threshold<\/th>/);
  assert.match(page, /formatLocationThreshold\(location\.thresholdValue, location\.thresholdUnit\)/);
});
