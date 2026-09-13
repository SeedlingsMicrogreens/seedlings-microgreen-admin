# UAT_FIX_PHASE_12 — Admin Confirmation UX & Safe Delete Rules

## Scope

Standardize confirmation messaging for the agreed Admin destructive actions and implement safe hard-delete/soft-delete behavior.

## Delete rules

### Production Product
- Show confirmation before every delete attempt.
- Confirmation states that the action cannot be undone.
- Check `growingBatches` for any batch item referencing the production product.
- If no batch reference exists: permanently delete the product.
- If a batch reference exists: retain the product and set `status: inactive` instead of deleting it.

### Salable Product
- Show confirmation before every delete attempt.
- Confirmation states that the action cannot be undone.
- Check existing `orders`, `subscriptions`, and `subscriptionDeliveries` references.
- If no reference exists: permanently delete the salable product.
- If a reference exists: retain it and set `active: false` instead of deleting it.

### Location
- Show confirmation.
- Permanently delete the location because no dependency was specified for this master.

### Subscription Plan
- Show confirmation.
- Do not permanently delete the plan in this phase.
- Soft-delete by setting `active: false`, preserving the master for existing subscription/history context.

### Delivery Charge
- Show confirmation.
- Do not permanently delete the charge in this phase.
- Soft-delete by setting `active: false`, preserving the master for existing order/history context.

### Geolocation
- Show confirmation.
- Permanently delete the geolocation.

### Website CMS records
- Show confirmation.
- Permanently delete the supported CMS records:
  - Hero Slider
  - Blogs
  - Testimonials
  - FAQ

## Confirmation requirement

Every agreed destructive action uses the existing styled `confirmAction()` modal and explicitly communicates that the delete action cannot be undone.

For dependency-protected Product/Salable Product deletion, the confirmation also explains that an existing reference will cause the record to be retained and deactivated rather than permanently deleted.

## Existing functionality preserved

- Existing Phase 10 and Phase 11 changes are preserved.
- Existing product stock adjustment logic is preserved.
- Existing image validation and slug rules are preserved.
- Existing subscription creation/lifecycle behavior is not changed.
- Existing CMS CRUD behavior is preserved apart from confirmation wording.

## Verification

- Targeted TypeScript transpile/syntax diagnostics: PASS for all changed TS/TSX files.
- `git diff --check`: PASS.
- Full `npm run typecheck` cannot be meaningfully executed in the supplied source because `node_modules` is not present.
- `.git` is preserved in the deliverable.
