const layawayController = require('../controllers/layawayController');
const Layaway = require('../models/Layaway');
const Variant = require('../models/Variant');
const Customer = require('../models/Customer');
const GiftCard = require('../models/GiftCard');
const Sale = require('../models/Sale');
const StoreCreditLedger = require('../models/StoreCreditLedger');
const { makeStyleWithVariant, makeCustomer, makeGiftCard, makeUser, fakeId } = require('./fixtures');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(overrides = {}) {
  return { params: {}, body: {}, user: {}, ...overrides };
}

describe('createLayaway', () => {
  let cashier, customer;
  beforeEach(async () => {
    cashier = await makeUser();
    customer = await makeCustomer();
  });

  async function create(overrides = {}) {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 10 });
    const req = mockReq({
      user: { id: cashier._id.toString() },
      body: {
        customer: customer._id.toString(),
        items: [{ variant: variant._id, quantity: 1, discount: 0 }],
        totalAmount: 1000,
        deposit: { amount: 300, method: 'cash' },
        ...overrides,
      },
    });
    const res = mockRes();
    await layawayController.createLayaway(req, res);
    return { req, res, variant };
  }

  test('reserves stock and creates a layaway with the correct remaining balance', async () => {
    const { res, variant } = await create();
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.balanceRemaining).toBe(700);
    expect(body.payments).toHaveLength(1);
    expect(body.status).toBe('active');

    const updatedVariant = await Variant.findById(variant._id);
    expect(updatedVariant.stock).toBe(9); // reserved immediately, not deferred to completion
  });

  test('rejects when no customer is given', async () => {
    const { res } = await create({ customer: undefined });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects a deposit that is not less than the total', async () => {
    const { res } = await create({ deposit: { amount: 1000, method: 'cash' } });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects a zero/negative deposit', async () => {
    const { res } = await create({ deposit: { amount: 0, method: 'cash' } });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects M-Pesa as a deposit method', async () => {
    const { res } = await create({ deposit: { amount: 300, method: 'mpesa' } });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects insufficient stock, without decrementing it', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 1 });
    const req = mockReq({
      user: { id: cashier._id.toString() },
      body: {
        customer: customer._id.toString(),
        items: [{ variant: variant._id, quantity: 5, discount: 0 }],
        totalAmount: 5000,
        deposit: { amount: 500, method: 'cash' },
      },
    });
    const res = mockRes();
    await layawayController.createLayaway(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const unchanged = await Variant.findById(variant._id);
    expect(unchanged.stock).toBe(1);
  });

  test('rejects a mismatched total, rolling back the stock reservation', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 10 });
    const req = mockReq({
      user: { id: cashier._id.toString() },
      body: {
        customer: customer._id.toString(),
        items: [{ variant: variant._id, quantity: 1, discount: 0 }],
        totalAmount: 50,
        deposit: { amount: 10, method: 'cash' },
      },
    });
    const res = mockRes();
    await layawayController.createLayaway(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const unchanged = await Variant.findById(variant._id);
    expect(unchanged.stock).toBe(10);
  });

  test('a store-credit deposit debits the customer atomically', async () => {
    const richCustomer = await makeCustomer({ storeCreditBalance: 500 });
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 10 });
    const req = mockReq({
      user: { id: cashier._id.toString() },
      body: {
        customer: richCustomer._id.toString(),
        items: [{ variant: variant._id, quantity: 1, discount: 0 }],
        totalAmount: 1000,
        deposit: { amount: 300, method: 'store_credit' },
      },
    });
    const res = mockRes();
    await layawayController.createLayaway(req, res);
    expect(res.status).toHaveBeenCalledWith(201);

    const updatedCustomer = await Customer.findById(richCustomer._id);
    expect(updatedCustomer.storeCreditBalance).toBe(200);
    const ledgerEntry = await StoreCreditLedger.findOne({ customer: richCustomer._id });
    expect(ledgerEntry.reason).toBe('layaway_payment');
    expect(ledgerEntry.amount).toBe(-300);
  });

  test('rejects a store-credit deposit with insufficient balance, rolling back stock', async () => {
    const poorCustomer = await makeCustomer({ storeCreditBalance: 50 });
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 10 });
    const req = mockReq({
      user: { id: cashier._id.toString() },
      body: {
        customer: poorCustomer._id.toString(),
        items: [{ variant: variant._id, quantity: 1, discount: 0 }],
        totalAmount: 1000,
        deposit: { amount: 300, method: 'store_credit' },
      },
    });
    const res = mockRes();
    await layawayController.createLayaway(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const unchangedVariant = await Variant.findById(variant._id);
    expect(unchangedVariant.stock).toBe(10);
  });
});

