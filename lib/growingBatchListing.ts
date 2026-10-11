export function soldPercentOfHarvested(sold: number, harvested: number): number {
  const s = Number(sold);
  const h = Number(harvested);
  if (!Number.isFinite(s) || !Number.isFinite(h) || h <= 0 || s <= 0) return 0;
  return Math.min(100, Math.round((s / h) * 1000) / 10);
}
