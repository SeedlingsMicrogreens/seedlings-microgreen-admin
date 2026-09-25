export type FulfilmentType = "ORDER" | "SUBSCRIPTION";
export type FulfilmentStatus = "partially_packed" | "packed" | "out_for_delivery" | "delivered";

export type FulfilmentPackLine = {
  orderItemIndex: number;
  boxGrams: number;
  boxesPacked: number;
};

export type PackingItemComponent = {
  productId: string;
  productName: string;
  quantityGramsPerBox: number;
  totalGrams: number;
};

export type PackingItem = {
  orderItemIndex: number;
  salableProductId: string;
  salableProductName: string;
  boxGrams: number;
  boxesPacked: number;
  requestedGrams: number;
  previousPackedGrams: number;
  packedGrams: number;
  components: PackingItemComponent[];
};

export type FulfilmentAllocation = {
  growingBatchId: string;
  growingBatchNumber: string;
  growingBatchItemId: string;
  productId: string;
  productName: string;
  quantityGrams: number;
};

export type Fulfilment = {
  id: string;
  fulfilmentType: FulfilmentType;
  orderId: string;
  orderNumber?: string;
  subscriptionDeliveryId?: string | null;
  sourceSubscriptionId?: string | null;
  customerId?: string;
  customerName?: string;
  scheduledDeliveryDate?: string;
  items: PackingItem[];
  allocations: FulfilmentAllocation[];
  totalGramsConsumed: number;
  status: FulfilmentStatus;
  packedAt?: unknown;
  packedByUid?: string;
  packedByEmail?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  deliveryUserId?: string;
  deliveryUserName?: string;
};

/** Historical fields retained so older fulfilment records can still be displayed safely. */
export type LegacyOrderFulfilment = Partial<Fulfilment> & {
  salableProductId?: string;
  salableProductName?: string;
  salableProductSku?: string;
  boxGrams?: number;
  quantityPacked?: number;
  totalGramsConsumed?: number;
  status?: string;
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
  scheduledDeliveryDate?: string;
};
