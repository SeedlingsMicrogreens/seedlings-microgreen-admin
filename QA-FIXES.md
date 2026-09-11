# QA fixes — 4 root issues

This package fixes the four root issues identified in the 3 Sep 2026 Admin QA report.

1. Firestore undefined-field failures (Orders + Salable Products): all shared CRUD writes now recursively remove `undefined` values before Firestore writes. Orders therefore omit an absent delivery address, and optional Salable Product fields are safely omitted.
2. CMS persistence: Our Journey uses a deterministic merge write for existing content; Navigation uses controlled form state; Site Settings uses the shared merge-write helper with visible error handling.
3. Delivery Users: Add Delivery User now has an explicit create mode instead of relying on the edit selection state.
4. Audit Log: shared CRUD writes create audit events; transaction-based stock, harvest, order, delivery and packaging operations also create audit events. Audit failures never invalidate a successful business write.

The package intentionally does not include production Firebase environment values. Keep the existing GitHub repository/package-lock and run `npm install` only if package.json changed or the lock is missing.

## QA report fixes — September 2026
- Salable Product optional fields are sanitized before Firestore writes; blank description/image no longer send `undefined`.
- Admin Create Order now validates that the selected customer has a saved delivery address and returns a clear validation message instead of attempting an invalid Firestore write.
- Customer and Order Details use shared address formatting and never display internal address document IDs.
- Customer Growth metric label now says "Purchasing customers" to match its order-in-period calculation.
- Added the AdminLTE default avatar asset at `public/assets/img/user2-160x160.jpg` to prevent the template asset 404.
