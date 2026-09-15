const Sentry = require('@sentry/node');
const logger = require('./logger');

// Every caught-and-handled error in a controller goes through here instead
// of calling req.log.error directly, so it reaches both sinks at once: the
// structured log (grep/aggregator-friendly, always on) and Sentry (real-time
// alerting/dashboard, no-ops safely if SENTRY_DSN isn't set). Pass the
// Express `req` when available (for the request-correlation id in the log);
// pass null from code with no request in scope (e.g. finalizeSale).
function reportError(req, err, message) {
  const log = req?.log || logger;
  log.error({ err }, message);
  Sentry.captureException(err);
}

module.exports = { reportError };
