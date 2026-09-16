const { getStoreCreditBalance, getGiftCardBalance } = require('../controllers/publicLookupController');
const { makeCustomer, makeGiftCard } = require('./fixtures');

// Plain Express handlers — call directly with a minimal mock req/res, same
// convention this app's controllers already use (see shiftClose.test.js).
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('GET /public/store-credit', () => {
  test('returns only name and storeCreditBalance for a matching phone', async () => {
    const customer = await makeCustomer({ phone: '0700111222', storeCreditBalance: 450, notes: 'VIP — allergic to wool' });
    const req = { query: { phone: '0700111222' } };
    const res = mockRes();

    await getStoreCreditBalance(req, res);

    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ name: customer.name, storeCreditBalance: 450 });
    expect(body.notes).toBeUndefined();
    expect(body.phone).toBeUndefined();
    expect(body.email).toBeUndefined();
    expect(body._id).toBeUndefined();
  });

  test('404s for a phone number with no matching customer', async () => {
    const req = { query: { phone: '0799999999' } };
    const res = mockRes();

    await getStoreCreditBalance(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('400s when phone is missing', async () => {
    const req = { query: {} };
    const res = mockRes();

    await getStoreCreditBalance(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
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
