export type SalesProductType = "single" | "multiple";

export type SalesProductComponent = {
  productId: string;
  productName: string;
  productSku?: string;
  quantityGrams: number;
  /** For combo Products, the microgreen share as a percentage of the total pack. */
  percentage?: number;
};

export type SalesProduct = {
  id: string;
  name: string;
  sku?: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  imageUrl?: string;
  type: SalesProductType;
  components: SalesProductComponent[];
  /** Original/reference retail price shown to customers before any discount. */
  mrp: number;
  /** Actual customer-facing sale price. */
  sellingPrice: number;
  /** Current packed saleable units available for fulfilment/orders. */
  packedStockQuantity?: number;
  currency: string;
  oneTimePurchase: boolean;
  subscriptionPurchase: boolean;
  active: boolean;
  featured?: boolean;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};
