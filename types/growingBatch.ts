export const GROWING_BATCH_STATUSES = [
  "planned", "growing", "partially_harvested", "completed",
] as const;
export type GrowingBatchStatus = (typeof GROWING_BATCH_STATUSES)[number];

export const GROWING_BATCH_ITEM_STATUSES = [
  "growing", "ready", "harvested", "failed",
] as const;
export type GrowingBatchItemStatus = (typeof GROWING_BATCH_ITEM_STATUSES)[number];

export type GrowingBatchItem = {
  id: string;
  productId: string;
  productName: string;

  /** Number of trays planted for this product in this batch. */
  trayCount: number;
  startDate: string;
  growingCycleDays: number;
  expectedReadyDate: string;

  expectedYieldGramsPerTray: number;
  minimumYieldGramsPerTray: number;
  expectedLossGramsPerTray: number;

  expectedYieldGrams: number;
  expectedLossGrams: number;
  expectedUsableYieldGrams: number;

  actualReadyDate?: string;
  /** Gross grams harvested before actual loss/wastage. */
  actualHarvestGrams?: number;
  /** Net usable grams added to product inventory after actual loss. */
  actualYieldGrams?: number;
  /** Actual grams lost/wasted during harvest/cleaning. */
  wastageGrams?: number;

  status: GrowingBatchItemStatus;
  notes?: string;
  /** Batch-wise inventory quantity recorded after harvest reconciliation. */
  batchStockGrams?: number;
};

export type GrowingBatch = {
  id: string;
  batchNumber: string;
  startDate: string;
  locationId?: string;
  locationName?: string;
  notes?: string;
  status: GrowingBatchStatus;
  items: GrowingBatchItem[];
  createdByUid: string;
  createdByEmail?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  /** True after the batch has been reconciled on Inventory → Batch-wise Stock. */
  stockAdjusted?: boolean;
  stockAdjustedAt?: unknown;
  stockAdjustedByUid?: string;
  stockAdjustedByEmail?: string;
  /** True when this batch has been fully delivered/closed operationally. */
  delivered?: boolean;
  deliveredAt?: unknown;
  deliveredByUid?: string;
  deliveredByEmail?: string;
};
