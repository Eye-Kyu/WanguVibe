const mongoose = require('mongoose');

// A till/cash-drawer session. Sales get attributed to whichever shift is
// open when they're made (Sale.shift), so closing a shift can reconcile
// counted cash against what should be in the drawer.
const shiftSchema = new mongoose.Schema({
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  openingFloat: { type: Number, required: true, min: 0 },
  openedAt: { type: Date, default: Date.now },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  closingCount: { type: Number, default: null },
  closedAt: { type: Date, default: null },
  expectedCash: { type: Number, default: null },
  discrepancy: { type: Number, default: null },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
});

// A cashier can only have one open shift at a time — enforced atomically at
// the DB level (partial index) rather than a race-prone check-then-insert.
shiftSchema.index({ openedBy: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });

module.exports = mongoose.model('Shift', shiftSchema);
