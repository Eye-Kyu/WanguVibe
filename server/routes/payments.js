const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { moneyMovingLimiter } = require('../middleware/rateLimiters');
const paymentsController = require('../controllers/paymentsController');

router.post('/mpesa/initiate', protect, moneyMovingLimiter, paymentsController.initiateMpesaPayment);
router.get('/mpesa/:id/status', protect, paymentsController.getMpesaStatus);
// Public — Safaricom calls this directly with no JWT (see paymentsController
// for how it verifies the callback without one).
router.post('/mpesa/callback', paymentsController.mpesaCallback);

module.exports = router;
