const { buildWeeklySummary, formatWeeklySummary, maybeSendWeeklySummary, isoWeekKey } = require('../services/ownerSummary');
const purchaseOrderController = require('../controllers/purchaseOrderController');
const Sale = require('../models/Sale');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const { getOutbox, clearOutbox } = require('../services/sms');
const { makeStyleWithVariant, makeUser, fakeId } = require('./fixtures');

const DAY = 24 * 60 * 60 * 1000;

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function saleOf(variant, { quantity = 1, unitPrice = 1000, daysAgo = 1, cashier, styleName = 'Linen Shirt' }) {
  return Sale.create({
    items: [{ variant: variant._id, styleName, size: variant.size, color: variant.color, unitPrice, quantity }],
    totalAmount: unitPrice * quantity,
    paymentMethod: 'cash',
    payments: [{ method: 'cash', amount: unitPrice * quantity }],
    cashier: cashier._id,
    createdAt: new Date(Date.now() - daysAgo * DAY),
  });
}

describe('weekly owner summary', () => {
  let cashier;
  beforeEach(async () => { cashier = await makeUser({ name: 'Amina' }); clearOutbox(); });

  test('reports revenue vs last week, top sellers and dead stock', async () => {
    const { variant: hot } = await makeStyleWithVariant({ name: 'Linen Shirt', costPrice: 400 });
    const { variant: dead } = await makeStyleWithVariant({ name: 'Wool Coat', costPrice: 3000 }, { stock: 4, size: 'L', color: 'Grey' });
    await saleOf(hot, { quantity: 3, daysAgo: 2, cashier });
    await saleOf(hot, { quantity: 1, daysAgo: 9, cashier }); // last week

    const s = await buildWeeklySummary();
    expect(s.revenue).toBe(3000);
    expect(s.previousRevenue).toBe(1000);
    expect(s.changePct).toBe(200);
    expect(s.topSellers[0]).toEqual({ name: 'Linen Shirt M/Black', units: 3 });
    expect(s.deadStock[0]).toMatchObject({ name: 'Wool Coat L/Grey', stock: 4, valueAtCost: 12000 });
    expect(s.deadStock.find((d) => d.name.startsWith('Linen'))).toBeUndefined();

    const text = formatWeeklySummary(s);
    expect(text).toMatch(/KES 3,000 from 1 sales \(\+200% vs last wk\)/);
    expect(text).toMatch(/Top: Linen Shirt M\/Black x3/);
    expect(text).toMatch(/Not selling \(30d\): Wool Coat L\/Grey \(4\)/);
    expect(text.length).toBeLessThan(459);
  });

  test('flags refunds needing action and till shortfalls', async () => {
    const PendingPayment = require('../models/PendingPayment');
    const Shift = require('../models/Shift');
    await PendingPayment.create({ checkoutRequestId: 'x1', phone: '254700000000', amount: 500, cartSnapshot: {}, cashier: cashier._id, status: 'refund_required' });
    await Shift.create({ openedBy: cashier._id, openingFloat: 0, status: 'closed', closedAt: new Date(), discrepancy: -800 });
    const text = formatWeeklySummary(await buildWeeklySummary());
    expect(text).toMatch(/till short KES 800 \(Amina\)/);
    expect(text).toMatch(/1 M-Pesa refund\(s\) need action/);
  });

  test('sends only on Monday morning Nairobi time, once per week', async () => {
    process.env.OWNER_SUMMARY_PHONES = '0712345678, 0722000111';
    try {
      const sunday = new Date('2026-11-15T09:00:00Z');
      const mondayEarly = new Date('2026-11-16T04:00:00Z'); // 07:00 EAT
      const mondayLater = new Date('2026-11-16T06:00:00Z'); // 09:00 EAT
      expect((await maybeSendWeeklySummary(sunday)).sent).toBe(false);
      expect((await maybeSendWeeklySummary(mondayEarly)).sent).toBe(false);
      const first = await maybeSendWeeklySummary(mondayLater);
      expect(first.sent).toBe(true);
      expect(first.smsSent).toBe(2);
      expect((await maybeSendWeeklySummary(new Date('2026-11-16T10:00:00Z'))).sent).toBe(false); // same week
      expect(getOutbox().map((m) => m.to)).toEqual(['+254712345678', '+254722000111']);
      expect((await maybeSendWeeklySummary(new Date('2026-11-23T06:00:00Z'))).sent).toBe(true); // next week
    } finally {
      delete process.env.OWNER_SUMMARY_PHONES;
    }
  });

  test('isoWeekKey', () => {
    expect(isoWeekKey(new Date('2026-11-16T06:00:00Z'))).toBe('2026-W47');
    expect(isoWeekKey(new Date('2027-01-01T06:00:00Z'))).toBe('2026-W53');
  });
});

describe('purchase order from the reorder forecast', () => {
  let admin, supplier, cashier;
  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
    cashier = await makeUser();
    supplier = await Supplier.create({ name: 'Gikomba Textiles' });
  });

  async function create(body) {
    const res = mockRes();
    await purchaseOrderController.createFromForecast({ body, user: { id: admin.id } }, res);
    return res;
  }

  test('creates one PO with suggested quantities and cost prices', async () => {
    const { variant } = await makeStyleWithVariant({ name: 'Kitenge Dress', costPrice: 650 }, { stock: 1 });
    await saleOf(variant, { quantity: 30, daysAgo: 3, cashier, styleName: 'Kitenge Dress' }); // 1/day -> 14 days cover

    const res = await create({ supplier: supplier.id, variantIds: [variant.id] });
    expect(res.status).toHaveBeenCalledWith(201);
    const po = await PurchaseOrder.findOne();
    expect(po.items).toHaveLength(1);
    expect(po.items[0]).toMatchObject({ quantityOrdered: 13, unitCost: 650, styleName: 'Kitenge Dress' });
    expect(po.notes).toMatch(/forecast/);
  });

  test('a quantity override wins; items needing nothing are skipped', async () => {
    const { variant: a } = await makeStyleWithVariant({ costPrice: 100 }, { stock: 1 });
    const { variant: b } = await makeStyleWithVariant({ costPrice: 100 }, { stock: 500 });
    await saleOf(a, { quantity: 30, cashier });
    await saleOf(b, { quantity: 1, cashier });

    await create({ supplier: supplier.id, variantIds: [a.id, b.id], quantities: { [a.id]: 40 } });
    const po = await PurchaseOrder.findOne();
    expect(po.items).toHaveLength(1);
    expect(po.items[0].quantityOrdered).toBe(40);
  });

  test('validates input', async () => {
    expect((await create({ variantIds: ['x'] })).status).toHaveBeenCalledWith(400);
    expect((await create({ supplier: supplier.id, variantIds: [] })).status).toHaveBeenCalledWith(400);
    expect((await create({ supplier: fakeId().toString(), variantIds: [fakeId().toString()] })).status).toHaveBeenCalledWith(404);
    const { variant } = await makeStyleWithVariant({}, { stock: 100 });
    expect((await create({ supplier: supplier.id, variantIds: [variant.id], quantities: { [variant.id]: -3 } })).status).toHaveBeenCalledWith(400);
  });
});
