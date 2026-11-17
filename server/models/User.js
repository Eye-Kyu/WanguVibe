const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'cashier'], default: 'cashier' },
    // Admin-only manager-override PIN (see utils/approval.js) — hashed, and
    // separate from the login password.
    approvalPinHash: { type: String, default: null },
    approvalPinFailures: { type: Number, default: 0 },
    approvalPinLockedUntil: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
