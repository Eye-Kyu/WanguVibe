// Till-fraud controls: manager-approved discounts, voids instead of deletes,
// and the exceptions report that surfaces who is giving money away.
const bcrypt = require('bcryptjs');
const salesController = require('../controllers/salesController');
const paymentsController = require('../controllers/paymentsController');
const layawayController = require('../controllers/layawayController');
const authController = require('../controllers/authController');
const { getExceptionsReport } = require('../routes/dashboard');
const Sale = require('../models/Sale');
const Variant = require('../models/Variant');
const Customer = require('../models/Customer');
const GiftCard = require('../models/GiftCard');
const User = require('../models/User');
const Shift = require('../models/Shift');
const PendingPayment = require('../models/PendingPayment');
const StoreCreditLedger = require('../models/StoreCreditLedger');
const { MAX_FAILED_ATTEMPTS } = require('../utils/approval');
const { makeStyleWithVariant, makeCustomer, makeGiftCard, makeUser } = require('./fixtures');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const body = (res) => res.json.mock.calls[0][0];
const statusOf = (res) => res.status.mock.calls[0]?.[0];

async function makeApprover(pin = '4321') {
  return makeUser({ role: 'admin', username: `mgr-${Date.now()}-${Math.random()}`, approvalPinHash: await bcrypt.hash(pin, 4) });
}

let cashier;
beforeEach(async () => { cashier = await makeUser(); });

async function ringUp({ discount = 0, cartDiscount = 0, approval, extra = {}, user = cashier, basePrice = 1000 } = {}) {
  const { variant } = await makeStyleWithVariant({ basePrice }, { stock: 5 });
  const total = basePrice * (1 - discount / 100) * (1 - cartDiscount / 100);
  const res = mockRes();
  await salesController.createSale({
    user: { id: user.id, role: user.role },
    body: { items: [{ variant: variant._id, quantity: 1, discount }], totalAmount: total, cartDiscount, paymentMethod: 'cash', approval, ...extra },
  }, res);
  return { res, variant };
}

describe('manager approval for large discounts', () => {
  test('a cashier can give up to the threshold without approval', async () => {
    const { res } = await ringUp({ discount: 20 });
    expect(statusOf(res)).toBe(201);
  });

  test('a cashier needs approval above the threshold', async () => {
    const { res, variant } = await ringUp({ discount: 30 });
    expect(statusOf(res)).toBe(403);
    expect(body(res).code).toBe('APPROVAL_REQUIRED');
    expect((await Variant.findById(variant._id)).stock).toBe(5);
  });

  test('line and cart discounts combine (10% + 15% = 23.5% effective)', async () => {
    const { res } = await ringUp({ discount: 10, cartDiscount: 15 });
    expect(body(res).code).toBe('APPROVAL_REQUIRED');
  });

  test('a valid manager PIN approves it and is recorded on the sale', async () => {
    const mgr = await makeApprover('4321');
    const { res } = await ringUp({ discount: 50, approval: { username: mgr.username, pin: '4321' } });
    expect(statusOf(res)).toBe(201);
    const sale = await Sale.findById(body(res)._id);
    expect(sale.approvedBy.toString()).toBe(mgr.id);
  });

  test('a wrong PIN is rejected', async () => {
    const mgr = await makeApprover('4321');
    const { res } = await ringUp({ discount: 50, approval: { username: mgr.username, pin: '0000' } });
    expect(statusOf(res)).toBe(403);
    expect(body(res).code).toBe('APPROVAL_INVALID');
  });

  test('a cashier cannot approve (only admins have PINs that count)', async () => {
    const other = await makeUser({ approvalPinHash: await bcrypt.hash('1111', 4) });
    const { res } = await ringUp({ discount: 50, approval: { username: other.username, pin: '1111' } });
    expect(body(res).code).toBe('APPROVAL_INVALID');
  });

  test('the PIN locks after repeated failures, even for the right PIN', async () => {
    const mgr = await makeApprover('4321');
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await ringUp({ discount: 50, approval: { username: mgr.username, pin: '9999' } });
    }
    const { res } = await ringUp({ discount: 50, approval: { username: mgr.username, pin: '4321' } });
    expect(body(res).error).toMatch(/locked/);
  });

  test('a client cannot claim approval or admin role in the body', async () => {
    const mgr = await makeApprover();
    const { res } = await ringUp({ discount: 50, extra: { approvedBy: mgr.id, cashierRole: 'admin' } });
    expect(body(res).code).toBe('APPROVAL_REQUIRED');
  });

  test('an admin ringing up a sale needs no approval', async () => {
    const admin = await makeUser({ role: 'admin' });
    const { res } = await ringUp({ discount: 50, user: admin });
    expect(statusOf(res)).toBe(201);
  });

  test('M-Pesa checks approval before charging the customer', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const res = mockRes();
    await paymentsController.initiateMpesaPayment({
      user: { id: cashier.id, role: 'cashier' },
      body: { phone: '0700000000', items: [{ variant: variant._id, quantity: 1, discount: 50 }], totalAmount: 500 },
    }, res);
    expect(statusOf(res)).toBe(403);
    expect(await PendingPayment.countDocuments()).toBe(0);
  });

  test('layaways follow the same rule', async () => {
    const customer = await makeCustomer();
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const res = mockRes();
    await layawayController.createLayaway({
      params: {},
      user: { id: cashier.id, role: 'cashier' },
      body: { customer: customer.id, items: [{ variant: variant._id, quantity: 1, discount: 50 }], totalAmount: 500, deposit: { amount: 100, method: 'cash' } },
    }, res);
    expect(statusOf(res)).toBe(403);
  });
});

