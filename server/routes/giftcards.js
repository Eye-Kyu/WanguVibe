const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const giftCardController = require('../controllers/giftCardController');

// Static path before any future /:id-style route
router.get('/lookup', protect, giftCardController.lookupByCode);
router.get('/', protect, adminOnly, giftCardController.getAllGiftCards);

module.exports = router;
