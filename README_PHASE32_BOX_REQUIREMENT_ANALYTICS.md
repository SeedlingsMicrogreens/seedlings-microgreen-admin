# Phase 32 — Packing Box Requirement Analytics

## Change
Reworked the Packing & Fulfilment box requirement section into a direct analytics/card view instead of a table.

Each requirement is grouped by **Salable Product + customer pack weight** and displayed as:

- Product name
- Pack size in `gms`
- Number of boxes required

Example:

- Broccoli — `100 gms` — `3 boxes`
- Broccoli — `200 gms` — `1 box`
- Combo1 — `200 gms` — `2 boxes`

## Requirement logic
- Counts all order quantities for orders that are not `delivered` or `cancelled`.
- Uses the order item's `weightGrams` as the customer-selected pack size.
- Falls back to the Salable Product recipe total for legacy orders where `weightGrams` is missing.
- Combo products remain one box requirement under the combo's name and total pack weight; their internal components are not shown as separate boxes.
- No packing worksheet/table is used for this analytics section.

## Existing functionality retained
- Manual Packing Worksheet remains below the analytics section.
- Existing stock validation and atomic packing behavior are unchanged.
- Existing `gms` display convention is retained.
- `.git` is preserved.
