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

### Canonical combo component contract

Combo salable products are built from production Microgreen components using `percentage` shares of the package. `quantityGrams` is not the canonical source of truth for combo packs; it is only meaningful for single-product or legacy records.

For a 100g combo with a 60/40 split:
- Broccoli = 60g
- Radish = 40g

For 10 such combo packs:
- Broccoli = 600g
- Radish = 400g
- Total pack weight = 1000g

### Order-line weight and per-package weight rule

The canonical contract is:
- `sellingOption.weightGrams` / package size = grams per package
- `OrderItem.quantity` = number of packages ordered
- `OrderItem.weightGrams` = total line weight = package size × quantity

Fulfiment and stock deduction must operate on the total line requirement. They must not multiply the same quantity twice.

Example: 100g packaging × 10 boxes → `weightGrams = 1000`; component demand is 600g broccoli + 400g radish.

### Demand and packing rules

- Forecasting must compute combo component demand from the component percentage and the actual package size/quantity.
- Packing UI and service calculations must use the same component percentages and same remaining-order grammar.
- Stock deduction and batch allocation occur only for the packed grams for that request.
- Partial fulfilment retains the remaining quantity; a fully packed order moves to the handover lifecycle.

### Packing idempotency and reversal rules

- A repeated logical packing request must be treated as the same operation, not an additional stock deduction.
- The duplicate check, stock deduction, order update, and fulfilment creation must be atomic within the transaction.
- A packing operation can only be cancelled or reversed before handover has occurred.
- Once a fulfilment has been handed over, its stock deduction is not reversible unless an explicit, safe reversal flow is defined and validated by authoritative handover state.

### Growing Batches listing — Sold column

- Sold % = `sold / harvested × 100` (0 when harvested is zero/missing, capped at 100). The Sold column follows Harvested.

### Growing Batch lifecycle rules

- Remaining batch stock = `batchStockGrams` if present, else `max(0, harvested - sold)`. This is used by Inventory, reconciliation and Close Batch.
- Close Batch (manual) records remaining stock as waste and deducts only that remainder from product stock; stock consumed by packing is never deducted again.
- Automatic close happens at handover only when every harvested item's sold quantity is >= its harvested quantity (harvested > 0) and no stock remains; it never uses Planned.
- Batch closure is `status: "closed"` with `closedAt/closedByUid/closedByEmail`. It does not set `delivered` and never changes order, fulfilment, delivery-assignment or subscription-delivery status. Legacy `delivered: true` batches are still treated as closed.
- Cancelling packing (before handover only) restores product stock and the originating batch items from the fulfilment allocations, reverts the order/subscription delivery from `packed`, and cannot run twice.
- Not Started batches (`not_started`, including the legacy `planned` alias) may be deleted only from the View Batch/details screen. The delete service re-reads the latest batch inside a Firestore transaction and blocks deletion if production/harvesting has started, lifecycle or stock history exists, or inventory-adjustment/fulfilment records reference the batch. Batch status-changing production, harvest, packing, and closure operations update the same batch document, so a concurrent lifecycle change conflicts with deletion rather than allowing an active batch to be removed.

### Notifications

- `lib/alerts.ts` is the single entry point. `confirmAction` and `promptText` remain SweetAlert dialogs (decision/input required).
- `showSuccess`, `showToast`, `showWarning`, `showError` and the global error handler use the centralized SweetAlert2 toast mixin in `lib/toast.ts`: top-right, animated, manually dismissible. Success/info 3s; error and warning 5s.

### Salable Product definition and pricing

- A Single Product has one Microgreen component with a fixed numeric `100` share, displayed as **Quantity (%)**. Its share is 100%, not a 100g package size; selected selling-option packaging determines actual sold grams. Combo component percentages and their calculations remain unchanged.
- Create and Update forms always include one real 100g selling option, preserving existing options and never duplicating an existing 100g option. A valid 100g option (positive MRP and price, price not above MRP) is required in both the form and Sales Product service before writes.
- Price & Purchase is review-only. The displayed MRP/selling price follow the 100g salable option, while purchase availability retains and displays the Product's saved values.

### Offers date ranges

