// Dry run: reports persisted subscription dates that differ from the weekly schedule.
// READ-ONLY — this script only calls get(); it never writes, updates or deletes.
//
// Usage (needs Google Application Default Credentials with read access to the project):
//   npx tsx --env-file=.env.local scripts/audit-subscription-dates.ts [--out report.json]

import { writeFileSync } from "node:fs";
import { adminDb } from "../lib/firebaseAdmin";
import { auditSubscriptionDates, type AuditDelivery, type AuditOrder, type AuditSubscription } from "../lib/subscriptionDateAudit";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function groupBy<T>(items: T[], key: (item: T) => string | undefined) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex > -1 ? process.argv[outIndex + 1] : `subscription-date-audit-${Date.now()}.json`;

  // Only date and identity fields are read; customer details are not fetched.
  const [subscriptionSnap, deliverySnap, typedOrderSnap, sourcedOrderSnap] = await Promise.all([
    adminDb.collection("subscriptions")
      .select("status", "deliveryDay", "startDate", "nextDeliveryDate", "endDate", "totalDeliveries", "deliveriesGenerated", "lastDeliveryNumber", "lastDeliveryDate")
      .get(),
    adminDb.collection("subscriptionDeliveries").select("subscriptionId", "deliveryNumber", "deliveryDate", "status").get(),
    adminDb.collection("orders").where("orderType", "==", "subscription")
      .select("orderNumber", "sourceSubscriptionId", "sourceSubscriptionDeliveryNumber", "scheduledDeliveryDate", "status").get(),
    adminDb.collection("orders").where("sourceSubscriptionId", ">", "")
      .select("orderNumber", "sourceSubscriptionId", "sourceSubscriptionDeliveryNumber", "scheduledDeliveryDate", "status").get(),
  ]);

  const subscriptions = subscriptionSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as AuditSubscription);
  const deliveries = groupBy(deliverySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as AuditDelivery), d => d.subscriptionId);
  const orderById = new Map([...typedOrderSnap.docs, ...sourcedOrderSnap.docs].map(doc => [doc.id, { id: doc.id, ...doc.data() } as AuditOrder]));
  const orders = groupBy([...orderById.values()], o => o.sourceSubscriptionId);

  const results = subscriptions.map(subscription =>
    auditSubscriptionDates(subscription, deliveries.get(subscription.id) ?? [], orders.get(subscription.id) ?? []));
  const affected = results.filter(result => result.findings.length || result.needsReview);
  const orphanedSubscriptionIds = [...new Set([...deliveries.keys(), ...orders.keys()])].filter(id => !subscriptions.some(s => s.id === id));

  writeFileSync(outPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    scanned: { subscriptions: subscriptions.length, subscriptionDeliveries: deliverySnap.size, subscriptionOrders: orderById.size },
    affectedSubscriptions: affected.length,
    orphanedSubscriptionIds,
    results: affected,
  }, null, 2)}\n`);

  console.log(`Scanned ${subscriptions.length} subscriptions, ${deliverySnap.size} subscription deliveries, ${orderById.size} subscription orders.`);
  for (const result of affected) {
    console.log(`\nsubscriptions/${result.subscriptionId} [${result.subscriptionStatus ?? "?"}] day=${DAY_NAMES[result.deliveryDay]} anchor=${result.anchor ?? "none"} (${result.anchorSource})${result.needsReview ? " NEEDS REVIEW" : ""}`);
    for (const note of result.notes) console.log(`  note: ${note}`);
    for (const f of result.findings) {
      const number = f.deliveryNumber ? ` #${f.deliveryNumber}` : "";
      const offset = f.offsetDays !== undefined ? ` (${f.offsetDays > 0 ? "+" : ""}${f.offsetDays}d)` : "";
      console.log(`  ${f.collection}/${f.documentId}.${f.field}${number} [${f.status ?? "?"}]: ${f.current || "(empty)"} -> ${f.expected || "(empty)"}${offset}`);
    }
  }
  if (orphanedSubscriptionIds.length) console.log(`\nRecords referencing missing subscriptions: ${orphanedSubscriptionIds.join(", ")}`);
  console.log(`\n${affected.length} subscription(s) with differences. Full report: ${outPath}`);
  console.log("No data was changed.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
