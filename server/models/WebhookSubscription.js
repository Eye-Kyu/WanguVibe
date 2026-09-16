const mongoose = require('mongoose');

// A third party's endpoint that wants to be notified of events happening in
// this POS. `secret` is stored as plain text (not hashed) deliberately —
// unlike an ApiKey or RefreshToken, this authenticates an OUTGOING request
// WE make (we HMAC-sign each delivery with it), so the server must be able
// to retrieve the raw value on every delivery, not just verify a hash of it.
const webhookSubscriptionSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  events: {
    type: [{ type: String, enum: ['sale.completed', 'stock.changed'] }],
    validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'At least one event is required' },
  },
  secret: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('WebhookSubscription', webhookSubscriptionSchema);
