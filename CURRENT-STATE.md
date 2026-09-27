# Seedlings Admin — Current State

**Baseline: Admin Phase 40**

This document describes the current business and technical state consolidated from the existing project documentation and Phase 40 handover. The actual implementation remains authoritative when a code-level detail differs from historical documentation.

## 1. Architecture

| Area | Current state |
|---|---|
| Frontend | Next.js 16 + React 19 + TypeScript |
| Database | Firebase Firestore |
| Authentication | Firebase Authentication |
| Server/API | Next.js application / Firebase-backed services |
| Business services | `lib/*.ts` service modules |
| Firebase Functions | **Not used** |
| UI | Existing Bootstrap/AdminLTE-style application UI |

## 2. Core product model — permanent distinction

The system intentionally has two different concepts:

### Microgreen
The underlying production/growing master. It represents what Seedlings grows.

Screen: **`/products`**

The `/products` UI must use the term **Microgreen**, not Product. This applies to listing headers, create/edit labels, placeholders, validation, messages and other user-visible terminology on this screen.

### Product
The salable customer-facing product that a customer purchases or subscribes to.

Screen: **`/sales-products`**

A Product can be a single Microgreen or a combo of multiple Microgreens.

### Packaging
Packaging sizes are stored in grams. Current approved sizes include:
- 100gms → 100
- 200gms → 200
- 500gms → 500
- 1kg → 1000
- 2kg → 2000
- 5kg → 5000

### Selling Option
A Product-specific customer packaging/selling option. Packaging and Product Selling Price are derived from the Product in Subscription Plan Master.

## 3. Main modules

- Dashboard
- Microgreen Production / Microgreen Master
- Products / Salable Product Master
- Offers Master
- Packaging Master
- Subscription Plans
- Pincode Master
- Rack Locations
- Growing Batches
- Inventory
- Fulfilment / Packing
- Orders
- Subscriptions
- Delivery Operations
- Customers
- Customer Contact / Enquiries
- Reports / Forecasting
- Notifications
- Audit Log
- Website CMS

## 4. Firestore collections

Current business/admin collections include:
- `userProfiles`
- `products`
- `salesProducts`
- `inventoryAdjustments`
- `growingBatches`
- `locations`
- `subscriptions`
- `subscriptionPlans`
- `deliveryCharges` (legacy/configuration collection still present in rules)
- `customers`
- `orders`
- `enquiries`
- `deliveryUsers`
- `deliveryAssignments`
- `subscriptionDeliveries`
- `fulfilments`
- `notifications`
- `auditEvents`
- Website CMS collections such as `cmsPages`, `cmsFaq`, `cmsTestimonials`, `cmsBlogs`, `cmsBanners`, `cmsNavigation`, `cmsSiteSettings`, `websiteTrustPoints`

### Order-line packing weight rule

For customer orders, `OrderItem.weightGrams` is the **total grams for the line** (packaging size × quantity). Fulfilment must use this value directly and must not multiply it by `OrderItem.quantity` again.

Example: 100g packaging × 2 boxes → `weightGrams = 200`; Fulfilment requirement = 200g.

## 5. Inventory and fulfilment

Inventory is canonical in grams.

- Creating a Growing Batch does **not** increase inventory.
- Harvest adds **net usable grams**.
- `gross harvested - actual loss = net usable`.
- Packing consumes required grams.
- Handover/delivery does not perform a second inventory deduction.
- Fulfilment records preserve operational/history information.
- Order-based fulfilment allocates harvested Microgreen stock to actual customer demand.

## 6. Orders

Orders represent customer purchases and their operational lifecycle.

- Orders contain customer/product/price/delivery snapshots.
- Historical order values remain based on stored snapshots rather than current master prices.
- Creating an order does not itself deduct inventory.
- Packing is responsible for consuming gram inventory.
- Customer-contact-required cases must not be represented as normal completed orders.

## 7. Subscription Plans

A Subscription Plan references a salable Product.

Current selling-option behavior:
- Product is selectable during Create.
- Product is read-only during Update.
- Active Product selling options are shown in the Selling Options block.
- Packaging is read-only.
- Product Selling Price is read-only.
- **Subscription Plan Price is editable during both Create and Update.**
- Each selling option can have its own plan price.
- Duplicate selling options are rejected.
- Negative plan prices are rejected.
- If the selected Product has no active selling options, the entire Selling Options block is hidden.
- Base Plan Price per 100gms remains editable.

Customer subscriptions are separate from plan masters and store customer-facing snapshots such as Product, selling option, weight, unit price, frequency and delivery schedule.

