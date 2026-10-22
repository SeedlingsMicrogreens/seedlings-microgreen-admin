import type { SubscriptionFrequency, SubscriptionStatus } from "@/types/subscription";
import type { SubscriptionDeliveryStatus } from "@/types/subscriptionDelivery";

// Rules for a subscription delivery status change and its effect on the parent
// subscription (SUBSCRIPTION-DELIVERY-LIFECYCLE-REQUIREMENTS.md, "Delivered progress
// and completion"). Only the first transition of an occurrence to `delivered` counts.

export type SubscriptionDeliveryTransition = {
  /** False when the delivery record must not be touched (a repeated Delivered request). */
  updateDelivery: boolean;
  completedDeliveries: number;
  subscriptionStatus: SubscriptionStatus;
};

export function resolveSubscriptionDeliveryTransition(args: {
  currentDeliveryStatus?: SubscriptionDeliveryStatus;
  nextDeliveryStatus: SubscriptionDeliveryStatus;
  subscriptionStatus: SubscriptionStatus;
  frequency: SubscriptionFrequency;
  totalDeliveries: unknown;
  completedDeliveries: unknown;
  deliveryLabel: string;
}): SubscriptionDeliveryTransition {
  const alreadyDelivered = args.currentDeliveryStatus === "delivered";
  const delivering = args.nextDeliveryStatus === "delivered";
  if (alreadyDelivered && !delivering) {
    throw new Error(`${args.deliveryLabel} is already delivered and cannot be changed to ${args.nextDeliveryStatus.replaceAll("_", " ")}.`);
  }

  const savedCompleted = Math.max(0, Math.floor(Number(args.completedDeliveries) || 0));
  const total = Number(args.totalDeliveries ?? 0);
  // Weekly subscriptions are created with totalDeliveries = 0, meaning ongoing.
  const ongoing = args.frequency === "weekly" && total === 0;
  const validTotal = Number.isInteger(total) && total > 0;
  if (delivering && !ongoing && !validTotal) {
    throw new Error(`${args.deliveryLabel}: the subscription's saved total deliveries (${String(args.totalDeliveries)}) is invalid, so its progress cannot be recorded.`);
  }

  const completedDeliveries = savedCompleted + (delivering && !alreadyDelivered ? 1 : 0);
  const reachedTotal = delivering && validTotal && completedDeliveries >= total;
  return {
    updateDelivery: !alreadyDelivered,
    completedDeliveries,
    subscriptionStatus: reachedTotal ? "completed" : args.subscriptionStatus,
  };
}
