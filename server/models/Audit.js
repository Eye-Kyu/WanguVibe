const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  action: { type: String, required: true },
  details: { type: Object, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, default: Date.now }
});

// Audit is the first unbounded-growth collection in this app — index what
// GET /api/audit filters/sorts by, since the array-per-collection convention
// used elsewhere (return everything, filter client-side) doesn't scale here.
auditSchema.index({ userId: 1 });
auditSchema.index({ action: 1 });
auditSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Audit', auditSchema);