export type SubscriptionFrequency = "monthly" | "quarterly" | "half_yearly" | "yearly";

export type SubscriptionPlanSellingOption = {
  id: string;
  weightGrams: number;
  planPrice?: number;
  maximumPlanPrice?: number;
};

export type SubscriptionPlan = {
  id: string;
  /** Salable product this subscription plan is offered for. */
  salableProductId: string;
  salableProductName: string;
  name: string;
  frequency: SubscriptionFrequency;
  deliveriesPerTerm: number;
  skipsAllowed: number;
  /** Current Product Selling Price for the 100gms option, not the discounted plan price. */
  price: number;
  /** Informational regular price for the full term at the current 100gms Selling Price. */
  maximumPlanPrice?: number;
  /** Subscription pricing configured only for selling options available on the selected salable product. */
  sellingOptions?: SubscriptionPlanSellingOption[];
  deliveryChargeMode: "included" | "per_delivery" | "free";
  deliveryCharge: number;
  active: boolean;
  description?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export const SUBSCRIPTION_FREQUENCIES: SubscriptionFrequency[] = [
  "monthly", "quarterly", "half_yearly", "yearly"
];

export function subscriptionFrequencyLabel(f: SubscriptionFrequency) {
  return ({
    monthly: "Monthly",
    quarterly: "Quarterly",
    half_yearly: "Half-Yearly",
    yearly: "Yearly",
  })[f];
}
