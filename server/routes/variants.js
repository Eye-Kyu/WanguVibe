const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const variantController = require('../controllers/variantController');

// Order matters: static paths before the /:id catch-all
router.get('/low-stock', protect, variantController.getLowStockVariants);
router.get('/lookup', protect, variantController.lookupByBarcode);
router.put('/:id', protect, variantController.updateVariant);
router.delete('/:id', protect, checkRole('admin'), variantController.deleteVariant);

module.exports = router;
