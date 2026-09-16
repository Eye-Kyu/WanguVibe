const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const webhookController = require('../controllers/webhookController');

router.post('/', protect, adminOnly, webhookController.createWebhook);
router.get('/', protect, adminOnly, webhookController.getAllWebhooks);
router.patch('/:id', protect, adminOnly, webhookController.updateWebhook);
router.delete('/:id', protect, adminOnly, webhookController.deleteWebhook);

module.exports = router;
