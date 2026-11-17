// Regression tests for the Nov 2026 security audit findings. Each describe
// block names the finding it pins down, so a future refactor that reopens
// one of these holes fails loudly here.
const jwt = require('jsonwebtoken');
const { finalizeSale } = require('../controllers/salesController');
const layawayController = require('../controllers/layawayController');
const paymentsController = require('../controllers/paymentsController');
const auditController = require('../controllers/auditController');
const authController = require('../controllers/authController');
const Variant = require('../models/Variant');
const Sale = require('../models/Sale');
const GiftCard = require('../models/GiftCard');
const Layaway = require('../models/Layaway');
const Audit = require('../models/Audit');
const PendingPayment = require('../models/PendingPayment');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { escapeRegex } = require('../utils/escapeRegex');
const { makeStyleWithVariant, makeCustomer, makeUser } = require('./fixtures');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
}

// ─── Finding 1: omitted discount made the computed total NaN, which
// silently passed the "total matches" check for any totalAmount ───────────
describe('finalizeSale — omitted/invalid discount cannot bypass pricing', () => {
  let cashier;
  beforeEach(async () => { cashier = (await makeUser()).id; });

  test('rejects an underpriced sale when discount is omitted', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1 }],
      totalAmount: 1,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/Total amount does not match/);

    expect((await Variant.findById(variant._id)).stock).toBe(5);
    expect(await Sale.countDocuments()).toBe(0);
  });

  test('omitted discount defaults to 0 and a correctly priced sale still works', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 2 }],
      totalAmount: 2000,
      paymentMethod: 'cash',
      cashier,
    });
    expect(sale.items[0].discount).toBe(0);
    expect(sale.totalAmount).toBe(2000);
  });

  test('cannot mint a high-value gift card for a token payment', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1 }],
      giftCardsSold: [{ amount: 1000000 }],
      totalAmount: 1,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/Total amount does not match/);
    expect(await GiftCard.countDocuments()).toBe(0);
  });

  test.each([
    ['a string', '10'],
    ['NaN', NaN],
    ['over 100', 150],
  ])('rejects a discount that is %s', async (_label, discount) => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount }],
      totalAmount: 1000,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/Discount for item 1/);
  });

  test('rejects a non-numeric cart discount', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      cartDiscount: 'abc',
      totalAmount: 1000,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/Cart discount/);
  });

  test('rejects a non-numeric payment line amount', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [{ method: 'cash', amount: 'abc' }],
      cashier,
    })).rejects.toThrow(/amount greater than 0/);
  });

  test('rejects a non-numeric gift card amount', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      giftCardsSold: [{ amount: 'lots' }],
      totalAmount: 1000,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/Gift card amount must be greater than 0/);
  });
});

// ─── Finding 2: negative / fractional quantities netted down the total and
// created phantom stock ──────────────────────────────────────────────────
describe('finalizeSale — quantity must be a positive whole number', () => {
  let cashier;
  beforeEach(async () => { cashier = (await makeUser()).id; });

  test('rejects a negative line used to offset an expensive one', async () => {
    const { variant: pricey } = await makeStyleWithVariant({ basePrice: 5000 }, { stock: 3 });
    const { variant: cheap } = await makeStyleWithVariant({ basePrice: 4999 }, { stock: 3 });
    await expect(finalizeSale({
      items: [
        { variant: pricey._id, quantity: 1, discount: 0 },
        { variant: cheap._id, quantity: -1, discount: 0 },
      ],
      totalAmount: 1,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/positive whole number/);

    expect((await Variant.findById(pricey._id)).stock).toBe(3);
    expect((await Variant.findById(cheap._id)).stock).toBe(3);
  });

  test.each([[0], [1.5], ['2']])('rejects quantity %p', async (quantity) => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/positive whole number/);
  });

  test('two lines for the same variant cannot oversell its stock', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 100 }, { stock: 3 });
    await expect(finalizeSale({
      items: [
        { variant: variant._id, quantity: 2, discount: 0 },
        { variant: variant._id, quantity: 2, discount: 0 },
      ],
      totalAmount: 400,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/Insufficient stock/);
    expect((await Variant.findById(variant._id)).stock).toBe(3);
  });
});

