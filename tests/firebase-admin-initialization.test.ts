import assert from "node:assert/strict";
import { getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import test from "node:test";

import { adminAuth, adminDb, firebaseAdminApp } from "../lib/firebaseAdmin";
import { apiErrorResponse } from "../lib/server/adminAuthorization";

test("all server Firebase Admin services share one ADC-backed Admin app", () => {
  const adminApps = getApps().filter(app => app.name === "seedlings-admin-server");
  assert.equal(adminApps.length, 1);
  assert.equal(adminApps[0], firebaseAdminApp);
  assert.equal(adminAuth, getAuth(firebaseAdminApp));
  assert.equal(adminDb, getFirestore(firebaseAdminApp));
});

test("missing runtime ADC returns a precise configuration error without custom app secrets", async () => {
  const response = apiErrorResponse(
    new Error("Could not load the default credentials"),
    "Firebase Admin test",
  );
  const body = await response.json() as { error: string };

  assert.equal(response.status, 503);
  assert.match(body.error, /Google Application Default Credentials/);
  assert.match(body.error, /hosting runtime's service account\/workload identity/);
  assert.doesNotMatch(body.error, /FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON/);
});

test("delivery-user and admin authorization use the shared Admin initialization", async () => {
  const { readFile } = await import("node:fs/promises");
  const [route, authorization] = await Promise.all([
    readFile("app/api/admin/delivery-users/route.ts", "utf8"),
    readFile("lib/server/adminAuthorization.ts", "utf8"),
  ]);
  assert.match(route, /from "@\/lib\/firebaseAdmin"/);
  assert.match(authorization, /from "@\/lib\/firebaseAdmin"/);
  assert.match(route, /createUser\(\{ uid: phoneNumber, phoneNumber/);
  assert.match(authorization, /verifyIdToken\(token\)/);
});
