const { getMarginReport } = require('../routes/dashboard');
const Sale = require('../models/Sale');
const Variant = require('../models/Variant');
const { makeStyleWithVariant, makeUser } = require('./fixtures');

// getMarginReport is a plain Express handler — call it directly with a
// minimal mock req/res rather than standing up an HTTP server, same
// convention this app's controllers already use (see shiftClose.test.js).
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function runReport(range = 'month') {
  const req = { query: { range } };
  const res = mockRes();
  await getMarginReport(req, res);
  expect(res.status).not.toHaveBeenCalled();
  return res.json.mock.calls[0][0];
}

describe('GET /dashboard/margins', () => {
  let cashier;
  beforeEach(async () => {
    cashier = await makeUser();
  });

  test('a plain sale reports revenue/cost/grossProfit/marginPct correctly', async () => {
    const { style, variant } = await makeStyleWithVariant({ costPrice: 400, category: 'Tops' });
    await Sale.create({
      items: [{ variant: variant._id, styleName: style.name, size: variant.size, color: variant.color, unitPrice: 1000, quantity: 2 }],
      totalAmount: 2000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 2000 }],
      cashier: cashier._id,
    });

    const body = await runReport();
    expect(body.totals.revenue).toBe(2000);
    expect(body.totals.cost).toBe(800); // 400 * 2
    expect(body.totals.grossProfit).toBe(1200);
    expect(body.totals.marginPct).toBe(60);
  });

  test('per-line discount and cart-level discount both reduce revenue exactly as finalizeSale would', async () => {
    const { variant } = await makeStyleWithVariant({ costPrice: 400 });
    // unitPrice 1000 * qty 1 * (1 - 10%) = 900, then * (1 - 20% cart) = 720
    await Sale.create({
      items: [{ variant: variant._id, styleName: 'Discounted Item', size: variant.size, color: variant.color, unitPrice: 1000, quantity: 1, discount: 10 }],
      totalAmount: 720,
      cartDiscount: 20,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 720 }],
      cashier: cashier._id,
    });

    const body = await runReport();
    expect(body.totals.revenue).toBeCloseTo(720);
    expect(body.totals.cost).toBe(400); // netQty 1 * costPrice 400 — cost isn't discounted
    expect(body.totals.grossProfit).toBeCloseTo(320);
  });

  test('a partial return zeroes out the returned portion of that line', async () => {
    const { variant } = await makeStyleWithVariant({ costPrice: 300 });
    // quantity 3, 1 returned -> netQty 2
    await Sale.create({
      items: [{ variant: variant._id, styleName: 'Partially Returned', size: variant.size, color: variant.color, unitPrice: 1000, quantity: 3, returnedQuantity: 1 }],
      totalAmount: 3000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 3000 }],
      cashier: cashier._id,
    });

    const body = await runReport();
    expect(body.totals.revenue).toBe(2000); // 1000 * 2
    expect(body.totals.cost).toBe(600); // 300 * 2
    expect(body.totals.grossProfit).toBe(1400);
  });

  test('a fully-returned sale contributes nothing at all', async () => {
    const { variant } = await makeStyleWithVariant({ costPrice: 300 });
    await Sale.create({
      items: [{ variant: variant._id, styleName: 'Fully Returned', size: variant.size, color: variant.color, unitPrice: 1000, quantity: 2, returnedQuantity: 2 }],
      totalAmount: 2000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 2000 }],
      cashier: cashier._id,
      status: 'returned',
    });

    const body = await runReport();
    expect(body.totals.revenue).toBe(0);
    expect(body.totals.cost).toBe(0);
    expect(body.totals.grossProfit).toBe(0);
  });

  test('a sale line whose variant has since been deleted still reports (zero cost, Uncategorized) instead of crashing', async () => {
    const { variant } = await makeStyleWithVariant({ costPrice: 500, category: 'Tops' });
    await Sale.create({
      items: [{ variant: variant._id, styleName: 'Ghost Style', size: variant.size, color: variant.color, unitPrice: 800, quantity: 1 }],
      totalAmount: 800,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 800 }],
      cashier: cashier._id,
    });
    await Variant.findByIdAndDelete(variant._id);

    const body = await runReport();
    const row = body.byStyle.find((r) => r.name === 'Ghost Style');
    expect(row).toBeTruthy();
    expect(row.revenue).toBe(800);
    expect(row.cost).toBe(0);
    expect(row.category).toBe('Uncategorized');
  });

  test('multiple styles across different categories aggregate into the right byStyle/byCategory buckets', async () => {
    const { variant: topVariant } = await makeStyleWithVariant({ costPrice: 200, category: 'Tops' });
    const { variant: bottomVariant } = await makeStyleWithVariant({ costPrice: 300, category: 'Bottoms' });
    await Sale.create({
      items: [
        { variant: topVariant._id, styleName: 'Top A', size: topVariant.size, color: topVariant.color, unitPrice: 1000, quantity: 1 },
        { variant: bottomVariant._id, styleName: 'Bottom B', size: bottomVariant.size, color: bottomVariant.color, unitPrice: 1500, quantity: 1 },
      ],
      totalAmount: 2500,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 2500 }],
      cashier: cashier._id,
    });

    const body = await runReport();
    const topRow = body.byStyle.find((r) => r.name === 'Top A');
    const bottomRow = body.byStyle.find((r) => r.name === 'Bottom B');
    expect(topRow).toMatchObject({ category: 'Tops', revenue: 1000, cost: 200, grossProfit: 800 });
    expect(bottomRow).toMatchObject({ category: 'Bottoms', revenue: 1500, cost: 300, grossProfit: 1200 });

    const topsCategory = body.byCategory.find((r) => r.category === 'Tops');
    const bottomsCategory = body.byCategory.find((r) => r.category === 'Bottoms');
    expect(topsCategory).toMatchObject({ revenue: 1000, cost: 200, grossProfit: 800 });
    expect(bottomsCategory).toMatchObject({ revenue: 1500, cost: 300, grossProfit: 1200 });
  });

  test('a sale outside the requested range window is excluded', async () => {
    const { variant } = await makeStyleWithVariant({ costPrice: 100 });
    const oldSale = await Sale.create({
      items: [{ variant: variant._id, styleName: 'Old Sale', size: variant.size, color: variant.color, unitPrice: 500, quantity: 1 }],
      totalAmount: 500,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 500 }],
      cashier: cashier._id,
    });
    await Sale.collection.updateOne({ _id: oldSale._id }, { $set: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } });

    const body = await runReport('day');
    expect(body.totals.revenue).toBe(0);
  });
});
