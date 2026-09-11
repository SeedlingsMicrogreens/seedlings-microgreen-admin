# Phase 19 — Customer Contact Required

## Purpose
Adds a Sales & Customers queue for website orders where `requiresCustomerContact === true`.

## Behavior
- Adds **Customer Contact Required** under **Sales & Customers** in the Admin left menu.
- Reads the existing `orders` collection; no new collection is created.
- Shows customer, order, type, delivery date, issue/shortage and status.
- Search supports customer name/mobile, order number/ID and subscription information.
- View opens a detail modal with customer, order, delivery, availability snapshot, address and items.
- Subscription orders and one-time orders are both supported because the website stores the flag on the order.
- No automatic clearing or mutation of `requiresCustomerContact` is performed in this phase.
