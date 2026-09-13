import { collection, doc, runTransaction, serverTimestamp, type Transaction } from "firebase/firestore";
import { db } from "./firebase";
import { auditEvent } from "./firestore";
import { addWeeks } from "./subscriptionService";
import type { Order } from "@/types/order";
import type { Subscription } from "@/types/subscription";
import type { SubscriptionDelivery, SubscriptionDeliveryStatus } from "@/types/subscriptionDelivery";

function deliveryDocumentId(subscriptionId: string, orderId: string, deliveryNumber: number) {
  return deliveryNumber > 0 ? `${subscriptionId}_${deliveryNumber}` : `${subscriptionId}_${orderId}`;
}

function nextDeliveryDate(subscription: Subscription, deliveryDate: string, deliveryNumber: number) {
  const total = Number(subscription.totalDeliveries || 0);
  if (total > 0 && deliveryNumber >= total) return "";
  return addWeeks(deliveryDate, 1);
}

export async function createSubscriptionDeliveryAtHandoverInTransaction(
  transaction: Transaction,
  order: Order,
  uid: string,
  email?: string,
) {
  if (order.orderType !== "subscription" || !order.sourceSubscriptionId) return null;

  const subscriptionRef = doc(db, "subscriptions", order.sourceSubscriptionId);
  const orderRef = doc(db, "orders", order.id);
  const subscriptionSnap = await transaction.get(subscriptionRef);
  const orderSnap = await transaction.get(orderRef);
  if (!subscriptionSnap.exists()) throw new Error("Source subscription not found.");
  if (!orderSnap.exists()) throw new Error("Subscription order no longer exists.");

  const subscription = { id: subscriptionSnap.id, ...(subscriptionSnap.data() as Omit<Subscription, "id">) } as Subscription;
  const currentOrder = { id: orderSnap.id, ...(orderSnap.data() as Omit<Order, "id">) } as Order;
  const existingNumber = Math.max(0, Math.round(Number(currentOrder.sourceSubscriptionDeliveryNumber || 0)));
  const currentGenerated = Math.max(0, Math.round(Number(subscription.deliveriesGenerated || 0)));
  const deliveryNumber = existingNumber > 0 ? existingNumber : currentGenerated + 1;
  const deliveryId = deliveryDocumentId(subscription.id, currentOrder.id, deliveryNumber);
  const deliveryRef = doc(db, "subscriptionDeliveries", deliveryId);
  const deliverySnap = await transaction.get(deliveryRef);

  if (deliverySnap.exists()) return deliveryId;

  const deliveryDate = currentOrder.scheduledDeliveryDate || subscription.nextDeliveryDate;
  if (!deliveryDate) throw new Error("Subscription delivery date is missing.");

  const nextDate = nextDeliveryDate(subscription, deliveryDate, deliveryNumber);
  const data: Omit<SubscriptionDelivery, "id" | "createdAt" | "updatedAt"> = {
    subscriptionId: subscription.id,
    orderId: currentOrder.id,
    orderNumber: currentOrder.orderNumber || currentOrder.id,
    deliveryNumber,
    customerId: currentOrder.customerId || subscription.customerId,
    customerName: currentOrder.customerName || subscription.customerName,
    customerMobile: currentOrder.customerMobile || subscription.customerMobile,
    salableProductId: currentOrder.items?.[0]?.salableProductId,
    productId: currentOrder.items?.[0]?.productId || subscription.productId,
    productName: currentOrder.items?.[0]?.productName || subscription.productName,
    deliveryDate,
    status: "out_for_delivery",
    deliveryAddress: currentOrder.deliveryAddress as Record<string, unknown> | undefined,
  };

  transaction.set(deliveryRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  transaction.update(subscriptionRef, {
    deliveriesGenerated: Math.max(currentGenerated, deliveryNumber),
    nextDeliveryDate: nextDate,
    updatedAt: serverTimestamp(),
    lastDeliveryId: deliveryId,
    lastDeliveryNumber: deliveryNumber,
    lastDeliveryDate: deliveryDate,
    lastDeliveryStatus: "out_for_delivery",
    lastDeliveryCreatedByUid: uid,
    lastDeliveryCreatedByEmail: email ?? "",
  });

  return deliveryId;
}

export async function createSubscriptionDeliveryAtHandover(order: Order, uid: string, email?: string) {
  let deliveryId: string | null = null;
  await runTransaction(db, async transaction => {
    deliveryId = await createSubscriptionDeliveryAtHandoverInTransaction(transaction, order, uid, email);
  });
  if (deliveryId) {
    await auditEvent("create", "subscriptionDeliveries", deliveryId, `Created subscription delivery for ${order.orderNumber || order.id}`);
  }
  return deliveryId;
}

export async function updateSubscriptionDeliveryStatusInTransaction(
  transaction: Transaction,
  order: Order,
  status: SubscriptionDeliveryStatus,
  uid: string,
  email?: string,
) {
  if (order.orderType !== "subscription" || !order.sourceSubscriptionId) return null;

  const subscriptionRef = doc(db, "subscriptions", order.sourceSubscriptionId);
  const subscriptionSnap = await transaction.get(subscriptionRef);
  if (!subscriptionSnap.exists()) return null;
  const subscription = { id: subscriptionSnap.id, ...(subscriptionSnap.data() as Omit<Subscription, "id">) } as Subscription;
  const deliveryNumber = Math.max(0, Math.round(Number(order.sourceSubscriptionDeliveryNumber || 0))) || Math.max(1, Math.round(Number(subscription.deliveriesGenerated || 1)));
  const deliveryId = deliveryDocumentId(subscription.id, order.id, deliveryNumber);
  const deliveryRef = doc(db, "subscriptionDeliveries", deliveryId);
  const deliverySnap = await transaction.get(deliveryRef);
  if (!deliverySnap.exists()) return null;

  const patch: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
    lastUpdatedByUid: uid,
    lastUpdatedByEmail: email ?? "",
  };
  if (status === "delivered") patch.deliveredAt = serverTimestamp();
  if (status === "failed") patch.failedAt = serverTimestamp();
  if (status === "cancelled") patch.cancelledAt = serverTimestamp();
  transaction.update(deliveryRef, patch);
  transaction.update(subscriptionRef, {
    lastDeliveryId: deliveryId,
    lastDeliveryNumber: deliveryNumber,
    lastDeliveryStatus: status,
    updatedAt: serverTimestamp(),
  });
  return deliveryId;
}

export async function updateSubscriptionDeliveryStatus(orderId: string, status: SubscriptionDeliveryStatus, uid: string, email?: string) {
  let deliveryId: string | null = null;
  await runTransaction(db, async transaction => {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) return;
    const order = { id: orderSnap.id, ...(orderSnap.data() as Omit<Order, "id">) } as Order;
    deliveryId = await updateSubscriptionDeliveryStatusInTransaction(transaction, order, status, uid, email);
  });
  if (deliveryId) {
    await auditEvent("update", "subscriptionDeliveries", deliveryId, `Subscription delivery status changed to ${status}`);
  }
  return deliveryId;
}
