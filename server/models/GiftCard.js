const mongoose = require('mongoose');

// Sold as a line item outside the Style/Variant matrix (it isn't a garment,
// so it never touches Variant.stock) and redeemed as a checkout payment
// method. v1 has no split-tender: a redemption must cover the full sale
// total or is rejected outright.
const giftCardSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  initialBalance: { type: Number, required: true, min: 0 },
  currentBalance: { type: Number, required: true, min: 0 },
  issuedAt: { type: Date, default: Date.now },
  issuedBySale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
  status: { type: String, enum: ['active', 'redeemed', 'expired', 'void'], default: 'active' },
});

module.exports = mongoose.model('GiftCard', giftCardSchema);
