const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const stockEventsController = require('../controllers/stockEventsController');

router.get('/', protect, stockEventsController.streamStockEvents);

module.exports = router;
