const Sale = require('../models/Sale');
const { reportError } = require('../utils/reportError');
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
    reportError(req, err, 'Error fetching eTIMS retry queue');
    res.status(500).json({ error: 'Server error fetching eTIMS retry queue' });
  }
};

// Shared by the manual admin retry endpoint below and the automated sweep in
// services/scheduledJobs.js, so "what it means to retry a submission" is
// defined once. `entry` may be null (a sale flagged for retry with no
// existing queue row yet); returns { success, invoiceNumber, error }.
async function attemptRetry(sale, entry) {
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

    return { success: true, invoiceNumber: result.invoiceNumber };
  }

  const rejected = result.status === 'rejected';
  sale.etimsStatus = rejected ? 'rejected' : 'unreachable';
  await sale.save();

  if (entry) {
    entry.attempts += 1;
    entry.lastError = result.error;
    entry.lastAttemptAt = new Date();
    entry.status = rejected ? 'abandoned' : 'pending';
    await entry.save();
  } else {
    await EtimsRetryQueue.create({ sale: sale._id, lastError: result.error, lastAttemptAt: new Date(), status: rejected ? 'abandoned' : 'pending' });
  }

  return { success: false, error: result.error };
}
exports.attemptRetry = attemptRetry;

// POST /api/etims/retry/:saleId — admin-only manual retry. Automated retries
// also happen now via services/scheduledJobs.js; this stays for an admin who
// wants to force one immediately rather than wait for the next sweep tick.
exports.retrySubmission = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.saleId);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const entry = await EtimsRetryQueue.findOne({ sale: sale._id });
    const result = await attemptRetry(sale, entry);

    if (result.success) {
      logAudit({ action: 'etims_retry_resolved', details: { saleId: sale._id, invoiceNumber: result.invoiceNumber }, userId: req.user.id });
      return res.json({ message: 'eTIMS submission succeeded', sale });
    }

    res.status(400).json({ error: result.error || 'eTIMS still unreachable' });
  } catch (err) {
    reportError(req, err, 'Error retrying eTIMS submission');
    res.status(400).json({ error: err.message || 'Failed to retry eTIMS submission' });
  }
};
