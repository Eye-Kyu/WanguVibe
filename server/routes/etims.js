const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const etimsController = require('../controllers/etimsController');

router.get('/retry-queue', protect, adminOnly, etimsController.getRetryQueue);
router.post('/retry/:saleId', protect, adminOnly, etimsController.retrySubmission);

module.exports = router;
