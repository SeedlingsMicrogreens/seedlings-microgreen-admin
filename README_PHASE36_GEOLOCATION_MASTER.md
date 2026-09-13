# Phase 36 — Geolocation Master

## Changes
- Added a dedicated **Geolocation Master** menu item under **Settings & Administration**.
- Added `/geolocations` CRUD screen backed by the existing Firestore `geolocations` collection.
- Preserved the existing `Locations` master used by production/growing-batch operations; it is not replaced by Geolocation Master.
- Geolocation fields match the existing Firestore structure shown in the provided database screenshot, with the requested additional `locationName` field:
  - `locationName`
  - `pincode`
  - `oneTimeCharge`
  - `subscriptionCharge`
  - `active`
  - `createdAt` (created automatically)
  - `updatedAt` (updated automatically)
- Add, edit and delete operations use the existing Firestore helpers and audit behavior.
