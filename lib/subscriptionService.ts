import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { deliveriesForFrequency, nextDeliveryOnDay } from "@/types/subscription";
import type { SalesProduct } from "@/types/salesProduct";
import type { Customer } from "@/types/customer";
import type { Subscription, SubscriptionFrequency } from "@/types/subscription";

export function addWeeks(date: string, weeks: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export function subscriptionDeliveryDates(startDate: string, frequency: SubscriptionFrequency, day: number) {
  const total = deliveriesForFrequency(frequency);
  const first = nextDeliveryOnDay(new Date(`${startDate}T00:00:00`), day);
  if (total == null) {
    return [first];
  }
  return Array.from({ length: total }, (_, index) => addWeeks(first, index));
}

export function calculateSubscriptionEndDate(startDate: string, frequency: SubscriptionFrequency, day: number) {
  const dates = subscriptionDeliveryDates(startDate, frequency, day);
  return dates[dates.length - 1];
}

export function createSubscriptionPayload(args: {
  customer: Customer;
  product: SalesProduct;
  sellingOptionId: string;
  quantity: number;
  frequency: SubscriptionFrequency;
  startDate: string;
  deliveryDay: number;
  deliveryAddress?: Record<string, unknown>;
  notes?: string;
}) {
  const option = (args.product.sellingOptions ?? []).find(o => o.id === args.sellingOptionId && o.active);
  if (!option) throw new Error("Select an active selling / packing option.");
  if (!Number.isInteger(args.quantity) || args.quantity < 1) throw new Error("Quantity must be at least 1.");
  const firstDelivery = nextDeliveryOnDay(new Date(`${args.startDate}T00:00:00`), args.deliveryDay);
  const total = deliveriesForFrequency(args.frequency);
  const endDate = total == null ? "" : calculateSubscriptionEndDate(args.startDate, args.frequency, args.deliveryDay);

  return {
    customerId: args.customer.id,
    customerName: args.customer.name?.trim() || "Unnamed customer",
    customerMobile: args.customer.mobileNumber || args.customer.phone || "",
    productId: args.product.id,
    productName: args.product.name,
    sellingOptionId: option.id,
    sellingOptionLabel: option.weightGrams >= 1000 && option.weightGrams % 1000 === 0 ? `${option.weightGrams / 1000}kg box` : `${option.weightGrams} gms box`,
    weightGrams: option.weightGrams,
    unitPrice: option.price,
    quantity: args.quantity,
    frequency: args.frequency,
    totalDeliveries: total ?? 0,
    deliveriesGenerated: 0,
    nextDeliveryDate: firstDelivery,
    deliveryDay: args.deliveryDay,
    startDate: args.startDate,
    endDate,
    deliveryAddress: args.deliveryAddress ?? {},
    status: "active" as const,
    notes: args.notes?.trim() || "",
  };
}

export async function createSubscription(args: {
  customer: Customer;
  product: SalesProduct;
  sellingOptionId: string;
  quantity: number;
  frequency: SubscriptionFrequency;
  startDate: string;
  deliveryDay: number;
  deliveryAddress?: Record<string, unknown>;
  notes?: string;
  uid: string;
  email?: string;
}) {
  const data = createSubscriptionPayload(args);
  const ref = doc(collection(db, "subscriptions"));
  const subscriptionNumber = `SUB-${ref.id.slice(0, 8).toUpperCase()}`;
  await runTransaction(db, async tx => {
    tx.set(ref, {
      ...data,
      subscriptionNumber,
      createdByUid: args.uid,
      createdByEmail: args.email ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return ref.id;
}

export async function updateSubscriptionStatus(
  subscription: Subscription,
  status: Subscription["status"],
  uid: string,
  email?: string,
) {
  if (subscription.status === "completed" || subscription.status === "cancelled") {
    throw new Error("A completed or cancelled subscription cannot be changed.");
  }
  await runTransaction(db, async tx => {
    tx.update(doc(db, "subscriptions", subscription.id), {
      status,
      updatedAt: serverTimestamp(),
      statusChangedByUid: uid,
      statusChangedByEmail: email ?? "",
    });
  });
}