- Offers use the existing `type`, `startDate`, and `endDate` fields. Date ranges are inclusive; ranges of the same type may not overlap, while different types may overlap.
- The Offers form reports date-ordering and overlap errors through the centralized SweetAlert2 error toast. The service revalidates writes against current Firestore offers while serializing saves by offer type.

### Offers Subscription type

- The approved specification is `OFFER-SUBSCRIPTION-REQUIREMENTS.md`. Subscription is the fourth Offers Master type alongside Price, Delivery Charge, and Quantity.
- Subscription offers store administrator-configured extra deliveries separately for selected Monthly, Quarterly, Half-Yearly, and Yearly frequencies in the optional `subscriptionOffer` field. No legacy offer migration is required.
- The Offers form previews total deliveries from each matching active Subscription Plan's editable `deliveriesPerTerm` plus the configured bonus. The separate hardcoded helper in `types/subscription.ts` is not used; subscription behavior is unchanged.
- Offer services validate the frequency/count configuration and clear subscription-only data when an offer changes to another type. The listing displays and searches the frequency/bonus summary.
- Scope is Admin Offers Master only. Applying offers to customer subscriptions, customer pricing, website/cart/checkout, and delivery generation are excluded.

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

Subscription Masters uses page-level **Subscription Plans** and **Add/Edit Subscription Plan** tabs. Add and Edit render the existing plan form inline (not in a modal); successful saves return to the list and refresh it. Cancel or navigating back to the listing from a dirty form requires confirmation through the existing SweetAlert2 confirmation utility.

Current selling-option behavior:
- Product is selectable during Create.
- Product is read-only during Update.
- Active Product selling options are shown in the Selling Options block.
- Packaging is read-only.
- Product Selling Price is read-only.
- **Subscription Plan Price is editable during both Create and Update.**
- Each selling option can have its own plan price.
- The plan-level `price` is the current Product 100g Selling Price, read-only in Subscription Masters. Plan-level `maximumPlanPrice` is `deliveriesPerTerm × price`. Each Subscription Plan selling option stores its actual `planPrice` and its own `maximumPlanPrice = deliveriesPerTerm × the matching Product selling option's price`, rounded to two currency decimals. Maximum prices are informational; discounted `planPrice` values below them are valid and are never rewritten because Product prices change. Missing actual selling-option `planPrice` values default to their packaging-specific maximum. Require a valid 100g Product Selling Option; never substitute MRP or another packaging size. Legacy nested `minimumPlanPrice` / `referencePlanPrice` values are read compatibly and replaced with canonical `maximumPlanPrice` on the next successful plan save. Legacy root `referencePlanPrice` is not authoritative; root `price` / `maximumPlanPrice` are refreshed from the latest valid 100g option on create/update. No bulk migration is required.
- Duplicate selling options are rejected.
- Negative plan prices are rejected.
- If the selected Product has no active selling options, the entire Selling Options block is hidden.
- Plan Price per 100gms is read-only and reflects the current Product 100g Selling Price.

### Subscription Masters listing

- The `/subscription-masters` listing displays exactly these columns in
  order: Product, Plan, Frequency, Deliveries, Skips Allowed, Selling Options,
  Status, Actions.
- Each configured Selling Option shows its weight and price using the
  existing currency formatting (for example, `100g - ₹500.00`).
- Maximum quantity and all maximum-related information are excluded from the
  listing. Plan forms, selling-option configuration and stored data, delivery
  counts, frequency rules, pricing calculations, status behavior, actions, and
  other pages remain unchanged.
- See `SUBSCRIPTION-MASTERS-LISTING-REQUIREMENTS.md` for the full listing
  requirements.

Customer subscriptions are separate from plan masters and store customer-facing snapshots such as Product, selling option, weight, unit price, frequency and delivery schedule.

### Admin subscription completion — Phase 1 analysis

- Subscription Masters stores an editable plan-level `deliveriesPerTerm` in
  `subscriptionPlans`. Admin customer subscriptions separately save
  `totalDeliveries`; the completion fix is scoped to this purchased entitlement
  and does not change creation, plan selection, or the existing frequency
  mapping. Admin subscription delivery orders currently save a blank
  `subscriptionPlanId`.
