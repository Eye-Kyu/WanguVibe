const GiftCard = require('../models/GiftCard');
const { reportError } = require('../utils/reportError');

// GET /api/giftcards/lookup?code=... — used by the POS to show a card's
// live balance before redeeming it.
exports.lookupByCode = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'code query param required' });

    const card = await GiftCard.findOne({ code: code.trim().toUpperCase() });
    if (!card) return res.status(404).json({ error: `No gift card found for code: ${code}` });
    res.json(card);
  } catch (err) {
    reportError(req, err, 'Error looking up gift card');
    res.status(500).json({ error: 'Server error looking up gift card' });
  }
};

// GET /api/giftcards — admin-only, paginated (same convention as audit/shifts)
exports.getAllGiftCards = async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const [giftCards, total] = await Promise.all([
      GiftCard.find()
        .sort({ issuedAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      GiftCard.countDocuments(),
    ]);

    res.json({ giftCards, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    reportError(req, err, 'Error fetching gift cards');
    res.status(500).json({ error: 'Server error fetching gift cards' });
  }
};
