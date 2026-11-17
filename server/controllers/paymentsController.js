const PendingPayment = require('../models/PendingPayment');
const { reportError } = require('../utils/reportError');
const { initiateStkPush, confirmStkPayment, reverseTransaction, callbackTokenMatches } = require('../services/mpesa');
const { notifyAdmins } = require('../services/pushNotifications');
const { finalizeSale } = require('./salesController');
const { logAudit } = require('../utils/auditLogger');
const HttpError = require('../utils/httpError');
const { normalizeLineItems, normalizeCartDiscount } = require('../utils/saleValidation');
const { assertDiscountAllowed, resolveApproval } = require('../utils/approval');

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

    // Validate the cart and any manager approval now — rejecting after the
    // customer has entered their PIN would mean charging, then refunding.
    let approvedBy = null;
    try {
      const normalizedItems = normalizeLineItems(items);
      const normalizedCartDiscount = normalizeCartDiscount(cartDiscount);
      approvedBy = await resolveApproval(req.body);
      assertDiscountAllowed(normalizedItems, normalizedCartDiscount, { role: req.user.role, approvedBy });
    } catch (validationErr) {
      if (validationErr instanceof HttpError) return res.status(validationErr.status).json(HttpError.body(validationErr));
      throw validationErr;
    }

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
      // cashierRole/approvedBy are set here from verified server state, never from the body.
      cartSnapshot: { items, totalAmount, cartDiscount, paymentMethod: 'mpesa', shift, giftCardsSold, cashierRole: req.user.role, approvedBy },
      cashier: req.user.id,
      shift: shift || null,
    });

    // checkoutRequestId deliberately not returned — the client only needs
    // pendingPaymentId to poll, and the less widely the Safaricom-side id is
    // known, the less there is to replay.
    res.status(201).json({ pendingPaymentId: pending._id });
  } catch (err) {
    reportError(req, err, 'Error initiating M-Pesa payment');
    res.status(400).json({ error: err.message || 'Failed to initiate M-Pesa payment' });
  }
};

// GET /api/payments/mpesa/:id/status — polled by the POS while waiting.
exports.getMpesaStatus = async (req, res) => {
  try {
    let pending = await PendingPayment.findById(req.params.id);
    if (!pending) return res.status(404).json({ error: 'Pending payment not found' });

    if (pending.status === 'pending' && Date.now() - pending.createdAt.getTime() > STALE_PENDING_MS) {
      // Conditional on still being 'pending', so this can't clobber a
      // callback that claimed the row ('processing') in the meantime.
      pending = (await PendingPayment.findOneAndUpdate(
        { _id: pending._id, status: 'pending' },
        { $set: { status: 'timed_out', resultMessage: 'No confirmation received in time' } },
        { new: true }
      )) || (await PendingPayment.findById(pending._id));
    }

    // 'processing' is an internal lock state — to the polling POS it's
    // still just "waiting".
    // Refund states are an admin concern; to the till it's simply "this
    // payment did not go through" (resultMessage says why).
    const status = pending.status === 'processing'
      ? 'pending'
      : (['refund_required', 'refund_requested', 'refunded'].includes(pending.status) ? 'failed' : pending.status);
    res.json({ status, saleId: pending.saleId, resultMessage: pending.resultMessage });
  } catch (err) {
    reportError(req, err, 'Error fetching M-Pesa status');
    res.status(500).json({ error: 'Server error fetching payment status' });
  }
};

const callbackItem = (stkCallback, name) =>
  stkCallback?.CallbackMetadata?.Item?.find((i) => i?.Name === name)?.Value;

