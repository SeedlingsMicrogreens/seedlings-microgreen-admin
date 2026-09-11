# Seedlings Admin — Phase 8

> **Current business development roadmap:** see `DEVELOPMENT-ROADMAP.md`. This roadmap is authoritative for the current aligned A→H development sequence. Historical phase notes below are retained for context and must not override the roadmap.

Phase 4 is the cumulative project based on the **corrected Phase 3 AdminLTE foundation**.

## Included

- Phase 1: Firebase authentication + Admin authorization
- Phase 2: Products + Inventory
- Phase 3: AdminLTE 4 React/Next.js foundation
- Phase 4: Customers + Orders

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use the Seedlings Firebase DEV project in `.env.local`.

## Firestore collections used

- `userProfiles`
- `products`
- `inventoryAdjustments`
- `customers`
- `orders`

All business collections in this phase are Admin-only in the supplied rules.

## Important

The application uses the existing `customers` collection rather than introducing a duplicate customer collection.

Orders store product name and unit price snapshots so historical orders remain unchanged after product price changes.

A reorder is a new order and must use the current product price. This phase provides the data model needed for that rule; the customer-facing reorder action will be implemented when the mobile order flow is integrated.


## Phase A — Growing Batches

- Growing Batches is a first-class Admin module.
- One growing batch can contain multiple products.
- Product production profiles provide growing cycle, expected yield, expected loss, minimum batch yield and safety stock.
- Inventory is tracked canonically in grams (`stockGrams`).
- Creating a growing batch does not increase inventory.
- Harvesting a batch item with actual yield atomically increases that product's inventory in grams and records an inventory adjustment.
- Batch items can be harvested independently; the batch becomes Partially Harvested until all items are harvested/failed, then Completed.
- Firestore rules include the `growingBatches` collection.
- Forecasting is intentionally not included in Phase A; it will consume this production data in the next phase.


## Locked Product + Production Model

A Product has two separate areas:

1. Selling / Packing Options — customer-facing options such as 100g box, 200g box, 500g box and 1kg box, each with its own price and active flag. These options do not hold stock.
2. Production Settings — growing cycle days, expected yield per tray (g), minimum yield per tray (g), expected loss per tray (g), safety stock (g), and whether the product is available for growing.

Inventory is maintained only in grams. A Growing Batch contains multiple products and the admin enters the number of trays for each product. Expected production is calculated from trays × expected yield per tray, less expected loss. Harvesting records actual grams and adds those grams to product inventory.


### Harvest quantity rule
At harvest, gross harvested grams and actual loss grams are recorded separately. Net usable grams = gross harvested grams - actual loss grams. Only net usable grams are added to product inventory.


### Harvest display
The Growing Batch detail explicitly shows Actual harvested (gross), Actual loss, and Actual usable (net). Actual usable is `Actual harvested - Actual loss` and is the only quantity added to product inventory.


## Phase C — Subscription Management

Subscriptions are based on an existing Product + active Selling/Packing Option. A subscription stores the selected pack weight and price as a historical snapshot, plus quantity per delivery.

Phase 1 frequency options are Weekly, Monthly, Quarterly and Yearly. Monthly = 4 deliveries, Quarterly = 12 deliveries, Yearly = 52 deliveries. Weekly is ongoing.

Delivery day is configurable and defaults to Saturday. Phase 1 does not add delivery slots/zones.

Subscription status supports Active, Paused, Cancelled and Completed. Subscription creation does not directly deduct inventory. Each future occurrence is intended to become a normal Order for fulfilment and inventory processing.


## Phase D — Packing & Fulfilment

- Packing is the bridge between gram inventory and box-based selling.
- Each order gets an idempotent fulfilment record.
- Selling-option pack weights determine grams required.
- Packing deducts the required grams from the product's canonical gram inventory in an atomic transaction.
- Inventory adjustment history records the grams consumed for the order.
- A successfully packed order becomes `ready_for_handover`.
- The existing Delivery screen can then assign it to a delivery user.
- Due active subscription occurrences can be generated into normal orders from the Packing & Fulfilment screen. Generation is idempotent through the subscription delivery counter and deterministic order number.
- Subscription creation itself does not deduct inventory.
- Forecasting from Phase B is retained and now includes active recurring subscription demand.


## Phase E — Production Analytics

Production analytics is read-only. It does not alter batches or inventory.

It reports:
- Total batches and trays
- Expected usable grams
- Actual gross harvested grams
- Actual usable grams
- Actual loss in grams
- Yield achievement versus expected usable yield
- Loss rate
- Average actual yield and usable yield per tray
- Product-level and batch-level views
- 30-day, 90-day, 6-month, 12-month and all-time filters

Actual usable remains the canonical inventory quantity. The report uses the separate gross harvest and actual loss fields recorded during batch harvest.


