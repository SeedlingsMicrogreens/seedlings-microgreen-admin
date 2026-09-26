# Seedlings Admin — Development Rules

These rules exist specifically to prevent repeated regressions during future development.

## 1. Highest-priority rule: preserve established terminology

### `/products` = Microgreen

This screen is the **Microgreen Master**.

Never casually change user-visible terminology back to **Product** on this screen.

This includes:
- Listing headings
- Create form labels
- Edit form labels
- Search placeholders
- Validation messages
- Empty states
- Confirmation messages
- Status/filter labels where they identify the master
- Navigation labels

If a new requirement genuinely changes the business concept, update this rule explicitly before changing the implementation.

### `/sales-products` = Product

This screen is the **Product Master / Salable Product Master**.

It is the customer-facing/salable Product and must not be renamed to Microgreen merely because it contains Microgreen components.

### Never collapse these concepts

```text
Microgreen
  = what Seedlings grows

Product
  = what the customer buys/subscribes to

Packaging
  = package size in grams

Selling Option
  = Product + packaging + selling price
```

## 2. Source-of-truth rule

Before changing business behavior:
1. Read `CURRENT-STATE.md`.
2. Read relevant sections of `DEVELOPMENT-RULES.md`.
3. Read `DEVELOPMENT-ROADMAP.md` if the change affects planned work.
4. Inspect the actual implementation and service layer.
5. Treat the latest supplied repository/ZIP as the source of truth.
6. Do not resurrect behavior from old phase documents unless the current requirement explicitly asks for it.

## 3. Do not discard existing work

Never reset/discard the Git working tree without reviewing uncommitted changes first.

The Phase 40 handover specifically identified operational files with uncommitted changes. Preserve and review them before destructive Git operations.

## 4. Architecture rules

- Keep Firebase Firestore as the database.
- Keep Firebase Authentication for Admin authentication.
- **Do not introduce Firebase Functions.**
- Do not replace the current Firestore architecture with another backend.
- Do not create a second inventory system.
- Reuse existing service/data-layer patterns where possible.
- Do not create duplicate masters for an already-established business concept.

## 5. Inventory rules

- Inventory is maintained in grams.
- Creating a Growing Batch does not increase inventory.
- Harvest adds only net usable grams.
- Packing consumes the required grams.
- Delivery/handover must not deduct inventory a second time.
- Inventory movements must retain adjustment/history information.
- Expected future production is not current available stock.

## 6. Order rules

- Order creation does not consume inventory.
- Historical order prices/values use stored snapshots.
- Packing/fulfilment is responsible for inventory consumption.
- Customer-contact-required cases must not become normal completed orders.
- Order/fulfilment changes must preserve existing lifecycle and history behavior.

## 7. Subscription rules

- Subscription creation does not directly deduct inventory.
- Customer subscriptions store snapshots of the selected Product/selling option/pricing and delivery information.
- Completed/cancelled subscriptions are protected from invalid further status changes.
- Subscription Plan Product is editable only during Create; during Update it is read-only.
- Subscription Plan Selling Option Packaging and Product Selling Price are read-only.
- **Subscription Plan Price must remain editable on Create and Update.**
- If there are no active selling options, do not render a disabled or empty Selling Options block.

## 8. Safe delete rules

Destructive actions must follow:

```text
Check references
    ↓
If referenced → block deletion
    ↓
If not referenced → ask confirmation
    ↓
User confirms → delete
```

The service layer must repeat the reference check. UI-only protection is not sufficient.

## 9. UI/UX rules

- Do not silently redesign established Admin UX.
- Do not change layout just to implement a backend/business rule.
- Use the existing alert/confirmation system.
- Do not reintroduce native browser dialogs.
- Preserve existing Tailwind/Bootstrap/AdminLTE styling patterns where the screen already uses them.
- Keep changes targeted when the requirement is targeted.

## 10. Data/history rules

- Do not remove historical records simply to simplify an operational screen.
- Master changes must not silently rewrite historical order/subscription snapshots.
- Keep audit/history behavior intact for administrative mutations.

## 11. Change discipline

For a requested fix:
- Change only the required behavior unless another dependency must change for correctness.
- Do not introduce unrelated refactors.
- Check the affected service as well as the UI.
- Run `git diff --check`.
- Run `npm run typecheck` when dependencies are available.
- Run the relevant UAT flow after the code change.
