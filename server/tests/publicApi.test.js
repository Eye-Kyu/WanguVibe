const apiKeyAuth = require('../middleware/apiKeyAuth');
const { createApiKey, getAllApiKeys, revokeApiKey } = require('../controllers/apiKeyController');
const { getSales, getStyles, getVariants } = require('../controllers/publicApiController');
const ApiKey = require('../models/ApiKey');
const Sale = require('../models/Sale');
const { makeUser, makeStyleWithVariant } = require('./fixtures');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('apiKeyAuth middleware', () => {
  let admin, rawKey;
  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
    const req = { body: { label: 'Test Integration' }, user: { id: admin._id.toString() } };
    const res = mockRes();
    await createApiKey(req, res);
    rawKey = res.json.mock.calls[0][0].key;
  });

  test('a valid, active key passes through and updates lastUsedAt', async () => {
    const req = { header: (name) => (name === 'X-API-Key' ? rawKey : undefined) };
    const res = mockRes();
    const next = jest.fn();

    await apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.apiKey).toBeTruthy();
    // lastUsedAt update is fire-and-forget — poll (bounded) for it to land;
    // a fixed short sleep was flaky on slower CI runners.
    let stored = await ApiKey.findById(req.apiKey._id);
    for (let i = 0; i < 40 && !stored.lastUsedAt; i++) {
      await new Promise((r) => setTimeout(r, 50));
      stored = await ApiKey.findById(req.apiKey._id);
    }
    expect(stored.lastUsedAt).toBeTruthy();
  });

  test('a missing key is rejected with 401', async () => {
    const req = { header: () => undefined };
    const res = mockRes();
    const next = jest.fn();

    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('an invalid key is rejected with 401', async () => {
    const req = { header: () => 'not-a-real-key' };
    const res = mockRes();
    const next = jest.fn();

    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('a revoked key is rejected with 401', async () => {
    const listRes = mockRes();
    await getAllApiKeys({}, listRes);
    const keyDoc = listRes.json.mock.calls[0][0][0];

    const revokeReq = { params: { id: keyDoc._id.toString() } };
    await revokeApiKey(revokeReq, mockRes());

    const req = { header: () => rawKey };
    const res = mockRes();
    const next = jest.fn();
    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('createApiKey / getAllApiKeys', () => {
  test('the raw key is returned once at creation and never again from the list', async () => {
    const admin = await makeUser({ role: 'admin' });
    const req = { body: { label: 'Accounting Export' }, user: { id: admin._id.toString() } };
    const res = mockRes();
    await createApiKey(req, res);
    expect(res.json.mock.calls[0][0].key).toBeTruthy();

    const listRes = mockRes();
    await getAllApiKeys({}, listRes);
    const listed = listRes.json.mock.calls[0][0];
    expect(listed[0].key).toBeUndefined();
    expect(listed[0].keyHash).toBeUndefined();
  });
});

describe('GET /v1/sales, /v1/styles, /v1/variants', () => {
  test('getSales returns a minimal, paginated projection', async () => {
    const { variant } = await makeStyleWithVariant();
    const cashier = await makeUser();
    await Sale.create({
      items: [{ variant: variant._id, styleName: 'Test', size: variant.size, color: variant.color, unitPrice: 500, quantity: 2 }],
      totalAmount: 1000,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 1000 }],
      cashier: cashier._id,
    });

    const req = { query: {} };
    const res = mockRes();
    await getSales(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ totalAmount: 1000, paymentMethod: 'cash', itemCount: 2 });
    expect(body.total).toBe(1);
  });

  test('getStyles returns the catalog', async () => {
    await makeStyleWithVariant({ name: 'Public API Test Style' });

    const req = { query: {} };
    const res = mockRes();
    await getStyles(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.some((s) => s.name === 'Public API Test Style')).toBe(true);
  });

  test('getVariants returns stock levels', async () => {
    const { variant } = await makeStyleWithVariant({}, { stock: 42 });

    const req = { query: {} };
    const res = mockRes();
    await getVariants(req, res);

    const body = res.json.mock.calls[0][0];
    const row = body.data.find((v) => v._id.toString() === variant._id.toString());
    expect(row.stock).toBe(42);
  });

  test('pagination respects page/limit params', async () => {
    for (let i = 0; i < 3; i++) await makeStyleWithVariant();

    const req = { query: { page: 1, limit: 2 } };
    const res = mockRes();
    await getStyles(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data).toHaveLength(2);
    expect(body.limit).toBe(2);
    expect(body.total).toBeGreaterThanOrEqual(3);
  });
});
