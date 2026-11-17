const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const purchaseOrderController = require('../controllers/purchaseOrderController');

router.post('/', protect, adminOnly, purchaseOrderController.createPurchaseOrder);
router.post('/from-forecast', protect, adminOnly, purchaseOrderController.createFromForecast);
router.get('/', protect, purchaseOrderController.getAllPurchaseOrders);
router.get('/:id', protect, purchaseOrderController.getPurchaseOrderById);
router.post('/:id/receive', protect, adminOnly, purchaseOrderController.receivePurchaseOrder);
router.post('/:id/cancel', protect, adminOnly, purchaseOrderController.cancelPurchaseOrder);

module.exports = router;
