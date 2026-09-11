# Phase 28 — Simple Production Forecast

## What changed

The Production Forecast screen was simplified to answer only the operational questions needed for production planning:

- **Product** — production product name.
- **Cycle** — growing cycle in days.
- **Current stock (remaining)** — current aggregate production inventory.
- **In production batch (ongoing batch expected)** — expected usable yield from ongoing batches that have not yet been harvested or failed.
- **Current requirement (subscriptions + open orders)** — active subscription requirement plus orders that are not delivered/cancelled.
- **Need to grow** — `Current requirement - Current stock - In production batch expected`, never below zero.

The old historical-demand forecast, confidence, coverage, recommended trays, safety-stock and time-period controls were removed from this screen because they made the operational answer harder to read.

## Important

No database field names or underlying gram calculations were changed. Displayed weight units continue to use **gms**.

The existing batch, order and subscription collections are reused. No new collection is introduced.
