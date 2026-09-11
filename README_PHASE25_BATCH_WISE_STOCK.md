# Phase 25 — Batch-wise Stock Reconciliation

- Added Inventory → Batch-wise Stock.
- Admin selects a harvested/failed batch that has not been stock-adjusted or marked delivered.
- Batch details populate automatically with actual harvested, wastage and actual usable grams.
- Admin can set final batch stock to 0 or any non-negative whole-gram quantity.
- Reconciliation applies only the difference between the harvested usable quantity already added to aggregate product stock and the final batch quantity.
- Each affected product gets an `inventoryAdjustments` record with `type: batch_stock` and `growingBatchId`.
- Each batch item stores `batchStockGrams`.
- The batch receives `stockAdjusted: true` and is removed from the Batch-wise Stock selector.
- Growing Batch Details can mark a batch `delivered: true`; delivered batches are also removed from the selector.
- Existing batch/order/packing flows are retained.
- `.git` is preserved.
