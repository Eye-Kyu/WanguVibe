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
  status: { type: String, enum: ['pending', 'confirmed', 'failed', 'timed_out'], default: 'pending' },
  resultMessage: { type: String, default: null },
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
  cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
}, { timestamps: true });

module.exports = mongoose.model('PendingPayment', pendingPaymentSchema);
