const Sentry = require('@sentry/node');
const Sale = require('../models/Sale');
const EtimsRetryQueue = require('../models/EtimsRetryQueue');
const PendingPayment = require('../models/PendingPayment');
const { sweepEtimsRetryQueue, sweepStalePendingPayments } = require('../services/scheduledJobs');
const { makeStyleWithVariant, makeUser, fakeId } = require('./fixtures');

async function makeSale(cashier, overrides = {}) {
  const { variant } = await makeStyleWithVariant();
  return Sale.create({
    items: [{ variant: variant._id, styleName: 'Test', size: 'M', color: 'Black', unitPrice: 1000, quantity: 1 }],
    totalAmount: 1000,
    paymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 1000 }],
    cashier: cashier._id,
    etimsStatus: 'unreachable',
    ...overrides,
  });
}

describe('sweepEtimsRetryQueue', () => {
  let cashier;
  beforeEach(async () => {
    cashier = await makeUser();
  });

  test('resolves a pending entry when the retry succeeds (mock eTIMS always accepts)', async () => {
    const sale = await makeSale(cashier);
    const entry = await EtimsRetryQueue.create({ sale: sale._id, lastError: 'previous failure', attempts: 1 });

    await sweepEtimsRetryQueue();

    const updatedEntry = await EtimsRetryQueue.findById(entry._id);
    expect(updatedEntry.status).toBe('resolved');

    const updatedSale = await Sale.findById(sale._id);
    expect(updatedSale.etimsStatus).toBe('accepted');
    expect(updatedSale.etimsInvoiceNumber).toBeTruthy();
  });

  test('abandons an entry that has hit the max-attempts ceiling without attempting another submission', async () => {
    const sale = await makeSale(cashier);
    const entry = await EtimsRetryQueue.create({ sale: sale._id, lastError: 'previous failure', attempts: 10 });

    await sweepEtimsRetryQueue();

    const updatedEntry = await EtimsRetryQueue.findById(entry._id);
    expect(updatedEntry.status).toBe('abandoned');
    expect(updatedEntry.attempts).toBe(10); // unchanged — never retried

    const updatedSale = await Sale.findById(sale._id);
    expect(updatedSale.etimsStatus).toBe('unreachable'); // unchanged — never retried
  });

  test('abandons an entry whose sale no longer exists', async () => {
    const entry = await EtimsRetryQueue.create({ sale: fakeId(), lastError: 'previous failure' });

    await sweepEtimsRetryQueue();

    const updatedEntry = await EtimsRetryQueue.findById(entry._id);
    expect(updatedEntry.status).toBe('abandoned');
  });

  test('leaves resolved/abandoned entries alone', async () => {
    const sale = await makeSale(cashier);
    const resolvedEntry = await EtimsRetryQueue.create({ sale: sale._id, status: 'resolved' });

    await sweepEtimsRetryQueue();

    const unchanged = await EtimsRetryQueue.findById(resolvedEntry._id);
    expect(unchanged.status).toBe('resolved');
    const unchangedSale = await Sale.findById(sale._id);
    expect(unchangedSale.etimsStatus).toBe('unreachable'); // sweep never touched it
  });

  test('alerts via Sentry when the pending backlog exceeds the threshold', async () => {
    const captureSpy = jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => {});
    try {
      for (let i = 0; i < 7; i++) {
        const sale = await makeSale(cashier);
        await EtimsRetryQueue.create({ sale: sale._id, attempts: 10 }); // abandoned immediately, but still counted before the sweep abandons it
      }
      await sweepEtimsRetryQueue();
      expect(captureSpy).toHaveBeenCalled();
    } finally {
      captureSpy.mockRestore();
    }
  });
});

describe('sweepStalePendingPayments', () => {
  let cashier;
  beforeEach(async () => {
    cashier = await makeUser();
  });

  test('marks an old pending payment as timed out', async () => {
    const pending = await PendingPayment.create({
      checkoutRequestId: `stale-${Date.now()}`,
      phone: '254700000000',
      amount: 500,
      cartSnapshot: {},
      cashier: cashier._id,
      status: 'pending',
    });
    // Backdate createdAt past the staleness window via the raw driver —
    // Mongoose's `timestamps: true` plugin re-stamps createdAt/updatedAt on
    // its own update-query hooks, silently overriding a Mongoose-level update.
    await PendingPayment.collection.updateOne({ _id: pending._id }, { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });

    await sweepStalePendingPayments();

    const updated = await PendingPayment.findById(pending._id);
    expect(updated.status).toBe('timed_out');
  });

  test('leaves a recent pending payment alone', async () => {
    const pending = await PendingPayment.create({
      checkoutRequestId: `fresh-${Date.now()}`,
      phone: '254700000000',
      amount: 500,
      cartSnapshot: {},
      cashier: cashier._id,
      status: 'pending',
    });

    await sweepStalePendingPayments();

    const updated = await PendingPayment.findById(pending._id);
    expect(updated.status).toBe('pending');
  });

  test('leaves an already-resolved payment alone even if old', async () => {
    const pending = await PendingPayment.create({
      checkoutRequestId: `confirmed-${Date.now()}`,
      phone: '254700000000',
      amount: 500,
      cartSnapshot: {},
      cashier: cashier._id,
      status: 'confirmed',
    });
    await PendingPayment.collection.updateOne({ _id: pending._id }, { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });

    await sweepStalePendingPayments();

    const updated = await PendingPayment.findById(pending._id);
    expect(updated.status).toBe('confirmed');
  });
});
