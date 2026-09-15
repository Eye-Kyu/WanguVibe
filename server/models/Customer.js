const mongoose = require('mongoose');

// Deliberately lightweight for phase one: enough to hang store credit, layaway,
// and purchase history off of later without a painful retrofit. No loyalty
// points, segments, or marketing fields yet — add those only once phase one
// (Style/Variant + POS) is solid.
const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true, unique: true, sparse: true },
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  notes: { type: String, default: '' }, // e.g. sizing notes, preferences — free text for staff
  // Cached balance, kept in sync with StoreCreditLedger inside a transaction
  // on every write. This is the field atomic balance checks guard against —
  // the ledger is the audit trail, this is the enforcement point (pure
  // ledger-sum can't atomically block two concurrent debits from both
  // reading "sufficient" and both committing).
  storeCreditBalance: { type: Number, default: 0 },
}, { timestamps: true });

customerSchema.index({ name: 'text', phone: 'text', email: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
