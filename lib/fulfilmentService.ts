import { collection, doc, getDocs, orderBy, query, runTransaction, serverTimestamp, where, arrayUnion, type Transaction } from "firebase/firestore";
import { db } from "./firebase";
import { auditEvent } from "./firestore";
import type { Product } from "@/types/catalog";
import type { SalesProduct } from "@/types/salesProduct";
import type { Order, OrderItem, OrderStatus } from "@/types/order";
import type { GrowingBatch } from "@/types/growingBatch";
import type { Subscription } from "@/types/subscription";
import type { Fulfilment, FulfilmentPackLine, FulfilmentAllocation, PackingItem } from "@/types/fulfilment";
import type { SubscriptionDelivery } from "@/types/subscriptionDelivery";

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function requiredItemGrams(item: OrderItem) {
  return Math.max(0, Math.round(numberValue(item.weightGrams) * numberValue(item.quantity)));
}

function componentGramsPerBox(salable: SalesProduct, boxGrams: number) {
  const components = salable.components ?? [];
  if (!components.length) throw new Error(`${salable.name} has no Microgreen components.`);

  if (salable.type === "single") {
    return components.map(component => ({
      productId: component.productId,
      productName: component.productName,
      quantityGrams: boxGrams,
    }));
  }

  const percentages = components.map(component => {
    const percentage = numberValue(component.percentage);
    if (percentage > 0) return percentage;
    const legacyTotal = components.reduce((sum, c) => sum + Math.max(0, numberValue(c.quantityGrams)), 0);
    return legacyTotal > 0 ? (numberValue(component.quantityGrams) / legacyTotal) * 100 : 0;
  });
  const totalPercentage = percentages.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalPercentage) || totalPercentage <= 0) {
    throw new Error(`${salable.name} has invalid Microgreen percentages.`);
  }

  const result = components.map((component, index) => ({
    productId: component.productId,
    productName: component.productName,
    quantityGrams: Math.round(boxGrams * percentages[index] / totalPercentage),
  }));
  const difference = boxGrams - result.reduce((sum, item) => sum + item.quantityGrams, 0);
  if (result.length) result[result.length - 1].quantityGrams += difference;
  return result;
}

function orderStatusCanBePacked(status: OrderStatus) {
  return !["pending_payment", "cancelled", "delivered", "handed_to_delivery", "out_for_delivery"].includes(status);
}

