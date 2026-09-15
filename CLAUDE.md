# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run server and client in separate terminals — there is no root-level script that starts both.

```bash
# Backend (from server/)
npm run dev              # nodemon server.js — auto-reloads on file changes, port from .env (PORT)

# Frontend (from client/)
npm run dev               # Vite dev server, http://localhost:5173
npm run build              # production build
npm run lint                # eslint .
npm run preview              # serve the production build locally
```

No automated test suite exists — `server/package.json`'s `test` script is the npm-init placeholder (`echo "Error: no test specified" && exit 1`). The closest thing to test coverage is:

```bash
# From server/, with the dev server already running against a real DB:
node scripts/smokeTest.js [baseUrl] [adminPassword]   # live HTTP smoke test of every route — creates and
                                                          # cleans up its own temp data, checks auth/role
                                                          # gating and a few validation edge cases, exits
                                                          # non-zero on any failure
```

This hits a real running server and a real database — it is not a substitute for unit tests, and there is no way to run "a single test" in the traditional sense (no Jest/Mocha/etc. configured on either side).

To bootstrap the first admin account (required before anything else works, since `/api/auth/register` is itself admin-only):

```bash
# From server/
node scripts/seedAdmin.js <username> <password> [name]   # idempotent — upserts by username
```

### Environment

Both `server/.env` and `client/.env` are required and gitignored; `.env.example` in each directory documents the exact keys:

- `server/.env`: `PORT`, `CLIENT_URL` (used for the CORS allowlist), `MONGO_URI`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `client/.env`: `VITE_API_BASE_URL` (e.g. `http://localhost:5000/api`) — `axiosInstance.js` has no fallback if this is unset

## Architecture

**Stack**: MongoDB (Atlas), accessed via Mongoose ODM — not Postgres, not a raw driver, no SQL anywhere. Express 5 backend, JWT auth (`jsonwebtoken` + `bcryptjs`), Cloudinary for style images (via `multer` + `multer-storage-cloudinary`). React 19 + Vite + Tailwind frontend, React Router 7, axios, recharts, `qrcode` (receipt QR) and `react-qr-barcode-scanner` (camera barcode scan on the POS screen).

### Domain model: Style vs. Variant

The catalog is deliberately two-tiered, and most catalog/inventory/sales code assumes this split:

- **Style** (`server/models/Style.js`) is the browsable "product" — name, brand, category, price, image. It carries nothing that varies by size/color.
- **Variant** (`server/models/Variant.js`) is the actual sellable unit — one size/color combination, with its own SKU, barcode, stock count, optional `priceOverride`, and `reorderThreshold`. Sales, stock, and barcode scanning all operate on Variants, never Styles directly.

`GET /api/styles` returns each style with its variants embedded (fetched separately, then joined in JS in `styleController.getAllStyles`) rather than via a Mongoose `populate`, since the boutique catalog is small enough that this keeps the POS screen to one request.

### Sale line items are denormalized on purpose

`Sale.items[]` (in `server/models/Sale.js`) copies `styleName`, `size`, `color`, and `unitPrice` onto each line at checkout time instead of only storing a `Variant` ref. This is intentional: a style can be edited or deleted later without corrupting historical receipts/reports. Any new code that reads sale history should read these denormalized fields, not re-derive them by populating and re-joining against current catalog state.

### Returns/refunds

`Sale.items[].returnedQuantity` and `Sale.refundedAmount` track returns. `POST /api/sales/:id/return` (`salesController.returnSale`) validates the requested return quantity against what's still eligible per line (`quantity - returnedQuantity`), restocks the variant, computes the refund using the same per-item-discount × cart-discount formula used at sale time, and transitions `Sale.status` through `completed → partially_returned → returned`. This is not wrapped in a Mongoose transaction — see Known Issues below.

### Auth: two admin-gating patterns coexist

`protect` (verifies JWT, sets `req.user`) is universal and lives in `server/middleware/authMiddleware.js`, which also exports `adminOnly`. A separate `server/middleware/roleMiddleware.js` exports `checkRole('admin')`, which does the identical check. Routes use one or the other inconsistently — e.g. `auth.js`/`admin.js`/`users.js` use `authMiddleware.adminOnly`, while `customers.js`/`styles.js`/`variants.js`/`inventory.js` use `roleMiddleware.checkRole('admin')`. When adding a new admin-only route, match whichever pattern the surrounding file already uses; don't introduce a third variant.

### Route → Controller shape (no DB-access layer)

`server/routes/*.js` wires an Express router straight to functions in `server/controllers/*.js`; controllers call Mongoose models directly — there is no repository/DB-access layer in between. New features follow this same shape: add/extend a model, write controller functions that do the Mongoose work and shape the HTTP response, add a route file, mount it in `server.js`.

### Dashboard aggregation

`server/routes/dashboard.js` builds its entire response inline with several parallel Mongoose aggregation pipelines (no separate service/query-builder file). A shared `NET_AMOUNT` expression (`totalAmount - ifNull(refundedAmount, 0)`) is used everywhere revenue is summed, and the best-sellers pipeline nets out `returnedQuantity` — any new revenue or units-sold stat added here must do the same or it will silently double-count returned sales.

### Client structure

All routes are declared flat in `client/src/App.jsx`; admin-only pages nest under `/admin` via `AdminLayout` + `Sidebar` (`client/src/components/layout/`). `client/src/components/auth/ProtectedRoute.jsx` gates both "must be logged in" (`/pos`) and "must be admin" (`/admin/*`) routes by reading `AuthContext`. `client/src/api/axiosInstance.js` attaches the JWT from `localStorage` to every outgoing request via an interceptor. Business identity (name, currency, logo, receipt footer) is centralized in `client/src/config/businessSettings.js` — new UI should read from there rather than hardcoding boutique-specific strings.

## Known issues / next steps (verified against the current code, not speculative)

- **No transactions around stock+money writes.** `createSale`, `returnSale`, and `restockVariant` each perform multiple independent writes (e.g. decrement stock, then save the sale/log) with no Mongoose session/transaction wrapping them. A crash mid-operation can leave stock out of sync with the sale/log record. Add transactions before building further money-handling features (store credit, gift cards, till reconciliation, etc.).
- **Two admin-gating middlewares, used inconsistently** (see above) — worth consolidating to one when next touching auth-related routes.
- **`Style.costPrice` is a dead column** — stored and returned by the API but never read by any report or margin calculation.
- **Audit logging is one-sided.** `POST /api/audit` exists, is authenticated, and is smoke-tested, but nothing in the client calls it, and there is no `GET /api/audit` to read entries back. Treat it as unbuilt until both a trigger point and a read path exist.
- **Unused frontend dependencies** — `i18next`, `react-i18next`, `idb`, `dompurify`, and `lodash` are in `client/package.json` with zero imports anywhere in `client/src`. Either start using them or remove them.
