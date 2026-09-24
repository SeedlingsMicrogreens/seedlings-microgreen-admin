export type GrowingPhase = {
  phase: string;
  noOfDays: number;
};

export type ProductStatus =
  | "active"
  | "inactive"
  | "out_of_stock"
  | "coming_soon";

/**
 * Production Product Master.
 *
 * A Product represents something Seedlings grows. Customer selling/commerce
 * configuration belongs to Sales Products and is intentionally not part of
 * this master.
 */
export type Product = {
  id: string;
  name: string;
  sku?: string;
  slug?: string;
  category: string;

  status: ProductStatus;
  featured?: boolean;
  sortOrder?: number;

  /** Canonical current loose inventory. Updated by actual harvest/fulfilment flows. */
  stockGrams: number;
  /** Warning threshold for current loose stock. */
  lowStockThresholdGrams: number;

  /** Production profile used by Growing Batches and Forecasting. */
  growingActive: boolean;
  growingPhases?: GrowingPhase[];
  soakingRequired?: boolean;
  growingCycleDays: number;
  expectedYieldGramsPerTray: number;
  minimumYieldGramsPerTray: number;
  expectedLossGramsPerTray: number;
  safetyStockGrams: number;

  /** Legacy commerce/production fields retained only for existing records/code migration. */
  unit?: string;
  price?: number;
  compareAtPrice?: number | null;
  sellingOptions?: ProductSellingOption[];
  stock?: number;
  lowStockThreshold?: number;
  expectedYieldGramsPerBatch?: number | null;
  expectedLossPercent?: number | null;
  minimumBatchYieldGrams?: number | null;

  createdAt?: unknown;
  updatedAt?: unknown;
};

/** Legacy type retained temporarily so older screens/data can be migrated in Phase B. */
export type ProductSellingOption = {
  id: string;
  weightGrams: number;
  /** Original/reference price for this salable option. */
  mrp?: number;
  /** Customer-facing selling price. */
  price: number;
  active: boolean;
};

export type InventoryAdjustmentType = "harvest" | "legacy" | "packaging" | "receive" | "add" | "remove" | "batch_stock";

export type InventoryAdjustment = {
  id: string;
  productId: string;
  productName: string;
  type: InventoryAdjustmentType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  createdByUid: string;
  createdByEmail?: string;
  actualHarvestGrams?: number;
  wastageGrams?: number;
  growingBatchId?: string;
  growingBatchItemId?: string;
  createdAt?: unknown;
};
