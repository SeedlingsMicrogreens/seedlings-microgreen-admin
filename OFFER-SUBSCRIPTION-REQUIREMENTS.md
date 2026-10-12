# Offers Master — Subscription Offer Requirements

**Status: Approved and implemented**

## Goal and scope

Add **Subscription** as the fourth Offer Type in `/offers`, alongside Price,
Delivery Charge, and Quantity. A Subscription offer configures bonus deliveries
by subscription frequency. This phase covers the Admin Offers Master only:
configuration, validation, Firestore persistence, edit restoration, calculated
preview, and listing display.

This offer master does not apply offers to customer subscriptions. Applying a
bonus, changing customer-facing prices, scheduling or generating deliveries,
and changing website/cart/checkout behavior are explicitly out of scope.

## Existing behavior and source of truth

- Offers are stored in the Firestore `offers` collection and typed in
  `types/offer.ts`. Existing offer types are `price`, `deliveryCharge`, and
  `quantity`.
- Create and update validation is in `lib/offerService.ts`; the form and list
  are in `app/offers/page.tsx`.
- Date ranges are inclusive. Offers of the same type may not overlap; different
  types may overlap. This remains unchanged, including for Subscription offers:
  frequency differences do not create separate overlap groups.
- Offer writes use the existing per-type transaction lock and audit event
  behavior. The current Firestore rules already grant Admin access to both
  `offers` and `offerTypeLocks`; no rules change is proposed.
- The relevant frequency type and labels already exist in
  `types/subscriptionPlan.ts`:
  `monthly`, `quarterly`, `half_yearly`, and `yearly`.
- Subscription Plan documents in `subscriptionPlans` have a frequency and an
  editable `deliveriesPerTerm`. This is the existing configurable regular
  delivery count for a specific plan.
- A separate `deliveriesForFrequency` helper in `types/subscription.ts`
  hardcodes counts for a different frequency union (`weekly`, `monthly`,
  `quarterly`, `yearly`), omits Half-Yearly, and currently returns 52 for
  Yearly. Subscription Plan Master instead displays defaults 4, 12, 24, and
  48 for Monthly, Quarterly, Half-Yearly, and Yearly; each plan's count is
  editable. These are inconsistent sources and must not be silently treated as
  equivalent.
- Form/service errors use `showError` from `lib/alerts.ts`; its centralized
  SweetAlert2 toast is top-right and uses the established error duration.

## Proposed behavior

### Offer data and types

Add `"subscription"` to `OfferType`. Reuse the existing
`SubscriptionFrequency` type from `types/subscriptionPlan.ts`; do not add or
change frequency values in this phase.

Proposed optional Firestore field, present only when `type === "subscription"`:

```ts
subscriptionOffer?: {
  frequencies: SubscriptionFrequency[];
  extraDeliveriesByFrequency: Partial<Record<SubscriptionFrequency, number>>;
};
```

Example document fragment:

```json
{
  "type": "subscription",
  "subscriptionOffer": {
    "frequencies": ["monthly", "quarterly", "half_yearly", "yearly"],
    "extraDeliveriesByFrequency": {
      "monthly": 1,
      "quarterly": 3,
      "half_yearly": 6,
      "yearly": 12
    }
  }
}
```

The values above are examples only; the administrator enters the extra
deliveries separately for each selected frequency. Persist the configured
bonus counts, not a copy of regular delivery counts or a calculated total.
Missing `subscriptionOffer` remains valid for existing non-subscription offer
documents; no backfill or migration is required.

### Admin form and preview

- Add Subscription to the Offer Type selector and show its configuration only
  while that type is selected.
- Provide one applicable-frequency checkbox for each supported frequency.
- For each selected frequency, require an administrator-entered
  **Extra Deliveries** value. It is a positive whole number; it is not
  hardcoded or prefilled with the illustrative values above.
- Calculate a preview from matching active `subscriptionPlans` records. For
  each plan whose frequency is selected, display its plan name, configured
  regular deliveries (`deliveriesPerTerm`), configured extra deliveries, and
  calculated total:
  `plan.deliveriesPerTerm + extraDeliveriesByFrequency[plan.frequency]`.
  Compute the preview from current loaded plan records; do not persist the
  regular count or preview total into the offer.
- Show a clear unavailable/no-active-plan message for a selected frequency
  with no matching active plan. This does not by itself prevent saving the
  offer because its bonus configuration is independent of whether a plan
  currently exists.
- If multiple active plans have the same selected frequency, show a preview
  row for each plan because their configured regular delivery counts may
  differ.

### Validation and errors

Validate in both the UI before save and in `lib/offerService.ts` before
Firestore writes:

- Subscription offers select at least one supported frequency.
- Selected frequencies are unique and supported.
- Each selected frequency has exactly one corresponding extra-delivery value;
  no unselected frequency has a value.
- Each extra-delivery value is a finite positive integer.
- Non-subscription offers do not write `subscriptionOffer`. When an existing
  Subscription offer is changed to another type, remove its
  `subscriptionOffer` field in the same update so the stored type-specific
  data does not remain attached to the non-subscription offer.
