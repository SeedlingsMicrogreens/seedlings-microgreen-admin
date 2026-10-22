import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where, type DocumentReference, type Transaction } from "firebase/firestore";
import { db } from "./firebase";
import { auditEvent } from "./firestore";
import type { Order } from "@/types/order";
import { nextScheduledDeliveryDate, type Subscription } from "@/types/subscription";
import type { SubscriptionDelivery, SubscriptionDeliveryStatus } from "@/types/subscriptionDelivery";
import { normalizeSubscriptionLineWeightGrams } from "./packingMath";
import { resolveSubscriptionDeliveryTransition } from "./subscriptionCompletion";

export { normalizeSubscriptionLineWeightGrams } from "./packingMath";

function deliveryDocumentId(subscriptionId: string, orderId: string, deliveryNumber: number) {
  return deliveryNumber > 0 ? `${subscriptionId}_${deliveryNumber}` : `${subscriptionId}_${orderId}`;
}

function nextDeliveryDate(subscription: Subscription, deliveryDate: string, deliveryNumber: number) {
  const total = Number(subscription.totalDeliveries || 0);
  if (total > 0 && deliveryNumber >= total) return "";
  return nextScheduledDeliveryDate(deliveryDate);
}

export async function addNextSubscriptionDeliveryForFulfilment(
  subscriptionId: string,
  uid: string,
  email?: string,
) {
  const deliveriesSnapshot = await getDocs(query(
    collection(db, "subscriptionDeliveries"),
    where("subscriptionId", "==", subscriptionId),
  ));

  const deliveredNumbers = deliveriesSnapshot.docs
    .map(snapshot => snapshot.data())
    .filter(data => data.status === "delivered")
    .map(data => Math.max(0, Math.round(Number(data.deliveryNumber || 0))))
    .filter(number => number > 0);
  const completedDeliveries = deliveredNumbers.length;

  let createdOrderId = "";
  let createdDeliveryId = "";
  let alreadyExists = false;

  await runTransaction(db, async transaction => {
    const subscriptionRef = doc(db, "subscriptions", subscriptionId);
    const subscriptionSnap = await transaction.get(subscriptionRef);
    if (!subscriptionSnap.exists()) throw new Error("Subscription not found.");

    const subscription = { id: subscriptionSnap.id, ...(subscriptionSnap.data() as Omit<Subscription, "id">) } as Subscription;
    if (subscription.status !== "active") throw new Error("Only active subscriptions can receive another delivery.");

    const totalDeliveries = Math.max(0, Math.round(Number(subscription.totalDeliveries || 0)));
    if (totalDeliveries > 0 && completedDeliveries >= totalDeliveries) {
      transaction.update(subscriptionRef, {
        completedDeliveries: totalDeliveries,
        status: "completed",
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const nextDeliveryNumber = completedDeliveries + 1;
    const deliveryId = `${subscription.id}_${nextDeliveryNumber}`;
    const deliveryRef = doc(db, "subscriptionDeliveries", deliveryId);
    const existingDeliverySnap = await transaction.get(deliveryRef);
    if (existingDeliverySnap.exists()) {
      alreadyExists = true;
      return;
    }

    const deliveryDate = subscription.nextDeliveryDate;
    if (!deliveryDate) throw new Error("Next delivery date is not available for this subscription.");

    const orderRef = doc(collection(db, "orders"));
    const orderNumber = `ORD-${orderRef.id.slice(0, 8).toUpperCase()}`;
    const lineTotal = Number(subscription.unitPrice || 0) * Math.max(1, Number(subscription.quantity || 1));
    const quantity = Math.max(1, Math.round(Number(subscription.quantity || 1)));
    const item = {
      salableProductId: subscription.productId,
      productId: subscription.productId,
      productName: subscription.productName,
      quantity,
      unitPrice: Number(subscription.unitPrice || 0),
      lineTotal,
      sellingOptionId: subscription.sellingOptionId,
      sellingOptionLabel: subscription.sellingOptionLabel,
      weightGrams: normalizeSubscriptionLineWeightGrams(quantity, Number(subscription.weightGrams || 0)),
      packedGrams: 0,
      packedBoxes: 0,
    };

    transaction.set(orderRef, {
      orderNumber,
      customerId: subscription.customerId,
      customerName: subscription.customerName || "",
      customerMobile: subscription.customerMobile || "",
      items: [item],
      subtotal: lineTotal,
      deliveryFee: 0,
      discount: 0,
      total: lineTotal,
      currency: "INR",
      paymentStatus: "paid",
      paymentMethod: "subscription",
      paymentDate: serverTimestamp(),
      paidAmount: lineTotal,
      status: "confirmed",
      deliveryAddress: subscription.deliveryAddress || {},
      scheduledDeliveryDate: deliveryDate,
      sourceSubscriptionId: subscription.id,
      sourceSubscriptionDeliveryNumber: nextDeliveryNumber,
      orderType: "subscription",
      subscriptionPlanId: "",
      subscriptionPlanName: "",
      subscriptionPlanFrequency: subscription.frequency,
      packingStatus: "pending",
      statusHistory: [{
        status: "confirmed",
        changedByUid: uid,
        changedByEmail: email || "",
        note: `Subscription delivery ${nextDeliveryNumber} added for fulfilment.`,
        changedAt: new Date(),
      }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.set(deliveryRef, {
      subscriptionId: subscription.id,
      orderId: orderRef.id,
      orderNumber,
      deliveryNumber: nextDeliveryNumber,
      customerId: subscription.customerId,
      customerName: subscription.customerName || "",
      customerMobile: subscription.customerMobile || "",
      salableProductId: subscription.productId,
      productId: subscription.productId,
      productName: subscription.productName,
      deliveryDate,
      status: "pending",
      deliveryAddress: subscription.deliveryAddress || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastUpdatedByUid: uid,
      lastUpdatedByEmail: email || "",
    });

    const nextDate = nextDeliveryDate(subscription, deliveryDate, nextDeliveryNumber);
    transaction.update(subscriptionRef, {
      deliveriesGenerated: Math.max(Number(subscription.deliveriesGenerated || 0), nextDeliveryNumber),
      completedDeliveries,
      nextDeliveryDate: nextDate,
      updatedAt: serverTimestamp(),
      lastUpdatedByUid: uid,
      lastUpdatedByEmail: email || "",
    });

    createdOrderId = orderRef.id;
    createdDeliveryId = deliveryId;
  });

  if (alreadyExists) return { created: false, orderId: "", deliveryId: "", completedDeliveries };
  if (createdDeliveryId) {
    await auditEvent("create", "subscriptionDeliveries", createdDeliveryId, `Added subscription delivery ${createdDeliveryId} to fulfilment.`);
  }
  return { created: true, orderId: createdOrderId, deliveryId: createdDeliveryId, completedDeliveries };
}

export async function prepareSubscriptionDeliveryAtHandoverInTransaction(
  transaction: Transaction,
  order: Order,
) {
  if (order.orderType !== "subscription" || !order.sourceSubscriptionId) return null;

  const subscriptionRef = doc(db, "subscriptions", order.sourceSubscriptionId);
  const subscriptionSnap = await transaction.get(subscriptionRef);
  if (!subscriptionSnap.exists()) throw new Error("Source subscription not found.");

  const subscription = { id: subscriptionSnap.id, ...(subscriptionSnap.data() as Omit<Subscription, "id">) } as Subscription;
  const currentOrder = order;
  const existingNumber = Math.max(0, Math.round(Number(currentOrder.sourceSubscriptionDeliveryNumber || 0)));
  const currentGenerated = Math.max(0, Math.round(Number(subscription.deliveriesGenerated || 0)));
  const deliveryNumber = existingNumber > 0 ? existingNumber : currentGenerated + 1;
  const deliveryId = deliveryDocumentId(subscription.id, currentOrder.id, deliveryNumber);
  const deliveryRef = doc(db, "subscriptionDeliveries", deliveryId);
  const deliverySnap = await transaction.get(deliveryRef);

  const deliveryDate = currentOrder.scheduledDeliveryDate || subscription.nextDeliveryDate;
  if (!deliveryDate) throw new Error("Subscription delivery date is missing.");

  const nextDate = nextDeliveryDate(subscription, deliveryDate, deliveryNumber);
  const deliveryData: Omit<SubscriptionDelivery, "id" | "createdAt" | "updatedAt"> = {
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

  return {
    subscriptionRef,
    deliveryRef,
    deliveryExists: deliverySnap.exists(),
    deliveryData,
    subscriptionUpdate: {
      deliveriesGenerated: Math.max(currentGenerated, deliveryNumber),
      nextDeliveryDate: nextDate,
      lastDeliveryId: deliveryId,
      lastDeliveryNumber: deliveryNumber,
      lastDeliveryDate: deliveryDate,
      lastDeliveryStatus: "out_for_delivery" as const,
    },
    deliveryId,
  };
}

export function applySubscriptionDeliveryAtHandoverInTransaction(
  transaction: Transaction,
  plan: NonNullable<Awaited<ReturnType<typeof prepareSubscriptionDeliveryAtHandoverInTransaction>>>,
  uid: string,
  email?: string,
) {
  if (plan.deliveryExists) {
    transaction.update(plan.deliveryRef, {
      status: "out_for_delivery",
      updatedAt: serverTimestamp(),
      lastUpdatedByUid: uid,
      lastUpdatedByEmail: email ?? "",
    });
  } else {
    transaction.set(plan.deliveryRef, {
      ...plan.deliveryData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  transaction.update(plan.subscriptionRef, {
    ...plan.subscriptionUpdate,
    updatedAt: serverTimestamp(),
    lastDeliveryCreatedByUid: uid,
    lastDeliveryCreatedByEmail: email ?? "",
  });

  return plan.deliveryId;
}

export async function createSubscriptionDeliveryAtHandoverInTransaction(
  transaction: Transaction,
  order: Order,
  uid: string,
  email?: string,
) {
  if (order.orderType !== "subscription" || !order.sourceSubscriptionId) return null;

  const orderRef = doc(db, "orders", order.id);
  const orderSnap = await transaction.get(orderRef);
  if (!orderSnap.exists()) throw new Error("Subscription order no longer exists.");
  const currentOrder = { id: orderSnap.id, ...(orderSnap.data() as Omit<Order, "id">) } as Order;
  const plan = await prepareSubscriptionDeliveryAtHandoverInTransaction(transaction, currentOrder);
  return plan ? applySubscriptionDeliveryAtHandoverInTransaction(transaction, plan, uid, email) : null;
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

/** Delivery records linked to an order; queried before a transaction, which re-reads them. */
export async function findSubscriptionDeliveryRefsForOrder(orderId: string) {
  const snapshot = await getDocs(query(collection(db, "subscriptionDeliveries"), where("orderId", "==", orderId)));
  return snapshot.docs.map(delivery => delivery.ref);
}

export async function updateSubscriptionDeliveryStatusInTransaction(
  transaction: Transaction,
  order: Order,
  status: SubscriptionDeliveryStatus,
  uid: string,
  email?: string,
  deliveryRefsForOrder: DocumentReference[] = [],
) {
  if (order.orderType !== "subscription" || !order.sourceSubscriptionId) return null;

  const label = `Subscription order ${order.orderNumber || order.id}`;
  const subscriptionRef = doc(db, "subscriptions", order.sourceSubscriptionId);
  const subscriptionSnap = await transaction.get(subscriptionRef);
  if (!subscriptionSnap.exists()) throw new Error(`${label}: its subscription was not found.`);
  const subscription = { id: subscriptionSnap.id, ...(subscriptionSnap.data() as Omit<Subscription, "id">) } as Subscription;
  const deliveryNumber = Math.max(0, Math.round(Number(order.sourceSubscriptionDeliveryNumber || 0))) || Math.max(1, Math.round(Number(subscription.deliveriesGenerated || 1)));

  // Prefer the canonical record ID; fall back to records linked by orderId (e.g. other ID schemes).
  const canonicalRef = doc(db, "subscriptionDeliveries", deliveryDocumentId(subscription.id, order.id, deliveryNumber));
  const candidateRefs = [canonicalRef, ...deliveryRefsForOrder.filter(ref => ref.path !== canonicalRef.path)];
  const candidates = await Promise.all(candidateRefs.map(ref => transaction.get(ref)));
  const deliverySnap = candidates.find(snapshot => {
    if (!snapshot.exists()) return false;
    const data = snapshot.data() as Partial<SubscriptionDelivery>;
    return data.subscriptionId === subscription.id && (!data.orderId || data.orderId === order.id);
  });
  if (!deliverySnap) throw new Error(`${label}: its subscription delivery record was not found, so subscription progress cannot be updated.`);
  const delivery = deliverySnap.data() as SubscriptionDelivery;
  const deliveryId = deliverySnap.id;

  const transition = resolveSubscriptionDeliveryTransition({
    currentDeliveryStatus: delivery.status,
    nextDeliveryStatus: status,
    subscriptionStatus: subscription.status,
    frequency: subscription.frequency,
    totalDeliveries: subscription.totalDeliveries,
    completedDeliveries: subscription.completedDeliveries,
    deliveryLabel: label,
  });

  const patch: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
    lastUpdatedByUid: uid,
    lastUpdatedByEmail: email ?? "",
  };
  if (status === "delivered") patch.deliveredAt = serverTimestamp();
  if (status === "failed") patch.failedAt = serverTimestamp();
  if (status === "cancelled") patch.cancelledAt = serverTimestamp();
  if (transition.updateDelivery) transaction.update(deliverySnap.ref, patch);

  transaction.update(subscriptionRef, {
    lastDeliveryId: deliveryId,
    lastDeliveryNumber: Math.round(Number(delivery.deliveryNumber)) || deliveryNumber,
    lastDeliveryStatus: status,
    completedDeliveries: transition.completedDeliveries,
    ...(transition.subscriptionStatus !== subscription.status ? { status: transition.subscriptionStatus } : {}),
    updatedAt: serverTimestamp(),
  });
  return deliveryId;
}

export async function updateSubscriptionDeliveryStatus(orderId: string, status: SubscriptionDeliveryStatus, uid: string, email?: string) {
  let deliveryId: string | null = null;
  const deliveryRefsForOrder = await findSubscriptionDeliveryRefsForOrder(orderId);
  await runTransaction(db, async transaction => {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) return;
    const order = { id: orderSnap.id, ...(orderSnap.data() as Omit<Order, "id">) } as Order;
    deliveryId = await updateSubscriptionDeliveryStatusInTransaction(transaction, order, status, uid, email, deliveryRefsForOrder);
  });
  if (deliveryId) {
    await auditEvent("update", "subscriptionDeliveries", deliveryId, `Subscription delivery status changed to ${status}`);
  }
  return deliveryId;
}
