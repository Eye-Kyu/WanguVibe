const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { protect } = require('../middleware/authMiddleware'); // ✅ destructure the middleware
const { moneyMovingLimiter } = require('../middleware/rateLimiters');

// Routes for sales — specific paths must come before /:id
router.post('/', protect, moneyMovingLimiter, salesController.createSale);
router.get('/', protect, salesController.getAllSales);
router.get('/report', protect, salesController.getSalesReport);
router.get('/:id', protect, salesController.getSaleById);
router.post('/:id/return', protect, moneyMovingLimiter, salesController.returnSale);
router.delete('/:id', protect, salesController.deleteSale);

module.exports = router;
