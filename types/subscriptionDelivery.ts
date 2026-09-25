export const SUBSCRIPTION_DELIVERY_STATUSES = [
  "pending",
  "packed",
  "assigned",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
] as const;

export type SubscriptionDeliveryStatus = (typeof SUBSCRIPTION_DELIVERY_STATUSES)[number];

export type SubscriptionDelivery = {
  id: string;
  subscriptionId: string;
  orderId: string;
  orderNumber?: string;
  deliveryNumber: number;

  customerId: string;
  customerName?: string;
  customerMobile?: string;
  salableProductId?: string;
  productId: string;
  productName: string;

  deliveryDate: string;
  status: SubscriptionDeliveryStatus;
  deliveryAddress?: Record<string, unknown>;

  deliveredAt?: unknown;
  failedAt?: unknown;
  cancelledAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};
