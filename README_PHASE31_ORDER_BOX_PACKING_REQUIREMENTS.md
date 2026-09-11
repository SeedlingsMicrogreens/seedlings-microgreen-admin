# Phase 31 — Order Box Packing Requirements

## Goal
Make Packing & Fulfilment directly actionable by showing the number of boxes required for all open orders.

## Behaviour
- Loads Orders alongside Products, Salable Products, Growing Batches and fulfilment history.
- Excludes orders whose status is `delivered` or `cancelled`.
- Aggregates order item quantities by Salable Product, so each Salable Product quantity represents boxes to fulfil.
- Supports combo Salable Products as a single box requirement while showing their component recipe below the product name.
- Shows the Salable Product box size from its component recipe total in `gms`.
- Shows current packed stock for the Salable Product.
- Calculates `Boxes to Pack = max(Open Order Boxes - Packed Stock, 0)`.
- Existing manual packing worksheet remains available below the requirement card.
- No order data or Firestore schema is changed by this phase.

## Example
- Broccoli 100 gms × 3 orders => 3 Broccoli boxes.
- Combo1 × 2 orders, where Combo1 contains Radish 100 gms + Broccoli 100 gms => 2 Combo1 boxes. The combo is not split into individual boxes.

## Verification
- `.git` is preserved.
- `git diff --check` passes.