// ─── Findings 1+2 on the layaway path, which had its own copy of the loop ─
describe('createLayaway — same pricing guards as finalizeSale', () => {
  let cashier, customer;
  beforeEach(async () => {
    cashier = await makeUser();
    customer = await makeCustomer();
  });

  async function create(items, totalAmount, depositAmount = 1) {
    const req = {
      params: {},
      user: { id: cashier._id.toString() },
      body: { customer: customer._id.toString(), items, totalAmount, deposit: { amount: depositAmount, method: 'cash' } },
    };
    const res = mockRes();
    await layawayController.createLayaway(req, res);
    return res;
  }

  test('rejects an underpriced layaway with omitted discount', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    const res = await create([{ variant: variant._id, quantity: 1 }], 2);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(await Layaway.countDocuments()).toBe(0);
    expect((await Variant.findById(variant._id)).stock).toBe(5);
  });

  test('rejects a negative quantity', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    const res = await create([{ variant: variant._id, quantity: -2, discount: 0 }], 2);
    expect(res.status).toHaveBeenCalledWith(400);
    expect((await Variant.findById(variant._id)).stock).toBe(5);
  });
});

// ─── Finding 3: the public M-Pesa callback trusted any caller who knew a
// CheckoutRequestID ─────────────────────────────────────────────────────
describe('mpesaCallback — forged or mismatched confirmations are refused', () => {
  const TOKEN = process.env.MPESA_CALLBACK_TOKEN;
  let cashier, variant;

  // The receipt-number uniqueness test depends on the index actually existing.
  beforeAll(async () => { await PendingPayment.init(); });

  beforeEach(async () => {
    cashier = await makeUser();
    ({ variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 }));
  });

  async function makePending(checkoutRequestId = `ws_CO_test_${Date.now()}_${Math.random()}`) {
    return PendingPayment.create({
      checkoutRequestId,
      phone: '254700000000',
      amount: 1000,
      cartSnapshot: { items: [{ variant: variant._id.toString(), quantity: 1, discount: 0 }], totalAmount: 1000, paymentMethod: 'mpesa' },
      cashier: cashier._id,
    });
  }

  function callbackBody(checkoutRequestId, { amount = 1000, receipt = `RCPT${Math.random()}`, resultCode = 0 } = {}) {
    return {
      Body: { stkCallback: {
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: 'ok',
        CallbackMetadata: { Item: [{ Name: 'Amount', Value: amount }, { Name: 'MpesaReceiptNumber', Value: receipt }] },
      } },
    };
  }

  async function postCallback(token, body) {
    const res = mockRes();
    await paymentsController.mpesaCallback({ params: { token }, body }, res);
    return res;
  }

  test.each([[undefined], [''], ['wrong-token'], [`${TOKEN}x`]])('rejects token %p and creates no sale', async (token) => {
    const pending = await makePending();
    const res = await postCallback(token, callbackBody(pending.checkoutRequestId));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(await Sale.countDocuments()).toBe(0);
    expect((await PendingPayment.findById(pending._id)).status).toBe('pending');
  });

  test('rejects a callback whose paid amount does not match', async () => {
    const pending = await makePending();
    await postCallback(TOKEN, callbackBody(pending.checkoutRequestId, { amount: 1 }));
    expect(await Sale.countDocuments()).toBe(0);
    expect((await PendingPayment.findById(pending._id)).status).toBe('failed');
  });

  test('rejects a callback with no amount metadata', async () => {
    const pending = await makePending();
    const body = callbackBody(pending.checkoutRequestId);
    delete body.Body.stkCallback.CallbackMetadata;
    await postCallback(TOKEN, body);
    expect(await Sale.countDocuments()).toBe(0);
  });

  test('a valid callback finalizes exactly one sale, even if delivered twice', async () => {
    const pending = await makePending();
    const body = callbackBody(pending.checkoutRequestId, { receipt: 'RCPT-ONCE' });
    await Promise.all([postCallback(TOKEN, body), postCallback(TOKEN, body)]);

    expect(await Sale.countDocuments()).toBe(1);
    const after = await PendingPayment.findById(pending._id);
    expect(after.status).toBe('confirmed');
    expect(after.mpesaReceiptNumber).toBe('RCPT-ONCE');
    expect((await Variant.findById(variant._id)).stock).toBe(4);
  });

  test('a receipt number already used by another payment cannot confirm a second sale', async () => {
    const first = await makePending();
    await postCallback(TOKEN, callbackBody(first.checkoutRequestId, { receipt: 'RCPT-REUSED' }));
    const second = await makePending();
    await postCallback(TOKEN, callbackBody(second.checkoutRequestId, { receipt: 'RCPT-REUSED' }));

    expect(await Sale.countDocuments()).toBe(1);
    expect((await PendingPayment.findById(second._id)).status).toBe('failed');
  });

  test('status endpoint reports the internal processing lock as pending', async () => {
    const pending = await makePending();
    await PendingPayment.updateOne({ _id: pending._id }, { status: 'processing' });
    const res = mockRes();
    await paymentsController.getMpesaStatus({ params: { id: pending._id.toString() } }, res);
    expect(res.json.mock.calls[0][0].status).toBe('pending');
  });
});

