const mongoose = require('mongoose');

// Authenticates INCOMING third-party requests to the read-only /api/v1/*
// routes — the opposite direction from WebhookSubscription.secret. Follows
// the exact same hash-at-rest convention as RefreshToken: only a SHA-256
// hash is ever stored, so a DB read alone can never be replayed as a valid
// key. The raw key is shown to the admin exactly once, at creation.
const apiKeySchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  keyHash: { type: String, required: true, unique: true },
  lastUsedAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('ApiKey', apiKeySchema);
