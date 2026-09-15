// Live smoke test for every API route. Hits the real running server (not a
// mock), exercises auth, CRUD, role gating, and cleans up everything it
// creates. Run with the dev server already up:
//   node scripts/smokeTest.js [baseUrl]
// Exits non-zero if anything unexpected happened.

const BASE = process.argv[2] || 'http://localhost:5000';
const API = `${BASE}/api`;

const results = [];
let passCount = 0;
let failCount = 0;

async function hit(label, method, path, { token, json, form, expect = [200, 201] } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let body;
    if (form) {
        body = form;
    } else if (json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(json);
    }

    const start = Date.now();
    let status = 'ERR';
    let data = null;
    let error = null;
    try {
        const res = await fetch(`${API}${path}`, { method, headers, body });
        status = res.status;
        try { data = await res.json(); } catch { /* no body */ }
    } catch (err) {
        error = err.message;
    }
    const ms = Date.now() - start;
    const ok = expect.includes(status);
    results.push({ label, method, path, status, ok, ms, error });
    if (ok) passCount++; else failCount++;
    return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Like `hit`, but also sends a Cookie header when given one and returns the
// Set-Cookie header from the response — needed to exercise the httpOnly
// refresh-token cookie flow, which `hit` (used for every other route) has no
// reason to know about.
async function hitWithCookie(label, method, path, { json, cookie, expect = [200, 201] } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    let body;
    if (json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(json);
    }
    const start = Date.now();
    let status = 'ERR';
    let data = null;
    let setCookie = null;
    let error = null;
    try {
        const res = await fetch(`${API}${path}`, { method, headers, body });
        status = res.status;
        setCookie = res.headers.get('set-cookie');
        try { data = await res.json(); } catch { /* no body */ }
    } catch (err) {
        error = err.message;
    }
    const ms = Date.now() - start;
    const ok = expect.includes(status);
    results.push({ label, method, path, status, ok, ms, error });
    if (ok) passCount++; else failCount++;
    return { data, cookie: setCookie ? setCookie.split(';')[0] : null };
}

// Polls GET /payments/mpesa/:id/status until it leaves 'pending' or attempts run out.
async function waitForMpesaStatus(pendingId, token, { attempts = 12, intervalMs = 500 } = {}) {
    for (let i = 0; i < attempts; i++) {
        const res = await fetch(`${API}/payments/mpesa/${pendingId}/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);
        if (data?.status && data.status !== 'pending') return data;
        await sleep(intervalMs);
    }
    return null;
}

async function main() {
    // ── Root ────────────────────────────────────────────────────────────
    {
        const start = Date.now();
        const res = await fetch(`${BASE}/`);
        const ok = res.status === 200;
        results.push({ label: 'API root', method: 'GET', path: '/', status: res.status, ok, ms: Date.now() - start });
        ok ? passCount++ : failCount++;
    }

    // ── Auth ────────────────────────────────────────────────────────────
    await hit('Login — wrong password', 'POST', '/auth/login', { json: { username: 'admin', password: 'wrong-password' }, expect: [400] });
    await hit('Login — NoSQL-operator payload rejected', 'POST', '/auth/login', { json: { username: { $gt: '' }, password: { $gt: '' } }, expect: [400] });

    const loginRes = await hit('Login — admin', 'POST', '/auth/login', { json: { username: 'admin', password: process.argv[3] || 'WanguNiW@ngu' } });
    const adminToken = loginRes?.token;
    if (!adminToken) {
        console.error('FATAL: could not log in as admin — aborting remaining tests. Pass the admin password as the 2nd script arg if it differs.');
        printSummary();
        process.exit(1);
    }

    // ── Refresh-token flow (httpOnly cookie, rotate-on-use, revoke-on-reuse) ──
    {
        const login = await hitWithCookie('Login (cookie capture) — admin', 'POST', '/auth/login', {
            json: { username: 'admin', password: process.argv[3] || 'WanguNiW@ngu' },
        });
        if (login.cookie) {
            const refreshed = await hitWithCookie('Refresh — valid cookie issues a new access token', 'POST', '/auth/refresh', { cookie: login.cookie });
            if (refreshed.data?.token && refreshed.cookie) {
                await hitWithCookie('Refresh — reuse of the rotated-out cookie is rejected', 'POST', '/auth/refresh', { cookie: login.cookie, expect: [401] });
                await hitWithCookie('Logout — revokes the current refresh cookie', 'POST', '/auth/logout', { cookie: refreshed.cookie });
                await hitWithCookie('Refresh — rejected after logout', 'POST', '/auth/refresh', { cookie: refreshed.cookie, expect: [401] });
            } else {
                results.push({ label: 'Refresh — valid cookie issues a new access token', method: 'POST', path: '/auth/refresh', status: 'SKIPPED (no token/cookie in response)', ok: false, ms: 0 });
                failCount++;
            }
        } else {
            results.push({ label: 'Login (cookie capture) — admin', method: 'POST', path: '/auth/login', status: 'SKIPPED (no Set-Cookie header)', ok: false, ms: 0 });
            failCount++;
        }
        await hitWithCookie('Refresh — no cookie at all is rejected', 'POST', '/auth/refresh', { expect: [401] });
    }

    // ── Unauthenticated access should be rejected ──────────────────────
    await hit('Dashboard — no token rejected', 'GET', '/dashboard/summary', { expect: [401] });
    await hit('Sales — no token rejected', 'GET', '/sales', { expect: [401] });
    await hit('Styles — no token rejected', 'GET', '/styles', { expect: [401] });

    // ── Dashboard ───────────────────────────────────────────────────────
    await hit('Dashboard summary (day)', 'GET', '/dashboard/summary?range=day', { token: adminToken });
    await hit('Dashboard summary (week)', 'GET', '/dashboard/summary?range=week', { token: adminToken });
    await hit('Dashboard summary (month)', 'GET', '/dashboard/summary?range=month', { token: adminToken });

    // ── Users / admin ───────────────────────────────────────────────────
    await hit('List users', 'GET', '/users', { token: adminToken });
    const cashier = await hit('Register cashier (temp)', 'POST', '/auth/register', {
        token: adminToken,
        json: { name: 'Smoke Test Cashier', username: `smoketest_cashier_${Date.now()}`, password: 'password123', role: 'cashier' },
        expect: [201],
    });
    const usersAfterCreate = await hit('List users (find temp cashier)', 'GET', '/users', { token: adminToken });
    const cashierUser = usersAfterCreate?.find(u => u.name === 'Smoke Test Cashier');

    let cashierToken = null;
    if (cashierUser) {
        const cashierLogin = await hit('Login as temp cashier', 'POST', '/auth/login', { json: { username: usersAfterCreate.find(u => u._id === cashierUser._id)?.username, password: 'password123' } });
        cashierToken = cashierLogin?.token;
    }
    // Role gating: cashier must NOT be able to hit an admin-only endpoint
    if (cashierToken) {
        await hit('Role gate — cashier blocked from /admin/create-user', 'POST', '/admin/create-user', {
            token: cashierToken,
            json: { name: 'x', username: `blocked_${Date.now()}`, password: 'password123', role: 'cashier' },
            expect: [403],
        });
    }
    if (cashierUser) {
        await hit('Update user', 'PUT', `/users/${cashierUser._id}`, { token: adminToken, json: { name: 'Smoke Test Cashier Updated' } });
        await hit('Delete temp cashier', 'DELETE', `/users/${cashierUser._id}`, { token: adminToken });
    }

    // /admin/create-user (separate admin-only user-creation path)
    const adminCreated = await hit('Admin create-user (temp)', 'POST', '/admin/create-user', {
        token: adminToken,
        json: { name: 'Smoke Test Temp2', username: `smoketest_temp2_${Date.now()}`, password: 'password123', role: 'cashier' },
        expect: [201],
    });
    if (adminCreated) {
        const list = await hit('List users (find temp2)', 'GET', '/users', { token: adminToken });
        const temp2 = list?.find(u => u.name === 'Smoke Test Temp2');
        if (temp2) await hit('Delete temp2 user', 'DELETE', `/users/${temp2._id}`, { token: adminToken });
    }

    // ── Customers ───────────────────────────────────────────────────────
    await hit('List customers', 'GET', '/customers', { token: adminToken });
    const customer = await hit('Create customer (temp)', 'POST', '/customers', {
        token: adminToken,
        json: { name: 'Smoke Test Customer', phone: `07${Date.now()}`.slice(0, 12) },
        expect: [201],
    });
    if (customer?._id) {
        await hit('Get customer by id', 'GET', `/customers/${customer._id}`, { token: adminToken });
        await hit('Update customer', 'PUT', `/customers/${customer._id}`, { token: adminToken, json: { name: 'Smoke Test Customer Updated' } });
        await hit('Delete customer', 'DELETE', `/customers/${customer._id}`, { token: adminToken });
    }

    // ── Styles / Variants / Sales / Inventory (interconnected — one shared fixture) ──
    await hit('List styles', 'GET', '/styles', { token: adminToken });

    const styleForm = new FormData();
    styleForm.append('name', 'Smoke Test Style');
    styleForm.append('basePrice', '1000');
    styleForm.append('variants', JSON.stringify([{ size: 'M', color: 'Blue', sku: `SMOKE-${Date.now()}`, stock: 10, reorderThreshold: 3 }]));
    const style = await hit('Create style + variant (temp)', 'POST', '/styles', { token: adminToken, form: styleForm, expect: [201] });
    const variant = style?.variants?.[0];

    if (style?._id) {
        await hit('Get style by id', 'GET', `/styles/${style._id}`, { token: adminToken });
        const updateForm = new FormData();
        updateForm.append('description', 'updated by smoke test');
        await hit('Update style', 'PUT', `/styles/${style._id}`, { token: adminToken, form: updateForm });
        await hit('List variants for style', 'GET', `/styles/${style._id}/variants`, { token: adminToken });
    }

    let sale = null;
    if (variant?._id) {
        await hit('Low stock variants', 'GET', '/variants/low-stock', { token: adminToken });
        await hit('Barcode lookup (expect 404, none set)', 'GET', `/variants/lookup?barcode=NONEXISTENT-${Date.now()}`, { token: adminToken, expect: [404] });
        await hit('Update variant', 'PUT', `/variants/${variant._id}`, { token: adminToken, json: { reorderThreshold: 4 } });

        // Sales
        sale = await hit('Create sale', 'POST', '/sales', {
            token: adminToken,
            json: { items: [{ variant: variant._id, quantity: 2, discount: 0 }], totalAmount: 2000, paymentMethod: 'cash' },
            expect: [201],
        });
        await hit('List sales', 'GET', '/sales', { token: adminToken });
        await hit('Sales report', 'GET', '/sales/report', { token: adminToken });
        if (sale?._id) {
            await hit('Get sale by id', 'GET', `/sales/${sale._id}`, { token: adminToken });
            await hit('Return rejected — missing destination', 'POST', `/sales/${sale._id}/return`, {
                token: adminToken,
                json: { items: [{ variant: variant._id, quantity: 1 }] },
                expect: [400],
            });
            await hit('Return rejected — invalid destination', 'POST', `/sales/${sale._id}/return`, {
                token: adminToken,
                json: { items: [{ variant: variant._id, quantity: 1 }], destination: 'bitcoin' },
                expect: [400],
            });
            const returnRes = await hit('Process partial return (destination=cash)', 'POST', `/sales/${sale._id}/return`, {
                token: adminToken,
                json: { items: [{ variant: variant._id, quantity: 1 }], destination: 'cash' },
            });
            const returnedOk = returnRes?.sale?.status === 'partially_returned'
                && returnRes.sale.returns?.length === 1
                && returnRes.sale.returns[0].destination === 'cash';
            results.push({ label: 'Return status=partially_returned + returns[0].destination round-trips', method: '-', path: '-', status: returnedOk ? 'ok' : JSON.stringify(returnRes?.sale?.returns), ok: returnedOk, ms: 0 });
            returnedOk ? passCount++ : failCount++;

            await hit('Over-return rejected', 'POST', `/sales/${sale._id}/return`, {
                token: adminToken,
                json: { items: [{ variant: variant._id, quantity: 99 }], destination: 'cash' },
                expect: [400],
            });
        }

        // Inventory
        await hit('Restock variant', 'POST', '/inventory/restock', { token: adminToken, json: { variantId: variant._id, quantity: 5 } });
        await hit('Inventory logs', 'GET', '/inventory/logs', { token: adminToken });
    }

    // ── Shifts ──────────────────────────────────────────────────────────
    const openShift = await hit('Open shift (float 1000)', 'POST', '/shifts/open', { token: adminToken, json: { openingFloat: 1000 }, expect: [201] });
    await hit('Open shift again rejected (already open)', 'POST', '/shifts/open', { token: adminToken, json: { openingFloat: 500 }, expect: [409] });

    const currentShift = await hit('Get current shift', 'GET', '/shifts/current', { token: adminToken });
    const currentOk = !!openShift && currentShift?._id === openShift._id;
    results.push({ label: 'GET /shifts/current returns the just-opened shift', method: '-', path: '-', status: currentOk ? 'ok' : 'mismatch', ok: currentOk, ms: 0 });
    currentOk ? passCount++ : failCount++;

    if (openShift?._id) {
        // Dedicated style so the sale total is exact for the reconciliation math
        const shiftStyleForm = new FormData();
        shiftStyleForm.append('name', 'Shift Test Item');
        shiftStyleForm.append('basePrice', '500');
        shiftStyleForm.append('variants', JSON.stringify([{ size: 'One Size', color: 'N/A', sku: `SHIFT-${Date.now()}`, stock: 5, reorderThreshold: 1 }]));
        const shiftStyle = await hit('Create style for shift test (temp)', 'POST', '/styles', { token: adminToken, form: shiftStyleForm, expect: [201] });
        const shiftVariant = shiftStyle?.variants?.[0];

        let shiftSale = null;
        if (shiftVariant?._id) {
            shiftSale = await hit('Create cash sale attributed to open shift', 'POST', '/sales', {
                token: adminToken,
                json: { items: [{ variant: shiftVariant._id, quantity: 1, discount: 0 }], totalAmount: 500, paymentMethod: 'cash', shift: openShift._id },
                expect: [201],
            });
        }

        const closeRes = await hit('Close shift (counted 1500 — expect discrepancy 0)', 'POST', `/shifts/${openShift._id}/close`, {
            token: adminToken,
            json: { closingCount: 1500 },
        });
        const shiftMathOk = closeRes?.status === 'closed' && closeRes?.expectedCash === 1500 && closeRes?.discrepancy === 0;
        results.push({ label: 'Shift close math: opening 1000 + cash sale 500 = expected 1500, discrepancy 0', method: '-', path: '-', status: shiftMathOk ? 'ok' : JSON.stringify(closeRes), ok: shiftMathOk, ms: 0 });
        shiftMathOk ? passCount++ : failCount++;

        await hit('Close already-closed shift rejected', 'POST', `/shifts/${openShift._id}/close`, { token: adminToken, json: { closingCount: 1500 }, expect: [400] });

        if (shiftSale?._id) await hit('Cleanup: delete shift-test sale', 'DELETE', `/sales/${shiftSale._id}`, { token: adminToken });
        if (shiftStyle?._id) await hit('Cleanup: delete shift-test style', 'DELETE', `/styles/${shiftStyle._id}`, { token: adminToken });
    }

    if (cashierToken) {
        await hit('Role gate — cashier blocked from GET /shifts', 'GET', '/shifts', { token: cashierToken, expect: [403] });
    }
    await hit('GET /shifts — no token rejected', 'GET', '/shifts', { expect: [401] });
    await hit('List shifts (admin)', 'GET', '/shifts?limit=5', { token: adminToken });

    // ── Store credit ────────────────────────────────────────────────────
    const creditCustomer = await hit('Create customer for store-credit test', 'POST', '/customers', {
        token: adminToken,
        json: { name: 'Store Credit Test Customer', phone: `07${Date.now()}`.slice(0, 12) },
        expect: [201],
    });

    const creditStyleForm = new FormData();
    creditStyleForm.append('name', 'Credit Test Item');
    creditStyleForm.append('basePrice', '400');
    creditStyleForm.append('variants', JSON.stringify([{ size: 'M', color: 'Grey', sku: `CREDIT-${Date.now()}`, stock: 10, reorderThreshold: 1 }]));
    const creditStyle = await hit('Create style for store-credit test (temp)', 'POST', '/styles', { token: adminToken, form: creditStyleForm, expect: [201] });
    const creditVariant = creditStyle?.variants?.[0];

    let creditSale1 = null, creditSale2 = null;
    if (creditCustomer?._id && creditVariant?._id) {
        creditSale1 = await hit('Create sale (customer attached, qty 2 @ 400 = 800)', 'POST', '/sales', {
            token: adminToken,
            json: { items: [{ variant: creditVariant._id, quantity: 2, discount: 0 }], totalAmount: 800, paymentMethod: 'cash', customer: creditCustomer._id },
            expect: [201],
        });

        if (creditSale1?._id) {
            await hit('Return full sale to store credit', 'POST', `/sales/${creditSale1._id}/return`, {
                token: adminToken,
                json: { items: [{ variant: creditVariant._id, quantity: 2 }], destination: 'store_credit' },
            });

            const afterCredit = await hit('Get customer after credit (expect balance 800)', 'GET', `/customers/${creditCustomer._id}`, { token: adminToken });
            const creditOk = afterCredit?.storeCreditBalance === 800;
            results.push({ label: 'Store credit balance = 800 after return', method: '-', path: '-', status: creditOk ? 'ok' : afterCredit?.storeCreditBalance, ok: creditOk, ms: 0 });
            creditOk ? passCount++ : failCount++;

            const ledger = await hit('Get store credit ledger', 'GET', `/customers/${creditCustomer._id}/store-credit-ledger`, { token: adminToken });
            const ledgerOk = ledger?.balance === 800 && ledger?.entries?.some(e => e.reason === 'return_refund' && e.amount === 800);
            results.push({ label: 'Store credit ledger records the return_refund entry', method: '-', path: '-', status: ledgerOk ? 'ok' : JSON.stringify(ledger), ok: ledgerOk, ms: 0 });
            ledgerOk ? passCount++ : failCount++;

            // Pay a sale exactly with the available balance (400 of 800)
            creditSale2 = await hit('Pay sale with store credit (400 of 800 balance)', 'POST', '/sales', {
                token: adminToken,
                json: { items: [{ variant: creditVariant._id, quantity: 1, discount: 0 }], totalAmount: 400, paymentMethod: 'store_credit', customer: creditCustomer._id },
                expect: [201],
            });

            const afterDebit = await hit('Get customer after store-credit payment (expect balance 400)', 'GET', `/customers/${creditCustomer._id}`, { token: adminToken });
            const debitOk = afterDebit?.storeCreditBalance === 400;
            results.push({ label: 'Store credit balance = 400 after checkout payment', method: '-', path: '-', status: debitOk ? 'ok' : afterDebit?.storeCreditBalance, ok: debitOk, ms: 0 });
            debitOk ? passCount++ : failCount++;

            // Attempt to overspend the remaining 400 balance
            await hit('Store credit payment exceeding balance rejected', 'POST', '/sales', {
                token: adminToken,
                json: { items: [{ variant: creditVariant._id, quantity: 1, discount: 0 }], totalAmount: 500, paymentMethod: 'store_credit', customer: creditCustomer._id },
                expect: [400],
            });
            const afterRejected = await hit('Get customer after rejected overspend (expect still 400)', 'GET', `/customers/${creditCustomer._id}`, { token: adminToken });
            const unchangedOk = afterRejected?.storeCreditBalance === 400;
            results.push({ label: 'Store credit balance unchanged (400) after rejected overspend', method: '-', path: '-', status: unchangedOk ? 'ok' : afterRejected?.storeCreditBalance, ok: unchangedOk, ms: 0 });
            unchangedOk ? passCount++ : failCount++;
        }
    }

    // Cleanup store-credit fixtures
    if (creditSale2?._id) await hit('Cleanup: delete store-credit-payment sale', 'DELETE', `/sales/${creditSale2._id}`, { token: adminToken });
    if (creditSale1?._id) await hit('Cleanup: delete store-credit-source sale', 'DELETE', `/sales/${creditSale1._id}`, { token: adminToken });
    if (creditStyle?._id) await hit('Cleanup: delete store-credit-test style', 'DELETE', `/styles/${creditStyle._id}`, { token: adminToken });
    if (creditCustomer?._id) await hit('Cleanup: delete store-credit-test customer', 'DELETE', `/customers/${creditCustomer._id}`, { token: adminToken });

    // ── Gift cards ──────────────────────────────────────────────────────
    const giftStyleForm = new FormData();
    giftStyleForm.append('name', 'Gift Card Test Item');
    giftStyleForm.append('basePrice', '400');
    giftStyleForm.append('variants', JSON.stringify([{ size: 'One Size', color: 'N/A', sku: `GIFT-${Date.now()}`, stock: 20, reorderThreshold: 1 }]));
    const giftStyle = await hit('Create style for gift-card test (temp)', 'POST', '/styles', { token: adminToken, form: giftStyleForm, expect: [201] });
    const giftVariant = giftStyle?.variants?.[0];

    let giftSaleSell = null, giftSaleRedeem1 = null, giftCode = null;
    if (giftVariant?._id) {
        giftSaleSell = await hit('Sell a gift card (1000) alongside an item purchase', 'POST', '/sales', {
            token: adminToken,
            json: { items: [{ variant: giftVariant._id, quantity: 1, discount: 0 }], totalAmount: 1400, paymentMethod: 'cash', giftCardsSold: [{ amount: 1000 }] },
            expect: [201],
        });
        giftCode = giftSaleSell?.giftCardsSold?.[0]?.code;
        const soldOk = giftSaleSell?.giftCardsSold?.[0]?.amount === 1000 && !!giftCode;
        results.push({ label: 'Gift card sold: code issued, amount 1000', method: '-', path: '-', status: soldOk ? giftCode : JSON.stringify(giftSaleSell?.giftCardsSold), ok: soldOk, ms: 0 });
        soldOk ? passCount++ : failCount++;

        if (giftCode) {
            const lookup1 = await hit('Look up gift card (expect balance 1000)', 'GET', `/giftcards/lookup?code=${giftCode}`, { token: adminToken });
            const lookup1Ok = lookup1?.currentBalance === 1000 && lookup1?.status === 'active';
            results.push({ label: 'Gift card lookup shows balance 1000, active', method: '-', path: '-', status: lookup1Ok ? 'ok' : JSON.stringify(lookup1), ok: lookup1Ok, ms: 0 });
            lookup1Ok ? passCount++ : failCount++;

            if (cashierToken) {
                await hit('Gift card lookup allowed for cashier (any staff)', 'GET', `/giftcards/lookup?code=${giftCode}`, { token: cashierToken });
            }

            // Redeem 400 of the 1000 balance — partial, no split-tender needed since balance covers it
            giftSaleRedeem1 = await hit('Redeem gift card for a 400 sale (partial, leaves 600)', 'POST', '/sales', {
                token: adminToken,
                json: { items: [{ variant: giftVariant._id, quantity: 1, discount: 0 }], totalAmount: 400, paymentMethod: 'gift_card', giftCardCode: giftCode },
                expect: [201],
            });
            const redeemedOk = giftSaleRedeem1?.giftCardRedeemed?.code === giftCode && giftSaleRedeem1?.giftCardRedeemed?.amount === 400;
            results.push({ label: 'Sale records giftCardRedeemed = {code, amount: 400}', method: '-', path: '-', status: redeemedOk ? 'ok' : JSON.stringify(giftSaleRedeem1?.giftCardRedeemed), ok: redeemedOk, ms: 0 });
            redeemedOk ? passCount++ : failCount++;

            const lookup2 = await hit('Look up gift card after redemption (expect balance 600)', 'GET', `/giftcards/lookup?code=${giftCode}`, { token: adminToken });
            const lookup2Ok = lookup2?.currentBalance === 600 && lookup2?.status === 'active';
            results.push({ label: 'Gift card balance = 600 after partial redemption', method: '-', path: '-', status: lookup2Ok ? 'ok' : JSON.stringify(lookup2), ok: lookup2Ok, ms: 0 });
            lookup2Ok ? passCount++ : failCount++;

            // No split-tender: a sale total exceeding the remaining balance is rejected outright
            await hit('Gift card redemption exceeding balance rejected (no split-tender)', 'POST', '/sales', {
                token: adminToken,
                json: { items: [{ variant: giftVariant._id, quantity: 1, discount: 0 }], totalAmount: 700, paymentMethod: 'gift_card', giftCardCode: giftCode },
                expect: [400],
            });
            const lookup3 = await hit('Gift card balance unchanged (600) after rejected overdraw', 'GET', `/giftcards/lookup?code=${giftCode}`, { token: adminToken });
            const unchangedGiftOk = lookup3?.currentBalance === 600;
            results.push({ label: 'Gift card balance still 600 after rejected overdraw', method: '-', path: '-', status: unchangedGiftOk ? 'ok' : lookup3?.currentBalance, ok: unchangedGiftOk, ms: 0 });
            unchangedGiftOk ? passCount++ : failCount++;

            // ── Concurrency: two simultaneous redemptions of 400 each against a
            // 600 balance — together they overdraw, so exactly one must win.
            // This is exactly what the atomic guarded findOneAndUpdate exists
            // to prevent (a plain read-then-write balance check would let both
            // succeed under this race).
            const raceBody = JSON.stringify({ items: [{ variant: giftVariant._id, quantity: 1, discount: 0 }], totalAmount: 400, paymentMethod: 'gift_card', giftCardCode: giftCode });
            const raceHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
            const [raceA, raceB] = await Promise.all([
                fetch(`${API}/sales`, { method: 'POST', headers: raceHeaders, body: raceBody }),
                fetch(`${API}/sales`, { method: 'POST', headers: raceHeaders, body: raceBody }),
            ]);
            const raceStatuses = [raceA.status, raceB.status].sort();
            const raceOk = raceStatuses[0] === 201 && raceStatuses[1] === 400;
            results.push({ label: 'Concurrent overdraw race: exactly one of two 400-redemptions succeeds', method: '-', path: '-', status: raceOk ? 'ok (201+400)' : `got ${raceStatuses.join(',')}`, ok: raceOk, ms: 0 });
            raceOk ? passCount++ : failCount++;
            // Consume the bodies so the process can exit cleanly
            await raceA.json().catch(() => {});
            await raceB.json().catch(() => {});

            const lookup4 = await hit('Gift card balance = 200 after race (only one redemption applied)', 'GET', `/giftcards/lookup?code=${giftCode}`, { token: adminToken });
            const finalBalanceOk = lookup4?.currentBalance === 200;
            results.push({ label: 'Gift card balance = 200 post-race', method: '-', path: '-', status: finalBalanceOk ? 'ok' : lookup4?.currentBalance, ok: finalBalanceOk, ms: 0 });
            finalBalanceOk ? passCount++ : failCount++;
        }
    }

    if (cashierToken) {
        await hit('Role gate — cashier blocked from GET /giftcards', 'GET', '/giftcards', { token: cashierToken, expect: [403] });
    }
    await hit('GET /giftcards — no token rejected', 'GET', '/giftcards', { expect: [401] });
    await hit('List gift cards (admin)', 'GET', '/giftcards?limit=5', { token: adminToken });

    // Cleanup gift-card fixtures (sales only — no delete endpoint for gift
    // cards themselves; a couple of depleted test cards are left behind,
    // same as how audit/inventory logs are append-only by design)
    if (giftSaleRedeem1?._id) await hit('Cleanup: delete gift-card-redemption sale', 'DELETE', `/sales/${giftSaleRedeem1._id}`, { token: adminToken });
    if (giftSaleSell?._id) await hit('Cleanup: delete gift-card-sale sale', 'DELETE', `/sales/${giftSaleSell._id}`, { token: adminToken });
    if (giftStyle?._id) await hit('Cleanup: delete gift-card-test style', 'DELETE', `/styles/${giftStyle._id}`, { token: adminToken });

    // ── Split-tender payments ───────────────────────────────────────────
    const splitStyleForm = new FormData();
    splitStyleForm.append('name', 'Smoke Test Split-Tender Style');
    splitStyleForm.append('basePrice', '1000');
    splitStyleForm.append('variants', JSON.stringify([{ size: 'One Size', color: 'N/A', sku: `SPLIT-${Date.now()}`, stock: 10, reorderThreshold: 1 }]));
    const splitStyle = await hit('Create style for split-tender test (temp)', 'POST', '/styles', { token: adminToken, form: splitStyleForm, expect: [201] });
    const splitVariant = splitStyle?.variants?.[0];

    // Cash+card here — store-credit/gift-card lines within a split are
    // already covered thoroughly by server/tests/finalizeSale.test.js
    // (atomic guards, insufficient-balance rollback, duplicate-line
    // rejection); this end-to-end pass just needs to prove the whole HTTP
    // round-trip and the return-destination interaction work.
    let splitSale = null;
    if (splitVariant?._id) {
        splitSale = await hit('Split-tender sale: 600 cash + 400 card', 'POST', '/sales', {
            token: adminToken,
            json: {
                items: [{ variant: splitVariant._id, quantity: 1, discount: 0 }],
                totalAmount: 1000,
                payments: [{ method: 'cash', amount: 600 }, { method: 'card', amount: 400 }],
            },
            expect: [201],
        });
        const splitOk = splitSale?.paymentMethod === 'split' && splitSale?.payments?.length === 2;
        results.push({ label: 'Split sale has paymentMethod=split and 2 payment lines', method: '-', path: '-', status: splitOk ? 'ok' : JSON.stringify({ paymentMethod: splitSale?.paymentMethod, payments: splitSale?.payments }), ok: splitOk, ms: 0 });
        splitOk ? passCount++ : failCount++;

        await hit('Split-tender rejected — line amounts do not sum to total', 'POST', '/sales', {
            token: adminToken,
            json: {
                items: [{ variant: splitVariant._id, quantity: 1, discount: 0 }],
                totalAmount: 1000,
                payments: [{ method: 'cash', amount: 300 }, { method: 'card', amount: 300 }],
            },
            expect: [400],
        });

        await hit('Split-tender rejected — M-Pesa combined with another method', 'POST', '/sales', {
            token: adminToken,
            json: {
                items: [{ variant: splitVariant._id, quantity: 1, discount: 0 }],
                totalAmount: 1000,
                payments: [{ method: 'mpesa', amount: 500 }, { method: 'cash', amount: 500 }],
            },
            expect: [400],
        });

        if (splitSale?._id) {
            // A split sale has no single "original payment method" to refund to.
            await hit('Return rejected for a split sale — destination=original_payment', 'POST', `/sales/${splitSale._id}/return`, {
                token: adminToken,
                json: { items: [{ variant: splitVariant._id, quantity: 1 }], destination: 'original_payment' },
                expect: [400],
            });
            // cash/store_credit remain valid destinations regardless of the original split.
            const splitReturnRes = await hit('Return accepted for a split sale — destination=cash', 'POST', `/sales/${splitSale._id}/return`, {
                token: adminToken,
                json: { items: [{ variant: splitVariant._id, quantity: 1 }], destination: 'cash' },
            });
            const splitReturnOk = splitReturnRes?.sale?.status === 'returned';
            results.push({ label: 'Split-sale return (destination=cash) succeeds', method: '-', path: '-', status: splitReturnOk ? 'ok' : JSON.stringify(splitReturnRes?.sale?.status), ok: splitReturnOk, ms: 0 });
            splitReturnOk ? passCount++ : failCount++;
        }
    }

    if (splitSale?._id) await hit('Cleanup: delete split-tender sale', 'DELETE', `/sales/${splitSale._id}`, { token: adminToken });
    if (splitStyle?._id) await hit('Cleanup: delete split-tender-test style', 'DELETE', `/styles/${splitStyle._id}`, { token: adminToken });

    // ── Layaway ──────────────────────────────────────────────────────────
    const layawayStyleForm = new FormData();
    layawayStyleForm.append('name', 'Smoke Test Layaway Style');
    layawayStyleForm.append('basePrice', '1000');
    layawayStyleForm.append('variants', JSON.stringify([{ size: 'One Size', color: 'N/A', sku: `LAYAWAY-${Date.now()}`, stock: 10, reorderThreshold: 1 }]));
    const layawayStyle = await hit('Create style for layaway test (temp)', 'POST', '/styles', { token: adminToken, form: layawayStyleForm, expect: [201] });
    const layawayVariant = layawayStyle?.variants?.[0];
    const layawayCustomer = await hit('Create customer for layaway test (temp)', 'POST', '/customers', {
        token: adminToken,
        json: { name: 'Layaway Customer', phone: `07${Date.now()}`.slice(0, 12) },
        expect: [201],
    });

    let layaway1 = null, layaway2 = null, completedSaleId = null;
    if (layawayVariant?._id && layawayCustomer?._id) {
        await hit('Layaway rejected — no customer', 'POST', '/layaways', {
            token: adminToken,
            json: { items: [{ variant: layawayVariant._id, quantity: 1, discount: 0 }], totalAmount: 1000, deposit: { amount: 300, method: 'cash' } },
            expect: [400],
        });
        await hit('Layaway rejected — deposit not less than total', 'POST', '/layaways', {
            token: adminToken,
            json: { customer: layawayCustomer._id, items: [{ variant: layawayVariant._id, quantity: 1, discount: 0 }], totalAmount: 1000, deposit: { amount: 1000, method: 'cash' } },
            expect: [400],
        });

        // Flow 1: create -> pay off the rest -> complete
        layaway1 = await hit('Create layaway (1000 total, 300 deposit)', 'POST', '/layaways', {
            token: adminToken,
            json: { customer: layawayCustomer._id, items: [{ variant: layawayVariant._id, quantity: 1, discount: 0 }], totalAmount: 1000, deposit: { amount: 300, method: 'cash' } },
            expect: [201],
        });
        const createdOk = layaway1?.status === 'active' && layaway1?.balanceRemaining === 700;
        results.push({ label: 'Layaway created: active, balanceRemaining=700', method: '-', path: '-', status: createdOk ? 'ok' : JSON.stringify({ status: layaway1?.status, balanceRemaining: layaway1?.balanceRemaining }), ok: createdOk, ms: 0 });
        createdOk ? passCount++ : failCount++;

        const stylesAfterReserve = await hit('List variants for style after layaway reservation', 'GET', `/styles/${layawayStyle._id}/variants`, { token: adminToken });
        const stockAfterReserveOk = stylesAfterReserve?.find(v => v._id === layawayVariant._id)?.stock === 9;
        results.push({ label: 'Stock reserved immediately at layaway creation (10 -> 9)', method: '-', path: '-', status: stockAfterReserveOk ? 'ok' : JSON.stringify(stylesAfterReserve?.map(v => v.stock)), ok: stockAfterReserveOk, ms: 0 });
        stockAfterReserveOk ? passCount++ : failCount++;

        if (layaway1?._id) {
            await hit('Layaway completion rejected while balance remains', 'POST', `/layaways/${layaway1._id}/complete`, { token: adminToken, expect: [400] });

            const paidRes = await hit('Record layaway installment (400)', 'POST', `/layaways/${layaway1._id}/payment`, {
                token: adminToken,
                json: { amount: 400, method: 'card' },
            });
            const paidOk = paidRes?.balanceRemaining === 300;
            results.push({ label: 'Balance after 400 installment = 300', method: '-', path: '-', status: paidOk ? 'ok' : paidRes?.balanceRemaining, ok: paidOk, ms: 0 });
            paidOk ? passCount++ : failCount++;

            await hit('Layaway payment rejected — exceeds remaining balance', 'POST', `/layaways/${layaway1._id}/payment`, {
                token: adminToken,
                json: { amount: 9000, method: 'cash' },
                expect: [400],
            });

            const finalPayRes = await hit('Record final layaway installment (300)', 'POST', `/layaways/${layaway1._id}/payment`, {
                token: adminToken,
                json: { amount: 300, method: 'cash' },
            });
            const finalPayOk = finalPayRes?.balanceRemaining === 0;
            results.push({ label: 'Balance after final installment = 0', method: '-', path: '-', status: finalPayOk ? 'ok' : finalPayRes?.balanceRemaining, ok: finalPayOk, ms: 0 });
            finalPayOk ? passCount++ : failCount++;

            const completeRes = await hit('Complete fully-paid layaway', 'POST', `/layaways/${layaway1._id}/complete`, { token: adminToken });
            completedSaleId = completeRes?.sale?._id;
            const completeOk = completeRes?.layaway?.status === 'completed' && completeRes?.sale?.paymentMethod === 'split' && completeRes?.sale?.payments?.length === 3;
            results.push({ label: 'Completed layaway produces a split sale with 3 payment lines', method: '-', path: '-', status: completeOk ? 'ok' : JSON.stringify({ status: completeRes?.layaway?.status, paymentMethod: completeRes?.sale?.paymentMethod, lines: completeRes?.sale?.payments?.length }), ok: completeOk, ms: 0 });
            completeOk ? passCount++ : failCount++;

            const stylesAfterComplete = await hit('List variants for style after layaway completion', 'GET', `/styles/${layawayStyle._id}/variants`, { token: adminToken });
            const stockUnchangedOk = stylesAfterComplete?.find(v => v._id === layawayVariant._id)?.stock === 9;
            results.push({ label: 'Stock unchanged by completion (still 9 — reserved at creation, not decremented twice)', method: '-', path: '-', status: stockUnchangedOk ? 'ok' : JSON.stringify(stylesAfterComplete?.map(v => v.stock)), ok: stockUnchangedOk, ms: 0 });
            stockUnchangedOk ? passCount++ : failCount++;

            await hit('Re-completing an already-completed layaway rejected', 'POST', `/layaways/${layaway1._id}/complete`, { token: adminToken, expect: [400] });
        }

        // Flow 2: create -> cancel (store_credit refund)
        layaway2 = await hit('Create second layaway (2000 total, 500 deposit)', 'POST', '/layaways', {
            token: adminToken,
            json: { customer: layawayCustomer._id, items: [{ variant: layawayVariant._id, quantity: 2, discount: 0 }], totalAmount: 2000, deposit: { amount: 500, method: 'cash' } },
            expect: [201],
        });
        if (layaway2?._id) {
            await hit('Layaway cancel rejected — invalid destination', 'POST', `/layaways/${layaway2._id}/cancel`, {
                token: adminToken,
                json: { destination: 'bitcoin' },
                expect: [400],
            });
            const cancelRes = await hit('Cancel layaway (destination=store_credit)', 'POST', `/layaways/${layaway2._id}/cancel`, {
                token: adminToken,
                json: { destination: 'store_credit' },
            });
            const cancelOk = cancelRes?.status === 'cancelled' && cancelRes?.cancellation?.destination === 'store_credit';
            results.push({ label: 'Cancelled layaway status=cancelled, destination=store_credit', method: '-', path: '-', status: cancelOk ? 'ok' : JSON.stringify(cancelRes), ok: cancelOk, ms: 0 });
            cancelOk ? passCount++ : failCount++;

            const custAfterCancel = await hit('Customer balance after layaway cancellation refund', 'GET', `/customers/${layawayCustomer._id}`, { token: adminToken });
            const refundOk = custAfterCancel?.storeCreditBalance === 500;
            results.push({ label: 'Customer refunded 500 store credit after cancellation', method: '-', path: '-', status: refundOk ? 'ok' : custAfterCancel?.storeCreditBalance, ok: refundOk, ms: 0 });
            refundOk ? passCount++ : failCount++;

            await hit('Re-cancelling an already-cancelled layaway rejected', 'POST', `/layaways/${layaway2._id}/cancel`, { token: adminToken, json: { destination: 'forfeit' }, expect: [400] });
        }

        await hit('List layaways (admin)', 'GET', '/layaways?limit=5', { token: adminToken });
        await hit('GET /layaways — no token rejected', 'GET', '/layaways', { expect: [401] });
    }

    if (completedSaleId) await hit('Cleanup: delete completed-layaway sale', 'DELETE', `/sales/${completedSaleId}`, { token: adminToken });
    if (layawayCustomer?._id) await hit('Cleanup: delete layaway customer', 'DELETE', `/customers/${layawayCustomer._id}`, { token: adminToken });
    if (layawayStyle?._id) await hit('Cleanup: delete layaway-test style', 'DELETE', `/styles/${layawayStyle._id}`, { token: adminToken });

    // ── Suppliers / Purchase Orders ──────────────────────────────────────
    await hit('Supplier creation rejected — missing name', 'POST', '/suppliers', { token: adminToken, json: { phone: '0700000000' }, expect: [400] });

    const poSupplier = await hit('Create supplier (temp)', 'POST', '/suppliers', {
        token: adminToken,
        json: { name: 'Smoke Test Supplier', contactName: 'Jane Doe', phone: '0700000000' },
        expect: [201],
    });

    const poStyleForm = new FormData();
    poStyleForm.append('name', 'Smoke Test PO Style');
    poStyleForm.append('basePrice', '1000');
    poStyleForm.append('variants', JSON.stringify([{ size: 'One Size', color: 'N/A', sku: `PO-${Date.now()}`, stock: 5, reorderThreshold: 1 }]));
    const poStyle = await hit('Create style for PO test (temp)', 'POST', '/styles', { token: adminToken, form: poStyleForm, expect: [201] });
    const poVariant = poStyle?.variants?.[0];

    let po = null;
    if (poSupplier?._id && poVariant?._id) {
        await hit('PO creation rejected — no supplier', 'POST', '/purchase-orders', {
            token: adminToken,
            json: { items: [{ variant: poVariant._id, quantityOrdered: 10, unitCost: 400 }] },
            expect: [400],
        });
        await hit('PO creation rejected — zero quantity', 'POST', '/purchase-orders', {
            token: adminToken,
            json: { supplier: poSupplier._id, items: [{ variant: poVariant._id, quantityOrdered: 0, unitCost: 400 }] },
            expect: [400],
        });

        po = await hit('Create purchase order (10 units, 400 each)', 'POST', '/purchase-orders', {
            token: adminToken,
            json: { supplier: poSupplier._id, items: [{ variant: poVariant._id, quantityOrdered: 10, unitCost: 400 }] },
            expect: [201],
        });
        const poCreatedOk = po?.status === 'ordered' && po?.items?.[0]?.quantityOrdered === 10 && po?.items?.[0]?.quantityReceived === 0;
        results.push({ label: 'PO created: status=ordered, quantityOrdered=10, quantityReceived=0', method: '-', path: '-', status: poCreatedOk ? 'ok' : JSON.stringify(po), ok: poCreatedOk, ms: 0 });
        poCreatedOk ? passCount++ : failCount++;

        if (po?._id) {
            const partialReceive = await hit('Partially receive PO (6 of 10)', 'POST', `/purchase-orders/${po._id}/receive`, {
                token: adminToken,
                json: { items: [{ variant: poVariant._id, quantity: 6 }] },
            });
            const partialOk = partialReceive?.status === 'partially_received' && partialReceive?.items?.[0]?.quantityReceived === 6;
            results.push({ label: 'PO partially received: status=partially_received, quantityReceived=6', method: '-', path: '-', status: partialOk ? 'ok' : JSON.stringify(partialReceive), ok: partialOk, ms: 0 });
            partialOk ? passCount++ : failCount++;

            const stylesAfterPartial = await hit('List variants for style after partial PO receipt', 'GET', `/styles/${poStyle._id}/variants`, { token: adminToken });
            const stockAfterPartialOk = stylesAfterPartial?.find(v => v._id === poVariant._id)?.stock === 11;
            results.push({ label: 'Stock incremented by partial receipt (5 -> 11)', method: '-', path: '-', status: stockAfterPartialOk ? 'ok' : JSON.stringify(stylesAfterPartial?.map(v => v.stock)), ok: stockAfterPartialOk, ms: 0 });
            stockAfterPartialOk ? passCount++ : failCount++;

            await hit('PO receive rejected — exceeds outstanding quantity', 'POST', `/purchase-orders/${po._id}/receive`, {
                token: adminToken,
                json: { items: [{ variant: poVariant._id, quantity: 999 }] },
                expect: [400],
            });

            const fullReceive = await hit('Receive remaining PO balance (4 of 10)', 'POST', `/purchase-orders/${po._id}/receive`, {
                token: adminToken,
                json: { items: [{ variant: poVariant._id, quantity: 4 }] },
            });
            const fullOk = fullReceive?.status === 'received' && fullReceive?.items?.[0]?.quantityReceived === 10;
            results.push({ label: 'PO fully received: status=received', method: '-', path: '-', status: fullOk ? 'ok' : JSON.stringify(fullReceive), ok: fullOk, ms: 0 });
            fullOk ? passCount++ : failCount++;

            await hit('PO cancel rejected — already fully received', 'POST', `/purchase-orders/${po._id}/cancel`, { token: adminToken, expect: [400] });
            await hit('PO receive rejected — already fully received', 'POST', `/purchase-orders/${po._id}/receive`, {
                token: adminToken,
                json: { items: [{ variant: poVariant._id, quantity: 1 }] },
                expect: [400],
            });

            await hit('Supplier deletion rejected — active PO on file', 'DELETE', `/suppliers/${poSupplier._id}`, { token: adminToken, expect: [400] });
        }

        // Second PO: create -> cancel (never received, no stock impact)
        const po2 = await hit('Create second purchase order (for cancel test)', 'POST', '/purchase-orders', {
            token: adminToken,
            json: { supplier: poSupplier._id, items: [{ variant: poVariant._id, quantityOrdered: 5, unitCost: 400 }] },
            expect: [201],
        });
        if (po2?._id) {
            const cancelRes = await hit('Cancel second PO (never received)', 'POST', `/purchase-orders/${po2._id}/cancel`, { token: adminToken });
            const cancelOk = cancelRes?.status === 'cancelled';
            results.push({ label: 'PO cancelled: status=cancelled', method: '-', path: '-', status: cancelOk ? 'ok' : cancelRes?.status, ok: cancelOk, ms: 0 });
            cancelOk ? passCount++ : failCount++;
        }

        await hit('List purchase orders (admin)', 'GET', '/purchase-orders?limit=5', { token: adminToken });
        await hit('GET /purchase-orders — no token rejected', 'GET', '/purchase-orders', { expect: [401] });
    }

    // Cleanup: cancel the first PO isn't possible (already received), and
    // there's no delete endpoint for purchase orders (append-only, same
    // convention as audit/inventory logs) — cancel the supplier's remaining
    // reference by leaving the PO in place, same as gift cards' "a couple of
    // depleted test docs are left behind" convention.
    if (poStyle?._id) await hit('Cleanup: delete PO-test style', 'DELETE', `/styles/${poStyle._id}`, { token: adminToken });

    // ── M-Pesa (mock mode) ──────────────────────────────────────────────
    await hit('M-Pesa initiate rejected — invalid phone', 'POST', '/payments/mpesa/initiate', {
        token: adminToken,
        json: { phone: 'not-a-phone', items: [{ variant: '000000000000000000000000', quantity: 1, discount: 0 }], totalAmount: 500 },
        expect: [400],
    });
    await hit('M-Pesa initiate rejected — no items', 'POST', '/payments/mpesa/initiate', {
        token: adminToken,
        json: { phone: '0712345678', items: [], totalAmount: 500 },
        expect: [400],
    });
    await hit('M-Pesa initiate — no token rejected', 'POST', '/payments/mpesa/initiate', { json: { phone: '0712345678', items: [], totalAmount: 500 }, expect: [401] });
    await hit('M-Pesa callback — malformed payload rejected', 'POST', '/payments/mpesa/callback', { json: { nonsense: true }, expect: [400] });
    await hit('M-Pesa callback — unknown CheckoutRequestID acked anyway', 'POST', '/payments/mpesa/callback', {
        json: { Body: { stkCallback: { CheckoutRequestID: 'does-not-exist', ResultCode: 0, ResultDesc: 'ok' } } },
    });

    const mpesaStyleForm = new FormData();
    mpesaStyleForm.append('name', 'M-Pesa Test Item');
    mpesaStyleForm.append('basePrice', '350');
    mpesaStyleForm.append('variants', JSON.stringify([{ size: 'One Size', color: 'N/A', sku: `MPESA-${Date.now()}`, stock: 10, reorderThreshold: 1 }]));
    const mpesaStyle = await hit('Create style for M-Pesa test (temp)', 'POST', '/styles', { token: adminToken, form: mpesaStyleForm, expect: [201] });
    const mpesaVariant = mpesaStyle?.variants?.[0];

    let mpesaSaleId = null;
    if (mpesaVariant?._id) {
        // Happy path: initiate, mock auto-confirms after ~2s, sale gets created
        const initiated = await hit('Initiate M-Pesa STK push (mock)', 'POST', '/payments/mpesa/initiate', {
            token: adminToken,
            json: { phone: '0712345678', items: [{ variant: mpesaVariant._id, quantity: 1, discount: 0 }], totalAmount: 350 },
            expect: [201],
        });

        if (initiated?.pendingPaymentId) {
            const finalStatus = await waitForMpesaStatus(initiated.pendingPaymentId, adminToken);
            const confirmedOk = finalStatus?.status === 'confirmed' && !!finalStatus?.saleId;
            results.push({ label: 'M-Pesa mock payment confirms and produces a saleId', method: '-', path: '-', status: confirmedOk ? 'ok' : JSON.stringify(finalStatus), ok: confirmedOk, ms: 0 });
            confirmedOk ? passCount++ : failCount++;

            if (finalStatus?.saleId) {
                mpesaSaleId = finalStatus.saleId;
                const sale = await hit('Get the M-Pesa-confirmed sale', 'GET', `/sales/${mpesaSaleId}`, { token: adminToken });
                const saleOk = sale?.paymentMethod === 'mpesa' && sale?.totalAmount === 350;
                results.push({ label: 'M-Pesa sale has paymentMethod=mpesa, totalAmount=350', method: '-', path: '-', status: saleOk ? 'ok' : JSON.stringify({ paymentMethod: sale?.paymentMethod, totalAmount: sale?.totalAmount }), ok: saleOk, ms: 0 });
                saleOk ? passCount++ : failCount++;

                const variantAfter = await hit('Check variant stock decremented by M-Pesa sale', 'GET', `/styles/${mpesaStyle._id}`, { token: adminToken });
                const stockOk = variantAfter?.variants?.[0]?.stock === 9; // started at 10, sold 1
                results.push({ label: 'Stock decremented 10 -> 9 after M-Pesa-confirmed sale', method: '-', path: '-', status: stockOk ? 'ok' : variantAfter?.variants?.[0]?.stock, ok: stockOk, ms: 0 });
                stockOk ? passCount++ : failCount++;
            }
        }

        // Failure path: simulateFailure flag makes the mock post a nonzero ResultCode
        const initiatedFail = await hit('Initiate M-Pesa STK push (mock, simulated failure)', 'POST', '/payments/mpesa/initiate', {
            token: adminToken,
            json: { phone: '0712345678', items: [{ variant: mpesaVariant._id, quantity: 1, discount: 0 }], totalAmount: 350, simulateFailure: true },
            expect: [201],
        });
        if (initiatedFail?.pendingPaymentId) {
            const failedStatus = await waitForMpesaStatus(initiatedFail.pendingPaymentId, adminToken);
            const failedOk = failedStatus?.status === 'failed' && !failedStatus?.saleId;
            results.push({ label: 'M-Pesa simulated failure: status=failed, no sale created', method: '-', path: '-', status: failedOk ? 'ok' : JSON.stringify(failedStatus), ok: failedOk, ms: 0 });
            failedOk ? passCount++ : failCount++;
        }
    }

    if (mpesaSaleId) await hit('Cleanup: delete M-Pesa sale', 'DELETE', `/sales/${mpesaSaleId}`, { token: adminToken });
    if (mpesaStyle?._id) await hit('Cleanup: delete M-Pesa-test style', 'DELETE', `/styles/${mpesaStyle._id}`, { token: adminToken });

    // ── KRA eTIMS (mock mode) ───────────────────────────────────────────
    const etimsStyleForm = new FormData();
    etimsStyleForm.append('name', 'eTIMS Test Item');
    etimsStyleForm.append('basePrice', '300');
    etimsStyleForm.append('variants', JSON.stringify([{ size: 'One Size', color: 'N/A', sku: `ETIMS-${Date.now()}`, stock: 10, reorderThreshold: 1 }]));
    const etimsStyle = await hit('Create style for eTIMS test (temp)', 'POST', '/styles', { token: adminToken, form: etimsStyleForm, expect: [201] });
    const etimsVariant = etimsStyle?.variants?.[0];

    let etimsGoodSale = null, etimsBadSale = null;
    if (etimsVariant?._id) {
        // Normal sale — mock mode auto-accepts
        etimsGoodSale = await hit('Create sale (expect eTIMS auto-accepted)', 'POST', '/sales', {
            token: adminToken,
            json: { items: [{ variant: etimsVariant._id, quantity: 1, discount: 0 }], totalAmount: 300, paymentMethod: 'cash' },
            expect: [201],
        });
        const acceptedOk = etimsGoodSale?.etimsStatus === 'accepted' && !!etimsGoodSale?.etimsInvoiceNumber;
        results.push({ label: 'Normal sale gets etimsStatus=accepted with an invoice number', method: '-', path: '-', status: acceptedOk ? etimsGoodSale.etimsInvoiceNumber : etimsGoodSale?.etimsStatus, ok: acceptedOk, ms: 0 });
        acceptedOk ? passCount++ : failCount++;

        // Forced-unreachable sale — should still complete, but queued for retry
        etimsBadSale = await hit('Create sale with simulated eTIMS outage (sale still completes)', 'POST', '/sales', {
            token: adminToken,
            json: { items: [{ variant: etimsVariant._id, quantity: 1, discount: 0 }], totalAmount: 300, paymentMethod: 'cash', simulateEtimsFailure: true },
            expect: [201],
        });
        const unreachableOk = etimsBadSale?.etimsStatus === 'unreachable' && !etimsBadSale?.etimsInvoiceNumber;
        results.push({ label: 'Sale with simulated eTIMS outage still completes, etimsStatus=unreachable', method: '-', path: '-', status: unreachableOk ? 'ok' : etimsBadSale?.etimsStatus, ok: unreachableOk, ms: 0 });
        unreachableOk ? passCount++ : failCount++;

        if (etimsBadSale?._id) {
            const queue = await hit('List eTIMS retry queue (admin)', 'GET', '/etims/retry-queue', { token: adminToken });
            const queuedOk = queue?.entries?.some(e => e.sale?._id === etimsBadSale._id && e.status === 'pending');
            results.push({ label: 'Failed sale appears in eTIMS retry queue', method: '-', path: '-', status: queuedOk ? 'ok' : JSON.stringify(queue?.entries?.map(e => e.sale?._id)), ok: queuedOk, ms: 0 });
            queuedOk ? passCount++ : failCount++;

            if (cashierToken) {
                await hit('Role gate — cashier blocked from GET /etims/retry-queue', 'GET', '/etims/retry-queue', { token: cashierToken, expect: [403] });
                await hit('Role gate — cashier blocked from POST /etims/retry', 'POST', `/etims/retry/${etimsBadSale._id}`, { token: cashierToken, expect: [403] });
            }
            await hit('GET /etims/retry-queue — no token rejected', 'GET', '/etims/retry-queue', { expect: [401] });

            // Manual retry (mock mode always accepts when not told to simulate failure)
            const retryRes = await hit('Manually retry eTIMS submission', 'POST', `/etims/retry/${etimsBadSale._id}`, { token: adminToken });
            const retryOk = retryRes?.sale?.etimsStatus === 'accepted' && !!retryRes?.sale?.etimsInvoiceNumber;
            results.push({ label: 'Manual retry resolves the failed submission', method: '-', path: '-', status: retryOk ? retryRes.sale.etimsInvoiceNumber : JSON.stringify(retryRes), ok: retryOk, ms: 0 });
            retryOk ? passCount++ : failCount++;

            const queueAfter = await hit('List eTIMS retry queue after resolving', 'GET', '/etims/retry-queue?status=pending', { token: adminToken });
            const resolvedOk = !queueAfter?.entries?.some(e => e.sale?._id === etimsBadSale._id);
            results.push({ label: 'Resolved sale no longer in pending retry queue', method: '-', path: '-', status: resolvedOk ? 'ok' : 'still pending', ok: resolvedOk, ms: 0 });
            resolvedOk ? passCount++ : failCount++;
        }
    }

    if (etimsGoodSale?._id) await hit('Cleanup: delete eTIMS-accepted sale', 'DELETE', `/sales/${etimsGoodSale._id}`, { token: adminToken });
    if (etimsBadSale?._id) await hit('Cleanup: delete eTIMS-retry sale', 'DELETE', `/sales/${etimsBadSale._id}`, { token: adminToken });
    if (etimsStyle?._id) await hit('Cleanup: delete eTIMS-test style', 'DELETE', `/styles/${etimsStyle._id}`, { token: adminToken });

    // ── Audit — manual log endpoint ────────────────────────────────────
    await hit('Log audit action', 'POST', '/audit', { token: adminToken, json: { action: 'smoke_test', details: { note: 'automated smoke test run' } }, expect: [201] });
    await hit('Log audit action — missing action rejected', 'POST', '/audit', { token: adminToken, json: { details: {} }, expect: [400] });

    // ── Cleanup ─────────────────────────────────────────────────────────
    if (sale?._id) await hit('Cleanup: delete sale', 'DELETE', `/sales/${sale._id}`, { token: adminToken });
    if (style?._id) await hit('Cleanup: delete style (cascades variant)', 'DELETE', `/styles/${style._id}`, { token: adminToken });

    // ── Audit — server-side trigger points + GET /api/audit ────────────
    // By this point the run above should have produced: style_created,
    // style_updated, variant_updated, stock_restocked, sale_return_processed,
    // sale_deleted, style_deleted (plus user_created/updated/deleted from
    // earlier). Confirm the log actually captured them.
    const auditPage = await hit('List audit logs (admin)', 'GET', '/audit?limit=100', { token: adminToken });
    const auditActions = new Set((auditPage?.logs || []).map(l => l.action));
    const expectedActions = ['style_created', 'style_updated', 'variant_updated', 'stock_restocked', 'sale_return_processed', 'sale_deleted', 'style_deleted', 'user_created', 'user_updated', 'user_deleted', 'shift_opened', 'shift_closed', 'store_credit_payment', 'gift_card_sold', 'gift_card_redeemed', 'mpesa_payment_confirmed', 'etims_retry_resolved'];
    const missing = expectedActions.filter(a => !auditActions.has(a));
    results.push({ label: `Audit log captured all server-side trigger points (${expectedActions.length - missing.length}/${expectedActions.length})`, method: '-', path: '-', status: missing.length ? `missing: ${missing.join(',')}` : 'ok', ok: missing.length === 0, ms: 0 });
    missing.length === 0 ? passCount++ : failCount++;

    const filteredByAction = await hit('Audit log filter by action', 'GET', '/audit?action=stock_restocked', { token: adminToken });
    const filterOk = (filteredByAction?.logs || []).every(l => l.action === 'stock_restocked') && filteredByAction?.logs?.length > 0;
    results.push({ label: 'Audit log action filter returns only matching entries', method: '-', path: '-', status: filterOk ? 'ok' : 'mismatch', ok: filterOk, ms: 0 });
    filterOk ? passCount++ : failCount++;

    const onePage = await hit('Audit log pagination params respected', 'GET', '/audit?page=1&limit=1', { token: adminToken });
    const pagingOk = onePage?.logs?.length === 1 && onePage?.page === 1;
    results.push({ label: 'Audit log limit=1 returns exactly 1 entry', method: '-', path: '-', status: pagingOk ? 'ok' : JSON.stringify(onePage), ok: pagingOk, ms: 0 });
    pagingOk ? passCount++ : failCount++;
    if (cashierToken) {
        await hit('Role gate — cashier blocked from GET /audit', 'GET', '/audit', { token: cashierToken, expect: [403] });
    }
    await hit('GET /audit — no token rejected', 'GET', '/audit', { expect: [401] });

    printSummary();
    process.exit(failCount > 0 ? 1 : 0);
}

function printSummary() {
    console.log('\n' + '─'.repeat(88));
    console.log(`${'Endpoint'.padEnd(50)} ${'Method'.padEnd(7)} ${'Status'.padEnd(8)} Result`);
    console.log('─'.repeat(88));
    for (const r of results) {
        const status = r.error ? `ERR` : r.status;
        console.log(`${r.label.padEnd(50)} ${(r.method || '-').padEnd(7)} ${String(status).padEnd(8)} ${r.ok ? 'PASS' : 'FAIL'}${r.error ? ` (${r.error})` : ''}`);
    }
    console.log('─'.repeat(88));
    console.log(`${passCount} passed, ${failCount} failed, ${results.length} total\n`);
}

main().catch(err => {
    console.error('Smoke test crashed:', err);
    printSummary();
    process.exit(1);
});
