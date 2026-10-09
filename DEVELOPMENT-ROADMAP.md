# Seedlings Admin — Development Roadmap

## How to use this file

This is the forward-looking development document. It should contain **current and planned work**, not a copy of every historical implementation note.

Business requirements are incremental. A new requirement must not silently change an already-decided business relationship.

## Current baseline

**Admin Phase 40** is the current source baseline.

Major current areas:
- Microgreen Master
- Product / Salable Product Master
- Packaging
- Subscription Plans
- Subscriptions
- Orders
- Growing Batches
- Inventory
- Fulfilment
- Delivery Operations
- Customers / Enquiries
- Offers
- Reports / Forecasting
- Notifications / Audit
- Website CMS

## Completed/currently established capabilities

### Microgreen Master
- Production/growing master is `/products`.
- User-visible terminology is **Microgreen**.
- Production configuration and growing phases belong to the Microgreen.
- Inventory remains gram-based.
- Microgreen deletion is reference-protected against salable Products.

### Product Master
- Salable/customer-facing master is `/sales-products`.
- Supports single and combo Products.
- Product components reference production Microgreens.
- Selling options define customer packaging and selling prices.
- Product deletion is reference-protected against Orders.

### Packaging
- Packaging sizes are stored in grams.
- Current approved examples: 100, 200, 500, 1000, 2000, 5000 grams.

### Growing Batches / Inventory
- Multiple Microgreens can be produced in a batch.
- Harvest records actual production.
- Net usable production affects inventory.
- Inventory movements are retained.

### Orders / Fulfilment
- Orders retain snapshots.
- Packing consumes gram inventory.
- Order-based fulfilment tracks partial/full packing.
- Delivery follows packing/handover lifecycle.

### Subscription Plans
- Plans reference salable Products.
- Active Product selling options are shown in the plan.
- Packaging and Product Selling Price are read-only.
- Subscription Plan Price is editable on Create and Update.
- Selling Options block is absent when there are no active selling options.
- Unused plans can be confirmed and permanently deleted; plans in use by subscriptions are protected.

### Reports / Forecasting
- Production analytics is read-only.
- Forecasting distinguishes current stock from expected future production.
- Forecasting uses existing production/order/subscription information.

### Notifications / Audit
- Admin operational alerts are retained.
- Audit events are retained.
- No separate background scheduling platform is introduced by the current architecture.

## Active operational rules

### Combo demand and packaging contract
- Combo salable Products use component `percentage` for the share of the total package weight.
- `quantityGrams` is not used as the canonical parser for percentage-based combos.
- Component demand is derived as: package weight × component percentage ÷ total percentage × quantity.
- Example: 100g × 10 boxes with 60/40 split → 600g broccoli + 400g radish.

### Order-line weight and fulfilment requirement contract
- `sellingOption.weightGrams` is the per-package weight.
- `OrderItem.quantity` is the number of packages ordered.
- `OrderItem.weightGrams` is the total line weight and must be used directly in fulfilment calculations.
- Fulfilment must not multiply the line weight by `quantity` again.

### Demand lifecycle and packing rules
- Forecast includes both open orders and active subscription delivery requirements while those requirements remain unfulfilled.
- Subscription delivery order generation does not create a second requirement beyond the original active subscription; demand remains tracked correctly until the order is fulfilled or closed.
- Partial packing preserves the remaining quantity until the full required grams are packed.
- Delivered and cancelled orders remain excluded from open demand according to current status rules.

### Idempotent packing and safe reversal rules
- The packing transaction must prevent the same logical packing request from being applied more than once.
- The system must guard against duplicate fulfilment records, duplicate inventory adjustments, and duplicate stock deduction.
- A packing operation may be deleted or cancelled only before handover; once a handover has occurred, the stock deduction is protected from unsafe reversal.
- Reversal must restore exact component stock and inventory-adjustment history for the selected packing record without altering unrelated fulfilment records.

## Future work rules

When adding a new requirement, record it here only after the requirement is agreed. Include:
- business goal
- affected modules
- data model impact
- validation
- security/authorization impact
- history/audit impact
- UAT acceptance criteria

Do not create another phase README for every small fix. Add a concise entry to `CHANGELOG.md` after completion and update this file only if the roadmap/current scope actually changes.

## Release readiness

Before a release/merge of substantial Admin work:
- review current Git working tree
- run relevant UAT scenarios
- run `git diff --check`
- run `npm run typecheck` when dependencies are available
- run production build when dependencies/environment permit
- verify Firestore rules and authorization for changed collections
- verify historical snapshots are preserved

### Waste Reconciliation Firestore Transaction Fix
- Moved `inventoryAdjustments` waste-history query outside the Firestore transaction because Web SDK transaction reads must target document references.
- Kept Product stock and growing-batch updates atomic inside the transaction.
- Preserved cumulative waste calculation and adjustment-history behavior.


### Batch Close — Final Waste Handling
- Close Batch automatically treats every remaining batch Stock gram as Waste for all harvested microgreens.
- Product aggregate stock is deducted by that final waste quantity and a `batch_waste` adjustment is recorded.
- Batch item Stock becomes 0g, cumulative Total Waste is preserved/increased, and the batch status becomes `closed`.
- Update Reconciliation continues to handle incremental Waste entries before closing.
### Closed Batch Detail — Per-Microgreen Waste
- Closed batch microgreen details now display Waste (gms) instead of the redundant per-microgreen Status.
- Waste is read directly from each microgreen item's cumulative `batchWasteGrams`.
