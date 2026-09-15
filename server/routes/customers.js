const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const customerController = require('../controllers/customerController');

router.get('/', protect, customerController.getAllCustomers);
router.post('/', protect, customerController.createCustomer);
router.get('/:id', protect, customerController.getCustomerById);
router.get('/:id/store-credit-ledger', protect, customerController.getStoreCreditLedger);
router.put('/:id', protect, customerController.updateCustomer);
router.delete('/:id', protect, checkRole('admin'), customerController.deleteCustomer);

module.exports = router;
