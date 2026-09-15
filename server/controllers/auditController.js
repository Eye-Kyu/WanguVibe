const Audit = require('../models/Audit');
const { reportError } = require('../utils/reportError');

exports.logAction = async (req, res) => {
  try {
    const { action, details } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required' });

    // userId comes from the authenticated request, never the client body —
    // a caller shouldn't be able to log an action under someone else's name.
    const audit = new Audit({ action, details, userId: req.user.id });
    await audit.save();
    res.status(201).json({ message: 'Action logged' });
  } catch (err) {
    reportError(req, err, 'Audit log error');
    res.status(400).json({ error: 'Failed to log action' });
  }
};

// GET /api/audit — admin-only, paginated, filterable by user/action/date range.
// Audit is the first unbounded-growth collection in this app, so unlike
// every other "return the whole array" list endpoint here, this one
// paginates server-side.
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 25, userId, action, startDate, endDate } = req.query;
    const query = {};
    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const [logs, total] = await Promise.all([
      Audit.find(query)
        .sort({ timestamp: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('userId', 'name username')
        .lean(),
      Audit.countDocuments(query),
    ]);

    res.json({ logs, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    reportError(req, err, 'Error fetching audit logs');
    res.status(500).json({ error: 'Server error fetching audit logs' });
  }
};

module.exports = exports;