describe('setting an approval PIN', () => {
  async function setPin(user, password, pin) {
    const res = mockRes();
    await authController.setApprovalPin({ user: { id: user.id }, body: { password, pin } }, res);
    return res;
  }

  test('requires the current password and a 4–8 digit PIN', async () => {
    const admin = await makeUser({ role: 'admin', password: await bcrypt.hash('correct-password', 4) });
    expect(statusOf(await setPin(admin, 'wrong', '1234'))).toBe(400);
    expect(statusOf(await setPin(admin, 'correct-password', '12'))).toBe(400);
    expect(statusOf(await setPin(admin, 'correct-password', 'abcd'))).toBe(400);

    const ok = await setPin(admin, 'correct-password', '1234');
    expect(body(ok).msg).toMatch(/saved/);
    const stored = await User.findById(admin.id);
    expect(await bcrypt.compare('1234', stored.approvalPinHash)).toBe(true);
  });
});

describe('voiding a sale', () => {
  let admin;
  beforeEach(async () => { admin = await makeUser({ role: 'admin' }); });

  async function voidSale(saleId, reason = 'Rung up twice') {
    const res = mockRes();
    await salesController.voidSale({ params: { id: saleId.toString() }, body: { reason }, user: { id: admin.id } }, res);
    return res;
  }

  test('restocks, keeps the record, and books a cash refund on the open shift', async () => {
    const shift = await Shift.create({ openedBy: cashier._id, openingFloat: 0 });
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    const sale = await salesController.finalizeSale({
      items: [{ variant: variant._id, quantity: 2, discount: 0 }], totalAmount: 2000, paymentMethod: 'cash', cashier: cashier.id, shift: shift.id,
    });

    const res = await voidSale(sale._id);
    expect(statusOf(res)).toBeUndefined(); // 200 via res.json

    const after = await Sale.findById(sale._id);
    expect(after.status).toBe('voided');
    expect(after.refundedAmount).toBe(2000);
    expect(after.void.reason).toBe('Rung up twice');
    expect(after.returns).toHaveLength(1);
    expect(after.returns[0]).toMatchObject({ destination: 'cash', amount: 2000 });
    expect((await Variant.findById(variant._id)).stock).toBe(5);
  });

  test('credits store credit and gift card payments straight back', async () => {
    const customer = await makeCustomer({ storeCreditBalance: 600 });
    const card = await makeGiftCard({ currentBalance: 800 });
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await salesController.finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [{ method: 'store_credit', amount: 500, customer: customer.id }, { method: 'gift_card', amount: 500, giftCardCode: card.code }],
      customer: customer.id,
      cashier: cashier.id,
    });
    expect((await Customer.findById(customer.id)).storeCreditBalance).toBe(100);

    await voidSale(sale._id);

    expect((await Customer.findById(customer.id)).storeCreditBalance).toBe(600);
    expect((await GiftCard.findById(card.id)).currentBalance).toBe(800);
    expect(await StoreCreditLedger.countDocuments({ reason: 'void_reversal' })).toBe(1);
  });

  test('voids an unused gift card sold on the sale', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await salesController.finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }], giftCardsSold: [{ amount: 500 }], totalAmount: 1500, paymentMethod: 'cash', cashier: cashier.id,
    });
    await voidSale(sale._id);
    const card = await GiftCard.findOne({ code: sale.giftCardsSold[0].code });
    expect(card.status).toBe('void');
    expect(card.currentBalance).toBe(0);
  });

  test('refuses if a gift card sold on the sale has been spent', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await salesController.finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }], giftCardsSold: [{ amount: 500 }], totalAmount: 1500, paymentMethod: 'cash', cashier: cashier.id,
    });
    await GiftCard.updateOne({ code: sale.giftCardsSold[0].code }, { currentBalance: 100 });

    const res = await voidSale(sale._id);
    expect(statusOf(res)).toBe(400);
    expect((await Sale.findById(sale._id)).status).toBe('completed');
    expect((await Variant.findById(variant._id)).stock).toBe(9); // transaction rolled back
  });

  test('requires a reason, refuses partly-returned sales, and blocks returns afterward', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    const sale = await salesController.finalizeSale({
      items: [{ variant: variant._id, quantity: 2, discount: 0 }], totalAmount: 2000, paymentMethod: 'cash', cashier: cashier.id,
    });
    expect(statusOf(await voidSale(sale._id, '  '))).toBe(400);

    const ret = mockRes();
    await salesController.returnSale({ params: { id: sale.id }, body: { items: [{ variant: variant.id, quantity: 1 }], destination: 'cash' }, user: { id: admin.id } }, ret);
    expect(statusOf(await voidSale(sale._id))).toBe(400);

    const other = await salesController.finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }], totalAmount: 1000, paymentMethod: 'cash', cashier: cashier.id,
    });
    await voidSale(other._id);
    const retAfterVoid = mockRes();
    await salesController.returnSale({ params: { id: other.id }, body: { items: [{ variant: variant.id, quantity: 1 }], destination: 'cash' }, user: { id: admin.id } }, retAfterVoid);
    expect(body(retAfterVoid).error).toMatch(/voided/);
  });
});

