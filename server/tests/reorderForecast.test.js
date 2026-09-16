const { getReorderForecast } = require('../controllers/variantController');
const Sale = require('../models/Sale');
const Variant = require('../models/Variant');
const { makeStyleWithVariant, makeUser } = require('./fixtures');

// getReorderForecast is a plain Express handler — call it directly with a
// minimal mock req/res, same convention this app's controllers already use
// (see shiftClose.test.js).
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function runForecast() {
  const req = {};
  const res = mockRes();
  await getReorderForecast(req, res);
  expect(res.status).not.toHaveBeenCalled();
  return res.json.mock.calls[0][0];
}

async function makeBackdatedSale({ variant, quantity, returnedQuantity = 0, daysAgo }) {
  const sale = await Sale.create({
    items: [{ variant: variant._id, styleName: 'Test', size: variant.size, color: variant.color, unitPrice: 500, quantity, returnedQuantity }],
    totalAmount: 500 * quantity,
    paymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 500 * quantity }],
    cashier: (await makeUser())._id,
  });
  // Raw collection.updateOne so Mongoose's own default-on-create logic (and
  // any timestamps re-stamping) never overrides the backdated value.
  await Sale.collection.updateOne({ _id: sale._id }, { $set: { createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000) } });
  return sale;
}

describe('GET /variants/forecast', () => {
  test('computes velocity/daysUntilStockout/suggestedReorderQty correctly for a variant with recent sales', async () => {
    const { variant } = await makeStyleWithVariant({}, { stock: 10 });
    await makeBackdatedSale({ variant, quantity: 30, daysAgo: 5 }); // within the 30-day window

    const body = await runForecast();
    const row = body.forecast.find((r) => r.variantId.toString() === variant._id.toString());
    expect(row).toBeTruthy();
    expect(row.unitsSoldInWindow).toBe(30);
    expect(row.velocityPerDay).toBe(1); // 30 units / 30-day window
    expect(row.daysUntilStockout).toBe(10); // 10 stock / 1 per day
    expect(row.suggestedReorderQty).toBe(4); // ceil(1 * 14) - 10
  });

  test('a sale outside the trailing window is excluded from velocity', async () => {
    const { variant } = await makeStyleWithVariant({}, { stock: 10 });
    await makeBackdatedSale({ variant, quantity: 30, daysAgo: 40 }); // outside the 30-day window

    const body = await runForecast();
    const row = body.forecast.find((r) => r.variantId.toString() === variant._id.toString());
    expect(row).toBeUndefined();
  });

  test('returned quantity nets out of unitsSold', async () => {
    const { variant } = await makeStyleWithVariant({}, { stock: 5 });
    await makeBackdatedSale({ variant, quantity: 20, returnedQuantity: 10, daysAgo: 3 }); // net 10

    const body = await runForecast();
    const row = body.forecast.find((r) => r.variantId.toString() === variant._id.toString());
    expect(row.unitsSoldInWindow).toBe(10);
    expect(row.daysUntilStockout).toBe(15); // 5 / (10/30)
  });

  test('a variant with no recent sales is excluded entirely, not shown with zero velocity', async () => {
    const { variant } = await makeStyleWithVariant({}, { stock: 3 });
    // No sales at all for this variant.
    const body = await runForecast();
    const row = body.forecast.find((r) => r.variantId.toString() === variant._id.toString());
    expect(row).toBeUndefined();
  });

  test('a variant deactivated after its sale is skipped gracefully rather than crashing the report', async () => {
    const { variant } = await makeStyleWithVariant({}, { stock: 8 });
    await makeBackdatedSale({ variant, quantity: 15, daysAgo: 2 });
    await Variant.findByIdAndUpdate(variant._id, { active: false });

    const body = await runForecast();
    const row = body.forecast.find((r) => r.variantId.toString() === variant._id.toString());
    expect(row).toBeUndefined();
  });

  test('multiple variants are sorted ascending by days until stockout (most urgent first)', async () => {
    const { variant: urgent } = await makeStyleWithVariant({}, { stock: 5 });
    await makeBackdatedSale({ variant: urgent, quantity: 30, daysAgo: 1 }); // velocity 1/day -> 5 days left

    const { variant: relaxed } = await makeStyleWithVariant({}, { stock: 20 });
    await makeBackdatedSale({ variant: relaxed, quantity: 15, daysAgo: 1 }); // velocity 0.5/day -> 40 days left

    const body = await runForecast();
    const urgentIdx = body.forecast.findIndex((r) => r.variantId.toString() === urgent._id.toString());
    const relaxedIdx = body.forecast.findIndex((r) => r.variantId.toString() === relaxed._id.toString());
    expect(urgentIdx).toBeGreaterThanOrEqual(0);
    expect(relaxedIdx).toBeGreaterThanOrEqual(0);
    expect(urgentIdx).toBeLessThan(relaxedIdx);
  });
});
