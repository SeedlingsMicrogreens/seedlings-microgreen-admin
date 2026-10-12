import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/subscription-masters/page.tsx", "utf8");

test("Add opens the inline form tab with a blank plan", () => {
  assert.match(page, /function openAdd\(\)\{setEditingPlan\(null\);setFormDirty\(false\);setError\(""\);setTab\("form"\)\}/);
  assert.match(page, /onClick=\{openAdd\}[^>]*>[\s\S]*?Add Subscription Plan/);
});

test("Edit opens the same inline form with the selected plan", () => {
  assert.match(page, /function openEdit\(plan:SubscriptionPlan\)\{setEditingPlan\(plan\);setFormDirty\(false\);setError\(""\);setTab\("form"\)\}/);
  assert.match(page, /<PlanForm value=\{editingPlan\}/);
  assert.match(page, /value\?"Edit Subscription Plan":"Add Subscription Plan"/);
  assert.match(page, /const initial=value\?\{\.\.\.value/);
});

test("Cancel and listing navigation confirm before discarding dirty form changes", () => {
  assert.match(page, /if\(formDirty&&!\(await confirmAction\(\{title:"Discard unsaved changes\?"/);
  assert.match(page, /onCancel=\{\(\)=>void showPlanList\(\)\}/);
});

test("successful save returns to the refreshed listing while failures stay in the form", () => {
  assert.match(page, /async function savedPlan\(\)\{setFormDirty\(false\);setEditingPlan\(null\);setTab\("list"\);await load\(\)\}/);
  assert.match(page, /catch\(e\)\{onError\(e\)\}finally\{setSaving\(false\)\}/);
  assert.match(page, /<PlanForm[\s\S]*?onSaved=\{savedPlan\}[\s\S]*?onError=\{error=>\{void showError\(error,"Unable to save subscription plan\."\)\}\}/);
});

test("form validation failures are caught and shown through the centralized toast", () => {
  assert.match(page, /<form onSubmit=\{save\} noValidate>/);
  assert.match(page, /if\(!v\.name\.trim\(\)\) throw new Error\("Plan name is required\."\)/);
  assert.match(page, /if\(!Number\.isInteger\(Number\(v\.deliveriesPerTerm\)\)\|\|Number\(v\.deliveriesPerTerm\)<1\)/);
  assert.match(page, /if\(!Number\.isInteger\(Number\(v\.skipsAllowed\)\)\|\|Number\(v\.skipsAllowed\)<0\)/);
  assert.match(page, /onError=\{error=>\{void showError\(error,"Unable to save subscription plan\."\)\}\}/);
});

test("Subscription Masters form is rendered inline without the modal workflow", () => {
  assert.match(page, /<ul className="nav nav-tabs mb-3">/);
  assert.match(page, /tab==="list"\?[\s\S]*?<PlanForm/);
  assert.doesNotMatch(page, /className="modal|function PlanModal|function Modal/);
});

test("Subscription Plans listing has exactly the required columns in order", () => {
  assert.match(page, /<thead><tr><th>Product<\/th><th>Plan<\/th><th>Frequency<\/th><th>Deliveries<\/th><th>Skips Allowed<\/th><th>Selling Options<\/th><th>Status<\/th><th className="text-end">Actions<\/th><\/tr><\/thead>/);
  assert.match(page, /!plans\.length&&!loading&&<tr><td colSpan=\{8\}/);
});

test("Selling Options list each weight and formatted plan price without maximum information", () => {
  const listing = page.slice(page.indexOf('<div className="table-responsive"><table'), page.indexOf("</table>"));
  assert.match(listing, /sellingOptionPrice\(Number\(o\.planPrice \|\| 0\)\)/);
  assert.match(listing, /} - \$\{sellingOptionPrice/);
  assert.match(page, /toLocaleString\("en-IN",\{minimumFractionDigits:2,maximumFractionDigits:2\}\)/);
  assert.doesNotMatch(listing, /maximum|Maximum Plan Price|maximumQuantity/i);
});
