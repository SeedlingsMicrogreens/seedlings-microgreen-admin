# Admin Subscription Completion Synchronization

**Status: Approved and implemented in Admin (2026-10-22)**

This document records the Admin delivery-completion behavior. The "Verified
Admin baseline" section describes the code as it was before the approved
correction; "Intended behavior" is now implemented (see "Implementation
notes").

## Scope

- Correct parent-subscription progress and completion when Admin marks a
  subscription order delivered, using the purchased subscription's already
  saved `totalDeliveries`.
- Preserve one-time order behavior and all existing subscription creation,
  plan configuration, payment, packaging, inventory, pricing, delivery charges,
  and subscription bonus-offer behavior.
- Do not redesign subscription creation, add Subscription Plan selection to
  its form, or change the Website application.

## Verified Admin baseline

### Plan source and new-subscription creation

- Subscription Plan documents are stored in `subscriptionPlans`. Their model
  uses `frequency` and the administrator-editable positive-integer
  `deliveriesPerTerm`; the supported identifiers are `monthly`, `quarterly`,
  `half_yearly`, and `yearly`. See `types/subscriptionPlan.ts`,
  `app/subscription-masters/page.tsx`, and `lib/subscriptionPlanService.ts`.
- Subscription Masters uses default count values of 4, 12, 24, and 48 for
  Monthly, Quarterly, Half-Yearly, and Yearly. These defaults are editable
  values, not a formula or a fixed rule for all plans with that frequency.
- Admin `/subscriptions` currently selects a Product and selling option, not a
  Subscription Plan. `lib/subscriptionService.ts` does not accept a plan ID,
  and its payload does not store `subscriptionPlanId`. Its existing
  frequency-based `totalDeliveries` creation behavior is outside this
  completion-only change and must remain unchanged.
- The current helper `deliveriesForFrequency()` in `types/subscription.ts`
  hardcodes `weekly → ongoing`, `monthly → 4`, `quarterly → 12`, and
  `yearly → 52`; it does not support `half_yearly`. This discrepancy with
  Subscription Masters is recorded as existing behavior, not a requirement to
  alter that mapping in this task.
- Admin subscription delivery orders created by
  `lib/subscriptionDeliveryService.ts` currently contain a blank
  `subscriptionPlanId` and plan name, and copy the subscription frequency into
  `subscriptionPlanFrequency`. Plan edits do not update existing
  `subscriptions.totalDeliveries`.
- The `Subscription` model types `totalDeliveries` as a required number and
  `completedDeliveries` as an optional number. Admin delivery completion reads
  the saved total and writes `completedDeliveries` and, when the current
  high-water calculation reaches that total, `status: "completed"` on the
  parent subscription document.
- No additional frequency-to-count mapping was found in the current Admin
  subscription creation path. Subscription offer preview instead reads each
  matching plan's `deliveriesPerTerm`; it is not the customer-subscription
  creation path.

### Admin pack, handover, and delivered transitions

- Packing in `lib/fulfilmentService.ts` moves a subscription delivery to
  `packed` (or `pending` when packing is incomplete); it does not represent a
  completed delivery.
- Admin handover in `lib/deliveryService.ts` creates or updates the
  subscription delivery as `out_for_delivery`, advances the order and
  fulfilment lifecycle, and writes the delivery assignment in a Firestore
  transaction.
- The Admin **Mark as Delivered** button is shown for assignments currently
  displayed as `out_for_delivery` in `app/delivery/page.tsx`. It calls
  `updateDeliveryAssignmentStatus()` in `lib/deliveryService.ts`.
- That service transaction updates the assignment, parent order, related
  fulfilments, and—through
  `updateSubscriptionDeliveryStatusInTransaction()` in
  `lib/subscriptionDeliveryService.ts`—the subscription-delivery record and
  parent subscription. For a subscription order, the mapping sets the
  subscription delivery to `delivered`.
- The current completion calculation is a delivery-number high-water mark:
  `completedDeliveries = max(saved completedDeliveries, delivered delivery
  number)`. The parent is marked `completed` when that value reaches
  `totalDeliveries`. Thus, marking a higher-numbered delivery delivered can
  overstate progress if earlier occurrences are still missing, skipped, failed,
  or cancelled.
- `addNextSubscriptionDeliveryForFulfilment()` separately queries all
  subscription-delivery documents marked `delivered`, uses the number of
  returned documents as `completedDeliveries`, and derives the next delivery
  number from that count. This query is outside the subsequent transaction and
  counts documents rather than distinct occurrence numbers; it is another
  progress/numbering calculation that must be reconciled with the approved
  definition.
- A non-delivered status update leaves `completedDeliveries` unchanged, while
  the delivery record itself is overwritten with the new status. In particular,
  the service currently has no guard preventing a later status update from
  replacing a `delivered` delivery record.
- The Delivery Status UI exposes the Delivered action only while an assignment
  is `out_for_delivery`, but `updateDeliveryAssignmentStatus()` does not
  independently validate the assignment's current status transition. If the
  related subscription-delivery document is absent, the transaction helper
  returns `null`; the caller still updates the assignment, order, and
  fulfilments.
- The Admin page's subscription-deliveries tab is informational/read-only;
  delivery actions are from Handover and Delivery Status. An exported
  `updateSubscriptionDeliveryStatus()` helper also exists, but no caller was
  found in this repository; the assignment service uses its transaction-level
  counterpart.
- Firestore security rules allow the Admin roles to read/write
  `subscriptions`, `subscriptionDeliveries`, `orders`, `deliveryAssignments`,
  and `fulfilments`. See `firestore.rules`.

### Scheduled delivery dates

- Subscription delivery dates (`startDate`, `nextDeliveryDate`, `endDate`,
  `scheduledDeliveryDate`, `deliveryDate`, `lastDeliveryDate`) are stored as
  `YYYY-MM-DD` calendar dates with no time of day or time zone.
- **Business rule: every subscription delivery is on a Saturday.** The Admin
  create form no longer offers other days; new subscriptions store
  `deliveryDay: 6` (`SUBSCRIPTION_DELIVERY_DAY`).
- The first delivery is the first Saturday strictly after the start date,
  taken from the administrator's local calendar date.
- Each later delivery is the first Saturday strictly after the previous
  scheduled delivery date. When the previous date is a Saturday this is
  exactly seven calendar days later. A previously stored non-Saturday date
  (for example a Friday written by the earlier IST bug) is left unchanged, and
  the following delivery is scheduled on the next Saturday after it. Dates are
  never derived from the order creation date or the current date.
- All date arithmetic uses the shared helpers in `lib/calendarDate.ts`, which
  never round-trip through local time and `toISOString()`. In IST that
  round trip moved every generated date back one day (24 Oct → 30 Oct →
  5 Nov 2026 instead of 31 Oct → 7 Nov).

### Implementation notes

- `resolveSubscriptionDeliveryTransition()` in `lib/subscriptionCompletion.ts`
  holds the transition rules; `updateSubscriptionDeliveryStatusInTransaction()`
  applies them inside the existing delivery-assignment transaction.
- The delivery record is located by its canonical ID
  (`{subscriptionId}_{deliveryNumber}`) or, failing that, by `orderId`; it must
  belong to the order's subscription. A missing subscription or delivery record
  now fails the update with a clear error instead of being skipped.
- `totalDeliveries = 0` on a `weekly` subscription means ongoing (existing
  creation behavior) and never completes; any other non-positive or
  non-integer total fails a Delivered update.
- Repeating Delivered on an already delivered occurrence changes nothing
  except completing a parent whose saved count already reached the total.

## Website integration boundary

- The requested integration contract states that Website checkout copies the
  selected plan's `deliveriesPerTerm` to the purchased
  `subscriptions.totalDeliveries`, and that the Website delivery-boy and Admin
  workflows operate on the same subscription lifecycle. This is treated here
  as externally supplied contract information, not as a fact verified from
  Website source code.
- The Website repository and a Website integration-contract document were not
  available in this Admin workspace. Its actual checkout plan-ID handling,
  completion transaction, record IDs, transition guards, and progress
  calculation therefore remain **Unverified**.
- Before implementation, Website owners must confirm whether the Website
  writes the same `subscriptionDeliveries/{deliveryId}` and
  `subscriptions/{subscriptionId}` records, and coordinate compatible
  transition/idempotency behavior. The Admin implementation must not modify
  Website code.

## Intended behavior for approval

### Use the saved purchased entitlement

1. Read `totalDeliveries` from the associated `subscriptions/{subscriptionId}`
   document. Do not read the current Subscription Master or infer an entitlement
   from frequency.
2. A missing, non-finite, non-integer, zero, or negative saved total is invalid.
   Do not substitute a hardcoded or recalculated value. Fail the subscription
   completion operation clearly rather than silently reporting success.
3. Do not change subscription creation, the subscription form, plan selection,
   or any existing subscription's saved entitlement.

### Delivered progress and completion

1. Packaging and handover remain intermediate states and do not count. A
   subscription delivery occurrence counts only when its
   `subscriptionDeliveries` record transitions to `delivered`.
2. In the existing transaction, validate the assignment, parent order,
   delivery record, and subscription identity/relationship before applying a
   subscription completion update. A missing or mismatched subscription
   delivery record must not be treated as a successful subscription-order
   completion while skipping the parent progress update.
3. Update `completedDeliveries` once per distinct occurrence, only on its first
   valid transition to `delivered`. Retries and duplicate requests for a
   delivery already marked delivered must not increment it again. Advance the
   saved completed count by one for that first valid transition; do not set
   progress to the delivery number or use a high-water mark. Read/update the
   delivery and parent subscription within the existing transaction so
   duplicate and concurrent requests serialize against the saved delivery
   state and subscription progress.
4. Compare the resulting completed count with the saved `totalDeliveries`.
   Mark the parent `completed` when the entitlement is reached. If deliveries
   remain, do not mark it completed; preserve a legitimate paused/cancelled
   parent status and otherwise keep it active.
5. Do not allow a later intermediate, failed, or cancelled update to overwrite
   an already delivered occurrence. Keep delivery, order, assignment,
   fulfilment, and subscription updates transaction-safe.
6. Keep one-time order delivery behavior unchanged.

### Open compatibility and legacy risks

- The Website completion implementation is not available in this repository.
  The supplied integration contract says it snapshots the purchased
  `totalDeliveries`, but does not establish its transition guards or progress
  update algorithm. Before release, confirm that Website writes the same
  subscription and delivery documents and cannot overwrite a delivered state or
  apply an incompatible completion count. Website code remains out of scope.
- Current Admin `completedDeliveries` may already contain a high-water-mark
  value that exceeds the number of genuinely delivered occurrences. The
  minimal transition fix will not silently invent or recompute a legacy
  entitlement. Existing progress reconciliation needs an explicit data policy
  if such records are found.
- The current model has `failed` and `cancelled` delivery statuses, but no
  explicit skipped status or reschedule contract. This change must not alter
  those business rules; those states do not count as Delivered. If they require
  special entitlement treatment, that needs separate approval.
- Duplicate document/occurrence identity and inconsistent legacy delivery
  records must be covered by focused tests and validated against actual
  persisted IDs. No production Firestore data has been inspected.

## Verification and tests required after approval

- A subscription with `totalDeliveries = 12` and 11 completed deliveries
  becomes Completed when its final required occurrence is delivered; a
  subscription with remaining deliveries stays Active.
- Missing, zero, fractional, or otherwise invalid saved totals fail safely.
- Partial and final delivery progress; one-time orders are unchanged.
- Duplicate and concurrent completion attempts cannot double-count.
- Packaging/handover/intermediate states do not count.
- Missing or mismatched subscription-delivery records do not silently bypass
  progress updates.
- Failed and cancelled occurrences do not count; no skipped/reschedule
  business rule is changed.
- Website/Admin shared-record compatibility is confirmed before release.

No application code, tests, Firestore data, security rules, commits, or Website
files are changed as part of this Phase 1 draft.
