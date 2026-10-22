import { addCalendarDays, calendarDayOfWeek, nextCalendarDateOnDay } from "./calendarDate";
import { SUBSCRIPTION_DELIVERY_DAY } from "@/types/subscription";

// Read-only analysis of persisted subscription dates. Expected dates are rebuilt from the
// subscription's first delivery: delivery n = first + 7 × (n − 1). Nothing here writes data.

export type AuditSubscription = {
  id: string;
  status?: string;
  deliveryDay?: number;
  startDate?: string;
  nextDeliveryDate?: string;
  endDate?: string;
  totalDeliveries?: number;
  deliveriesGenerated?: number;
  lastDeliveryNumber?: number;
  lastDeliveryDate?: string;
};

export type AuditDelivery = { id: string; subscriptionId: string; deliveryNumber?: number; deliveryDate?: string; status?: string };
export type AuditOrder = { id: string; orderNumber?: string; sourceSubscriptionId?: string; sourceSubscriptionDeliveryNumber?: number; scheduledDeliveryDate?: string; status?: string };

export type DateFinding = {
  collection: "subscriptions" | "subscriptionDeliveries" | "orders";
  documentId: string;
  field: string;
  deliveryNumber?: number;
  status?: string;
  current: string;
  expected: string;
  offsetDays?: number;
};

export type SubscriptionDateAudit = {
  subscriptionId: string;
  subscriptionStatus?: string;
  deliveryDay: number;
  anchor?: string;
  anchorSource: "stored delivery #1" | "start date" | "none";
  /** Expected dates come from the start date, or cannot be derived; confirm before correcting. */
  needsReview: boolean;
  notes: string[];
  findings: DateFinding[];
};

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !CALENDAR_DATE.test(value)) return false;
  try {
    calendarDayOfWeek(value);
    return true;
  } catch {
    return false;
  }
}

function positiveInteger(value: unknown) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function dayDifference(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function auditSubscriptionDates(
  subscription: AuditSubscription,
  deliveries: AuditDelivery[],
  orders: AuditOrder[],
): SubscriptionDateAudit {
  // Business rule: every subscription delivers on Saturday, whatever deliveryDay was stored.
  const deliveryDay = SUBSCRIPTION_DELIVERY_DAY;
  const notes: string[] = [];
  const findings: DateFinding[] = [];

  const storedFirst = [
    ...deliveries.filter(d => positiveInteger(d.deliveryNumber) === 1).map(d => d.deliveryDate),
    ...orders.filter(o => positiveInteger(o.sourceSubscriptionDeliveryNumber) === 1).map(o => o.scheduledDeliveryDate),
  ].find(isCalendarDate);

  let anchor: string | undefined;
  let anchorSource: SubscriptionDateAudit["anchorSource"] = "none";
  if (storedFirst && calendarDayOfWeek(storedFirst) === deliveryDay) {
    anchor = storedFirst;
    anchorSource = "stored delivery #1";
  } else if (isCalendarDate(subscription.startDate)) {
    anchor = nextCalendarDateOnDay(subscription.startDate, deliveryDay);
    anchorSource = "start date";
    notes.push(storedFirst
      ? `Stored delivery #1 (${storedFirst}) is not on the delivery day; expected dates use the start date instead.`
      : "No stored delivery #1; expected dates use the start date.");
  } else {
    notes.push("No usable delivery #1 date or start date; expected dates cannot be derived.");
  }

  const expectedFor = (deliveryNumber: number) => anchor ? addCalendarDays(anchor, (deliveryNumber - 1) * 7) : undefined;
  const check = (finding: Omit<DateFinding, "expected" | "offsetDays">, expected: string | undefined) => {
    if (expected === undefined || finding.current === expected) return;
    findings.push({
      ...finding,
      expected,
      offsetDays: isCalendarDate(finding.current) && expected ? dayDifference(expected, finding.current) : undefined,
    });
  };

  for (const delivery of deliveries) {
    const deliveryNumber = positiveInteger(delivery.deliveryNumber);
    if (!deliveryNumber) {
      notes.push(`subscriptionDeliveries/${delivery.id} has no delivery number; not checked.`);
      continue;
    }
    check({ collection: "subscriptionDeliveries", documentId: delivery.id, field: "deliveryDate", deliveryNumber, status: delivery.status, current: delivery.deliveryDate ?? "" }, expectedFor(deliveryNumber));
  }

  for (const order of orders) {
    const deliveryNumber = positiveInteger(order.sourceSubscriptionDeliveryNumber);
    if (!deliveryNumber) {
      notes.push(`orders/${order.id} has no subscription delivery number; not checked.`);
      continue;
    }
    check({ collection: "orders", documentId: order.id, field: "scheduledDeliveryDate", deliveryNumber, status: order.status, current: order.scheduledDeliveryDate ?? "" }, expectedFor(deliveryNumber));
  }

  const total = positiveInteger(subscription.totalDeliveries);
  const generated = Math.max(
    positiveInteger(subscription.deliveriesGenerated) ?? 0,
    ...deliveries.map(d => positiveInteger(d.deliveryNumber) ?? 0),
    ...orders.map(o => positiveInteger(o.sourceSubscriptionDeliveryNumber) ?? 0),
  );
  const subscriptionFinding = (field: string, current: string | undefined) =>
    ({ collection: "subscriptions" as const, documentId: subscription.id, field, status: subscription.status, current: current ?? "" });

  check(subscriptionFinding("nextDeliveryDate", subscription.nextDeliveryDate), total && generated >= total ? "" : expectedFor(generated + 1));
  check(subscriptionFinding("endDate", subscription.endDate), total ? expectedFor(total) : "");
  if (subscription.deliveryDay !== undefined && subscription.deliveryDay !== deliveryDay) {
    findings.push({ ...subscriptionFinding("deliveryDay", String(subscription.deliveryDay)), expected: String(deliveryDay) });
  }
  const lastNumber = positiveInteger(subscription.lastDeliveryNumber);
  if (lastNumber && subscription.lastDeliveryDate !== undefined) {
    check({ ...subscriptionFinding("lastDeliveryDate", subscription.lastDeliveryDate), deliveryNumber: lastNumber }, expectedFor(lastNumber));
  }

  return {
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    deliveryDay,
    anchor,
    anchorSource,
    needsReview: anchorSource !== "stored delivery #1" && (findings.length > 0 || !anchor),
    notes,
    findings,
  };
}
