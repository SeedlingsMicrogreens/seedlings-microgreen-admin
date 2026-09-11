export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "confirmed",
  "preparing",
  "ready_for_handover",
  "handed_to_delivery",
  "out_for_delivery",
  "delivered",
  "cancelled"
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PaymentStatus = "pending" | "partially_paid" | "paid" | "failed" | "refunded";

export type OrderItem = {
  /** Salable Product referenced by this order item. */
  salableProductId?: string;
  salableProductSku?: string;
  salableProductType?: "single" | "multiple";
  /** Legacy productId/productName fields are retained for existing orders. */
  productId: string;
  productName: string;
  productSlug?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl?: string;
  sellingOptionId?: string;
  sellingOptionLabel?: string;
  weightGrams?: number;
};

export type OrderAddress = {
  name?: string;
  mobileNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

export type PaymentTransaction = {
  id: string;
  amount: number;
  paymentMethod?: string;
  transactionId?: string;
  paymentReceiptUrl?: string;
  paymentReceiptPath?: string;
  recordedAt?: unknown;
  recordedByUid?: string;
  recordedByEmail?: string;
};

export type Order = {
  id: string;
  orderNumber?: string;
  customerId: string;
  customerName?: string;
  customerMobile?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  currency?: string;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  transactionId?: string;
  paymentReceiptUrl?: string;
  paymentReceiptPath?: string;
  paymentRecordedByUid?: string;
  paymentRecordedByEmail?: string;
  paymentDate?: unknown;
  paidAmount?: number;
  paymentTransactions?: PaymentTransaction[];
  refundAmount?: number;
  refundedAt?: unknown;
  refundedByUid?: string;
  refundedByEmail?: string;
  refundReason?: string;
  status: OrderStatus;
  deliveryAddress?: OrderAddress;
  notes?: string;
  scheduledDeliveryDate?: string;
  sourceSubscriptionId?: string;
  sourceSubscriptionDeliveryNumber?: number;
  orderType?: "one_time" | "subscription";
  deliveryChargeId?: string;
  deliveryChargeName?: string;
  deliveryChargeSnapshot?: number;
  subscriptionPlanId?: string;
  subscriptionPlanName?: string;
  subscriptionPlanFrequency?: string;
  packingStatus?: "pending" | "packed";
  packedAt?: unknown;
  packedByUid?: string;
  packedByEmail?: string;
  statusHistory?: OrderStatusHistory[];
  createdAt?: unknown;
  updatedAt?: unknown;
  /** Customer selected the contact-me path during an availability shortage. */
  requiresCustomerContact?: boolean;
  availabilityRequestedGrams?: number;
  availabilityAvailableGrams?: number;
  availabilityShortageGrams?: number;
  carryForwardQuantityGrams?: number;
  availabilityDecision?: "continue" | "contact" | string;
};

export type OrderStatusHistory = {
  status: OrderStatus;
  changedByUid: string;
  changedByEmail?: string;
  note?: string;
  changedAt?: unknown;
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus) {
  if (from === to) return true;
  if (from === "delivered" || from === "cancelled") return false;

  const transitions: Record<OrderStatus, OrderStatus[]> = {
    pending_payment: ["paid", "cancelled"],
    paid: ["confirmed", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["ready_for_handover", "cancelled"],
    ready_for_handover: ["handed_to_delivery", "cancelled"],
    handed_to_delivery: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered", "cancelled"],
    delivered: [],
    cancelled: []
  };

  return transitions[from].includes(to);
}

export function formatOrderStatus(status: OrderStatus) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