## Phase F — Business Dashboard & Sales Reporting

Phase F adds a management-level Business Dashboard under Reports.

It combines:
- Sales/order KPIs
- Delivered and open orders
- Average order value
- Active subscriptions and subscription value per delivery
- Current gram inventory
- Low-stock product count
- Growing batches and trays
- Expected usable growing quantity
- Actual production loss
- Top product sales
- Links to Forecasting, Production Analytics and Packing & Fulfilment

Time filters: 30 days, 90 days, 6 months, 12 months and all time.

Phase F is read-only. It does not change orders, subscriptions, inventory or production records.


## Phase G — Customer Growth

Phase G adds read-only customer growth analytics.

It provides:
- Total customers
- Active customers
- New customers
- Repeat customers
- Subscription customers
- Inactive customers
- Repeat purchase rate
- Revenue and average customer value
- Active subscription value per delivery
- Customer-level order/revenue history
- Segment filtering and search
- 30-day, 90-day, 6-month, 12-month and all-time views

Customer segments are derived from existing Admin data:
- New = one order
- Repeat = more than one order
- Subscription = active subscription
- Inactive = no order in the selected period

Phase G does not create marketing campaigns, coupons, messages, loyalty points or customer records. It is intentionally analytics-only.


## Phase H — Notifications & Operational Alerts

Phase H adds operational notifications for the Admin.

Phase 1 channels:
- In-app admin alerts/history
- Email/SMS are represented as future channel types but are not sent by this phase

Current alerts include:
- Low product stock
- Subscription delivery due within 3 days
- Growing batch item due for harvest
- Orders awaiting payment

The existing notification history remains visible and searchable. Notification records can be queued through the notification service for future delivery integrations.

This phase does not add customer marketing campaigns, bulk messaging, WhatsApp, push-provider integration, or automated background scheduling. Those require a later delivery/integration phase.


## Phase I — Subscription & Delivery Masters

Phase I adds the missing configuration/master layer before customer subscriptions and the Order Master.

### Subscription Plan Master
- Monthly
- Quarterly
- Half-Yearly
- Yearly
- Configurable deliveries per term
- Plan price
- Delivery pricing mode: included, per delivery, or free
- Active/inactive
- Edit/delete

Default delivery counts are editable:
- Monthly: 4
- Quarterly: 12
- Half-Yearly: 24
- Yearly: 48

### Delivery Charges Master
- Separate charge records for One-time Orders and Subscriptions
- Fixed charge or free delivery
- Amount per delivery
- Active/inactive
- Edit/delete

The master is configuration. Customer subscriptions and future orders should snapshot the selected plan/charge values so historical transactions do not change when a master is edited later.


## Phase J — Order Master

Phase J upgrades the Admin Orders screen into the operational Order Master.

### Order types
- One-time purchase
- Subscription order
- Subscription orders retain their source subscription and delivery occurrence number.

### Order creation
Admin can create an order on behalf of a customer by selecting:
- Customer
- One-time purchase or an active customer subscription
- Product
- Active selling/packing option (100g/200g/500g/1kg etc.)
- Number of packs
- Configured delivery charge
- Scheduled delivery date
- Notes

The order stores selling-option, plan and delivery-charge snapshots. Inventory remains gram-based; the UI displays the calculated grams required for packing.

### Order Master
The list supports:
- Search
- One-time/subscription filtering
- Status filtering
- Customer/order/subscription search
- Order details
- Pack-level item information
- Subscription occurrence information
- Delivery information
- Payment status
- Status lifecycle updates

### Important boundary
Creating an order does not deduct inventory. Packing & Fulfilment remains responsible for consuming the required gram inventory when the order is packed.


## Phase J Extension — Payment / Transaction Details & Refund

The existing Order Details panel now shows payment/transaction information when available and provides a simple admin refund action only for successfully paid orders.

### Payment details
- Payment status
- Amount paid
- Payment method
- Transaction ID
- Payment date
- Refund amount/date after refund

### Refund
- Visible only when `paymentStatus` is `paid`
- Admin confirms the refund and may enter a reason
- Order is marked `refunded` with refund amount, timestamp and admin identity
- Already refunded orders cannot be refunded again

### Payment gateway boundary
This phase records the refund in the Admin order record. There is currently no payment-gateway SDK/secret configured in this codebase, so this does **not** claim to move money at a payment provider. Actual gateway refund execution should be connected in the Customer/API payment integration when the payment provider is selected.


## Current implementation phase
Phase D — Orders. See `docs/phase-D.md` and `DEVELOPMENT-ROADMAP.md` for the authoritative scope.

## Phase 32 — Packing Box Requirement Analytics
See `README_PHASE32_BOX_REQUIREMENT_ANALYTICS.md` for the direct box requirement analytics view added to Packing & Fulfilment.