describe('recordPayment', () => {
  let cashier, customer, layawayId, variantId;

  beforeEach(async () => {
    cashier = await makeUser();
    customer = await makeCustomer();
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 10 });
    variantId = variant._id;
    const createReq = mockReq({
      user: { id: cashier._id.toString() },
      body: {
        customer: customer._id.toString(),
        items: [{ variant: variant._id, quantity: 1, discount: 0 }],
        totalAmount: 1000,
        deposit: { amount: 300, method: 'cash' },
      },
    });
    const createRes = mockRes();
    await layawayController.createLayaway(createReq, createRes);
    layawayId = createRes.json.mock.calls[0][0]._id;
  });

  test('reduces the remaining balance and appends the payment', async () => {
    const req = mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { amount: 200, method: 'cash' } });
    const res = mockRes();
    await layawayController.recordPayment(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.balanceRemaining).toBe(500); // 700 - 200
    expect(body.payments).toHaveLength(2);
  });

  test('rejects a payment exceeding the remaining balance', async () => {
    const req = mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { amount: 9000, method: 'cash' } });
    const res = mockRes();
    await layawayController.recordPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects a payment against a nonexistent layaway', async () => {
    const req = mockReq({ params: { id: fakeId().toString() }, user: { id: cashier._id.toString() }, body: { amount: 100, method: 'cash' } });
    const res = mockRes();
    await layawayController.recordPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('rejects a payment against a cancelled layaway', async () => {
    const cancelReq = mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { destination: 'forfeit' } });
    await layawayController.cancelLayaway(cancelReq, mockRes());

    const req = mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { amount: 100, method: 'cash' } });
    const res = mockRes();
    await layawayController.recordPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('a gift-card installment redeems atomically', async () => {
    const card = await makeGiftCard({ currentBalance: 1000 });
    const req = mockReq({
      params: { id: layawayId.toString() },
      user: { id: cashier._id.toString() },
      body: { amount: 200, method: 'gift_card', giftCardCode: card.code },
    });
    const res = mockRes();
    await layawayController.recordPayment(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);

    const updatedCard = await GiftCard.findById(card._id);
    expect(updatedCard.currentBalance).toBe(800);
  });

  test('two rapid concurrent payments that together exceed the balance: only one succeeds', async () => {
    // Remaining balance is 700 — two 500 payments together overdraw it, and
    // there's no per-line balance guard the way store-credit/gift-card have
    // their own atomic guard, so this exercises recordPayment's own
    // re-fetch-inside-the-transaction check under a real race.
    const attempt = () => layawayController.recordPayment(
      mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { amount: 500, method: 'cash' } }),
      mockRes()
    );
    const results = await Promise.allSettled([attempt(), attempt()]);
    // Both calls resolve (errors are caught and turned into a JSON response,
    // not a rejection), so inspect the final balance instead.
    void results;
    const layaway = await Layaway.findById(layawayId);
    expect(layaway.balanceRemaining).toBeGreaterThanOrEqual(0);
    expect(layaway.payments.reduce((s, p) => s + p.amount, 0)).toBeLessThanOrEqual(1000);
  });
});

