const Sentry = require('@sentry/node');
const webpush = require('web-push');
const Sale = require('../models/Sale');
const EtimsRetryQueue = require('../models/EtimsRetryQueue');
const PendingPayment = require('../models/PendingPayment');
const Variant = require('../models/Variant');
const PushSubscription = require('../models/PushSubscription');
const { sweepEtimsRetryQueue, sweepStalePendingPayments, sweepLowStock } = require('../services/scheduledJobs');
const { makeStyleWithVariant, makeUser, fakeId } = require('./fixtures');

// The backlog-dedup tests need to force attemptRetry() to keep failing (so
// entries stay 'pending' instead of the real mock etims immediately
// accepting every submission) — jest.mock replaces the module at
// resolution time, before etimsController.js's own `const { submitInvoice
// } = require(...)` destructures it, so this reaches the actual call site.
// Everything else in this file relies on the real mock-accepts behavior, so
// the wrapped jest.fn defaults to the real implementation and every test
// that overrides it restores that default afterward.
jest.mock('../services/etims', () => {
  const actual = jest.requireActual('../services/etims');
  return { ...actual, submitInvoice: jest.fn(actual.submitInvoice) };
});
const { submitInvoice: mockSubmitInvoice } = require('../services/etims');
const { submitInvoice: actualSubmitInvoice } = jest.requireActual('../services/etims');

afterEach(() => {
  mockSubmitInvoice.mockImplementation(actualSubmitInvoice);
});

// notifyAdmins() is deliberately fire-and-forget (.catch(...), not awaited)
// at every call site in scheduledJobs.js — a push-notification hiccup must
// never block or fail the sweep itself. That means the sweep functions
// return before the notification's own DB query + webpush.sendNotification
// round trip finishes, so dedup tests need to let that settle before
// asserting on it.
const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 50));

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

describe('sweepEtimsRetryQueue — backlog push-notification dedup', () => {
  let cashier, admin;
  beforeEach(async () => {
    cashier = await makeUser();
    admin = await makeUser({ role: 'admin' });
    await PushSubscription.create({ user: admin._id, endpoint: 'https://push.example/etims-admin', keys: { p256dh: 'a', auth: 'b' } });
    // Reset the module-level dedup flag: an empty queue always resolves the
    // backlog check to "under threshold", regardless of what a previous
    // test in this file left the flag as.
    await sweepEtimsRetryQueue();
  });

  async function createFailingBacklog(count) {
    mockSubmitInvoice.mockImplementation(async () => ({ status: 'unreachable', invoiceNumber: null, qrPayload: null, error: 'Simulated KRA eTIMS outage' }));
    for (let i = 0; i < count; i++) {
      const sale = await makeSale(cashier);
      await EtimsRetryQueue.create({ sale: sale._id, attempts: 0 });
    }
  }

  test('notifies once when the backlog first crosses the threshold, and does not repeat while it stays above', async () => {
    const sendSpy = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({});
    try {
      await createFailingBacklog(6); // threshold is 5
      await sweepEtimsRetryQueue();
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(1);

      // Still above threshold on the next tick (submitInvoice still failing) — must not re-notify.
      await sweepEtimsRetryQueue();
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(1);
    } finally {
      sendSpy.mockRestore();
    }
  });

  test('alerts again for a new backlog episode after the previous one clears', async () => {
    const sendSpy = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({});
    try {
      await createFailingBacklog(6);
      await sweepEtimsRetryQueue();
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(1);

      // Let retries succeed now — the backlog clears.
      mockSubmitInvoice.mockImplementation(actualSubmitInvoice);
      await sweepEtimsRetryQueue();
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(1); // cleared, no new alert

      // A fresh episode forms.
      await createFailingBacklog(6);
      await sweepEtimsRetryQueue();
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(2);
    } finally {
      sendSpy.mockRestore();
    }
  });
});

describe('sweepLowStock — per-variant push-notification dedup', () => {
  let admin;
  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
    await PushSubscription.create({ user: admin._id, endpoint: 'https://push.example/lowstock-admin', keys: { p256dh: 'a', auth: 'b' } });
    // Reset the module-level dedup set: an empty DB always yields no low
    // variants, so this always ends the sweep with an empty alerted-set.
    await sweepLowStock();
  });

  test('notifies once for a newly-low variant, and does not repeat while it stays low', async () => {
    const { variant } = await makeStyleWithVariant({}, { stock: 1, reorderThreshold: 5 });
    const sendSpy = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({});
    try {
      await sweepLowStock();
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(1);

      await sweepLowStock(); // still low, same variant — must not re-notify
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(1);

      expect((await Variant.findById(variant._id)).stock).toBe(1); // unchanged — sweep never touches stock
    } finally {
      sendSpy.mockRestore();
    }
  });

  test('alerts again if a variant is restocked above threshold and later dips low again', async () => {
    const { variant } = await makeStyleWithVariant({}, { stock: 1, reorderThreshold: 5 });
    const sendSpy = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({});
    try {
      await sweepLowStock();
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(1);

      await Variant.findByIdAndUpdate(variant._id, { stock: 20 }); // restocked above threshold
      await sweepLowStock();
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(1); // no longer low — no new alert

      await Variant.findByIdAndUpdate(variant._id, { stock: 2 }); // dips low again
      await sweepLowStock();
      await flushAsync();
      expect(sendSpy).toHaveBeenCalledTimes(2); // a fresh low episode for this variant
    } finally {
      sendSpy.mockRestore();
    }
  });

  test('does not notify about an inactive variant even if its stock is below threshold', async () => {
    await makeStyleWithVariant({}, { stock: 0, reorderThreshold: 5, active: false });
    const sendSpy = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({});
    try {
      await sweepLowStock();
      await flushAsync();
      expect(sendSpy).not.toHaveBeenCalled();
    } finally {
      sendSpy.mockRestore();
    }
  });
});
