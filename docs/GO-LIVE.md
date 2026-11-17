# Go-live checklist

Work through this top to bottom before the first real customer. Items marked **must** block launch.

## 1. Environments

Run two completely separate environments, **staging** and **production**. Each gets its own:

- MongoDB database (a separate Atlas cluster is best, a separate database at minimum)
- `JWT_SECRET`, `MPESA_CALLBACK_TOKEN`, and every other credential
- Safaricom app: sandbox for staging, production for production
- KRA eTIMS: sandbox/test control unit for staging, the real one for production

Never point staging at the production database.

The server checks its configuration at startup (`server/config/validateEnv.js`). With `NODE_ENV=production` it **refuses to start** on a weak `JWT_SECRET`, a missing callback token, an `http://` callback URL, and similar problems. It also logs warnings for any integration still in mock mode. `GET /health` reports the active modes (`modes.mpesa`, `modes.etims`, `modes.sms`), so you can confirm production isn't still simulating payments.

**must:**
- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` set to a 48+ byte random value: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- [ ] `CLIENT_URL` set to the real POS address (it's the CORS allowlist)
- [ ] `TRUST_PROXY=1` when running behind a host's proxy (Railway, Render, Nginx). Without it, every customer shares one rate limit.
- [ ] HTTPS on both the API and the web app
- [ ] Change the admin password. An old default (`WanguNiW@ngu`) is in git history, so it's no longer secret. If it was ever used for a real account, change it everywhere.

## 2. M-Pesa (Daraja)

- [ ] **must** `MPESA_MODE=production`, with production consumer key/secret, shortcode and passkey
- [ ] **must** `MPESA_CALLBACK_URL=https://<api>/api/payments/mpesa/callback`. The server adds `/<MPESA_CALLBACK_TOKEN>` itself; don't add it to the URL.
- [ ] **must** `MPESA_CALLBACK_TOKEN` set to a 32+ character random value, different from staging's
- [ ] Reversals (automatic refunds when a sale fails after the customer has paid): set `MPESA_INITIATOR_NAME`, `MPESA_SECURITY_CREDENTIAL` and `MPESA_REVERSAL_RESULT_URL=https://<api>/api/payments/mpesa/reversal-result`. Without them, refunds land on **Admin → M-Pesa Refunds** for manual handling.
- [ ] Check the STK Query (`confirmStkPayment`) and Reversal (`reverseTransaction`) payloads in `server/services/mpesa.js` against Safaricom's current Daraja docs
- [ ] Do one real KES 1 payment end to end, plus one forced failure (a sale that can't complete), and confirm the refund appears

## 3. KRA eTIMS

`ETIMS_MODE=live` posts each sale to your OSCU/VSCU endpoint. **The payload mapping in `server/services/etims.js` was written from KRA's published OSCU contract and has only been tested against a fake KRA server in `tests/etimsLive.test.js`.** Verify it against KRA's current spec in their sandbox before going live.

- [ ] **must** Complete OSCU/VSCU registration and get your TIN, branch ID and communication key (`ETIMS_TIN`, `ETIMS_BRANCH_ID`, `ETIMS_CMC_KEY`, `ETIMS_BASE_URL`)
- [ ] **must** Confirm in KRA's sandbox:
  - the endpoint path (`/trnsSales/saveSales`)
  - the header names (`tin`, `bhfId`, `cmcKey`)
  - the field names and codes in `buildSalesPayload()`
  - the success response (`resultCd: "000"`) in `parseSalesResponse()`
- [ ] Confirm your VAT band and rate (`ETIMS_DEFAULT_TAX_TYPE`, `ETIMS_DEFAULT_TAX_RATE`) and the item classification code (`ETIMS_DEFAULT_ITEM_CLASS`) with your accountant
- [ ] **Known gap:** returns and voids are not yet sent to KRA as credit notes (`rcptTyCd: 'R'`). Ask your accountant how to handle refunds until this is built.
- Invoice numbers come from a per-branch counter (`counters` collection). Each sale keeps its number across retries, so a lost response never turns one sale into two invoices.
- An outage is retried automatically every 5 minutes. A rejection (bad data) is parked on **Admin → eTIMS Retry** for a person to look at.

## 4. SMS (Africa's Talking)

- [ ] `SMS_MODE=live`, `AT_USERNAME`, `AT_API_KEY`. Test first with `AT_USERNAME=sandbox` and the AT simulator.
- [ ] Register a sender ID (`AT_SENDER_ID`) so messages show your name instead of a short code
- [ ] `BUSINESS_NAME`, which is used in receipts and codes
- [ ] `OWNER_SUMMARY_PHONES` for the Monday-morning weekly summary
- Without SMS, the public balance check can't verify store credit. Gift-card balance checks still work.

## 5. Staff and controls

- [ ] Every admin sets an approval PIN (**Users → My approval PIN**). Without one, nobody can approve a cashier's discount over the limit.
- [ ] Choose the discount limit (`DISCOUNT_APPROVAL_THRESHOLD`, default 20%)
- [ ] Each staff member gets their own login. No shared accounts; the Exceptions report depends on it.
- [ ] Walk through the **Exceptions** page with the owner so they know what to look for

## 6. Backups (must)

Use two layers:

1. **Your database host's backups.** On MongoDB Atlas, turn on Cloud Backup / continuous backup (paid tiers) for point-in-time restore.
2. **Your own copy, off-platform.** Run `node scripts/backup.js` from `server/` once a day:
   - It writes gzipped EJSON to `server/backups/` (or `BACKUP_DIR`) and keeps the newest `BACKUP_KEEP` (default 14).
   - Schedule it with cron, Windows Task Scheduler or your host's cron feature.
   - Sync the folder somewhere else: cloud storage, or another machine.

   ```bash
   # Linux cron, daily at 02:30
   30 2 * * * cd /srv/wanguvibe/server && node scripts/backup.js >> backup.log 2>&1
   ```

**Restore drill.** Do this before launch, then every quarter. A backup you've never restored is a hope, not a backup.

```bash
node scripts/restore.js server/backups/backup-<db>-<timestamp> --uri "<STAGING or scratch URI>" --db restore_drill --yes
```

The restore checks every collection's document count against the backup's manifest. It also refuses to write into a non-empty database unless you pass `--drop`. Log in to staging against the restored data and spot-check yesterday's sales.

## 7. Monitoring

- [ ] Point an uptime monitor (UptimeRobot, Better Uptime, etc.) at `GET /health`. It returns 503 if the database connection drops.
- [ ] Set `SENTRY_DSN`, and set up a Sentry alert rule for new issues
- [ ] Enable push notifications for at least one admin device. Shift shortfalls, low stock, eTIMS backlog, M-Pesa refunds and the weekly summary all go there.

## 8. Final checks

- [ ] CI is green (unit tests, client lint and build, live smoke test)
- [ ] Run a full day on staging with real staff: open shift, sales by every payment method, a return, a void, an approved discount, an offline sale, close shift
- [ ] `node scripts/smokeTest.js https://<staging-api> <adminPassword>` passes against staging
