const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// POST /api/audit
router.post('/', protect, auditController.logAction);

// GET /api/audit — admin-only, paginated
router.get('/', protect, adminOnly, auditController.getAuditLogs);

module.exports = router;
