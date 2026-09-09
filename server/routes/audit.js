const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { protect } = require('../middleware/authMiddleware'); // ✅ destructure correctly

// POST /api/audit
router.post('/', protect, auditController.logAction);

module.exports = router;
