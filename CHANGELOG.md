## Closed Batch — Harvest action visibility
- The Harvest button is now hidden when viewing a closed batch.
- Closed batches remain view-only and cannot start another harvest operation.

## Closed Batch Detail — Per-Microgreen Waste Display

- In the Closed Batch detail view, replaced the per-microgreen Status column with **Waste (gms)**.
- Closed batches now show the recorded `batchWasteGrams` for each microgreen so the waste quantity can be reconciled individually.
- Active batch details continue to show the existing Status column.


## Closed Batches — Waste Display

- Removed the Status column from the Closed Batches list because all rows in that tab are already closed.
- Added a Waste (gms) column showing the cumulative `batchWasteGrams` across all microgreens in each closed batch.
- Active Batches continue to show their existing Status column.

## Combo demand, packing, stock, idempotency and delete-before-handover — current fix baseline

- Combo Product components are defined by `percentage` of the total package weight. Multi-component combo products may store `quantityGrams: 0`; percentage is the canonical contract for demand and packing math.
- For a 100g combo with 60% broccoli and 40% radish, one unit requires 60g broccoli and 40g radish. Ten units require 600g and 400g respectively.
- Order line `weightGrams` is the total line weight for the order item, not a per-box value multiplied again by quantity. A 100g box with quantity 10 should yield `weightGrams = 1000` at the order-line level.
- Forecasting, fulfillment, and stock deduction all use the same percentage-based conversion to derive component grams from the selected package size and quantity.
- Packing operations are idempotent at the logical-request level. A retry of the same logical request must not create a duplicate fulfilment row or a second inventory deduction.
- A packing operation may be reversed or cancelled only when the packed goods have not been handed over. Once handover occurs, the system must reject deletion and leave stock records unchanged.
- Deletion/cancellation must reverse the exact component deductions, inventory adjustments, and order-packing state for the selected packing operation without touching unrelated packing records.
- Regression tests now cover combo percentages, package weight consistency, partial/full packing, duplicate requests, and delete-before-handover reversal.

## Fulfilment packing weight fix — Phase 47 baseline

- Fixed pending packing requirements to treat an order item's `weightGrams` as the **total line weight** already calculated from packaging size × box quantity.
- Removed the duplicate multiplication by `quantity` in the Fulfilment UI and packing service.
- Example: a 100g packaging ordered with quantity 2 and `weightGrams: 200` now shows **200 gms required / 200 gms pending**, not 400 gms.
- Packing box validation and inventory deduction continue to use the actual total grams required by the order line.


## Batch Close — Irreversible Confirmation

- Updated the Close Batch confirmation to clearly state that all remaining Stock for harvested Microgreens will be automatically recorded as Waste.
- The confirmation now states that the batch will no longer be available for selling after closure.
- The confirmation explicitly warns that closing a batch is an irreversible action.

# Seedlings Admin — Consolidated Changelog

This file replaces the previous collection of phase-specific Markdown notes. It keeps the useful historical context without maintaining dozens of competing documentation files.

## Phase 45 — Seedlings Feedback image validation refinement

- Seedlings Feedback images now use feedback-specific validation instead of Product image validation.
- Images must be landscape 3:2 with minimum dimensions of 900×600 px.
- 1200×800 px is the recommended image size.
- PNG/JPG/JPEG are supported and files above 1 MB are rejected.
- Images are not automatically cropped or resized to force the aspect ratio.
- Ideal file size guidance is 150–500 KB; up to ~700 KB is recommended.

## Phase 42 — Not Started Growing Batch Editing

- Added an Edit Batch action only for Growing Batches with status `not_started`.
- Not Started batches can update harvest date, growing location, notes and Microgreen tray quantities.
- Setting a Microgreen tray quantity to `0` removes that Microgreen from the batch.
- New Microgreens can be added to a Not Started batch with any valid tray quantity.
- Editing recalculates the affected batch item production quantities and phase dates from the selected harvest date.
- Closed, in-progress, and harvested batches cannot be edited.
- Growing Batch creation workflow remains unchanged.

## Phase 40 — Current baseline

- Subscription Plan Selling Options use the selected Product's active selling options.
- Packaging and Product Selling Price are read-only in Subscription Plan Master.
- Subscription Plan Price is editable on both Create and Update.
- Selling Options block is completely hidden when the selected Product has no active selling options.
- Selling-option plan prices are validated and persisted with selling-option identity and weight.
- Subscription fulfilment was simplified to an order/delivery-occurrence based operational flow.
- Order-based fulfilment allocates harvested Microgreen stock to customer demand.
- Packing records preserve partial/full packing state and batch traceability.

### Recent Admin fixes

