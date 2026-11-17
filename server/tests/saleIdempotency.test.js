// A till that loses the response to POST /sales (flaky Wi-Fi) and retries —
// or replays its offline queue — must never record the same sale twice.
const salesController = require('../controllers/salesController');
const Sale = require('../models/Sale');
const Variant = require('../models/Variant');
const { makeStyleWithVariant, makeUser } = require('./fixtures');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeAll(async () => { await Sale.init(); });

let cashier, variant;
beforeEach(async () => {
  cashier = await makeUser();
  ({ variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 }));
});

async function post(clientSaleId, user = cashier) {
  const res = mockRes();
  await salesController.createSale({
    user: { id: user.id, role: user.role },
    body: { items: [{ variant: variant._id, quantity: 1, discount: 0 }], totalAmount: 1000, paymentMethod: 'cash', clientSaleId },
  }, res);
  return res;
}

test('a retried sale with the same clientSaleId returns the original', async () => {
  const first = await post('till1-2026-0001');
  const second = await post('till1-2026-0001');

  expect(first.status).toHaveBeenCalledWith(201);
  expect(second.status).toHaveBeenCalledWith(200);
  expect(second.json.mock.calls[0][0]._id.toString()).toBe(first.json.mock.calls[0][0]._id.toString());
  expect(await Sale.countDocuments()).toBe(1);
  expect((await Variant.findById(variant._id)).stock).toBe(4);
});

test('concurrent duplicates still produce exactly one sale', async () => {
  const results = await Promise.all([post('till1-race-0001'), post('till1-race-0001'), post('till1-race-0001')]);
  expect(await Sale.countDocuments()).toBe(1);
  expect((await Variant.findById(variant._id)).stock).toBe(4);
  const ids = new Set(results.map((r) => r.json.mock.calls[0][0]._id?.toString()).filter(Boolean));
  expect(ids.size).toBe(1);
});

test('different clientSaleIds are different sales', async () => {
  await post('till1-2026-0002');
  await post('till1-2026-0003');
  expect(await Sale.countDocuments()).toBe(2);
});

test("another cashier can't fetch someone else's sale by guessing its key", async () => {
  await post('till1-2026-0004');
  const other = await makeUser();
  const res = await post('till1-2026-0004', other);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(await Sale.countDocuments()).toBe(1);
});

test('a malformed clientSaleId is rejected', async () => {
  const res = await post('x');
  expect(res.status).toHaveBeenCalledWith(400);
});

test('sales without a clientSaleId still work as before', async () => {
  const res = await post(undefined);
  expect(res.status).toHaveBeenCalledWith(201);
});
