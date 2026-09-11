# Phase 29 — Production Forecast Order Component Fix

## What changed

Production Forecast **Current requirement** now calculates demand at the production-product level from every open order.

### Open orders

An order is included when its status is anything other than:

- `delivered`
- `cancelled`

Payment status is **not** used to decide whether an open order contributes to production requirement. Pending, partially paid, and fully paid orders are all demand commitments until the order is delivered or cancelled.

### Salable products and combos

Orders use `salableProductId` to identify the customer-facing item. The forecast now loads `salesProducts` and expands each salable product into its production-product components.

For example:

- Radish 100 gms × 1 box → Radish requirement = 100 gms
- Radish + Broccoli combo, 1 box, with 100 gms each → Radish requirement = 100 gms and Broccoli requirement = 100 gms

Therefore, those two orders together produce:

- Radish = 200 gms
- Broccoli = 100 gms

A combo's total box weight is no longer incorrectly assigned to one production product.

### Legacy orders

Older orders that do not have a matching `salableProductId` in `salesProducts` continue to use their existing production-product `productId` and stored weight information as a fallback.

## Requirement formula

For each production product:

`Current requirement = active subscription requirement + open-order production requirement`

Then:

`Need to grow = max(0, Current requirement - Current stock - In-production batch expected)`

No database migration or change to stored order quantities is introduced.
