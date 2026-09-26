# Seedlings Admin — Consolidated Changelog

This file replaces the previous collection of phase-specific Markdown notes. It keeps the useful historical context without maintaining dozens of competing documentation files.

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
