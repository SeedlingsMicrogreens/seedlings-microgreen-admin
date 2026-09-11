# Phase 20 — SweetAlert2 + Exception Handling

Implemented across the Admin application:

- Added SweetAlert2 as the standard alert/confirm/prompt UI.
- Removed native `alert()`, `confirm()`, and `prompt()` usage.
- Added shared helpers in `lib/alerts.ts` for success, error, warning, confirmation, prompt and toast flows.
- Replaced destructive-action confirmations with SweetAlert2 dialogs.
- Replaced the order refund browser prompt with a SweetAlert2 input dialog.
- Added global unhandled promise rejection and browser error handling.
- Added Next.js route-level `app/error.tsx` and root `app/global-error.tsx` fallbacks.
- Existing try/catch business-operation handling remains in place; mutation paths now surface failures through the shared alert system where native dialogs existed.
- Firestore writes continue to sanitize undefined values before writes.

## Install

Run `npm install` after extracting the ZIP so SweetAlert2 is installed and the lockfile is refreshed by npm for the current environment.

## Verification

- No native `alert()`, `confirm()`, or `prompt()` calls remain under `app/`, `components/`, or `lib/`.
- `git diff --check` passes.
