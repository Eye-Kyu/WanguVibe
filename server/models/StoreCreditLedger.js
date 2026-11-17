const mongoose = require('mongoose');

// Full audit trail of every store-credit movement. Customer.storeCreditBalance
// is the enforcement point (atomic guard against overdraft); this collection
// is purely historical — never read for a balance check, only for display.
const storeCreditLedgerSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  amount: { type: Number, required: true }, // positive = credit, negative = debit
  reason: {
    type: String,
    enum: ['return_refund', 'checkout_payment', 'manual_adjustment', 'layaway_payment', 'layaway_refund', 'void_reversal'],
    required: true,
  },
  relatedSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
  relatedReturn: { type: mongoose.Schema.Types.ObjectId, default: null }, // _id of the Sale.returns[] subdoc
  relatedLayaway: { type: mongoose.Schema.Types.ObjectId, ref: 'Layaway', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

storeCreditLedgerSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model('StoreCreditLedger', storeCreditLedgerSchema);
