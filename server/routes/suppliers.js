const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const supplierController = require('../controllers/supplierController');

router.get('/', protect, supplierController.getAllSuppliers);
router.post('/', protect, adminOnly, supplierController.createSupplier);
router.get('/:id', protect, supplierController.getSupplierById);
router.put('/:id', protect, adminOnly, supplierController.updateSupplier);
router.delete('/:id', protect, adminOnly, supplierController.deleteSupplier);

module.exports = router;
