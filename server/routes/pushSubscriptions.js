const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const pushSubscriptionController = require('../controllers/pushSubscriptionController');

router.get('/vapid-public-key', protect, pushSubscriptionController.getVapidPublicKey);
router.post('/', protect, adminOnly, pushSubscriptionController.subscribe);
router.delete('/', protect, adminOnly, pushSubscriptionController.unsubscribe);

module.exports = router;
