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
const { attemptRetry } = require('../controllers/etimsController');
const { STALE_PENDING_MS } = require('../controllers/paymentsController');
const { reportError } = require('../utils/reportError');
const logger = require('../utils/logger');
const Sentry = require('@sentry/node');

const ETIMS_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const ETIMS_MAX_ATTEMPTS = 10; // beyond this, stop hammering KRA and surface it for a human instead
const ETIMS_BACKLOG_ALERT_THRESHOLD = 5;
const PENDING_PAYMENT_SWEEP_INTERVAL_MS = 60 * 1000;

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
  }
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

  logger.info('Scheduled jobs started (eTIMS retry sweep, stale pending-payment sweep)');
}

module.exports = { startScheduledJobs, sweepEtimsRetryQueue, sweepStalePendingPayments };
