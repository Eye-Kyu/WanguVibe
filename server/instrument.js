// Required as the very first line of server.js, before express/mongoose/
// anything else is required — Sentry's Node SDK auto-instruments modules
// (http, mongodb, express) via monkey-patching at require-time, which only
// works if Sentry.init() runs before those modules are first loaded.
require('dotenv').config();
const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}
