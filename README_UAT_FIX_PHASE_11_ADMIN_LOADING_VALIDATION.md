# UAT_FIX_PHASE_11 — Admin Loading & Validation Fixes

## Scope

Phase 11 addresses the Admin issues identified in the 13 September 2026 functional/UI-UX QA pass:

1. Salable Product image is mandatory because Salable Products are customer-facing website catalogue items.
2. Inventory batch-stock save must not remain in a blocking `Saving...` state after a successful write.
3. Geolocation create/update must not remain in a blocking `Saving...` state after a successful write.

## 1. Salable Product image requirement

- Product Image is explicitly marked required in the Salable Product form.
- Client/service validation rejects an empty image with a clear error.
- The saved `imageUrl` is a non-empty trimmed string.
- Existing image validation remains unchanged:
  - 1200 × 1200 px
  - 1:1 square
  - PNG/JPG/JPEG
  - above 1 MB rejected
  - existing size guidance retained

Reason: a Salable Product is displayed to customers on the Website, so it must have a product image.

## 2. Inventory save state

The successful batch-stock save now uses a non-blocking success toast rather than awaiting a modal. The existing `finally` block clears `savingBatch`, so the Save button becomes usable again immediately after the operation completes.

## 3. Geolocation save state

Create/update now uses a non-blocking success toast. The existing `finally` block clears `saving`, so the form no longer remains blocked waiting for a success dialog to be dismissed.

## Verification

- `git diff --check` should pass.
- Targeted TypeScript syntax checks are required for changed files.
- Full dependency-based typecheck may be unavailable if `node_modules` is absent from the supplied source environment.
