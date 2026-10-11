import type { Subscription } from "@/types/subscription";
import type { SubscriptionDelivery } from "@/types/subscriptionDelivery";
import type { Order, OrderItem } from "@/types/order";
import type { FulfilmentPackLine } from "@/types/fulfilment";

export const FULFILMENT_ORDER_QUERY_STATUSES: readonly Order["status"][] = [
  "confirmed",
  "preparing",
  "packed",
  "ready_for_handover",
  "handed_to_delivery",
  "out_for_delivery",
];

export const PACKABLE_ORDER_STATUSES: readonly Order["status"][] = [
  "confirmed",
  "preparing",
];

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function isPaidFulfilmentOrder(order: Pick<Order, "status" | "paymentStatus" | "requiresCustomerContact" | "availabilityDecision">): boolean {
  return order.paymentStatus === "paid"
    && FULFILMENT_ORDER_QUERY_STATUSES.includes(order.status)
    && order.requiresCustomerContact !== true
    && order.availabilityDecision !== "contact";
}

export function isPackableOrder(order: Pick<Order, "status" | "paymentStatus" | "requiresCustomerContact" | "availabilityDecision" | "packingStatus">): boolean {
  return isPaidFulfilmentOrder(order)
    && PACKABLE_ORDER_STATUSES.includes(order.status)
    && order.packingStatus !== "packed";
}

export function isPendingFulfilmentOrder(
  order: Order,
  deliveries: SubscriptionDelivery[],
  subscriptions: Subscription[],
): boolean {
  if (!isPackableOrder(order)) return false;
  if (order.orderType !== "subscription" && !order.sourceSubscriptionId) return true;

  const subscriptionId = order.sourceSubscriptionId;
  if (!subscriptionId) return false;
  const subscription = subscriptions.find(item => item.id === subscriptionId);
  const delivery = deliveries.find(item => item.orderId === order.id);
  return subscription?.status === "active"
    && subscription.requiresCustomerContact !== true
    && subscription.availabilityDecision !== "contact"
    && delivery?.subscriptionId === subscriptionId
    && delivery.status === "pending";
}

export type OrderPackagingPlan = {
  lines: FulfilmentPackLine[];
  errors: string[];
};

export function orderPackagingPlan(items: OrderItem[]): OrderPackagingPlan {
  const lines: FulfilmentPackLine[] = [];
  const errors: string[] = [];

  items.forEach((item, orderItemIndex) => {
    const quantity = Number(item.quantity);
    const requiredGrams = numberValue(item.weightGrams);
    if (!Number.isInteger(quantity) || quantity <= 0
      || !Number.isInteger(requiredGrams) || requiredGrams <= 0
      || requiredGrams % quantity !== 0) {
      errors.push(`Order item ${orderItemIndex + 1} has invalid saved packaging details.`);
      return;
    }

    const boxGrams = requiredGrams / quantity;
    const packedGrams = numberValue(item.packedGrams);
    const storedPackedBoxes = Number(item.packedBoxes ?? 0);
    if (!Number.isInteger(packedGrams) || packedGrams < 0
      || !Number.isInteger(storedPackedBoxes) || storedPackedBoxes < 0
      || packedGrams % boxGrams !== 0) {
      errors.push(`Order item ${orderItemIndex + 1} has inconsistent packed quantity history.`);
      return;
    }

    const packedBoxes = storedPackedBoxes > 0 ? storedPackedBoxes : packedGrams / boxGrams;
    if (packedBoxes > quantity || packedBoxes * boxGrams !== packedGrams) {
      errors.push(`Order item ${orderItemIndex + 1} has inconsistent saved packaging progress.`);
      return;
    }

    const remainingBoxes = quantity - packedBoxes;
    if (remainingBoxes > 0) {
      lines.push({ orderItemIndex, boxGrams, boxesPacked: remainingBoxes });
    }
  });

  return { lines, errors };
}

export function validateAuthoritativePackLines(order: Order, lines: FulfilmentPackLine[]): FulfilmentPackLine[] {
  if (!isPackableOrder(order)) {
    throw new Error("Only fully paid, confirmed active orders can be packed.");
  }

  const plan = orderPackagingPlan(order.items ?? []);
  if (plan.errors.length) throw new Error(plan.errors[0]);

  const expectedByIndex = new Map(plan.lines.map(line => [line.orderItemIndex, line]));
  if (lines.length !== expectedByIndex.size) {
    throw new Error("Packing quantities must match the remaining boxes on the confirmed order.");
  }

  const seen = new Set<number>();
  const cleanLines: FulfilmentPackLine[] = [];
  for (const line of lines) {
    if (!Number.isInteger(line.orderItemIndex) || seen.has(line.orderItemIndex)) {
      throw new Error("Each outstanding order item must appear exactly once in the packing worksheet.");
    }
    seen.add(line.orderItemIndex);
    const expected = expectedByIndex.get(line.orderItemIndex);
    if (!expected || line.boxGrams !== expected.boxGrams || line.boxesPacked !== expected.boxesPacked) {
      throw new Error("Packaging size and box quantity must match the confirmed order.");
    }
    cleanLines.push(expected);
  }

  return cleanLines;
}

export function isSubscriptionDeliveryPackable(
  order: Order,
  subscription: Subscription,
  delivery: SubscriptionDelivery,
): boolean {
  return subscription.status === "active"
    && subscription.requiresCustomerContact !== true
    && subscription.availabilityDecision !== "contact"
    && order.sourceSubscriptionId === subscription.id
    && delivery.orderId === order.id
    && delivery.subscriptionId === subscription.id
    && delivery.status === "pending";
}
