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

Server tests are Jest (`server/tests/`, run with `npm test` from `server/`) against a real single-node MongoDB replica set started by `mongodb-memory-server` (transactions need a replica set). Controllers are tested by calling them directly with mock `req`/`res`. Run one file with `npx jest tests/<file>.test.js`. If the C: drive is short on space, point `TEMP`/`TMP` at another drive, since mongod writes its journal there.

```bash
# From server/, with a server already running against a real (throwaway) DB:
node scripts/smokeTest.js [baseUrl] <adminPassword>   # live HTTP test of every route; or set SMOKE_ADMIN_PASSWORD
```

CI (`.github/workflows/ci.yml`) runs the Jest suite, client lint plus a production build, and the live smoke test.

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

`Sale.items[].returnedQuantity` and `Sale.refundedAmount` track returns. `POST /api/sales/:id/return` (`salesController.returnSale`) validates the requested return quantity against what's still eligible per line (`quantity - returnedQuantity`), restocks the variant, computes the refund using the same per-item-discount × cart-discount formula used at sale time, and transitions `Sale.status` through `completed → partially_returned → returned`. It runs in a Mongoose transaction. Sales are never hard-deleted: `POST /api/sales/:id/void` (admin) restocks the items and reverses every payment line, keeping the record with `status: 'voided'`.

### Auth: two admin-gating patterns coexist

`protect` (verifies JWT, sets `req.user`) is universal and lives in `server/middleware/authMiddleware.js`, which also exports `adminOnly`. A separate `server/middleware/roleMiddleware.js` exports `checkRole('admin')`, which does the identical check. Routes use one or the other inconsistently — e.g. `auth.js`/`admin.js`/`users.js` use `authMiddleware.adminOnly`, while `customers.js`/`styles.js`/`variants.js`/`inventory.js` use `roleMiddleware.checkRole('admin')`. When adding a new admin-only route, match whichever pattern the surrounding file already uses; don't introduce a third variant.

### Route → Controller shape (no DB-access layer)

`server/routes/*.js` wires an Express router straight to functions in `server/controllers/*.js`; controllers call Mongoose models directly — there is no repository/DB-access layer in between. New features follow this same shape: add/extend a model, write controller functions that do the Mongoose work and shape the HTTP response, add a route file, mount it in `server.js`.

### Dashboard aggregation

`server/routes/dashboard.js` builds its entire response inline with several parallel Mongoose aggregation pipelines (no separate service/query-builder file). A shared `NET_AMOUNT` expression (`totalAmount - ifNull(refundedAmount, 0)`) is used everywhere revenue is summed, and the best-sellers pipeline nets out `returnedQuantity` — any new revenue or units-sold stat added here must do the same or it will silently double-count returned sales.

### Client structure

All routes are declared flat in `client/src/App.jsx`; admin-only pages nest under `/admin` via `AdminLayout` + `Sidebar` (`client/src/components/layout/`). `client/src/components/auth/ProtectedRoute.jsx` gates both "must be logged in" (`/pos`) and "must be admin" (`/admin/*`) routes by reading `AuthContext`. `client/src/api/axiosInstance.js` attaches the JWT from `localStorage` to every outgoing request via an interceptor. Business identity (name, currency, logo, receipt footer) is centralized in `client/src/config/businessSettings.js` — new UI should read from there rather than hardcoding boutique-specific strings.

## Money-handling invariants (don't regress these)

- **Cart pricing** goes through `utils/saleValidation.js` (`normalizeLineItems`, `assertTotalMatches`): quantities are positive integers, discounts are finite numbers 0–100, and the server-computed total must be finite. NaN once silently passed the total check.
- **Discount approval:** an effective discount over `DISCOUNT_APPROVAL_THRESHOLD` (default 20%) needs an admin's approval PIN (`utils/approval.js`). The server answers `403 { code: 'APPROVAL_REQUIRED' }`, and the client's axios interceptor shows `<ApprovalPrompt />` and retries the request. `cashierRole` and `approvedBy` are trusted server context; never take them from a request body.
- **M-Pesa callback** (`/api/payments/mpesa/callback/:token`):
  - The secret path token must match. The pending row is claimed atomically, and the paid amount and receipt (unique) are checked.
  - Outside mock mode, an STK Query must also confirm the payment.
  - A payment taken without a resulting sale goes to `refund_required` and an automatic reversal is attempted. Admins see these on the M-Pesa Refunds page.
- **Idempotency:** the POS sends a `clientSaleId` with every checkout, so a retried or offline-replayed sale returns the original instead of duplicating it.
- **Integrations** (`services/mpesa.js`, `services/etims.js`, `services/sms.js`) each have a `mock` mode. The eTIMS and SMS adapters read their mode on every call. `config/validateEnv.js` refuses unsafe production config at startup.
- **Route gating:** catalog, stock, purchase-order, supplier, return and void writes are admin-only. `tests/securityRegressions.test.js` checks each guard.

## Known gaps

- Returns and voids are not yet sent to KRA eTIMS as credit notes. The live eTIMS payload mapping must be verified against KRA's current spec (see `docs/GO-LIVE.md`).
- Scheduled jobs are in-process `setInterval`s. The weekly summary is deduplicated in the database (`JobState`), but the eTIMS and low-stock sweeps assume a single server instance.
- **Two admin-gating middlewares** (`adminOnly` and `checkRole('admin')`) do the same check. Match whichever the surrounding file uses.
- **Unused frontend dependencies:** `dompurify` and `lodash`.
