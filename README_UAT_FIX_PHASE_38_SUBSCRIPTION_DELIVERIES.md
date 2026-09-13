# UAT FIX PHASE 38 — Subscription Deliveries

## Scope
Admin-side implementation of actual subscription delivery tracking.

## Architecture
- Firestore collection: `subscriptionDeliveries`
- One document represents one actual subscription delivery being handed over.
- Future delivery occurrences are NOT created in advance.
- A record is created only when the related subscription order is handed over to delivery.
- The record links the actual delivery to exactly one subscription and one order.
- Delivery status is synchronized from the existing delivery assignment flow.

## Relationship
`1 Subscription -> Many subscriptionDeliveries -> Each delivery -> 1 Order`

## Delivery record
Stores:
- subscriptionId
- orderId / orderNumber
- deliveryNumber
- customerId / customerName / customerMobile
- salableProductId / productId / productName
- deliveryDate
- status
- deliveryAddress
- deliveredAt / failedAt / cancelledAt when applicable
- createdAt / updatedAt

## Handover behavior
When an order is handed over:
1. Existing order and delivery assignment are updated.
2. If it is a subscription order, the transaction creates the corresponding `subscriptionDeliveries` record.
3. The subscription `deliveriesGenerated` and `nextDeliveryDate` are advanced.
4. All of the above occur in the same Firestore transaction.

The operation is idempotent for the same subscription delivery occurrence.

## Status behavior
Existing delivery assignment statuses are mapped to subscription delivery statuses:
- assigned / accepted -> assigned
- picked_up / out_for_delivery -> out_for_delivery
- delivered -> delivered
- failed -> failed
- cancelled -> cancelled

## Admin UI
Delivery Operations now includes a **Subscription Deliveries** tab showing actual recorded deliveries only.

## Firestore rules
Admin read/write access was added for `subscriptionDeliveries`.

## Verification
- Changed TypeScript/TSX files passed TypeScript `transpileModule` syntax diagnostics.
- `git diff --check` passed.
- Full project `npm run typecheck` could not be run because the supplied project archive does not contain installed `node_modules`.
