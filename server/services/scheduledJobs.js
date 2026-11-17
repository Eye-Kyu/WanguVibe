// Background sweeps replacing what were previously purely reactive/manual
// checks — no job-queue infra exists in this app, so a couple of setIntervals
// is the pragmatic first step (see the Tier 2 roadmap note on this). Not
// safe to run on more than one server instance at once: each instance would
// independently sweep the same rows, and while attemptRetry/updateMany are
// individually safe to run twice, it'd mean duplicate KRA submissions being
// attempted concurrently. Fine for this app's current single-instance
// deployment; revisit (a distributed lock, or a real job queue) before ever
// running more than one instance.
const EtimsRetryQueue = require('../models/EtimsRetryQueue');
const PendingPayment = require('../models/PendingPayment');
const Variant = require('../models/Variant');
const { attemptRetry } = require('../controllers/etimsController');
const { STALE_PENDING_MS } = require('../controllers/paymentsController');
const { reportError } = require('../utils/reportError');
const { notifyAdmins } = require('./pushNotifications');
const logger = require('../utils/logger');
const Sentry = require('@sentry/node');
const { maybeSendWeeklySummary } = require('./ownerSummary');

const ETIMS_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const ETIMS_MAX_ATTEMPTS = 10; // beyond this, stop hammering KRA and surface it for a human instead
const ETIMS_BACKLOG_ALERT_THRESHOLD = 5;
const PENDING_PAYMENT_SWEEP_INTERVAL_MS = 60 * 1000;
const LOW_STOCK_SWEEP_INTERVAL_MS = 30 * 60 * 1000;

// In-memory dedup so a persisting backlog doesn't re-notify every single
// sweep tick (every 5 min) — resets once the backlog actually clears, so a
// *new* backlog episode alerts again. A server restart also resets it,
// which is an acceptable tradeoff for a push notification (not a
// correctness-critical record — the backlog itself is still tracked in the
// DB regardless of this flag).
let etimsBacklogAlerted = false;

// Same in-memory-dedup idea for low stock, keyed per-variant rather than a
// single flag: only *newly* low variants trigger a notification each sweep,
// and a variant is dropped from the set (so it can alert again later) once
// it's restocked back above its threshold.
let lowStockAlerted = new Set();

async function sweepEtimsRetryQueue() {
  const entries = await EtimsRetryQueue.find({ status: 'pending' }).populate('sale');

  for (const entry of entries) {
    if (!entry.sale) {
      // The sale was deleted after the retry row was created — nothing left to retry.
      entry.status = 'abandoned';
      entry.lastError = 'Referenced sale no longer exists';
      await entry.save();
      continue;
    }

    if (entry.attempts >= ETIMS_MAX_ATTEMPTS) {
      entry.status = 'abandoned';
      await entry.save();
      logger.warn({ saleId: entry.sale._id, attempts: entry.attempts }, 'eTIMS retry abandoned after max attempts — needs manual attention');
      Sentry.captureMessage(`eTIMS retry abandoned for sale ${entry.sale._id} after ${entry.attempts} attempts`, 'warning');
      continue;
    }

    try {
      const result = await attemptRetry(entry.sale, entry);
      if (result.success) {
        logger.info({ saleId: entry.sale._id }, 'eTIMS retry sweep resolved a pending submission');
      }
    } catch (err) {
      reportError(null, err, 'eTIMS retry sweep failed for a sale');
    }
  }

  const backlog = await EtimsRetryQueue.countDocuments({ status: 'pending' });
  if (backlog > ETIMS_BACKLOG_ALERT_THRESHOLD) {
    logger.warn({ backlog }, 'eTIMS retry queue backlog exceeds threshold');
    Sentry.captureMessage(`eTIMS retry queue backlog: ${backlog} pending submissions`, 'warning');
    if (!etimsBacklogAlerted) {
      etimsBacklogAlerted = true;
      notifyAdmins({
        title: 'eTIMS retry backlog',
        body: `${backlog} sale${backlog !== 1 ? 's' : ''} pending eTIMS retry`,
        tag: 'etims-backlog',
        data: { url: '/admin/etims' },
      }).catch((err) => reportError(null, err, 'Failed to send eTIMS-backlog notification'));
    }
  } else {
    etimsBacklogAlerted = false; // backlog cleared — a future episode can alert again
  }
}

// Reuses the exact same query as GET /api/variants/low-stock
// (variantController.getLowStockVariants) — "low" is per-variant against its
// own reorderThreshold, not a flat number.
async function sweepLowStock() {
  const lowVariants = await Variant.find({ $expr: { $lt: ['$stock', '$reorderThreshold'] }, active: true })
    .populate('style', 'name')
    .lean();

  const currentLowIds = new Set(lowVariants.map((v) => v._id.toString()));
  const newlyLow = lowVariants.filter((v) => !lowStockAlerted.has(v._id.toString()));

  if (newlyLow.length > 0) {
    const names = newlyLow.slice(0, 5).map((v) => `${v.style?.name || 'Unknown'} (${v.size}/${v.color})`).join(', ');
    const extra = newlyLow.length > 5 ? ` and ${newlyLow.length - 5} more` : '';
    logger.warn({ count: newlyLow.length }, 'New low-stock variants detected');
    notifyAdmins({
      title: 'Low stock alert',
      body: `${names}${extra}`,
      tag: 'low-stock',
      data: { url: '/admin/inventory' },
    }).catch((err) => reportError(null, err, 'Failed to send low-stock notification'));
  }

  lowStockAlerted = currentLowIds;
}

// Marks M-Pesa payments that never got a callback as timed out, even if no
// client ever polls GET /mpesa/:id/status to trigger the lazy check there —
// e.g. a cashier who closed the tab mid-payment.
async function sweepStalePendingPayments() {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS);
  const result = await PendingPayment.updateMany(
    { status: 'pending', createdAt: { $lt: cutoff } },
    { $set: { status: 'timed_out', resultMessage: 'No confirmation received in time' } }
  );
  if (result.modifiedCount > 0) {
    logger.info({ count: result.modifiedCount }, 'Marked stale pending M-Pesa payments as timed out');
  }
}

function startScheduledJobs() {
  setInterval(() => {
    sweepEtimsRetryQueue().catch((err) => reportError(null, err, 'eTIMS retry sweep crashed'));
  }, ETIMS_SWEEP_INTERVAL_MS);

  setInterval(() => {
    sweepStalePendingPayments().catch((err) => reportError(null, err, 'Pending payment sweep crashed'));
  }, PENDING_PAYMENT_SWEEP_INTERVAL_MS);

  setInterval(() => {
    sweepLowStock().catch((err) => reportError(null, err, 'Low stock sweep crashed'));
  }, LOW_STOCK_SWEEP_INTERVAL_MS);

  // Checked every 15 min; sends at most once per week (Monday morning,
  // Nairobi time), deduplicated in the database so restarts can't resend.
  setInterval(() => {
    maybeSendWeeklySummary().catch((err) => reportError(null, err, 'Weekly owner summary crashed'));
  }, 15 * 60 * 1000);

  logger.info('Scheduled jobs started (eTIMS retry sweep, stale pending-payment sweep, low stock sweep, weekly owner summary)');
}

module.exports = { startScheduledJobs, sweepEtimsRetryQueue, sweepStalePendingPayments, sweepLowStock };
