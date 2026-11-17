const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { moneyMovingLimiter } = require('../middleware/rateLimiters');

// Routes for sales — specific paths must come before /:id
router.post('/', protect, moneyMovingLimiter, salesController.createSale);
router.get('/', protect, salesController.getAllSales);
router.get('/report', protect, salesController.getSalesReport);
router.get('/:id', protect, salesController.getSaleById);
router.post('/:id/return', protect, adminOnly, moneyMovingLimiter, salesController.returnSale);
router.post('/:id/send-receipt', protect, moneyMovingLimiter, salesController.sendReceiptSms);
// Sales are voided, never deleted — see salesController.voidSale.
router.post('/:id/void', protect, adminOnly, salesController.voidSale);

module.exports = router;
