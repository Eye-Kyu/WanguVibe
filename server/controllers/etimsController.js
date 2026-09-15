const Sale = require('../models/Sale');
const EtimsRetryQueue = require('../models/EtimsRetryQueue');
const { submitInvoice } = require('../services/etims');
const { logAudit } = require('../utils/auditLogger');

// GET /api/etims/retry-queue — admin-only, paginated (same convention as
// audit/shifts/gift cards).
exports.getRetryQueue = async (req, res) => {
  try {
    const { page = 1, limit = 25, status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const query = status ? { status } : {};

    const [entries, total] = await Promise.all([
      EtimsRetryQueue.find(query)
        .sort({ lastAttemptAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate({ path: 'sale', select: 'totalAmount createdAt etimsStatus cashier', populate: { path: 'cashier', select: 'name' } })
        .lean(),
      EtimsRetryQueue.countDocuments(query),
    ]);

    res.json({ entries, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error('Error fetching eTIMS retry queue:', err);
    res.status(500).json({ error: 'Server error fetching eTIMS retry queue' });
  }
};

// POST /api/etims/retry/:saleId — admin-only manual retry (v1 has no
// automated sweep, since no job-queue infra exists in this app).
exports.retrySubmission = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.saleId);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const entry = await EtimsRetryQueue.findOne({ sale: sale._id });
    const result = await submitInvoice(sale, {});

    if (result.status === 'accepted') {
      sale.etimsStatus = 'accepted';
      sale.etimsInvoiceNumber = result.invoiceNumber;
      sale.etimsQrPayload = result.qrPayload;
      sale.etimsSubmittedAt = new Date();
      await sale.save();

      if (entry) {
        entry.status = 'resolved';
        entry.lastAttemptAt = new Date();
        await entry.save();
      }

      logAudit({ action: 'etims_retry_resolved', details: { saleId: sale._id, invoiceNumber: result.invoiceNumber }, userId: req.user.id });
      return res.json({ message: 'eTIMS submission succeeded', sale });
    }

    if (entry) {
      entry.attempts += 1;
      entry.lastError = result.error;
      entry.lastAttemptAt = new Date();
      entry.status = 'pending';
      await entry.save();
    } else {
      await EtimsRetryQueue.create({ sale: sale._id, lastError: result.error, lastAttemptAt: new Date() });
    }

    res.status(400).json({ error: result.error || 'eTIMS still unreachable' });
  } catch (err) {
    console.error('Error retrying eTIMS submission:', err);
    res.status(400).json({ error: err.message || 'Failed to retry eTIMS submission' });
  }
};
