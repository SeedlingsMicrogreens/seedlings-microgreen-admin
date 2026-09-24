import type { GrowingBatch, GrowingBatchItem } from "@/types/growingBatch";
import type { Product } from "@/types/catalog";

export type ProductProductionMetric = {
  productId: string;
  productName: string;
  batches: number;
  trays: number;
  expectedGrams: number;
  expectedUsableGrams: number;
  actualHarvestedGrams: number;
  actualUsableGrams: number;
  actualLossGrams: number;
  yieldVarianceGrams: number;
  yieldAchievementPercent: number | null;
  lossRatePercent: number | null;
  avgActualYieldPerTrayGrams: number | null;
  avgActualUsablePerTrayGrams: number | null;
  completedBatches: number;
  minimumExpectedGrams: number;
};

export type BatchProductionMetric = {
  batchId: string;
  batchNumber: string;
  startDate: string;
  locationName?: string;
  status: GrowingBatch["status"];
  productCount: number;
  trays: number;
  expectedUsableGrams: number;
  actualUsableGrams: number;
  actualHarvestedGrams: number;
  actualLossGrams: number;
  completionPercent: number;
  yieldAchievementPercent: number | null;
};

function n(v: unknown) {
  return Math.max(0, Math.round(Number(v ?? 0)));
}

export function metricForItem(item: GrowingBatchItem) {
  const expected = n(item.expectedYieldGrams);
  const expectedUsable = n(item.expectedUsableYieldGrams);
  const minimum = n(item.minimumYieldGramsPerTray) * n(item.trayCount);
  const harvested = n(item.actualHarvestGrams);
  const usable = n(item.actualYieldGrams);
  const loss = n(item.wastageGrams);
  return {
    expected,
    expectedUsable,
    minimum,
    harvested,
    usable,
    loss,
    variance: item.status === "completed_harvested" ? usable - expectedUsable : 0,
    achievement: expectedUsable > 0 && item.status === "completed_harvested" ? (usable / expectedUsable) * 100 : null,
  };
}

export function buildProductionMetrics(
  products: Product[],
  batches: GrowingBatch[],
  startDate?: string,
  endDate?: string,
): ProductProductionMetric[] {
  const productMap = new Map(products.map(p => [p.id, p]));
  const rows = new Map<string, ProductProductionMetric>();

  for (const batch of batches) {
    if (startDate && batch.startDate < startDate) continue;
    if (endDate && batch.startDate > endDate) continue;

    for (const item of batch.items) {
      const current = rows.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName || productMap.get(item.productId)?.name || "Unknown product",
        batches: 0, trays: 0, expectedGrams: 0, expectedUsableGrams: 0,
        actualHarvestedGrams: 0, actualUsableGrams: 0, actualLossGrams: 0,
        yieldVarianceGrams: 0, yieldAchievementPercent: null, lossRatePercent: null,
        avgActualYieldPerTrayGrams: null, avgActualUsablePerTrayGrams: null,
        completedBatches: 0, minimumExpectedGrams: 0,
      };
      const m = metricForItem(item);
      current.batches += 1;
      current.trays += n(item.trayCount);
      current.expectedGrams += m.expected;
      current.expectedUsableGrams += m.expectedUsable;
      current.actualHarvestedGrams += m.harvested;
      current.actualUsableGrams += m.usable;
      current.actualLossGrams += m.loss;
      current.yieldVarianceGrams += m.variance;
      current.minimumExpectedGrams += m.minimum;
      if (item.status === "completed_harvested") current.completedBatches += 1;
      rows.set(item.productId, current);
    }
  }

  return [...rows.values()].map(r => ({
    ...r,
    yieldAchievementPercent: r.expectedUsableGrams > 0 && r.completedBatches > 0
      ? (r.actualUsableGrams / r.expectedUsableGrams) * 100 : null,
    lossRatePercent: r.actualHarvestedGrams > 0
      ? (r.actualLossGrams / r.actualHarvestedGrams) * 100 : null,
    avgActualYieldPerTrayGrams: r.trays > 0 && r.actualHarvestedGrams > 0
      ? r.actualHarvestedGrams / r.trays : null,
    avgActualUsablePerTrayGrams: r.trays > 0 && r.actualUsableGrams > 0
      ? r.actualUsableGrams / r.trays : null,
  })).sort((a,b) => b.actualUsableGrams - a.actualUsableGrams);
}

export function buildBatchMetrics(batches: GrowingBatch[], startDate?: string, endDate?: string): BatchProductionMetric[] {
  return batches.filter(b => (!startDate || b.startDate >= startDate) && (!endDate || b.startDate <= endDate)).map(batch => {
    const metrics = batch.items.map(metricForItem);
    const expectedUsable = metrics.reduce((s,m) => s+m.expectedUsable,0);
    const actualUsable = metrics.reduce((s,m) => s+m.usable,0);
    const actualHarvested = metrics.reduce((s,m) => s+m.harvested,0);
    const actualLoss = metrics.reduce((s,m) => s+m.loss,0);
    const trays = batch.items.reduce((s,i)=>s+n(i.trayCount),0);
    const harvestedItems = batch.items.filter(i=>i.status==="completed_harvested").length;
    return {
      batchId: batch.id, batchNumber: batch.batchNumber, startDate: batch.startDate,
      locationName: batch.locationName, status: batch.status, productCount: batch.items.length,
      trays, expectedUsableGrams: expectedUsable, actualUsableGrams: actualUsable,
      actualHarvestedGrams: actualHarvested, actualLossGrams: actualLoss,
      completionPercent: batch.items.length ? (harvestedItems/batch.items.length)*100 : 0,
      yieldAchievementPercent: expectedUsable && harvestedItems ? (actualUsable/expectedUsable)*100 : null,
    };
  }).sort((a,b)=>b.startDate.localeCompare(a.startDate));
}
