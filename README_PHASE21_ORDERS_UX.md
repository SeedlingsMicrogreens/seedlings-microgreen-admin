# Seedlings Admin — Orders UX & One-time Admin Order Phase 21

## Orders list UX
- Removed the persistent right-side Order Details panel.
- `View Details` now opens a large scrollable modal, keeping the order list readable and giving the selected order enough space for customer, delivery, items, payment and status controls.
- Customer names fall back to the customer's mobile number when the name is missing.
- Existing subscription orders remain visible in Order Master, but they are not creatable from this screen.

## Create Order
- Create flow is explicitly **One-time only**.
- Removed customer subscription selection and all subscription creation behavior from this form.
- New admin-created orders are stored with `orderType: "one_time"` and no subscription source.
- Offline payment is recorded as paid at creation with payment method `offline` and paid amount equal to the order total.
- Optional transaction ID / number field.
- Optional payment transaction photo upload (image only, max 5 MB) using Firebase Storage.
- Payment receipt URL/path and payment recording actor fields are stored on the order.
- Missing customer delivery address is blocked with a SweetAlert error.

## Storage
- Added `storage.rules` for admin-only payment receipt access.
- Deploy Firebase Storage rules with the project when this feature is deployed.

## Existing behavior retained
- Existing subscription orders and subscription status data are retained for viewing/history.
- Existing SweetAlert2 error/confirmation handling is retained.
- `.git` directory is preserved.