- `/products` is the Microgreen Master; user-facing terminology was corrected from Product to Microgreen.
- The unnecessary Featured checkbox was removed from Microgreen Create/Update.
- Microgreen deletion is blocked when referenced by a salable Product; unused Microgreens require confirmation before permanent deletion.
- `/sales-products` remains the Product Master.
- Product deletion is blocked when referenced by Orders; unused Products require confirmation before permanent deletion.
- Subscription Plan deletion is protected when the plan is used by a customer subscription; unused plans require confirmation before permanent deletion.

## Phase 39 — Order-based fulfilment

- Fulfilment is tied to actual customer Orders.
- One-time and subscription fulfilment are distinguished.
- Subscription delivery occurrences use `subscriptionDeliveryId`.
- Harvested batch stock is allocated to demand.
- Partial packing remains pending until the required grams are fully packed.
- Fully packed orders move into the handover-ready lifecycle.
- No Firebase Functions were introduced.

## Phase 38 — Subscription deliveries UAT

- Subscription delivery records represent individual delivery occurrences.
- Delivery lifecycle and handover were kept separate from the parent subscription.
- Duplicate delivery creation is protected.

## Phase 37 — Product image and slug validation

- Salable Product images use 1200 × 1200 square validation.
- PNG/JPG/JPEG are supported.
- Files above 1 MB are rejected.
- Product slugs normalize to lowercase and allow letters, hyphens and underscores.
- Invalid characters are removed while typing/saving.

## Phase 36 — Geolocation Master

- Added Geolocation Master and `/geolocations` CRUD using the existing Firestore architecture.
- Existing Rack/production Locations were kept separate.
- Geolocation fields include location name, pincode, charges and active state.

## Phase 35 — Typecheck fixes

- Fixed identified TypeScript issues in customer contact, subscriptions, address handling and order creation/payment receipt handling.
- No intended business workflow change.

## Phase 34 / Delivery Handover

- Fixed Handover invocation so selected orders immediately enter `out_for_delivery`.
- Delivery assignment and status tracking were retained.
- Today's eligible-order filtering and delivery-user selection remained in place.

## Phase 32 — Packing box requirement analytics

- Added operational box requirement analytics to Packing & Fulfilment.
- Requirement calculations use existing Product component/packaging data.

## Phase 31 — Order box packing requirements

- Added order-driven box/pack requirement calculations for fulfilment.
- Packaging uses active Packaging Master entries.
- Combo Products calculate Microgreen requirements from component percentages.

## Phase 30 — Forecast tray planning

- Forecasting shows tray requirements derived from required grams and expected usable production.
- Existing production/inventory calculations were retained.

## Phase 29 — Forecast order component fix

- Open-order requirements account for salable Product components and combos.
- Legacy order data remains supported.
- Forecasting continues to distinguish current stock from future expected production.

## Phase 28 — Simple production forecast

The operational forecast was simplified to:
- Product/Microgreen
- Growing cycle
- Current stock
- Ongoing batch expected production
- Current requirement from subscriptions/open orders
- Need to grow

Historical-demand/confidence controls were removed from the operational screen.

## Phase 27 — Forecast runtime fix

- Corrected runtime handling in forecasting without changing the underlying gram-based requirement model.

## Phase 25 — Batch-wise stock reconciliation

- Production stock reconciliation was extended to preserve batch-wise stock traceability while retaining aggregate gram inventory.

## Phase 23 — Partial/offline payment history

- Admin order payment history supports partial/offline payment records.
- Validation prevents invalid payment totals.
- Historical payment information remains part of the Order record.

## Phase 21 — Orders UX / one-time Admin orders

- Orders list, filtering, details and Admin-created one-time orders were improved.
- Orders retain Product/price/delivery snapshots.
- Creating an order does not consume inventory.

## Phase 20 — SweetAlert2 / exception handling

- SweetAlert2 became the standard Admin confirmation/alert/prompt mechanism.
- Native browser dialogs were removed from Admin application code.
- Shared alert helpers were introduced.
- Global and route-level error fallbacks were added.

## Phase 19 — Customer Contact Required

- Added Customer Contact Required queue for orders with `requiresCustomerContact === true`.
- Existing Orders collection is reused; no duplicate collection was introduced.
- One-time and subscription orders are supported.

## Phase 14 — Image upload foundation

- Existing Cloudinary implementation was integrated into Admin image fields.
- Local preview is shown before upload.
- Uploaded `secure_url` is stored in form state and persisted through existing save flows.
- No second Cloudinary implementation was introduced.

## Phase 13 / CMS finalization

- Website CMS was completed through the existing CMS collections and Admin UI.
- Save feedback and Admin confirmation UX were standardized.
- Existing CMS behavior was preserved.

## Phase 12 / CMS continuation

