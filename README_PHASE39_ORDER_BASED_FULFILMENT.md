# Phase 39 — Order-Based Fulfilment

## Purpose

Fulfilment now represents the physical allocation of freshly harvested Microgreens to actual customer demand.

## Core rules

- `salesProducts.packedStockQuantity` is no longer used by the Fulfilment workflow.
- Packing is performed against a specific Order.
- `fulfilmentType` identifies `ORDER` or `SUBSCRIPTION`.
- One-time fulfilment stores `orderId`.
- Subscription fulfilment stores `orderId` and `subscriptionDeliveryId`.
- `subscriptionDeliveryId` identifies the specific delivery occurrence, not the whole subscription.
- Harvested quantities are allocated from completed Growing Batch items using `batchStockGrams` (or the harvested usable quantity when batch stock has not yet been initialized).
- Aggregate Microgreen stock is reduced by the grams actually packed.
- Growing Batch item `batchStockGrams` is reduced by the same grams, preserving batch-to-demand traceability.
- Order item `packedGrams` / `packedBoxes` tracks partial packing.
- A fully packed one-time Order moves to Order status `packed` and appends `packed` to `statusHistory`.
- A subscription order creates/updates its `subscriptionDeliveries` record as `pending` for partial packing and `packed` when fully packed.
- Once an Order is fully packed it no longer appears in Pending Packing.
- Partial packing remains pending for the remaining grams.
- Delivery Operations accepts `packed` or existing `ready_for_handover` orders for handover.
- Existing handover continues to move the order to `out_for_delivery` and updates the subscription delivery accordingly.

## Packaging

Box size is selected from active `Packaging Master` entries. For combo Products, Microgreen grams per box are calculated from the Product component percentages.

## No Firebase Functions

The implementation uses the existing Next.js/Firestore architecture only.
