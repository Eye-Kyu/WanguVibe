const mongoose = require('mongoose');

// One row per subscribed browser/device — an admin can have several (phone,
// desktop, etc). `endpoint` is the natural unique key: the push service
// (browser vendor) issues one unique endpoint URL per subscription.
const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
}, { timestamps: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