- Website CMS modules continued using the existing Firestore-backed Admin architecture.

## Phase 11 / Admin loading and validation UAT

- Salable Product image was made mandatory.
- Inventory and Geolocation save states were corrected so successful writes do not leave the UI stuck in `Saving...`.

## Phase 10 / CMS V2-driven development

- Website CMS continued with the established Admin/CMS data model.

## Phase 9 / CMS foundation

- Established the Website CMS foundation and content-management architecture.

## Phase 8 / Security and runtime foundation

- Admin security and runtime fixes were consolidated.
- Firestore access remains Admin-authenticated.
- Existing production architecture was preserved.

## Phase 7 — Notifications and Reports

- Added Admin notifications and reporting foundations.
- Production/business/customer analytics are read-only and do not mutate operational data.

## Phase 6 / F — Delivery Operations

- Delivery users, assignments, handover and delivery status were introduced.
- Handover transitions packed orders into the delivery lifecycle.
- Delivery does not perform a second inventory deduction.

## Phase 5 / Delivery Operations foundation

- Established the initial delivery workflow and its separation from stock consumption.

## Phase 4 — Customers and Orders

- Customer master and Orders were introduced.
- Orders store historical product/price snapshots.
- Reorders are new orders and use current pricing.

## Phase 3 — AdminLTE foundation

- Established the Next.js/AdminLTE-style Admin UI foundation and application structure.

## Phase 2 — Products and Inventory

- Established production Products and gram-based inventory.
- Harvesting adds usable grams.
- Expected/future production is not treated as current stock.

## Phase A — Growing Batches / Production

- Growing Batches support multiple production Microgreens.
- Production quantities are gram-based.
- Growing cycle and production phases belong to the Microgreen production model.
- Harvest records actual gross, loss and net usable quantities.

## Phase B — Salable Product Master

- Salable Products can be Single or Combo.
- Single references one production Microgreen.
- Combo references multiple production Microgreens.
- Component quantities are stored in grams.
- Customer-facing name/SKU/slug and selling options belong to the salable Product.

## Phase C — Packaging & Fulfilment foundation

- Packing bridges gram-based loose inventory and customer packaging.
- Component consumption is atomic for combos.
- Packaging history and inventory adjustments are retained.

## Phase D — Orders / fulfilment integration

- Order lifecycle and fulfilment were integrated while maintaining the boundary that order creation does not consume inventory.

## Phase E — Subscription & Delivery Charges

- Subscription Plan and Delivery Charge masters were established.
- Customer subscriptions snapshot selected master values so later master edits do not rewrite historical customer transactions.

## Phase F — Delivery Operations

- Delivery users, assignments, handover and delivery status became operational Admin modules.

## Documentation consolidation — Phase 40

The repository previously contained 51 Markdown files consisting of old phase notes, UAT notes, runtime fixes and duplicate historical descriptions. They have now been consolidated into five active documents:

1. `README.md`
2. `CURRENT-STATE.md`
3. `DEVELOPMENT-RULES.md`
4. `DEVELOPMENT-ROADMAP.md`
5. `CHANGELOG.md`

Future small fixes should normally update `CHANGELOG.md` rather than creating another phase-specific Markdown file. Permanent rules belong in `DEVELOPMENT-RULES.md`; current system facts belong in `CURRENT-STATE.md`; future scope belongs in `DEVELOPMENT-ROADMAP.md`.

## Growing Batch Sold Quantity / Auto Close

