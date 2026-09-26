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
