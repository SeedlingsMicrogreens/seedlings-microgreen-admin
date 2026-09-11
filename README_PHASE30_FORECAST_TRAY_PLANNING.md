# Phase 30 — Production Forecast Tray Planning

## Change
Added a simple **Trays to grow** column to Production Forecast, next to **Need to grow**.

### Forecast row now shows
- Product
- Cycle
- Current stock (remaining)
- In production batch (ongoing batch expected)
- Current requirement (subscriptions + open orders)
- Need to grow (additional quantity)
- Trays to grow (based on expected yield)

## Tray calculation
`Trays to grow = ceil(Need to grow / Expected yield per tray)`

If the product does not have an expected yield per tray configured, the UI shows `0 trays` rather than guessing.

This is planning information only. No batch is created automatically and no inventory/order data is changed.

## Existing logic retained
- Open orders continue to include all orders except delivered/cancelled.
- Salable Product combos continue to expand into their production-product components.
- Active subscription requirements continue to be included without double-counting subscription-generated open orders.
- Weight display remains `gms`.
