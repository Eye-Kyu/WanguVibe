const mongoose = require('mongoose');

// Lets a customer reserve items against a deposit and pay off the balance
// over time before taking them home. Stock is decremented at CREATION (the
// items are physically set aside) — not at completion — so completing a
// layaway must never go through finalizeSale (which would decrement stock
// again for the same items); see layawayController.completeLayaway.
const layawaySchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  items: [
    {
      variant: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant', required: true },
      styleName: { type: String, required: true },
      size: { type: String, required: true },
      color: { type: String, required: true },
      unitPrice: { type: Number, required: true },
      quantity: { type: Number, required: true },
      discount: { type: Number, default: 0, min: 0, max: 100 },
    },
  ],
  totalAmount: { type: Number, required: true },
  cartDiscount: { type: Number, default: 0, min: 0, max: 100 },
  // One entry per payment made against this layaway — the initial deposit
  // is payments[0]. Same allowed methods as split-tender (no M-Pesa: its
  // STK-push confirmation is asynchronous, which doesn't fit this
  // synchronous "record a payment now" flow).
  payments: [
    {
      amount: { type: Number, required: true },
      method: { type: String, enum: ['cash', 'card', 'store_credit', 'gift_card'], required: true },
      customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
      giftCardCode: { type: String, default: null },
      cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      paidAt: { type: Date, default: Date.now },
    },
  ],
  // Denormalized cache updated atomically on every payment — same
  // cache-plus-history split as Customer.storeCreditBalance/StoreCreditLedger.
  balanceRemaining: { type: Number, required: true },
  dueDate: { type: Date, default: null },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Set once completeLayaway builds and saves the real Sale record.
  completedSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
  cancellation: {
    destination: { type: String, enum: ['forfeit', 'store_credit'], default: null },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt: { type: Date, default: null },
  },
}, { timestamps: true });

layawaySchema.index({ status: 1, createdAt: -1 });
layawaySchema.index({ customer: 1 });

module.exports = mongoose.model('Layaway', layawaySchema);