describe('exceptions report', () => {
  test('summarizes discounts, approvals, returns, voids and shortfalls per person', async () => {
    const admin = await makeUser({ role: 'admin', name: 'Owner' });
    const mgr = await makeApprover();
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 20 });

    await salesController.finalizeSale({ items: [{ variant: variant._id, quantity: 1, discount: 10 }], totalAmount: 900, paymentMethod: 'cash', cashier: cashier.id });
    await salesController.finalizeSale({ items: [{ variant: variant._id, quantity: 1, discount: 50 }], totalAmount: 500, paymentMethod: 'cash', cashier: cashier.id, approvedBy: mgr.id });
    const toVoid = await salesController.finalizeSale({ items: [{ variant: variant._id, quantity: 1, discount: 0 }], totalAmount: 1000, paymentMethod: 'cash', cashier: cashier.id });
    await salesController.voidSale({ params: { id: toVoid.id }, body: { reason: 'test' }, user: { id: admin.id } }, mockRes());
    await Shift.create({ openedBy: cashier._id, openingFloat: 0, status: 'closed', closedAt: new Date(), discrepancy: -350 });

    const res = mockRes();
    await getExceptionsReport({ query: { range: 'day' } }, res);
    const { staff, totals } = body(res);
    const c = staff.find((s) => s.userId === cashier.id);
    const o = staff.find((s) => s.userId === admin.id);

    expect(c).toMatchObject({ salesCount: 3, discountGiven: 600, discountedSales: 2, approvedDiscounts: 1, worstShortfall: -350, shiftsClosed: 1 });
    expect(c.discountRatePct).toBe(20);
    expect(o).toMatchObject({ voidsCount: 1, voidsAmount: 1000, returnsCount: 0 }); // the void isn't double-counted as a return
    expect(totals.voidsAmount).toBe(1000);
  });
});
