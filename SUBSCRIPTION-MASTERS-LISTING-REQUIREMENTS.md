# Subscription Masters — Listing Columns

**Status: Implemented**

## Goal and scope

The Subscription Plans listing at `/subscription-masters` shows the agreed
columns and concise Selling Options details. Plan creation/editing and all plan,
subscription, delivery, pricing, and status behavior remain unchanged.

## Required columns

Display exactly these columns in this order:

1. Product
2. Plan
3. Frequency
4. Deliveries
5. Skips Allowed
6. Selling Options
7. Status
8. Actions

## Selling Options

- Use the plan's existing selling-option data.
- Display each configured option as its weight followed by its price, for
  example `100g - ₹500.00` and `200g - ₹1,000.00`.
- Use the existing currency-formatting behavior.

## Explicit exclusions

- Do not display maximum quantity or any maximum-related information in the
  listing.
- Do not change the Subscription Masters create/edit form, selling-option
  configuration, or stored data.
- Do not change delivery counts, frequency rules, pricing calculations, status
  behavior, or existing actions.
- Do not modify other pages or unrelated functionality.
