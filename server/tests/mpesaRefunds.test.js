// A customer charged via M-Pesa for a sale that never completes must get
// their money back — automatically where possible, and loudly flagged for an
// admin where not.
jest.mock('../services/mpesa', () => {
  const actual = jest.requireActual('../services/mpesa');
  return { ...actual, reverseTransaction: jest.fn(actual.reverseTransaction) };
});

const mpesa = require('../services/mpesa');
const paymentsController = require('../controllers/paymentsController');
const PendingPayment = require('../models/PendingPayment');
const Sale = require('../models/Sale');
const Audit = require('../models/Audit');
const { makeStyleWithVariant, makeUser } = require('./fixtures');

const TOKEN = process.env.MPESA_CALLBACK_TOKEN;

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// logAudit() is fire-and-forget, so poll briefly for the row to land.
async function auditCount(action, expected, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let n = await Audit.countDocuments({ action });
  while (n < expected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
    n = await Audit.countDocuments({ action });
  }
  return n;
}

let seq = 0;
async function makePending({ cashier, variant, status = 'pending', amount = 1000 }) {
  seq += 1;
  return PendingPayment.create({
    checkoutRequestId: `ws_CO_refund_${Date.now()}_${seq}`,
    phone: '254700000000',
    amount,
    status,
    cartSnapshot: { items: [{ variant: variant._id.toString(), quantity: 1, discount: 0 }], totalAmount: amount, paymentMethod: 'mpesa' },
    cashier: cashier._id,
  });
}

function paidCallback(pending, receipt = `RCPT${Date.now()}${seq}`) {
  return {
    params: { token: TOKEN },
    body: { Body: { stkCallback: {
      CheckoutRequestID: pending.checkoutRequestId,
      ResultCode: 0,
      ResultDesc: 'ok',
      CallbackMetadata: { Item: [{ Name: 'Amount', Value: pending.amount }, { Name: 'MpesaReceiptNumber', Value: receipt }] },
    } } },
  };
}

beforeAll(async () => { await PendingPayment.init(); });

let cashier;
beforeEach(async () => {
  mpesa.reverseTransaction.mockClear();
  cashier = await makeUser();
});

