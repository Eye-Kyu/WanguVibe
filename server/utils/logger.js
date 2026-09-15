const pino = require('pino');

// Pretty-printed for a human reading a dev terminal; plain JSON in
// production so it's shippable to a real log aggregator later without
// re-touching every call site. Built as an in-process transform stream
// rather than pino's `transport` option (which spawns pino-pretty on a
// worker_thread) — that worker silently stopped receiving messages once
// @sentry/node's instrumentation was initialized, dropping every
// request log with no error. Constructing the stream directly avoids the
// worker thread entirely, at the (irrelevant for this app's volume) cost of
// pretty-printing running on the main thread instead of off it.
const destination = process.env.NODE_ENV === 'production'
  ? undefined
  : require('pino-pretty')({ colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' });

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Auth headers/cookies must never land in logs verbatim — a JWT or the
  // refresh-token cookie in a log aggregator is as good as a stolen session.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[redacted]',
  },
}, destination);

module.exports = logger;
