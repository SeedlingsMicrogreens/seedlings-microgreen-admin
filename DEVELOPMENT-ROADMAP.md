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
