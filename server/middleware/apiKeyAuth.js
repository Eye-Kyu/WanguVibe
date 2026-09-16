const ApiKey = require('../models/ApiKey');
const { hashToken } = require('../utils/refreshToken');
const { reportError } = require('../utils/reportError');

// Authenticates a third-party request to /api/v1/* via X-API-Key — a
// completely separate scheme from the staff JWT (`protect`), since a
// third-party integration isn't a logged-in POS user. Same hash-at-rest
// lookup convention as the refresh-token flow.
async function apiKeyAuth(req, res, next) {
  try {
    const rawKey = req.header('X-API-Key');
    if (!rawKey) return res.status(401).json({ error: 'X-API-Key header is required' });

    const keyHash = hashToken(rawKey);
    const apiKey = await ApiKey.findOne({ keyHash, active: true });
    if (!apiKey) return res.status(401).json({ error: 'Invalid or inactive API key' });

    req.apiKey = apiKey;
    // Fire-and-forget — a failed lastUsedAt write must never block or fail
    // the actual request, it's just bookkeeping.
    ApiKey.updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() }).catch(() => {});
    next();
  } catch (err) {
    reportError(req, err, 'API key auth failed');
    res.status(500).json({ error: 'Server error during API key authentication' });
  }
}

module.exports = apiKeyAuth;