// ─── Medium: cashier could reach admin-only catalog/stock/money routes ───
describe('route guards — cashiers are blocked from admin-only writes', () => {
  const routers = {
    sales: require('../routes/sales'),
    variants: require('../routes/variants'),
    styles: require('../routes/styles'),
    purchaseOrders: require('../routes/purchaseOrders'),
    suppliers: require('../routes/suppliers'),
  };

  const isGuard = (fn) => fn === protect || fn === adminOnly || /requiredRole/.test(fn.toString());

  // Runs only the auth/role guards of a route in order. Returns 'blocked'
  // if a guard ended the request with a 4xx, 'allowed' if every guard
  // called next() (i.e. the controller would have run).
  async function runGuards(router, method, path, role) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`No route ${method.toUpperCase()} ${path}`);
    const token = jwt.sign({ id: '000000000000000000000001', role, name: 'x' }, process.env.JWT_SECRET);
    const req = { header: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined) };
    const res = mockRes();
    for (const { handle } of layer.route.stack) {
      if (!isGuard(handle)) continue;
      let passed = false;
      await handle(req, res, () => { passed = true; });
      if (!passed) return { outcome: 'blocked', status: res.status.mock.calls[0]?.[0] };
    }
    return { outcome: 'allowed' };
  }

  test.each([
    ['sales', 'post', '/:id/void'],
    ['sales', 'post', '/:id/return'],
    ['variants', 'put', '/:id'],
    ['styles', 'post', '/'],
    ['styles', 'put', '/:id'],
    ['styles', 'post', '/:styleId/variants'],
    ['purchaseOrders', 'post', '/'],
    ['purchaseOrders', 'post', '/:id/receive'],
    ['purchaseOrders', 'post', '/:id/cancel'],
    ['suppliers', 'post', '/'],
    ['suppliers', 'put', '/:id'],
    ['suppliers', 'delete', '/:id'],
  ])('%s %s %s: cashier 403, admin allowed', async (name, method, path) => {
    const asCashier = await runGuards(routers[name], method, path, 'cashier');
    expect(asCashier).toEqual({ outcome: 'blocked', status: 403 });
    const asAdmin = await runGuards(routers[name], method, path, 'admin');
    expect(asAdmin.outcome).toBe('allowed');
  });

  test('cashiers can still ring up sales', async () => {
    expect((await runGuards(routers.sales, 'post', '/', 'cashier')).outcome).toBe('allowed');
  });
});

// ─── Low findings ────────────────────────────────────────────────────────
describe('escapeRegex', () => {
  test('neutralizes regex metacharacters', () => {
    const escaped = escapeRegex('(a+)+$');
    expect(new RegExp(escaped).test('(a+)+$')).toBe(true);
    expect(new RegExp(escaped).test('aaaa')).toBe(false);
  });

  test('caps search length', () => {
    expect(escapeRegex('x'.repeat(1000)).length).toBe(100);
  });
});

describe('POST /api/audit — client actions are namespaced', () => {
  test('stores client actions under a client: prefix', async () => {
    const user = await makeUser();
    const res = mockRes();
    await auditController.logAction({ user: { id: user.id }, body: { action: 'user_deleted', details: {} } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const entry = await Audit.findOne(); // logAction awaits its own save, unlike logAudit()
    expect(entry.action).toBe('client:user_deleted');
  });

  test('rejects non-string or oversized action names', async () => {
    const user = await makeUser();
    for (const action of [{ $gt: '' }, 'x'.repeat(65), 'has spaces']) {
      const res = mockRes();
      await auditController.logAction({ user: { id: user.id }, body: { action } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });
});

describe('register — minimum password length', () => {
  test('rejects a short password', async () => {
    const res = mockRes();
    await authController.register({ body: { name: 'n', username: `short-${Date.now()}`, password: 'abc', role: 'cashier' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