- Display subscription-specific validation and save failures through the
  existing `showError` SweetAlert2 top-right toast, preserving the current
  inline form error behavior where applicable. Do not add a new notification
  dependency or use browser-native dialogs.

### Create, Update, Edit, and listing

- **Create:** build and persist the `subscriptionOffer` object from the
  selected frequencies and user-entered positive whole-number extras; retain
  the existing common fields, transaction lock, overlap check, and audit
  behavior.
- **Update:** validate the complete merged offer in the service; replace the
  saved bonus configuration for Subscription offers. Clear the
  `subscriptionOffer` field when changing away from Subscription. Preserve
  existing date overlap/lock semantics.
- **Edit:** restore selected frequencies and each extra-delivery input exactly
  from the saved object. Legacy non-subscription records without this object
  continue to edit normally.
- **Listing and search:** show the type label **Subscription** and a concise
  frequency/bonus summary (for example, `Monthly: +1, Quarterly: +3`). Keep
  existing status, location, period, search, edit, and delete behavior.

## Backward compatibility and boundaries

- Price, Delivery Charge, and Quantity remain supported with their current
  fields, form sections, service validation, date behavior, and listing
  summaries.
- Existing non-subscription documents are not migrated or rewritten.
- Continue using the existing `offers` collection and offer type locks.
- Do not change `firestore.rules`, subscription plan pricing, customer
  subscription records, website, cart, checkout, offer application logic, or
  delivery generation/fulfilment logic.
- No new package or dependency is required.
- Do not commit or deploy as part of this work.

## Proposed affected files

### Phase 2 application and tests

1. `types/offer.ts` — add the fourth type and optional typed bonus
   configuration.
2. `app/offers/page.tsx` — load Subscription Plan configuration for previews;
   add type-specific form controls, validation, edit restoration, type label,
   and listing summary.
3. `lib/offerService.ts` — enforce subscription configuration validation and
   clear subscription-only data when changing an offer to another type.
4. `lib/subscriptionOffer.ts` (new) — pure validation/preview helpers, if
   needed to keep the behavior testable without Firebase.
5. `tests/subscription-offer.test.ts` (new) — configuration validation and
   plan-specific preview coverage.
6. `tests/offer-date-validation.test.ts` — extend overlap compatibility
   coverage for the new offer type without changing date rules.
7. Reuse `types/subscriptionPlan.ts` as the frequency/type source; no change is
   currently proposed there.

### Phase 1 documentation

- `OFFER-SUBSCRIPTION-REQUIREMENTS.md` — this specification.
- `CURRENT-STATE.md` — record the draft plan and explicitly state that it is
  not implemented.
- `CHANGELOG.md` — record the planned, approval-gated work, not a completed
  implementation.

## Tests and acceptance criteria

- Pure tests cover every supported frequency, multiple plans with different
  `deliveriesPerTerm`, the total formula, and a selected frequency without an
  active matching plan.
- Validation tests reject no frequency, duplicates, unsupported frequencies,
  missing/extra map entries, zero, negative, fractional, `NaN`, and infinite
  counts; valid per-frequency values are accepted.
- Service/UI tests verify validation is enforced before writes and errors use
  the existing top-right toast path.
- Create and Update tests verify correct stored shape and that changing away
  from Subscription removes only the new subscription-specific field.
- Edit/list tests verify saved selection/count restoration and readable
  frequency-wise summary.
- Existing Price, Delivery Charge, Quantity, date-overlap, and toast behavior
  remains valid.
- Existing offers require no migration. No regular count or calculated total
  is written into subscription offer data.
- The implementation must not change subscription pricing or any customer
  subscription/delivery behavior.

## Phase 2 implementation sequence

1. After explicit approval, settle the source-of-truth question below without
   deviating from the approved decision.
2. Add and test pure Subscription Offer validation and plan-specific preview
   helpers, reusing the Subscription Plan frequency type.
3. Add the typed optional Firestore shape and service-side create/update
   validation/cleanup.
4. Wire the Offers page: load plan configuration, add frequency/extra controls,
   calculated preview, toast validation, and Create/Edit restoration.
5. Add the Subscription label and listing summary; verify existing offer types
   and type/date-overlap behavior are unchanged.
6. Run targeted offer tests, then `npm run typecheck`, `npm run build`, and
   `git diff --check`.
7. Update this specification and current-state/changelog documentation first
   if implementation exposes a missing or conflicting requirement; stop and
   obtain approval before changing code for that new requirement.

## Approved source-of-truth decision

The repository has two incompatible regular-delivery conventions: editable,
frequency-specific `subscriptionPlans.deliveriesPerTerm` values versus
hardcoded values in `types/subscription.ts` (including a different Yearly
count and no Half-Yearly). As approved, use each matching active Subscription
Plan's `deliveriesPerTerm` and show one preview row per plan; do not use the
hardcoded helper. This decision applies only to the Admin offer preview and
does not change subscription behavior.