// POST /api/payments/mpesa/callback/:token — public, called by Safaricom
// (or by our own mock self-post). No JWT is available, so it trusts nothing
// in the body on its own:
//   1. the secret path token must match (only Safaricom has the full URL);
//   2. the pending row is claimed atomically (pending -> processing) so a
//      retried/duplicated callback can never finalize the same cart twice;
//   3. the paid amount must match what we asked for;
//   4. outside mock mode, Daraja's STK Query must independently confirm it.
exports.mpesaCallback = async (req, res) => {
  if (!callbackTokenMatches(req.params.token)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback || typeof stkCallback.CheckoutRequestID !== 'string') {
      return res.status(400).json({ error: 'Malformed callback payload' });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;
    // A payment that already timed out on the till can still be claimed —
    // the customer may have entered their PIN late, and that money has to
    // be refunded rather than silently ignored.
    const before = await PendingPayment.findOneAndUpdate(
      { checkoutRequestId: CheckoutRequestID, status: { $in: ['pending', 'timed_out'] } },
      { $set: { status: 'processing' } },
      { new: false }
    );
    const arrivedLate = before?.status === 'timed_out';
    const pending = before && await PendingPayment.findById(before._id);

    // Safaricom expects a 200 regardless of what we found, or it retries
    // the callback repeatedly.
    if (!pending) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted (no matching pending payment)' });
    }

    const fail = async (message) => {
      pending.status = 'failed';
      pending.resultMessage = message;
      await pending.save();
    };

    if (Number(ResultCode) !== 0) {
      await fail(ResultDesc);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const paidAmount = Number(callbackItem(stkCallback, 'Amount'));
    const receipt = callbackItem(stkCallback, 'MpesaReceiptNumber');
    if (!Number.isFinite(paidAmount) || Math.round(paidAmount) !== Math.round(pending.amount)) {
      await fail(`Paid amount ${paidAmount} does not match expected ${pending.amount}`);
      reportError(req, new Error('M-Pesa callback amount mismatch'), 'M-Pesa callback amount mismatch');
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    let confirmation;
    try {
      confirmation = await confirmStkPayment(CheckoutRequestID);
    } catch (queryErr) {
      // Couldn't reach Daraja to double-check — put it back so a retried
      // callback (or an admin) can try again, rather than failing a real payment.
      pending.status = arrivedLate ? 'timed_out' : 'pending';
      await pending.save();
      reportError(req, queryErr, 'M-Pesa STK query failed');
      return res.status(200).json({ ResultCode: 1, ResultDesc: 'Temporary error' });
    }
    if (!confirmation.paid) {
      await fail(`Daraja did not confirm payment: ${confirmation.resultDesc || confirmation.resultCode}`);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    try {
      pending.mpesaReceiptNumber = receipt ? String(receipt) : undefined;
      await pending.save(); // unique index rejects a receipt already used by another payment
    } catch (dupErr) {
      if (dupErr.code !== 11000) throw dupErr;
      // This receipt already paid for another sale — a replay, not new money.
      // Nothing to refund.
      pending.mpesaReceiptNumber = undefined;
      await fail('Duplicate M-Pesa receipt — already applied to another payment');
      reportError(req, dupErr, 'Duplicate M-Pesa receipt on callback');
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (arrivedLate) {
      await requireRefund(pending, 'Payment arrived after the till stopped waiting', req);
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
        details: { pendingPaymentId: pending._id, saleId: sale._id, amount: pending.amount, receipt },
        userId: pending.cashier,
      });
    } catch (finalizeErr) {
      // Money already moved on Safaricom's side but the sale couldn't be
      // finalized (e.g. stock sold out while waiting on the customer's PIN).
      reportError(req, finalizeErr, 'M-Pesa payment confirmed but finalizeSale failed');
      await requireRefund(pending, `Payment received but sale could not be completed: ${finalizeErr.message}`, req);
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    reportError(req, err, 'Error handling M-Pesa callback');
    res.status(200).json({ ResultCode: 1, ResultDesc: 'Internal error' });
  }
};

// ─── Refunds ──────────────────────────────────────────────────────────────

// Flags a charged-but-unsold payment and immediately tries to send the money
// back. If the reversal can't even be requested, it stays refund_required
// and admins are paged — it must never be silently dropped.
async function requireRefund(pending, reason, req = null) {
  pending.status = 'refund_required';
  pending.resultMessage = reason;
  pending.refund.reason = reason;
  await pending.save();
  logAudit({ action: 'mpesa_refund_required', details: { pendingPaymentId: pending._id, amount: pending.amount, reason }, userId: pending.cashier });
  await attemptRefund(pending, req);
  return pending;
}

async function attemptRefund(pending, req = null) {
  pending.refund.attempts = (pending.refund.attempts || 0) + 1;
  try {
    const result = await reverseTransaction({ receipt: pending.mpesaReceiptNumber, amount: pending.amount });
    pending.refund.conversationId = result.conversationId || null;
    pending.refund.requestedAt = new Date();
    pending.refund.lastError = null;
    if (result.status === 'completed') {
      pending.status = 'refunded';
      pending.refund.completedAt = new Date();
    } else {
      pending.status = 'refund_requested';
    }
    await pending.save();
    logAudit({
      action: pending.status === 'refunded' ? 'mpesa_refund_completed' : 'mpesa_refund_requested',
      details: { pendingPaymentId: pending._id, amount: pending.amount, conversationId: pending.refund.conversationId },
      userId: pending.cashier,
    });
  } catch (err) {
    pending.status = 'refund_required';
    pending.refund.lastError = err.message;
    await pending.save();
    reportError(req, err, 'M-Pesa refund request failed');
    notifyAdmins({
      title: 'M-Pesa refund needed',
      body: `KES ${pending.amount} from ${pending.phone} needs a manual refund: ${err.message}`,
      tag: 'mpesa-refund',
      data: { url: '/admin/refunds' },
    }).catch((notifyErr) => reportError(req, notifyErr, 'Failed to send refund notification'));
  }
  return pending;
}
exports.requireRefund = requireRefund;

// POST /api/payments/mpesa/reversal-result/:token — Daraja's async outcome
// for a reversal (also used as its QueueTimeOutURL).
exports.mpesaReversalResult = async (req, res) => {
  if (!callbackTokenMatches(req.params.token)) return res.status(404).json({ error: 'Not found' });
  try {
    const result = req.body?.Result;
    const conversationId = result?.ConversationID || result?.OriginatorConversationID;
    if (typeof conversationId !== 'string') return res.status(400).json({ error: 'Malformed reversal result' });

    const pending = await PendingPayment.findOne({ 'refund.conversationId': conversationId, status: 'refund_requested' });
    if (pending) {
      if (Number(result.ResultCode) === 0) {
        pending.status = 'refunded';
        pending.refund.completedAt = new Date();
        pending.refund.lastError = null;
      } else {
        pending.status = 'refund_required';
        pending.refund.lastError = result.ResultDesc || `Reversal failed (code ${result.ResultCode})`;
        notifyAdmins({
          title: 'M-Pesa refund failed',
          body: `KES ${pending.amount} to ${pending.phone}: ${pending.refund.lastError}`,
          tag: 'mpesa-refund',
          data: { url: '/admin/refunds' },
        }).catch((err) => reportError(req, err, 'Failed to send refund notification'));
      }
      await pending.save();
      logAudit({
        action: pending.status === 'refunded' ? 'mpesa_refund_completed' : 'mpesa_refund_failed',
        details: { pendingPaymentId: pending._id, conversationId },
        userId: pending.cashier,
      });
    }
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    reportError(req, err, 'Error handling M-Pesa reversal result');
    res.status(200).json({ ResultCode: 1, ResultDesc: 'Internal error' });
  }
};

// GET /api/payments/mpesa/refunds — admin: everything that was charged but
// never became a sale, newest first.
exports.getRefunds = async (req, res) => {
  try {
    const statuses = ['refund_required', 'refund_requested', 'refunded'];
    const { status } = req.query;
    const filter = { status: statuses.includes(status) ? status : { $in: statuses } };
    const refunds = await PendingPayment.find(filter)
      .select('-cartSnapshot')
      .sort({ updatedAt: -1 })
      .limit(200)
      .populate('cashier', 'name')
      .lean();
    res.json(refunds);
  } catch (err) {
    reportError(req, err, 'Error fetching M-Pesa refunds');
    res.status(500).json({ error: 'Server error fetching refunds' });
  }
};

// POST /api/payments/mpesa/:id/refund — admin: retry a refund that couldn't
// be requested automatically, or (body: { manual: true, note }) record one
// settled outside Daraja, e.g. cash handed back.
exports.retryRefund = async (req, res) => {
  try {
    const pending = await PendingPayment.findOne({ _id: req.params.id, status: 'refund_required' });
    if (!pending) return res.status(404).json({ error: 'No refund awaiting action for that payment' });

    if (req.body?.manual === true) {
      const note = String(req.body.note || '').slice(0, 200);
      if (!note.trim()) return res.status(400).json({ error: 'A note is required when marking a refund as settled manually' });
      pending.status = 'refunded';
      pending.refund.completedAt = new Date();
      pending.refund.lastError = null;
      pending.resultMessage = `Refunded manually: ${note}`;
      await pending.save();
      logAudit({ action: 'mpesa_refund_manual', details: { pendingPaymentId: pending._id, note }, userId: req.user.id });
    } else {
      await attemptRefund(pending, req);
    }
    const { cartSnapshot, ...rest } = pending.toObject();
    res.json(rest);
  } catch (err) {
    reportError(req, err, 'Error retrying M-Pesa refund');
    res.status(500).json({ error: 'Server error retrying refund' });
  }
};
