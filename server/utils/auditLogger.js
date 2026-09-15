const Audit = require('../models/Audit');
const Sentry = require('@sentry/node');
const logger = require('./logger');

// Fire-and-forget audit write, called from inside controllers after the
// action it describes has already succeeded. Never let a logging failure
// take down the request that triggered it.
async function logAudit({ action, details, userId }) {
  try {
    await Audit.create({ action, details, userId });
  } catch (err) {
    logger.error({ err, action, userId }, 'Audit log write failed');
    Sentry.captureException(err);
  }
}

module.exports = { logAudit };
