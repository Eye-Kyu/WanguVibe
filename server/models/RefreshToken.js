const mongoose = require('mongoose');

// Only a SHA-256 hash of the actual refresh token is ever stored — the raw
// token lives solely in the client's httpOnly cookie, so a DB read (or
// backup leak) alone can never be replayed as a valid credential. Rotated
// on every /auth/refresh use (old row revoked, a new row+cookie issued);
// revoked also on logout. TTL-indexed so expired rows clean up on their own.
const refreshTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
