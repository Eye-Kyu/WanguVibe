const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { moneyMovingLimiter } = require('../middleware/rateLimiters');
const paymentsController = require('../controllers/paymentsController');

router.post('/mpesa/initiate', protect, moneyMovingLimiter, paymentsController.initiateMpesaPayment);
router.get('/mpesa/refunds', protect, adminOnly, paymentsController.getRefunds);
router.get('/mpesa/:id/status', protect, paymentsController.getMpesaStatus);
router.post('/mpesa/:id/refund', protect, adminOnly, paymentsController.retryRefund);
// Public — Safaricom calls this directly with no JWT (see paymentsController
// for how it verifies the callback without one).
router.post('/mpesa/callback/:token', paymentsController.mpesaCallback);
router.post('/mpesa/reversal-result/:token', paymentsController.mpesaReversalResult);

module.exports = router;
