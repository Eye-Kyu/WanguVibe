const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const purchaseOrderController = require('../controllers/purchaseOrderController');

router.post('/', protect, purchaseOrderController.createPurchaseOrder);
router.get('/', protect, purchaseOrderController.getAllPurchaseOrders);
router.get('/:id', protect, purchaseOrderController.getPurchaseOrderById);
router.post('/:id/receive', protect, purchaseOrderController.receivePurchaseOrder);
router.post('/:id/cancel', protect, purchaseOrderController.cancelPurchaseOrder);

module.exports = router;
