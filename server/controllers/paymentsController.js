const PendingPayment = require('../models/PendingPayment');
const { reportError } = require('../utils/reportError');
const { initiateStkPush } = require('../services/mpesa');
const { finalizeSale } = require('./salesController');
const { logAudit } = require('../utils/auditLogger');

// Also used by services/scheduledJobs.js's proactive sweep — this lazy
// check on read still runs too, so a client that's actively polling sees a
// pending payment flip to timed_out immediately rather than waiting for the
// next sweep tick.
const STALE_PENDING_MS = 90 * 1000;
exports.STALE_PENDING_MS = STALE_PENDING_MS;

// POST /api/payments/mpesa/initiate — starts an STK push and holds the cart
// as a snapshot until Safaricom's callback confirms or denies the payment.
exports.initiateMpesaPayment = async (req, res) => {
  try {
    const { phone, items, totalAmount, cartDiscount, shift, giftCardsSold, simulateFailure } = req.body;

    if (!phone || !/^\d{9,15}$/.test(String(phone).replace(/\D/g, ''))) {
      return res.status(400).json({ error: 'A valid phone number is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty items' });
    }
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid total amount' });
    }
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const normalizedPhone = String(phone).replace(/\D/g, '');

    const stk = await initiateStkPush({
      phone: normalizedPhone,
      amount: totalAmount,
      accountReference: `POS-${Date.now()}`,
      simulateFailure,
    });

    const pending = await PendingPayment.create({
      checkoutRequestId: stk.checkoutRequestId,
      merchantRequestId: stk.merchantRequestId,
      phone: normalizedPhone,
      amount: totalAmount,
      // Held until the callback arrives — paymentMethod is fixed to 'mpesa'
      // here; store-credit/gift-card redemption aren't offered alongside an
      // M-Pesa STK push (they're each their own payment method).
      cartSnapshot: { items, totalAmount, cartDiscount, paymentMethod: 'mpesa', shift, giftCardsSold },
      cashier: req.user.id,
      shift: shift || null,
    });

    res.status(201).json({ pendingPaymentId: pending._id, checkoutRequestId: pending.checkoutRequestId });
  } catch (err) {
    reportError(req, err, 'Error initiating M-Pesa payment');
    res.status(400).json({ error: err.message || 'Failed to initiate M-Pesa payment' });
  }
};

// GET /api/payments/mpesa/:id/status — polled by the POS while waiting.
exports.getMpesaStatus = async (req, res) => {
  try {
    const pending = await PendingPayment.findById(req.params.id);
    if (!pending) return res.status(404).json({ error: 'Pending payment not found' });

    if (pending.status === 'pending' && Date.now() - pending.createdAt.getTime() > STALE_PENDING_MS) {
      pending.status = 'timed_out';
      pending.resultMessage = 'No confirmation received in time';
      await pending.save();
    }

    res.json({ status: pending.status, saleId: pending.saleId, resultMessage: pending.resultMessage });
  } catch (err) {
    reportError(req, err, 'Error fetching M-Pesa status');
    res.status(500).json({ error: 'Server error fetching payment status' });
  }
};

// POST /api/payments/mpesa/callback — public, called directly by Safaricom
// (or by our own mock self-post). No JWT is available here, so this handler
// trusts only what it can verify itself: the CheckoutRequestID must match a
// PendingPayment we created. Payload shape matches Daraja's real STK
// callback body.
exports.mpesaCallback = async (req, res) => {
  try {
    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback) return res.status(400).json({ error: 'Malformed callback payload' });

    const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;
    const pending = await PendingPayment.findOne({ checkoutRequestId: CheckoutRequestID });

    // Safaricom expects a 200 regardless of what we found, or it retries
    // the callback repeatedly.
    if (!pending) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted (no matching pending payment)' });
    }
    if (pending.status !== 'pending') {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Already processed' });
    }

    if (ResultCode !== 0) {
      pending.status = 'failed';
      pending.resultMessage = ResultDesc;
      await pending.save();
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    try {
      const sale = await finalizeSale({ ...pending.cartSnapshot, cashier: pending.cashier.toString() });
      pending.status = 'confirmed';
      pending.saleId = sale._id;
      pending.resultMessage = ResultDesc;
      await pending.save();
      logAudit({
        action: 'mpesa_payment_confirmed',
        details: { pendingPaymentId: pending._id, saleId: sale._id, amount: pending.amount },
        userId: pending.cashier,
      });
    } catch (finalizeErr) {
      // Money already moved on Safaricom's side but the sale couldn't be
      // finalized (e.g. stock sold out while waiting on the customer's PIN).
      // Production would need to trigger a Daraja reversal here — out of
      // scope for mock mode, but flagged for when real credentials land.
      pending.status = 'failed';
      pending.resultMessage = `Payment received but sale could not be completed: ${finalizeErr.message}`;
      await pending.save();
      reportError(req, finalizeErr, 'M-Pesa payment confirmed but finalizeSale failed');
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    reportError(req, err, 'Error handling M-Pesa callback');
    res.status(200).json({ ResultCode: 1, ResultDesc: 'Internal error' });
  }
};
