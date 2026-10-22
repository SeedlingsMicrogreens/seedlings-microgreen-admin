import { localCalendarDate, nextCalendarDateOnDay } from "@/lib/calendarDate";

export const SUBSCRIPTION_FREQUENCIES = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number];

export const SUBSCRIPTION_STATUSES = [
  "active",
  "paused",
  "cancelled",
  "completed",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type Subscription = {
  id: string;
  subscriptionNumber: string;

  customerId: string;
  customerName?: string;
  customerMobile?: string;

  productId: string;
  productName: string;
  sellingOptionId: string;
  sellingOptionLabel: string;
  weightGrams: number;
  unitPrice: number;
  quantity: number;

  frequency: SubscriptionFrequency;
  totalDeliveries: number;
  deliveriesGenerated: number;
  completedDeliveries?: number;
  nextDeliveryDate: string;
  deliveryDay: number; // 0 = Sunday ... 6 = Saturday; Phase 1 default = 6
  startDate: string;
  endDate: string;

  deliveryAddress?: Record<string, unknown>;

  requiresCustomerContact?: boolean;
  availabilityRequestedGrams?: number;
  availabilityAvailableGrams?: number;
  availabilityShortageGrams?: number;
  carryForwardQuantityGrams?: number;
  availabilityDecision?: "continue" | "contact" | string;

  status: SubscriptionStatus;
  notes?: string;

  createdAt?: unknown;
  updatedAt?: unknown;
};

export function deliveriesForFrequency(frequency: SubscriptionFrequency) {
  switch (frequency) {
    case "weekly": return null; // ongoing weekly subscription
    case "monthly": return 4;
    case "quarterly": return 12;
    case "yearly": return 52;
  }
}

export function frequencyLabel(frequency: SubscriptionFrequency) {
  return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}

export function packLabel(weightGrams: number) {
  return weightGrams >= 1000 && weightGrams % 1000 === 0
    ? `${weightGrams / 1000}kg box`
    : `${weightGrams}g box`;
}

/** Business rule: every subscription delivery is on a Saturday (0 = Sunday ... 6 = Saturday). */
export const SUBSCRIPTION_DELIVERY_DAY = 6;

/** The delivery after `previousDeliveryDate`: the next Saturday, i.e. +7 days from a Saturday. */
export function nextScheduledDeliveryDate(previousDeliveryDate: string) {
  return nextCalendarDateOnDay(previousDeliveryDate, SUBSCRIPTION_DELIVERY_DAY);
}

export function nextDeliveryOnDay(date: Date, day: number) {
  return nextCalendarDateOnDay(localCalendarDate(date), day);
}
