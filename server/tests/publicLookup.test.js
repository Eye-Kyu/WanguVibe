const { requestStoreCreditCode, verifyStoreCreditCode, getGiftCardBalance } = require('../controllers/publicLookupController');
const { getOutbox, clearOutbox } = require('../services/sms');
const { makeCustomer, makeGiftCard } = require('./fixtures');

// Plain Express handlers — call directly with a minimal mock req/res, same
// convention this app's controllers already use (see shiftClose.test.js).
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Store credit is SMS-verified: request a code, then verify it. The old
// phone-only lookup let anyone read a customer's name and balance.
describe('POST /public/store-credit (SMS code)', () => {
  beforeEach(() => clearOutbox());

  async function requestCode(phone) {
    const res = mockRes();
    await requestStoreCreditCode({ body: { phone } }, res);
    return res;
  }
  async function verify(phone, code) {
    const res = mockRes();
    await verifyStoreCreditCode({ body: { phone, code } }, res);
    return res;
  }
  const lastCode = () => getOutbox().at(-1)?.message.match(/\b(\d{6})\b/)?.[1];

  test('texts a code to the number on file and reveals the balance only after verifying', async () => {
    const customer = await makeCustomer({ phone: '0700111222', storeCreditBalance: 450, notes: 'VIP — allergic to wool' });
    const sent = await requestCode('+254 700 111 222'); // different formatting, same number
    expect(sent.status).not.toHaveBeenCalled();
    expect(getOutbox()).toHaveLength(1);
    expect(getOutbox()[0].to).toBe('+254700111222');

    const res = await verify('0700111222', lastCode());
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ name: customer.name, storeCreditBalance: 450 });
    expect(body.notes).toBeUndefined();
    expect(body.phone).toBeUndefined();
  });

  test('responds identically for unknown numbers and sends nothing', async () => {
    await makeCustomer({ phone: '0700111222' });
    const known = await requestCode('0700111222');
    const unknown = await requestCode('0799999999');
    expect(unknown.json.mock.calls[0][0]).toEqual(known.json.mock.calls[0][0]);
    expect(getOutbox()).toHaveLength(1);
  });

  test('rejects a wrong code, and locks out after five wrong tries', async () => {
    await makeCustomer({ phone: '0700111333' });
    await requestCode('0700111333');
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await verify('0700111333', wrong)).status).toHaveBeenCalledWith(400);
    expect((await verify('0700111333', code)).status).toHaveBeenCalledWith(400);
  });

  test('a code works only once', async () => {
    await makeCustomer({ phone: '0700111444' });
    await requestCode('0700111444');
    const code = lastCode();
    expect((await verify('0700111444', code)).status).not.toHaveBeenCalled();
    expect((await verify('0700111444', code)).status).toHaveBeenCalledWith(400);
  });

  test('throttles resends to one per minute per customer', async () => {
    await makeCustomer({ phone: '0700111555' });
    await requestCode('0700111555');
    await requestCode('0700111555');
    expect(getOutbox()).toHaveLength(1);
  });

  test('400s for a missing or invalid phone', async () => {
    expect((await requestCode(undefined)).status).toHaveBeenCalledWith(400);
    expect((await requestCode('12345')).status).toHaveBeenCalledWith(400);
  });
});

describe('GET /public/gift-card', () => {
  test('returns only code/currentBalance/status for a matching code', async () => {
    const card = await makeGiftCard({ currentBalance: 750 });
    const req = { query: { code: card.code.toLowerCase() } }; // lowercase input, code is stored uppercase
    const res = mockRes();

    await getGiftCardBalance(req, res);

    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ code: card.code, currentBalance: 750, status: 'active' });
    expect(body._id).toBeUndefined();
    expect(body.issuedBySale).toBeUndefined();
  });

  test('404s for a code with no matching gift card', async () => {
    const req = { query: { code: 'NOSUCHCODE' } };
    const res = mockRes();

    await getGiftCardBalance(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('400s when code is missing', async () => {
    const req = { query: {} };
    const res = mockRes();

    await getGiftCardBalance(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
