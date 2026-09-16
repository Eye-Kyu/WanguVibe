const ApiKey = require('../models/ApiKey');
const { reportError } = require('../utils/reportError');
const { hashToken, generateRawToken } = require('../utils/refreshToken');

// POST /api/api-keys — the raw key is generated here and returned exactly
// once, in this response. Only its hash is ever stored — same
// never-retrievable-again convention as a refresh token; a lost key is
// revoked and replaced, not recovered.
exports.createApiKey = async (req, res) => {
  try {
    const { label } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });
    const rawKey = generateRawToken();
    const apiKey = await ApiKey.create({ label: label.trim(), keyHash: hashToken(rawKey), createdBy: req.user.id });
    res.status(201).json({ _id: apiKey._id, label: apiKey.label, active: apiKey.active, createdAt: apiKey.createdAt, key: rawKey });
  } catch (err) {
    reportError(req, err, 'Error creating API key');
    res.status(400).json({ error: 'Invalid API key data' });
  }
};

// GET /api/api-keys — raw key is never included.
exports.getAllApiKeys = async (req, res) => {
  try {
    const keys = await ApiKey.find().select('-keyHash').sort({ createdAt: -1 });
    res.json(keys);
  } catch (err) {
    reportError(req, err, 'Error fetching API keys');
    res.status(500).json({ error: 'Server error fetching API keys' });
  }
};

exports.revokeApiKey = async (req, res) => {
  try {
    const updated = await ApiKey.findByIdAndUpdate(req.params.id, { active: false }, { new: true }).select('-keyHash');
    if (!updated) return res.status(404).json({ error: 'API key not found' });
    res.json(updated);
  } catch (err) {
    reportError(req, err, 'Error revoking API key');
    res.status(400).json({ error: 'Error revoking API key' });
  }
};
