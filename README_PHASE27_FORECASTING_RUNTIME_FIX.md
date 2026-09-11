# Phase 27 — Forecasting Runtime Error Fix

## Fix
- Hardened forecasting date parsing to safely support Firestore Timestamp values via either `toDate()` or `toMillis()`.
- Forecast calculation is now guarded so an unexpected calculation/data-shape error does not crash the Forecasting page.
- The page displays a normal error message and logs the calculation error to the browser console.
- Existing `gms` display-unit change from Phase 26 is retained.

## Important
- No database schema or stored numeric values were changed.
- The underlying weight fields remain in grams; only display labels use `gms`.
- If the local Next.js dev server still shows an old runtime error after replacing the project, stop it, delete `.next`, and start `npm run dev` again so the old development bundle is not reused.
