const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const shiftController = require('../controllers/shiftController');

// Static paths before the /:id catch-all
router.post('/open', protect, shiftController.openShift);
router.get('/current', protect, shiftController.getCurrentShift);
router.get('/', protect, adminOnly, shiftController.getAllShifts);
router.post('/:id/close', protect, shiftController.closeShift);

module.exports = router;
