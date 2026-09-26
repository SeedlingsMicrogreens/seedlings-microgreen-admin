export type SubscriptionFrequency = "monthly" | "quarterly" | "half_yearly" | "yearly";

export type SubscriptionPlanSellingOption = {
  id: string;
  weightGrams: number;
  planPrice: number;
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
  /** Legacy/base subscription price, always stored per 100gms. */
  price: number;
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