## 8. Delete/reference rules currently established

### Microgreen — `/products`
- Check whether the Microgreen is referenced by any salable Product in `/sales-products`.
- If referenced, block deletion.
- If not referenced, ask for confirmation and then permanently delete.
- The reference check must also be enforced in the delete service, not only the UI.

### Product — `/sales-products`
- Check whether the Product is referenced by Orders.
- If referenced, block deletion.
- If not referenced, ask for confirmation and then permanently delete.
- The reference check must also be enforced in the delete service.

### Subscription Plan
- Check whether the plan is used by customer subscriptions.
- If unused, ask confirmation and permanently delete.
- If used, block deletion.
- Do not infer plan usage merely from Product/frequency when there is no explicit plan reference; use the actual stored plan reference where available.

## 9. Current UX/implementation decisions

- SweetAlert2 is the standard confirmation/alert flow; native `alert`, `confirm` and `prompt` should not be reintroduced.
- Existing Admin UX should be preserved unless a requirement explicitly requests a change.
- Salable Product images use the established validation requirements documented in the historical changelog.
- Website CMS and operational modules reuse existing collections/services rather than introducing duplicate systems.

## 10. Security

- Admin authentication uses Firebase Authentication.
- Firestore business collections are restricted to authenticated Admin users according to current rules.
- Unmatched Firestore access is denied by the supplied rules.
- Administrative operations validate authenticated identity.
- Secrets remain in environment/deployment configuration and are not committed.
## Inventory Batch Reconciliation Update
- Inventory batch table columns are now ordered: Microgreen, Harvested, Loss, Stock, Sold Quantity (gms), Waste (gms).
- Added batch-level Waste as a reconciliation field separate from production Loss.
- Waste is an incremental reconciliation adjustment. Each Update deducts the entered waste grams from Product stock and batch Stock and records a batch_waste adjustment; the batch can be closed only after remaining Stock reaches 0.
### Inventory Batch Reconciliation — Sold Quantity Read-only / Waste Editable
- Sold Quantity is now read-only in Inventory and remains system-controlled from completed fulfilment/handover records.
- Stock remains read-only and is used to initialise the Waste field with the remaining batch stock.
- Waste is the only editable reconciliation value.
- Server-side reconciliation and batch closing now always read Sold Quantity from the latest Firestore batch, preventing manual Sold Quantity edits.
- Waste adjustments are incremental. Each Update reduces remaining batch Stock and Product stock and creates an Adjustment History entry; Close Batch requires remaining Stock to be 0 and does not deduct stock again.

### Batch Waste Product Stock Deduction Fix

- Closing a harvested batch now explicitly deducts reconciled Waste (remaining batch stock) from the aggregate Product `stockGrams`/`stock` in the same Firestore transaction.
- Sold Quantity remains read-only and is already deducted at packing; Waste is the final inventory deduction at batch close.
- A `batch_waste` inventory adjustment records previous stock, waste quantity, and new stock.

- Waste adjustment history now writes `growingBatchId` from the batch reference, preventing undefined Firestore fields.

### Inventory Batch Waste Reconciliation
- **Waste Adjustment (gms)** is the incremental editable amount for the current update.
- **Total Waste (gms)** is readonly and cumulative across all waste adjustments for the batch item.
- Example: 10g adjustment, then 10g adjustment = 20g Total Waste.
- Batch Stock continues to decrease by each incremental Waste Adjustment.
- Product aggregate stock and stockGrams are reduced by each incremental Waste Adjustment.
- Adjustment History records each individual waste adjustment.

- Total Waste display now uses explicit `batch_waste`/`isWaste` adjustment history: before the first waste adjustment it shows the initial remaining Stock; after adjustments it shows cumulative waste only. New waste adjustment records set `isWaste: true`.
- Fixed waste-adjustment history query to use the actual growing batch document ID (`batch.id`) instead of `latest.id` from Firestore document data, preventing `where()` from receiving `undefined`.

### Latest Phase 47 bugfix
- Waste adjustment flow validates required batch/product IDs before Firestore document references are created.
- Waste adjustment history writes `growingBatchItemId` only when available.

### Latest Phase 47 Waste Transaction Fix
- Root cause identified for `Cannot read properties of undefined (reading 'path')`: `transaction.get()` was being called with an `inventoryAdjustments` Query. The Firestore Web SDK transaction path expects a document reference for this operation.
- Waste history is now fetched with `getDocs()` before the transaction.
- Product documents continue to be read through transaction document references, then Product stock, batch Stock, and waste adjustment history are written atomically.
