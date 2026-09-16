const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const apiKeyController = require('../controllers/apiKeyController');

router.post('/', protect, adminOnly, apiKeyController.createApiKey);
router.get('/', protect, adminOnly, apiKeyController.getAllApiKeys);
router.delete('/:id', protect, adminOnly, apiKeyController.revokeApiKey);

module.exports = router;
