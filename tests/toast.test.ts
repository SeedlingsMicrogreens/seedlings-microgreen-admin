import assert from "node:assert/strict";
import test from "node:test";

import { buildToastFireOptions, TOAST_DURATION_MS } from "../lib/toast";

test("SweetAlert2 toast durations match notification severity requirements", () => {
  assert.equal(TOAST_DURATION_MS.success, 3000);
  assert.equal(TOAST_DURATION_MS.info, 3000);
  assert.equal(TOAST_DURATION_MS.warning, 5000);
  assert.equal(TOAST_DURATION_MS.error, 5000);
});

test("SweetAlert2 toast options preserve title, message, icon and timer", () => {
  assert.deepEqual(buildToastFireOptions("success", { title: "Saved", message: "Batch updated." }), {
    icon: "success",
    title: "Saved",
    text: "Batch updated.",
    timer: 3000,
  });

  assert.deepEqual(buildToastFireOptions("error", { title: "Something went wrong", message: "Unable to save." }), {
    icon: "error",
    title: "Something went wrong",
    text: "Unable to save.",
    timer: 5000,
  });
});

test("SweetAlert2 toast options trim blank fields and allow explicit duration override", () => {
  assert.deepEqual(buildToastFireOptions("info", { title: "  Queued  ", message: "   ", durationMs: 750 }), {
    icon: "info",
    title: "Queued",
    text: undefined,
    timer: 750,
  });
});
