# Phase 40 — Simple Subscription Fulfilment Delivery Flow

## Agreed business flow

The Fulfilment page uses the existing subscription as the source for the agreed number of deliveries.

For each active subscription:

```text
Completed Deliveries / Total Deliveries
```

The Admin user manually adds the next delivery only when it is not already present in Pending Packing Requirements.

### Example

```text
Subscription: 4 deliveries

Delivery 1 → delivered
Completed = 1 / 4

Delivery 2 missing from Fulfilment
→ Admin clicks Add Delivery
→ Delivery 2 appears in Pending Packing Requirements

Delivery 2 → packed → out for delivery → delivered
Completed = 2 / 4

Repeat until 4 / 4
```

## Last delivery

When the final agreed delivery is marked `delivered`:

```text
completedDeliveries = totalDeliveries
subscription.status = completed
```

The subscription is no longer shown in the Active Subscriptions section and no further delivery can be added.

## Firestore records

Adding a delivery creates the operational records required by the existing order-based fulfilment workflow:

- `orders` — one operational subscription order for the delivery
- `subscriptionDeliveries` — delivery lifecycle record with `pending` status

The existing packing, handover, delivery, fulfilment and history workflow remains unchanged.

No Cashfree payment is created for these subsequent deliveries.

## Duplicate protection

The next delivery number is based on completed deliveries. If that delivery already exists, the Add Delivery action does not create another order or delivery record.