describe('completeLayaway', () => {
  let cashier, customer, layawayId, variantId;

  beforeEach(async () => {
    cashier = await makeUser();
    customer = await makeCustomer();
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 10 });
    variantId = variant._id;
    const createRes = mockRes();
    await layawayController.createLayaway(mockReq({
      user: { id: cashier._id.toString() },
      body: {
        customer: customer._id.toString(),
        items: [{ variant: variant._id, quantity: 1, discount: 0 }],
        totalAmount: 1000,
        deposit: { amount: 400, method: 'cash' },
      },
    }), createRes);
    layawayId = createRes.json.mock.calls[0][0]._id;
  });

  test('rejects completion while a balance remains', async () => {
    const req = mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() } });
    const res = mockRes();
    await layawayController.completeLayaway(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('completes once fully paid: creates a Sale, does not touch stock again, marks the layaway completed', async () => {
    await layawayController.recordPayment(
      mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { amount: 600, method: 'card' } }),
      mockRes()
    );

    const stockAfterPayment = (await Variant.findById(variantId)).stock;

    const res = mockRes();
    await layawayController.completeLayaway(mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() } }), res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.layaway.status).toBe('completed');
    expect(body.sale.paymentMethod).toBe('split'); // cash deposit + card installment
    expect(body.sale.payments).toHaveLength(2);
    expect(body.sale.totalAmount).toBe(1000);

    const stockAfterCompletion = (await Variant.findById(variantId)).stock;
    expect(stockAfterCompletion).toBe(stockAfterPayment); // unchanged — already reserved at creation

    const sale = await Sale.findById(body.sale._id);
    expect(sale).toBeTruthy();
    expect(sale.etimsStatus).toBe('accepted'); // mock eTIMS always accepts
  });

  test('rejects completing an already-completed layaway', async () => {
    await layawayController.recordPayment(
      mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { amount: 600, method: 'cash' } }),
      mockRes()
    );
    await layawayController.completeLayaway(mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() } }), mockRes());

    const res = mockRes();
    await layawayController.completeLayaway(mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('cancelLayaway', () => {
  let cashier, customer, layawayId, variantId;

  beforeEach(async () => {
    cashier = await makeUser();
    customer = await makeCustomer();
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 10 });
    variantId = variant._id;
    const createRes = mockRes();
    await layawayController.createLayaway(mockReq({
      user: { id: cashier._id.toString() },
      body: {
        customer: customer._id.toString(),
        items: [{ variant: variant._id, quantity: 2, discount: 0 }],
        totalAmount: 2000,
        deposit: { amount: 500, method: 'cash' },
      },
    }), createRes);
    layawayId = createRes.json.mock.calls[0][0]._id;
  });

  test('rejects an invalid destination', async () => {
    const req = mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { destination: 'bitcoin' } });
    const res = mockRes();
    await layawayController.cancelLayaway(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('forfeit: restocks items, keeps the deposit, marks cancelled', async () => {
    const req = mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { destination: 'forfeit' } });
    const res = mockRes();
    await layawayController.cancelLayaway(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);

    const variant = await Variant.findById(variantId);
    expect(variant.stock).toBe(10); // 8 after reservation + 2 restocked

    const updatedCustomer = await Customer.findById(customer._id);
    expect(updatedCustomer.storeCreditBalance).toBe(0); // forfeited, not refunded
  });

  test('store_credit: restocks items and refunds payments made as store credit', async () => {
    await layawayController.recordPayment(
      mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { amount: 300, method: 'cash' } }),
      mockRes()
    );

    const req = mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { destination: 'store_credit' } });
    const res = mockRes();
    await layawayController.cancelLayaway(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);

    const variant = await Variant.findById(variantId);
    expect(variant.stock).toBe(10);

    const updatedCustomer = await Customer.findById(customer._id);
    expect(updatedCustomer.storeCreditBalance).toBe(800); // 500 deposit + 300 installment refunded

    const ledgerEntry = await StoreCreditLedger.findOne({ reason: 'layaway_refund' });
    expect(ledgerEntry.amount).toBe(800);
  });

  test('rejects cancelling an already-cancelled layaway', async () => {
    await layawayController.cancelLayaway(
      mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { destination: 'forfeit' } }),
      mockRes()
    );
    const res = mockRes();
    await layawayController.cancelLayaway(
      mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { destination: 'forfeit' } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects cancelling a completed layaway', async () => {
    await layawayController.recordPayment(
      mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { amount: 1500, method: 'cash' } }),
      mockRes()
    );
    await layawayController.completeLayaway(mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() } }), mockRes());

    const res = mockRes();
    await layawayController.cancelLayaway(
      mockReq({ params: { id: layawayId.toString() }, user: { id: cashier._id.toString() }, body: { destination: 'forfeit' } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
