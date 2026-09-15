const mongoose = require('mongoose');

// One row per sale that failed eTIMS submission, for manual admin retry.
// No job-queue infrastructure exists in this app — v1 retry is a button on
// an admin screen, not an automated sweep.
const etimsRetryQueueSchema = new mongoose.Schema({
  sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true, unique: true },
  attempts: { type: Number, default: 1 },
  lastError: { type: String, default: null },
  lastAttemptAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'resolved', 'abandoned'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('EtimsRetryQueue', etimsRetryQueueSchema);
