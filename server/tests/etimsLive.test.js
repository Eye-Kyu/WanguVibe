// Live-mode eTIMS adapter, exercised against a fake KRA OSCU server on
// localhost. This pins down OUR side of the contract (payload maths,
// sequencing, retry/rejection handling) — it cannot prove KRA's real API
// matches; see the warning at the top of services/etims.js.
const http = require('http');
const { submitInvoice, buildSalesPayload } = require('../services/etims');
const { submitSaleToEtims } = require('../controllers/salesController');
const Sale = require('../models/Sale');
const EtimsRetryQueue = require('../models/EtimsRetryQueue');
const { makeUser, fakeId } = require('./fixtures');

const CFG = { tin: 'P000000000X', branchId: '00', cmcKey: 'test-cmc', taxType: 'B', taxRate: 16, itemClassCode: '5310000000' };

let server, requests, respond;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : null;
      requests.push({ url: req.url, headers: req.headers, body: parsed });
      const { status = 200, json } = respond(parsed);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});
afterAll(() => new Promise((r) => server.close(r)));

const okResponse = (body) => ({
  json: { resultCd: '000', resultMsg: 'It is succeeded', data: { rcptNo: body.invcNo, intrlData: 'INTRL', rcptSign: 'SIGN123', sdcDateTime: '20261117120000', sdcId: 'KRACU0100000001', mrcNo: 'WIS00000001' } },
});

let savedEnv;
beforeEach(() => {
  requests = [];
  respond = okResponse;
  savedEnv = { ...process.env };
  Object.assign(process.env, {
    ETIMS_MODE: 'live',
    ETIMS_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    ETIMS_TIN: CFG.tin,
    ETIMS_BRANCH_ID: CFG.branchId,
    ETIMS_CMC_KEY: CFG.cmcKey,
    ETIMS_TIMEOUT_MS: '2000',
  });
});
afterEach(() => { process.env = savedEnv; });

async function makeSale(overrides = {}) {
  const cashier = await makeUser();
  return Sale.create({
    items: [{ variant: fakeId(), styleName: 'Linen Shirt', size: 'M', color: 'White', unitPrice: 1160, quantity: 1, discount: 0 }],
    totalAmount: 1160,
    paymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 1160 }],
    cashier: cashier._id,
    ...overrides,
  });
}

describe('buildSalesPayload', () => {
  test('backs VAT out of VAT-inclusive prices', () => {
    const payload = buildSalesPayload({
      _id: fakeId(), createdAt: new Date('2026-11-17T09:30:00Z'), cartDiscount: 0, paymentMethod: 'mpesa',
      items: [{ variant: fakeId(), styleName: 'Shirt', size: 'M', color: 'White', unitPrice: 1160, quantity: 2, discount: 0 }],
    }, 7, CFG);

    expect(payload.invcNo).toBe(7);
    expect(payload.salesDt).toBe('20261117');
    expect(payload.pmtTyCd).toBe('06');
    expect(payload.itemList[0]).toMatchObject({ qty: 2, prc: 1160, totAmt: 2320, taxblAmt: 2000, taxAmt: 320, taxTyCd: 'B' });
    expect(payload).toMatchObject({ totAmt: 2320, totTaxblAmt: 2000, totTaxAmt: 320, taxblAmtB: 2000, taxAmtB: 320, taxRtB: 16, taxblAmtA: 0 });
  });

  test('combines line and cart discounts into one effective rate', () => {
    const payload = buildSalesPayload({
      _id: fakeId(), createdAt: new Date(), cartDiscount: 10, paymentMethod: 'cash',
      items: [{ variant: fakeId(), styleName: 'S', size: 'M', color: 'B', unitPrice: 1000, quantity: 1, discount: 10 }],
    }, 1, CFG);
    expect(payload.itemList[0].dcRt).toBe(19); // 1 - 0.9 * 0.9
    expect(payload.itemList[0].totAmt).toBe(810);
  });
});

describe('submitInvoice (live)', () => {
  test('sends auth headers and returns the signed receipt as the QR payload', async () => {
    const sale = await makeSale();
    const result = await submitInvoice(sale);

    expect(result.status).toBe('accepted');
    expect(result.invoiceNumber).toBe('KRACU0100000001/1');
    expect(JSON.parse(result.qrPayload)).toMatchObject({ rcptSign: 'SIGN123', sdcId: 'KRACU0100000001' });
    expect(requests[0].url).toBe('/trnsSales/saveSales');
    expect(requests[0].headers).toMatchObject({ tin: CFG.tin, bhfid: '00', cmckey: 'test-cmc' });
  });

  test('assigns sequential invoice numbers and reuses one on retry', async () => {
    const a = await makeSale();
    const b = await makeSale();
    respond = () => ({ status: 503, json: {} });
    await submitInvoice(a);
    await submitInvoice(a); // retry
    respond = okResponse;
    await submitInvoice(b);

    expect(requests.map((r) => r.body.invcNo)).toEqual([1, 1, 2]);
    expect((await Sale.findById(a._id)).etimsInvoiceSeq).toBe(1);
  });

  test('a 5xx is transient (unreachable)', async () => {
    respond = () => ({ status: 502, json: {} });
    expect((await submitInvoice(await makeSale())).status).toBe('unreachable');
  });

  test('a connection failure is transient (unreachable)', async () => {
    process.env.ETIMS_BASE_URL = 'http://127.0.0.1:1';
    const result = await submitInvoice(await makeSale());
    expect(result.status).toBe('unreachable');
  });

  test('a non-000 result code is a rejection', async () => {
    respond = () => ({ json: { resultCd: '910', resultMsg: 'Invalid item classification' } });
    const result = await submitInvoice(await makeSale());
    expect(result.status).toBe('rejected');
    expect(result.error).toMatch(/910 Invalid item classification/);
  });

  test('refuses to run with missing configuration', async () => {
    delete process.env.ETIMS_CMC_KEY;
    await expect(submitInvoice(await makeSale())).rejects.toThrow(/ETIMS_CMC_KEY/);
  });
});

describe('submitSaleToEtims (live)', () => {
  test('a rejection is parked for a human, not auto-retried', async () => {
    respond = () => ({ json: { resultCd: '910', resultMsg: 'bad data' } });
    const sale = await makeSale();
    await submitSaleToEtims(sale);

    expect((await Sale.findById(sale._id)).etimsStatus).toBe('rejected');
    const entry = await EtimsRetryQueue.findOne({ sale: sale._id });
    expect(entry.status).toBe('abandoned');
    expect(entry.lastError).toMatch(/bad data/);
  });

  test('an outage is queued for automatic retry', async () => {
    respond = () => ({ status: 503, json: {} });
    const sale = await makeSale();
    await submitSaleToEtims(sale);
    expect((await Sale.findById(sale._id)).etimsStatus).toBe('unreachable');
    expect((await EtimsRetryQueue.findOne({ sale: sale._id })).status).toBe('pending');
  });

  test('success records the invoice on the sale', async () => {
    const sale = await makeSale();
    await submitSaleToEtims(sale);
    const after = await Sale.findById(sale._id);
    expect(after.etimsStatus).toBe('accepted');
    expect(after.etimsInvoiceNumber).toBe('KRACU0100000001/1');
  });
});
