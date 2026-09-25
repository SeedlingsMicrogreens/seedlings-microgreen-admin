export const GROWING_BATCH_STATUSES = [
  "not_started", "in_progress", "completed_harvested", "closed",
] as const;
export type GrowingBatchStatus = (typeof GROWING_BATCH_STATUSES)[number];

export const GROWING_BATCH_ITEM_STATUSES = [
  "not_started", "in_progress", "completed_harvested", "failed",
] as const;
export type GrowingBatchItemStatus = (typeof GROWING_BATCH_ITEM_STATUSES)[number];

export const GROWING_BATCH_PHASE_STATUSES = [
  "na", "not_started", "in_progress", "completed",
] as const;
export type GrowingBatchPhaseStatus = (typeof GROWING_BATCH_PHASE_STATUSES)[number];

export type GrowingBatchPhase = {
  status: GrowingBatchPhaseStatus;
  date?: string;
};

export type GrowingBatchItem = {
  id: string;
  productId: string;
  productName: string;

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

  /** Planned phase dates calculated backwards from the batch harvest date. */
  phases?: {
    soaking: GrowingBatchPhase;
    darkPeriod: GrowingBatchPhase;
    lightPeriod: GrowingBatchPhase;
  };

  actualReadyDate?: string;
  actualHarvestGrams?: number;
  actualYieldGrams?: number;
  wastageGrams?: number;

  status: GrowingBatchItemStatus;
  notes?: string;
  /** Remaining grams available from this harvested batch item for fulfilment. */
  batchStockGrams?: number;
};

export type GrowingBatch = {
  id: string;
  batchNumber: string;
  /** Earliest planned phase date. Kept for backward compatibility. */
  startDate: string;
  /** Harvest date selected while creating the batch. */
  harvestDate?: string;
  locationId?: string;
  locationName?: string;
  notes?: string;
  status: GrowingBatchStatus;
  items: GrowingBatchItem[];
  createdByUid: string;
  createdByEmail?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  stockAdjusted?: boolean;
  stockAdjustedAt?: unknown;
  stockAdjustedByUid?: string;
  stockAdjustedByEmail?: string;
  delivered?: boolean;
  deliveredAt?: unknown;
  deliveredByUid?: string;
  deliveredByEmail?: string;
};
