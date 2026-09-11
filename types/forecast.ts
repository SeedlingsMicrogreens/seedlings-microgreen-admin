/**
 * Simple production-planning row.
 *
 * The forecast screen intentionally focuses on four numbers an admin needs:
 * current stock, stock expected from ongoing batches, current requirement,
 * and the remaining quantity that still needs to be grown.
 */
export type ForecastRow = {
  productId: string;
  productName: string;
  cycleDays: number;
  currentStockGrams: number;
  inProductionGrams: number;
  currentRequirementGrams: number;
  needToGrowGrams: number;
  expectedYieldGramsPerTray: number;
  traysToGrow: number;
};