- Existing Growing Batch creation and production planning are unchanged.
- Sold quantity is recorded against the exact batch microgreen from fulfilment allocations when the related order is handed over.
- The existing batch Planned Quantity (the planned production quantity represented by the batch item's tray plan) is the close target.
- When Sold Quantity reaches the Planned Quantity for every microgreen in the batch, the batch is automatically closed.
- Existing manual Close Batch confirmation remains separate.
- Handover records are protected from double-counting through fulfilment-level sold-quantity recording metadata.
## Growing Batch Listing — Active / Closed Views

- Active batches now show each Microgreen as its own row with Planned, Sold and Harvested quantities.
- Active rows show the current production Stage derived from the existing growing phases.
- Sold quantity includes a progress indicator against the batch item's Planned Quantity.
- Closed batches are separated into a dedicated Closed Batches tab and retain the existing compact batch-level listing.
- Existing View Status / View Details actions remain available for both active and closed batches.

## Inventory Batch Selection / Adjustment Updates

- Adjustment history is filtered to the selected Growing Batch when a batch is selected.
- Batch selector options show the batch status in brackets.
- Batch stock adjustment starts from Actual Usable Quantity minus the batch microgreen's Sold Quantity.
- Batch-stock reconciliation compares the requested remaining batch stock with the current stored batch stock to avoid re-applying previously consumed quantities.
- Microgreen aggregate inventory is currently reduced during Fulfilment Packing. Handover records Sold Quantity against the Growing Batch but does not perform a second aggregate inventory deduction, preventing double reduction.

## Inventory batch sold-quantity adjustment
- Batch stock is now read-only in Inventory batch adjustment.
- Sold Quantity is the editable field.
- Added Update Sold Quantity action without changing batch stock.
- Added Close Batch action in Inventory; closing sets each harvested item's batch stock to its sold quantity and closes the batch.
- Removed the manual Close Batch button from the Growing Batch detail view.
- Existing handover sold-quantity recording remains unchanged.

## Phase 43 — Product Image Dimension Validation
- Removed the fixed 1200 × 1200 px requirement from Sales Product Create/Update image validation.
- Product images must remain square (1:1), PNG/JPG/JPEG, and at or below 1 MB.
- Existing file-size guidance remains: ideal 150–400 KB; up to ~700 KB recommended.
- Smaller square images such as 600 × 600 px are now accepted.

## Seedlings Feedback
- Added `CMS → Seedlings Feedback` as a separate admin menu/page for feedback displayed on the website Journey page.
- Supports Text + optional image, Image, and YouTube Video feedback types.
- Feedback images use the existing Product image validation: square 1:1, PNG/JPG/JPEG, maximum 1 MB, with 150–400 KB ideal guidance.
- YouTube feedback accepts a normal YouTube URL; the admin UI extracts/stores the video ID and uses the YouTube embed URL for preview. Embed/iframe HTML is not accepted.
- Added draft/published status and display order, with edit/delete support.
- Added Firestore access rule for `seedlingsFeedback` and `websiteJourneyContent`.

## Phase 47 — Actual Harvest Can Exceed Expected Yield
- Removed the validation that prevented Actual Harvested quantity from being greater than Expected Yield.
- Expected Yield remains a production reference/planned quantity only.
- Actual Harvested may exceed Expected because microgreen growth can produce more grams than the planned estimate.
- Removed the UI maximum tied to Expected Yield so admins can enter the actual harvested quantity.
- Loss remains calculated only when Actual Harvested is below Expected; when Actual Harvested exceeds Expected, loss is 0.
- No changes to inventory posting, batch lifecycle, or existing harvest transaction logic beyond allowing the actual quantity to exceed the reference quantity.
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

- Fixed waste adjustment history transaction: use the known batch document id instead of `latest.id`, which is not present in Firestore snapshot data.

## Phase 47 — Total Waste Display
- Added readonly **Total Waste (gms)** to Inventory batch reconciliation.
- Waste Adjustment remains the incremental editable value.
- Total Waste is cumulative: previous total + current adjustment.
- Batch close preserves the cumulative Total Waste value.

- Total Waste display now uses explicit `batch_waste`/`isWaste` adjustment history: before the first waste adjustment it shows the initial remaining Stock; after adjustments it shows cumulative waste only. New waste adjustment records set `isWaste: true`.
- Fixed waste-adjustment history query to use the actual growing batch document ID (`batch.id`) instead of `latest.id` from Firestore document data, preventing `where()` from receiving `undefined`.

## Phase 47 bugfix — Waste adjustment reference safety
- Added explicit validation for batch and product references before creating Firestore document references.
- Waste adjustment history no longer attempts to create a reference from an undefined batch item/product ID.
- Optional `growingBatchItemId` is only written when a valid batch item ID exists.

## Waste Reconciliation Transaction Fix
- Fixed Firestore waste reconciliation failure caused by calling `transaction.get()` with an `inventoryAdjustments` query.
- Waste history is now read with `getDocs()` before the transaction; the transaction uses document reads only.
- Product document reads are performed sequentially through the transaction to keep transaction reads explicit and deterministic.


### Batch Close — Automatic Final Waste Reconciliation
- Close Batch now automatically converts all remaining batch Stock for every harvested microgreen into Waste.
- Remaining Stock is set to 0g and cumulative Total Waste is increased accordingly for each batch item.
- Aggregate Product stock is reduced by the automatically created waste quantity.
- A `batch_waste` inventory adjustment is recorded for the final waste deduction.
- The batch is then marked closed.
- Update Reconciliation already records entered Waste incrementally: each update reduces batch Stock and Product stock and creates a `batch_waste` history record.

### 2026-09-27 — Typecheck cleanup
- Removed stray waste-debug references accidentally left in unrelated growing-batch functions.
- Removed an invalid debug payload referencing out-of-scope waste variables from the harvest inventory adjustment path.
- Waste reconciliation debug logging remains scoped only to `updateGrowingBatchSoldQuantity`.
