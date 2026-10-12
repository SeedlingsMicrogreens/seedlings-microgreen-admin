import type { SubscriptionFrequency } from "./subscriptionPlan";

export type OfferType = "price" | "deliveryCharge" | "quantity" | "subscription";
export type OfferLocationType = "all" | "pincode";
export type OfferDiscountType = "percentage" | "flat";

export type OfferQuantityRule = {
  buyProductId: string;
  buyProductName: string;
  buyPackaging: number;
  getProductId: string;
  getProductName: string;
  getPackaging: number;
};

export type SubscriptionOfferConfiguration = {
  frequencies: SubscriptionFrequency[];
  extraDeliveriesByFrequency: Partial<Record<SubscriptionFrequency, number>>;
};

export type Offer = {
  id: string;
  name: string;
  locationType: OfferLocationType;
  pincodeIds?: string[];
  pincodeLabels?: string[];
  type: OfferType;
  startDate: string;
  endDate: string;
  active: boolean;

  discountType?: OfferDiscountType;
  discountValue?: number;

  quantityRule?: OfferQuantityRule;
  subscriptionOffer?: SubscriptionOfferConfiguration;

  createdAt?: unknown;
  updatedAt?: unknown;
};
