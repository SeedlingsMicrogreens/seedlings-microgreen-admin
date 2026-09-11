# Orders Phase 23 — Partial Offline Payments & Payment History

## Scope
Admin-created orders remain **one-time only**. This phase adds flexible offline payment collection.

## Payment behavior
- Create Order allows payment of ₹0 up to the order total.
- Payment status is automatically derived:
  - `pending` when nothing is paid
  - `partially_paid` when some but not all is paid
  - `paid` when the full total is collected
- Every payment is recorded as a separate entry in `paymentTransactions[]`.
- A later payment can be any positive amount up to the current remaining balance.
- The remaining balance can therefore be collected over multiple payments.
- Transaction ID/No. is optional for each payment.
- Payment transaction photo is optional for each payment and is stored in Firebase Storage.
- Order detail shows Total, Paid, Remaining, a Record Payment form, and payment history.
- Existing refund behavior remains limited to fully paid orders.

## Example
Order total: ₹100

1. Create order and collect ₹50 → `partially_paid`, paid ₹50, remaining ₹50.
2. Later collect ₹20 → paid ₹70, remaining ₹30.
3. Later collect ₹30 → `paid`, remaining ₹0.

Each collection remains visible as its own payment history entry.

## Validation
- No payment can exceed the current remaining balance.
- Payment amount must be greater than zero for subsequent collections.
- Receipt uploads remain image-only and limited to 5 MB.