- Admin packing marks occurrences `packed`; handover creates/updates them as
  `out_for_delivery`; the Delivery Status **Mark as Delivered** action updates
  the assignment, order, fulfilments, subscription-delivery record, and parent
  subscription in a transaction.
- Current `completedDeliveries` uses the delivered occurrence's sequence number
  as a high-water mark, not a count of distinct currently delivered records.
  This can overstate progress when earlier occurrences are incomplete. The
  fulfilment delivery-generation path separately counts delivered documents to
  determine progress and the next number. The delivery service can also
  overwrite a previously delivered occurrence with a later status, while the
  parent progress remains unchanged; its Delivered UI gate is not revalidated
  as a service transition, and a missing subscription-delivery record does not
  currently prevent the order/assignment/fulfilment updates.
- The proposed completion-only correction and legacy/Website compatibility
  risks are documented in
  [SUBSCRIPTION-DELIVERY-LIFECYCLE-REQUIREMENTS.md](./SUBSCRIPTION-DELIVERY-LIFECYCLE-REQUIREMENTS.md).
- The Website checkout snapshot and shared-lifecycle behavior are supplied as
  an integration contract for this task but are not verified against Website
  source in this repository. Confirm the Website's document paths and
  completion writer before implementing compatible shared-document changes.
- **No implementation has been made.** The requirements document is a draft
  awaiting approval; application changes must not begin until approval.

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

## Rack Locations — Thresholds

- Rack Locations store the user-entered `thresholdValue` and `thresholdUnit` (`gms` or `kg`) unchanged, alongside `thresholdGrams`, normalized to grams for internal calculations.
- Changing the unit selection must not convert or otherwise alter the entered value. A positive finite threshold is required when creating or saving a Rack Location.
- Create and edit forms expose the value and unit, and the listing displays the saved value with its saved unit. Existing records without threshold fields remain unset until a user explicitly enters a threshold; the UI must not invent or silently persist a value for those legacy records.
- The current repository baseline had no threshold fields in the Rack Locations UI, `Location` type, or write payload, and no remaining `locations.thresholdGrams` consumer was found. Existing location selection in Growing Batches continues to use the location name and active flag.
- Rack Location create/update validates the location name and threshold value/unit before any Firestore write and reports validation or save errors through the centralized top-right SweetAlert2 toast. Threshold values must be finite and greater than zero.

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

### Inventory Adjustment History Display
- Adjustment History is shown only for a selected batch and includes only records carrying that batch ID.
- The table displays Before, signed Qty, and After in that order, without a Created By column. Stored adjustment data, stock calculations, creator/audit records, and other adjustment details remain unchanged.

### Orders — Active and Delivered Listings
- Active Orders are restricted to confirmed lifecycle statuses (`confirmed`, `preparing`, `packed`, `ready_for_handover`, `handed_to_delivery`, `out_for_delivery`) and existing successful payment states (`paid`, `partially_paid`). Pending-payment, paid-but-unconfirmed, failed/refunded, delivered, and cancelled orders are excluded.
- Delivered Orders require both the order and delivery assignment to be `delivered`. Delivery date filtering uses the assignment's `updatedAt`, which the delivery status transaction sets when it records the `delivered` transition.
- The Delivered tab defaults to the current local calendar day and previous six days, inclusive. Queries constrain delivery-assignment timestamps in Firestore and fetch only the linked order documents.

### Fulfilment — Confirmed Paid Orders and Fixed Order Packaging
- Fulfilment order queries are restricted to payment `paid` and packable parent order statuses; pending/failed/refunded/cancelled/delivered orders are excluded. Subscription packing additionally requires an active parent subscription and that order's own scheduled delivery to remain `pending`.
- Packaging grams and box counts come from the confirmed order line (`weightGrams`, `quantity`, and saved packed progress) and are display-only in the packing worksheet.
- The packing transaction re-reads the parent order and subscription delivery, then rejects payment/status changes or client-provided package/box values that differ from the authoritative remaining order quantities before stock allocation or deduction.

### Delivery Button Label
- The existing delivery assignment action keeps its `delivered` status update and workflow; its visible label is **Mark as Delivered**.
