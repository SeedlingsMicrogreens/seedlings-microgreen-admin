# Phase 34 — Delivery Handover Immediate Out-for-Delivery Fix

## Changes
- Fixed the Handover button click handler so the handover function is actually invoked.
- Handover now immediately sets the order status to `out_for_delivery`.
- Delivery assignment is created directly with status `out_for_delivery`.
- Handover confirmation explicitly states that selected orders will be marked Out for delivery.
- Delivery Status now focuses on tracking handed-over/out-for-delivery orders and provides the Delivered action.
- Handover continues to remove assigned orders from the Handover list after reload.

## Existing workflow retained
- Only today's orders that are not delivered/cancelled are eligible.
- One delivery user is selected for all checked orders.
- Delivery user mobile is stored on the assignment and displayed in Delivery Status.
- `.git` is preserved.
