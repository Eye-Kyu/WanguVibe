const Customer = require('../models/Customer');
const GiftCard = require('../models/GiftCard');
const { reportError } = require('../utils/reportError');

// GET /api/public/store-credit?phone=... — PUBLIC, no auth (see routes/publicLookup.js).
// Returns only the minimum a customer needs to self-check their own balance
// — never the full Customer document (email, internal staff notes, etc.).
exports.getStoreCreditBalance = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'phone query param required' });
    const customer = await Customer.findOne({ phone: phone.trim() });
    if (!customer) return res.status(404).json({ error: 'No account found for that phone number' });
    res.json({ name: customer.name, storeCreditBalance: customer.storeCreditBalance });
  } catch (err) {
    reportError(req, err, 'Error looking up public store-credit balance');
    res.status(500).json({ error: 'Server error looking up balance' });
  }
};

// GET /api/public/gift-card?code=... — PUBLIC, no auth. GiftCard carries no
// PII, but this still only echoes back the minimal safe fields rather than
// the raw document (no _id, issuedBySale, etc.).
exports.getGiftCardBalance = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'code query param required' });
    const card = await GiftCard.findOne({ code: code.trim().toUpperCase() });
    if (!card) return res.status(404).json({ error: 'No gift card found for that code' });
    res.json({ code: card.code, currentBalance: card.currentBalance, status: card.status });
  } catch (err) {
    reportError(req, err, 'Error looking up public gift-card balance');
    res.status(500).json({ error: 'Server error looking up balance' });
  }
};
