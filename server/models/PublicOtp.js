const mongoose = require('mongoose');

// One-time codes for the public self-service balance check. Only a hash of
// the code is stored; rows expire on their own via the TTL index.
const publicOtpSchema = new mongoose.Schema({
  purpose: { type: String, enum: ['store_credit_balance'], required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

publicOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
publicOtpSchema.index({ customer: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model('PublicOtp', publicOtpSchema);
