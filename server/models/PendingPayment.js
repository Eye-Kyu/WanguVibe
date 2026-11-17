const mongoose = require('mongoose');

// Tracks an M-Pesa STK-push checkout from initiation through Safaricom's
// async callback. Unlike cash/card/store-credit/gift-card, the Sale itself
// isn't created until the callback confirms payment — cartSnapshot holds
// everything finalizeSale() needs to do that at that point.
const pendingPaymentSchema = new mongoose.Schema({
  provider: { type: String, default: 'mpesa' },
  checkoutRequestId: { type: String, required: true, unique: true },
  merchantRequestId: { type: String, default: null },
  phone: { type: String, required: true },
  amount: { type: Number, required: true },
  cartSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: [
    'pending', 'processing', 'confirmed', 'failed', 'timed_out',
    // Customer was charged but no sale exists (stock ran out mid-PIN, or the
    // payment arrived after the POS gave up waiting) — money must go back.
    'refund_required', 'refund_requested', 'refunded',
  ], default: 'pending' },
  resultMessage: { type: String, default: null },
  // Safaricom's receipt for a confirmed payment — unique so one real payment
  // can never be attached to two sales.
  mpesaReceiptNumber: { type: String, default: undefined },
  refund: {
    reason: { type: String, default: null },
    conversationId: { type: String, default: null },
    requestedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    attempts: { type: Number, default: 0 },
  },
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
  cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
}, { timestamps: true });

pendingPaymentSchema.index({ mpesaReceiptNumber: 1 }, { unique: true, sparse: true });
pendingPaymentSchema.index({ 'refund.conversationId': 1 }, { sparse: true });

module.exports = mongoose.model('PendingPayment', pendingPaymentSchema);
