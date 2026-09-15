const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { moneyMovingLimiter } = require('../middleware/rateLimiters');
const layawayController = require('../controllers/layawayController');

// Static paths before the /:id catch-all
router.post('/', protect, moneyMovingLimiter, layawayController.createLayaway);
router.get('/', protect, layawayController.getAllLayaways);
router.get('/:id', protect, layawayController.getLayawayById);
router.post('/:id/payment', protect, moneyMovingLimiter, layawayController.recordPayment);
router.post('/:id/complete', protect, moneyMovingLimiter, layawayController.completeLayaway);
router.post('/:id/cancel', protect, moneyMovingLimiter, layawayController.cancelLayaway);

module.exports = router;
