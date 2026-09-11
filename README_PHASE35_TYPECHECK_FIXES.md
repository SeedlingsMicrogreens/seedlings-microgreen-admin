# Phase 35 — Typecheck Fixes

## Scope
Fixed the nine TypeScript errors reported by `npm run typecheck` after Phase 34.

## Fixes
- `app/customer-contact-required/page.tsx`
  - Added optional `subscriptionNumber` and `subscriptionPlanName` fields to `ContactOrder` because the page searches these fields but `Order` does not define them.
- `app/subscriptions/page.tsx`
  - Imported `confirmAction` from `lib/alerts` to match the SweetAlert confirmation already used by the cancellation flow.
- `lib/address.ts`
  - Updated `DisplayAddress` to include `string`, matching the existing runtime handling of legacy/string addresses and preventing `never` narrowing errors on `.trim()`.
- `lib/orderCreationService.ts`
  - Added an explicit null guard after payment receipt upload before accessing `receipt.url` and `receipt.path`.

## Validation
- `git diff --check` passes.
- A full typecheck could not be completed in the build environment because dependency installation (`npm ci`) timed out and `node_modules` is unavailable. The reported nine project errors were addressed directly.

## No functional change
These are type-safety/compile fixes only. Existing order, payment, delivery, fulfilment, forecasting, and UI behavior is otherwise unchanged.
