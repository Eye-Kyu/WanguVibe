const Shift = require('../models/Shift');
const Sale = require('../models/Sale');
const { logAudit } = require('../utils/auditLogger');

// POST /api/shifts/open — start a till session for the caller.
exports.openShift = async (req, res) => {
  try {
    const { openingFloat } = req.body;
    if (typeof openingFloat !== 'number' || openingFloat < 0) {
      return res.status(400).json({ error: 'openingFloat must be a non-negative number' });
    }

    const shift = await Shift.create({ openedBy: req.user.id, openingFloat });
    logAudit({ action: 'shift_opened', details: { shiftId: shift._id, openingFloat }, userId: req.user.id });
    res.status(201).json(shift);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You already have an open shift' });
    }
    console.error('Error opening shift:', err);
    res.status(400).json({ error: 'Failed to open shift' });
  }
};

// GET /api/shifts/current — the caller's own open shift, or null.
exports.getCurrentShift = async (req, res) => {
  try {
    const shift = await Shift.findOne({ openedBy: req.user.id, status: 'open' });
    res.json(shift);
  } catch (err) {
    console.error('Error fetching current shift:', err);
    res.status(500).json({ error: 'Server error fetching current shift' });
  }
};

// POST /api/shifts/:id/close — reconcile counted cash against expected cash.
// expectedCash = openingFloat + (cash sales made on this shift) - (cash
// refunds processed while this shift was open, regardless of which shift
// the original sale belongs to — the cashier is physically handing back
// cash from *this* till right now).
exports.closeShift = async (req, res) => {
  try {
    const { closingCount } = req.body;
    if (typeof closingCount !== 'number' || closingCount < 0) {
      return res.status(400).json({ error: 'closingCount must be a non-negative number' });
    }

    const shift = await Shift.findById(req.params.id);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    if (shift.status !== 'open') return res.status(400).json({ error: 'Shift is already closed' });

    const isOwner = shift.openedBy.toString() === req.user.id;
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the shift owner or an admin can close this shift' });
    }

    const closedAt = new Date();

    const [cashSalesAgg, cashRefundsAgg] = await Promise.all([
      Sale.aggregate([
        { $match: { shift: shift._id, paymentMethod: 'cash' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Sale.aggregate([
        { $unwind: '$returns' },
        { $match: { 'returns.destination': 'cash', 'returns.processedAt': { $gte: shift.openedAt, $lte: closedAt } } },
        { $group: { _id: null, total: { $sum: '$returns.amount' } } },
      ]),
    ]);

    const cashSalesTotal = cashSalesAgg[0]?.total || 0;
    const cashRefundsTotal = cashRefundsAgg[0]?.total || 0;
    const expectedCash = shift.openingFloat + cashSalesTotal - cashRefundsTotal;
    const discrepancy = closingCount - expectedCash;

    shift.closedBy = req.user.id;
    shift.closingCount = closingCount;
    shift.closedAt = closedAt;
    shift.expectedCash = expectedCash;
    shift.discrepancy = discrepancy;
    shift.status = 'closed';
    await shift.save();

    logAudit({
      action: 'shift_closed',
      details: { shiftId: shift._id, closingCount, expectedCash, discrepancy },
      userId: req.user.id,
    });

    res.json(shift);
  } catch (err) {
    console.error('Error closing shift:', err);
    res.status(400).json({ error: 'Failed to close shift' });
  }
};

// GET /api/shifts — admin-only, paginated (same convention as GET /api/audit).
exports.getAllShifts = async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const [shifts, total] = await Promise.all([
      Shift.find()
        .sort({ openedAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('openedBy', 'name')
        .populate('closedBy', 'name')
        .lean(),
      Shift.countDocuments(),
    ]);

    res.json({ shifts, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error('Error fetching shifts:', err);
    res.status(500).json({ error: 'Server error fetching shifts' });
  }
};
