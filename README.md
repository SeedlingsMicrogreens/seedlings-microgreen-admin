# Seedlings Microgreens — Admin Portal

## Current source
**Admin Phase 40** is the current source baseline. The supplied Phase 40 repository/ZIP is the source of truth for future Admin work.

## What to read before changing the application
1. **CURRENT-STATE.md** — what the system currently is and how the modules/data relate.
2. **DEVELOPMENT-RULES.md** — permanent rules and non-regression constraints.
3. **DEVELOPMENT-ROADMAP.md** — planned/current development direction.
4. **CHANGELOG.md** — important historical decisions and completed changes.

Do not use old phase documents as competing sources of truth. Historical phase material has been consolidated into `CHANGELOG.md`; the actual source code and current state documents take precedence.

## Technology
- Next.js 16
- React 19
- TypeScript
- Firebase Authentication
- Firebase Firestore
- Next.js application/API and `lib/*.ts` service modules
- Existing Bootstrap/AdminLTE-style UI and application components
- Firebase Functions are **not used**

## Run locally
```bash
npm install
cp .env.example .env.local
npm run dev
```

Other useful commands:
```bash
npm run build
npm run start
npm run typecheck
```

## Core navigation terminology
- `/products` = **Microgreen Master** (production/growing master)
- `/sales-products` = **Product Master** (salable customer-facing product)
- Packaging = available customer package sizes
- Selling Option = Product-specific packaging + selling price

**Do not confuse Microgreen and Product.** See `DEVELOPMENT-RULES.md`.

## Important source-control note
The Phase 40 handover identified uncommitted changes in several operational files. Review the working tree before resetting, rebasing, or discarding changes.