function nextSubscriptionDeliveryDate(subscription: Subscription, deliveryDate: string, deliveryNumber: number) {
  const total = Number(subscription.totalDeliveries || 0);
  if (total > 0 && deliveryNumber >= total) return "";
  const date = new Date(`${deliveryDate}T00:00:00`);
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

async function createOrUpdateSubscriptionDeliveryInTransaction(
  transaction: Transaction,
  order: Order,
  subscription: Subscription,
  fullyPacked: boolean,
  uid: string,
  email?: string,
) {
  if (order.orderType !== "subscription" || !order.sourceSubscriptionId) return null;

  const deliveryNumber = Math.max(
    0,
    Math.round(numberValue(order.sourceSubscriptionDeliveryNumber || 0)),
  ) || Math.max(1, Math.round(numberValue(subscription.deliveriesGenerated || 0)) + 1);
  const deliveryId = deliveryNumber > 0
    ? `${subscription.id}_${deliveryNumber}`
    : `${subscription.id}_${order.id}`;
  const deliveryRef = doc(db, "subscriptionDeliveries", deliveryId);
  const existingSnap = await transaction.get(deliveryRef);
  const deliveryDate = order.scheduledDeliveryDate || subscription.nextDeliveryDate;
  if (!deliveryDate) throw new Error("Subscription delivery date is missing.");

  const status: SubscriptionDelivery["status"] = fullyPacked ? "packed" : "pending";
  const item = order.items?.[0];
  const base = {
    subscriptionId: subscription.id,
    orderId: order.id,
    orderNumber: order.orderNumber || order.id,
    deliveryNumber,
    customerId: order.customerId || subscription.customerId,
    customerName: order.customerName || subscription.customerName,
    customerMobile: order.customerMobile || subscription.customerMobile,
    salableProductId: item?.salableProductId || item?.productId || subscription.productId,
    productId: item?.productId || subscription.productId,
    productName: item?.productName || subscription.productName,
    deliveryDate,
    status,
    deliveryAddress: order.deliveryAddress as Record<string, unknown> | undefined,
    updatedAt: serverTimestamp(),
    lastUpdatedByUid: uid,
    lastUpdatedByEmail: email ?? "",
  };

  if (existingSnap.exists()) {
    transaction.update(deliveryRef, base);
  } else {
    transaction.set(deliveryRef, {
      ...base,
      createdAt: serverTimestamp(),
    });
    transaction.update(doc(db, "subscriptions", subscription.id), {
      deliveriesGenerated: Math.max(numberValue(subscription.deliveriesGenerated), deliveryNumber),
      nextDeliveryDate: nextSubscriptionDeliveryDate(subscription, deliveryDate, deliveryNumber),
      updatedAt: serverTimestamp(),
    });
  }

  return deliveryId;
}

/**
 * Pack one customer order against freshly harvested Microgreen quantities.
 * No persistent Salable Product packed stock is created or updated.
 */
export async function packOrderFulfilment(
  orderId: string,
  lines: FulfilmentPackLine[],
  uid: string,
  email?: string,
) {
  if (!lines.length) throw new Error("Add at least one packing line.");

  let createdFulfilmentId = "";
  let packedCompletely = false;
  let subscriptionDeliveryId: string | null = null;

  // Firestore Web SDK transactions accept DocumentReferences, not Query objects.
  // Load the collection-based configuration outside the transaction, then read
  // the actual documents that will be updated inside the transaction.
  const [salesSnap, packagingSnap, batchesSnap] = await Promise.all([
    getDocs(collection(db, "salesProducts")),
    getDocs(query(collection(db, "packagingMaster"), where("active", "==", true))),
    getDocs(collection(db, "growingBatches")),
  ]);

  await runTransaction(db, async transaction => {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error("Order no longer exists. Refresh and retry.");
    const currentOrder = { id: orderSnap.id, ...(orderSnap.data() as Omit<Order, "id">) } as Order;

    if (!orderStatusCanBePacked(currentOrder.status)) {
      throw new Error(`Order ${currentOrder.orderNumber || orderId} cannot be packed from status ${currentOrder.status}.`);
    }
    if (currentOrder.packingStatus === "packed" || currentOrder.status === "packed") {
      throw new Error("This order is already fully packed.");
    }

    const subscriptionSnap = currentOrder.orderType === "subscription" && currentOrder.sourceSubscriptionId
      ? await transaction.get(doc(db, "subscriptions", currentOrder.sourceSubscriptionId))
      : null;

    const salesProducts = new Map<string, SalesProduct>();
    salesSnap.docs.forEach(snap => salesProducts.set(snap.id, { id: snap.id, ...(snap.data() as Omit<SalesProduct, "id">) }));
    const packagingSizes = new Set(packagingSnap.docs.map(snap => Math.round(numberValue(snap.data().size))));
    const batchRefs = batchesSnap.docs.map(snap => doc(db, "growingBatches", snap.id));
    const batchSnaps = await Promise.all(batchRefs.map(ref => transaction.get(ref)));
    const batches = batchSnaps.map(snap => ({ id: snap.id, ...(snap.data() as Omit<GrowingBatch, "id">) })) as GrowingBatch[];

    if (currentOrder.orderType === "subscription" && currentOrder.sourceSubscriptionId && !subscriptionSnap?.exists()) {
      throw new Error("Source subscription not found.");
    }

    const cleanLines = lines.map(line => ({
      orderItemIndex: Math.round(Number(line.orderItemIndex)),
      boxGrams: Math.round(Number(line.boxGrams)),
      boxesPacked: Math.round(Number(line.boxesPacked)),
    }));
    const seen = new Set<number>();
    for (const line of cleanLines) {
      if (seen.has(line.orderItemIndex)) throw new Error("Each order item can appear only once in the packing worksheet.");
      seen.add(line.orderItemIndex);
      if (!Number.isInteger(line.boxGrams) || line.boxGrams <= 0 || !packagingSizes.has(line.boxGrams)) {
        throw new Error(`Packaging ${line.boxGrams}g is not an active Packaging Master size.`);
      }
      if (!Number.isInteger(line.boxesPacked) || line.boxesPacked <= 0) {
        throw new Error("Packed box quantity must be a positive whole number.");
      }
    }

    const updatedItems = [...(currentOrder.items ?? [])];
    const fulfilmentItems: PackingItem[] = [];
    const requiredByProduct = new Map<string, number>();

    for (const line of cleanLines) {
      const item = updatedItems[line.orderItemIndex];
      if (!item) throw new Error("One or more order items no longer exists. Refresh and retry.");
      const salableId = item.salableProductId || item.productId;
      const salable = salesProducts.get(salableId);
      if (!salable) throw new Error(`Product for order item ${line.orderItemIndex + 1} no longer exists.`);

      const requiredGrams = requiredItemGrams(item);
      const alreadyPacked = Math.max(0, Math.round(numberValue(item.packedGrams)));
      const remainingGrams = Math.max(0, requiredGrams - alreadyPacked);
      const packedGrams = line.boxGrams * line.boxesPacked;
      if (packedGrams > remainingGrams) {
        throw new Error(`${salable.name}: ${packedGrams.toLocaleString()} gms is more than the remaining ${remainingGrams.toLocaleString()} gms.`);
      }

      const components = componentGramsPerBox(salable, line.boxGrams);
      const totalComponentGrams = components.reduce((sum, component) => sum + component.quantityGrams, 0);
      if (totalComponentGrams !== line.boxGrams) {
        throw new Error(`${salable.name}: component grams do not match the selected box size.`);
      }

      components.forEach(component => {
        const required = component.quantityGrams * line.boxesPacked;
        requiredByProduct.set(component.productId, (requiredByProduct.get(component.productId) ?? 0) + required);
      });

      const previousPacked = alreadyPacked;
      const nextPacked = previousPacked + packedGrams;
      updatedItems[line.orderItemIndex] = {
        ...item,
        packedGrams: nextPacked,
        packedBoxes: Math.max(0, Math.round(numberValue(item.packedBoxes))) + line.boxesPacked,
      };
      fulfilmentItems.push({
        orderItemIndex: line.orderItemIndex,
        salableProductId: salable.id,
        salableProductName: salable.name,
        boxGrams: line.boxGrams,
        boxesPacked: line.boxesPacked,
        requestedGrams: requiredGrams,
        previousPackedGrams: previousPacked,
        packedGrams,
        components: components.map(component => ({
          productId: component.productId,
          productName: component.productName,
          quantityGramsPerBox: component.quantityGrams,
          totalGrams: component.quantityGrams * line.boxesPacked,
        })),
      });
    }

    const allOrderItemsPacked = updatedItems.every(item => {
      const required = requiredItemGrams(item);
      return required <= 0 || Math.max(0, Math.round(numberValue(item.packedGrams))) >= required;
    });
    packedCompletely = allOrderItemsPacked;

    const productIds = [...requiredByProduct.keys()];
    const productRefs = productIds.map(id => doc(db, "products", id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    const productStates = new Map(productIds.map((id, index) => {
      const snap = productSnaps[index];
      if (!snap.exists()) throw new Error("One or more Microgreens no longer exist.");
      const product = { id, ...(snap.data() as Omit<Product, "id">) } as Product;
      return [id, { ref: productRefs[index], product, stock: Math.max(0, numberValue(product.stockGrams ?? product.stock)) }] as const;
    }));

    for (const [productId, required] of requiredByProduct) {
      const state = productStates.get(productId);
      if (!state) throw new Error("A required Microgreen is missing.");
      if (state.stock < required) {
        throw new Error(`${state.product.name}: ${state.stock.toLocaleString()} gms aggregate stock available, ${required.toLocaleString()} gms required.`);
      }
    }

    const batchWorking = batches
      .filter(batch => batch.status === "completed_harvested" && !batch.delivered)
      .sort((a, b) => String(a.harvestDate || a.createdAt || "").localeCompare(String(b.harvestDate || b.createdAt || "")))
      .map(batch => ({
        batch,
        items: (batch.items ?? []).map(item => ({
          item,
          available: Math.max(0, Math.round(numberValue(item.batchStockGrams !== undefined ? item.batchStockGrams : item.actualYieldGrams))),
        })),
      }));

    const allocations: FulfilmentAllocation[] = [];
    const batchItemUpdates = new Map<string, GrowingBatch["items"]>();

    for (const [productId, required] of requiredByProduct) {
      let remaining = required;
      for (const batchState of batchWorking) {
        if (remaining <= 0) break;
        const matching = batchState.items.find(entry => entry.item.productId === productId && entry.item.status === "completed_harvested" && entry.available > 0);
        if (!matching) continue;
        const take = Math.min(remaining, matching.available);
        matching.available -= take;
        remaining -= take;
        const existingItems = batchItemUpdates.get(batchState.batch.id) ?? [...(batchState.batch.items ?? [])];
        const index = existingItems.findIndex(item => item.id === matching.item.id);
        if (index >= 0) {
          existingItems[index] = { ...existingItems[index], batchStockGrams: matching.available };
          batchItemUpdates.set(batchState.batch.id, existingItems);
        }
        allocations.push({
          growingBatchId: batchState.batch.id,
          growingBatchNumber: batchState.batch.batchNumber,
          growingBatchItemId: matching.item.id,
          productId,
          productName: matching.item.productName,
          quantityGrams: take,
        });
      }
      if (remaining > 0) {
        throw new Error(`Insufficient harvested batch quantity for ${productStates.get(productId)?.product.name || productId}. Remaining requirement: ${remaining.toLocaleString()} gms.`);
      }
    }

    if (currentOrder.orderType === "subscription" && currentOrder.sourceSubscriptionId && subscriptionSnap?.exists()) {
      const subscription = { id: subscriptionSnap.id, ...(subscriptionSnap.data() as Omit<Subscription, "id">) } as Subscription;
      subscriptionDeliveryId = await createOrUpdateSubscriptionDeliveryInTransaction(
        transaction,
        currentOrder,
        subscription,
        packedCompletely,
        uid,
        email,
      );
    }

    for (const state of productStates.values()) {
      const required = requiredByProduct.get(state.product.id) ?? 0;
      if (!required) continue;
      const nextStock = state.stock - required;
      transaction.update(state.ref, {
        stockGrams: nextStock,
        stock: nextStock,
        updatedAt: serverTimestamp(),
      });
      const adjustmentRef = doc(collection(db, "inventoryAdjustments"));
      transaction.set(adjustmentRef, {
        productId: state.product.id,
        productName: state.product.name,
        type: "fulfilment",
        quantity: required,
        unit: "g",
        previousStock: state.stock,
        newStock: nextStock,
        reason: `Fulfilment packing for ${currentOrder.orderNumber || currentOrder.id}`,
        orderId: currentOrder.id,
        createdByUid: uid,
        createdByEmail: email ?? "",
        createdAt: serverTimestamp(),
      });
    }

    const orderPatch: Record<string, unknown> = {
      items: updatedItems,
      packingStatus: packedCompletely ? "packed" : "partial",
      updatedAt: serverTimestamp(),
    };
    if (packedCompletely) {
      orderPatch.status = "packed";
      orderPatch.packedAt = serverTimestamp();
      orderPatch.packedByUid = uid;
      orderPatch.packedByEmail = email ?? "";
      orderPatch.statusHistory = arrayUnion({
        status: "packed",
        changedByUid: uid,
        changedByEmail: email ?? "",
        note: "Order packed through Fulfilment.",
        changedAt: new Date(),
      });
    }
    transaction.update(orderRef, orderPatch);

    for (const [batchId, items] of batchItemUpdates) {
      transaction.update(doc(db, "growingBatches", batchId), {
        items,
        updatedAt: serverTimestamp(),
      });
    }

    const fulfilmentRef = doc(collection(db, "fulfilments"));
    createdFulfilmentId = fulfilmentRef.id;
    transaction.set(fulfilmentRef, {
      fulfilmentType: currentOrder.orderType === "subscription" ? "SUBSCRIPTION" : "ORDER",
      orderId: currentOrder.id,
      orderNumber: currentOrder.orderNumber || currentOrder.id,
      subscriptionDeliveryId,
      sourceSubscriptionId: currentOrder.sourceSubscriptionId || null,
      customerId: currentOrder.customerId,
      customerName: currentOrder.customerName || "",
      scheduledDeliveryDate: currentOrder.scheduledDeliveryDate || "",
      items: fulfilmentItems,
      allocations,
      totalGramsConsumed: allocations.reduce((sum, item) => sum + item.quantityGrams, 0),
      status: packedCompletely ? "packed" : "partially_packed",
      packedAt: serverTimestamp(),
      packedByUid: uid,
      packedByEmail: email ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await auditEvent("pack", "fulfilments", createdFulfilmentId, `${packedCompletely ? "Packed" : "Partially packed"} order ${orderId}${subscriptionDeliveryId ? ` / subscription delivery ${subscriptionDeliveryId}` : ""}`);
  return { fulfilmentId: createdFulfilmentId, packedCompletely, subscriptionDeliveryId };
}

/** Backward-compatible aliases are intentionally no longer used by the Fulfilment UI. */
export async function listManualFulfilments() {
  const snapshot = await getDocs(query(collection(db, "fulfilments"), orderBy("createdAt", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...(item.data() as Omit<Fulfilment, "id">) })) as Fulfilment[];
}

export async function packSalableProducts() {
  throw new Error("Manual Salable Product packing has been replaced by order-based Fulfilment.");
}