describe('automatic refunds', () => {
  test('refunds when the sale cannot be finalized after payment (sold out mid-PIN)', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 0 });
    const pending = await makePending({ cashier, variant });

    await paymentsController.mpesaCallback(paidCallback(pending, 'RCPT-SOLDOUT'), mockRes());

    const after = await PendingPayment.findById(pending._id);
    expect(after.status).toBe('refunded'); // mock reversal completes immediately
    expect(after.refund.reason).toMatch(/sale could not be completed/);
    expect(after.refund.completedAt).toBeTruthy();
    expect(mpesa.reverseTransaction).toHaveBeenCalledWith({ receipt: 'RCPT-SOLDOUT', amount: 1000 });
    expect(await Sale.countDocuments()).toBe(0);
    expect(await auditCount('mpesa_refund_required', 1)).toBe(1);
    expect(await auditCount('mpesa_refund_completed', 1)).toBe(1);
  });

  test('refunds a payment that arrives after the till timed out, without creating a sale', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    const pending = await makePending({ cashier, variant, status: 'timed_out' });

    await paymentsController.mpesaCallback(paidCallback(pending), mockRes());

    const after = await PendingPayment.findById(pending._id);
    expect(after.status).toBe('refunded');
    expect(after.refund.reason).toMatch(/after the till stopped waiting/);
    expect(await Sale.countDocuments()).toBe(0);
  });

  test('a failed (unpaid) callback on a timed-out payment needs no refund', async () => {
    const { variant } = await makeStyleWithVariant();
    const pending = await makePending({ cashier, variant, status: 'timed_out' });
    const req = paidCallback(pending);
    req.body.Body.stkCallback.ResultCode = 1032;

    await paymentsController.mpesaCallback(req, mockRes());

    expect((await PendingPayment.findById(pending._id)).status).toBe('failed');
    expect(mpesa.reverseTransaction).not.toHaveBeenCalled();
  });

  test('stays refund_required when the reversal request itself fails', async () => {
    mpesa.reverseTransaction.mockRejectedValueOnce(new Error('Daraja unreachable'));
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 0 });
    const pending = await makePending({ cashier, variant });

    await paymentsController.mpesaCallback(paidCallback(pending), mockRes());

    const after = await PendingPayment.findById(pending._id);
    expect(after.status).toBe('refund_required');
    expect(after.refund.lastError).toBe('Daraja unreachable');
    expect(after.refund.attempts).toBe(1);
  });

  test('a live-mode reversal is tracked as requested until Daraja reports back', async () => {
    mpesa.reverseTransaction.mockResolvedValueOnce({ status: 'requested', conversationId: 'AG_conv_1' });
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 0 });
    const pending = await makePending({ cashier, variant });

    await paymentsController.mpesaCallback(paidCallback(pending), mockRes());
    expect((await PendingPayment.findById(pending._id)).status).toBe('refund_requested');

    await paymentsController.mpesaReversalResult({ params: { token: TOKEN }, body: { Result: { ConversationID: 'AG_conv_1', ResultCode: 0 } } }, mockRes());
    expect((await PendingPayment.findById(pending._id)).status).toBe('refunded');
  });

  test('a failed reversal result puts it back to refund_required', async () => {
    mpesa.reverseTransaction.mockResolvedValueOnce({ status: 'requested', conversationId: 'AG_conv_2' });
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 0 });
    const pending = await makePending({ cashier, variant });
    await paymentsController.mpesaCallback(paidCallback(pending), mockRes());

    await paymentsController.mpesaReversalResult({ params: { token: TOKEN }, body: { Result: { ConversationID: 'AG_conv_2', ResultCode: 2001, ResultDesc: 'Initiator invalid' } } }, mockRes());

    const after = await PendingPayment.findById(pending._id);
    expect(after.status).toBe('refund_required');
    expect(after.refund.lastError).toBe('Initiator invalid');
  });

  test('reversal results require the secret token', async () => {
    const res = mockRes();
    await paymentsController.mpesaReversalResult({ params: { token: 'nope' }, body: { Result: { ConversationID: 'x', ResultCode: 0 } } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('a replayed receipt is rejected without issuing a refund', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    const first = await makePending({ cashier, variant });
    await paymentsController.mpesaCallback(paidCallback(first, 'RCPT-DUP'), mockRes());
    const second = await makePending({ cashier, variant });
    await paymentsController.mpesaCallback(paidCallback(second, 'RCPT-DUP'), mockRes());

    expect((await PendingPayment.findById(second._id)).status).toBe('failed');
    expect(mpesa.reverseTransaction).not.toHaveBeenCalled();
  });
});

describe('admin refund endpoints', () => {
  test('lists only refund-state payments, without the cart snapshot', async () => {
    const { variant } = await makeStyleWithVariant();
    await makePending({ cashier, variant, status: 'refund_required' });
    await makePending({ cashier, variant, status: 'confirmed' });
    const res = mockRes();
    await paymentsController.getRefunds({ query: {} }, res);
    const rows = res.json.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('refund_required');
    expect(rows[0].cartSnapshot).toBeUndefined();
  });

  test('manual settlement requires a note and is audited', async () => {
    const admin = await makeUser({ role: 'admin' });
    const { variant } = await makeStyleWithVariant();
    const pending = await makePending({ cashier, variant, status: 'refund_required' });

    const noNote = mockRes();
    await paymentsController.retryRefund({ params: { id: pending._id.toString() }, body: { manual: true }, user: { id: admin.id } }, noNote);
    expect(noNote.status).toHaveBeenCalledWith(400);

    const ok = mockRes();
    await paymentsController.retryRefund({ params: { id: pending._id.toString() }, body: { manual: true, note: 'Cash handed back at till 2' }, user: { id: admin.id } }, ok);
    expect(ok.json.mock.calls[0][0].status).toBe('refunded');
    expect(await auditCount('mpesa_refund_manual', 1)).toBe(1);
  });

  test('retry re-attempts the reversal', async () => {
    const admin = await makeUser({ role: 'admin' });
    const { variant } = await makeStyleWithVariant();
    const pending = await makePending({ cashier, variant, status: 'refund_required' });
    pending.mpesaReceiptNumber = 'RCPT-RETRY';
    await pending.save();

    const res = mockRes();
    await paymentsController.retryRefund({ params: { id: pending._id.toString() }, body: {}, user: { id: admin.id } }, res);
    expect(res.json.mock.calls[0][0].status).toBe('refunded');
    expect(mpesa.reverseTransaction).toHaveBeenCalledWith({ receipt: 'RCPT-RETRY', amount: 1000 });
  });

  test('the till sees refund states as a plain failure', async () => {
    const { variant } = await makeStyleWithVariant();
    const pending = await makePending({ cashier, variant, status: 'refunded' });
    const res = mockRes();
    await paymentsController.getMpesaStatus({ params: { id: pending._id.toString() } }, res);
    expect(res.json.mock.calls[0][0].status).toBe('failed');
  });
});
