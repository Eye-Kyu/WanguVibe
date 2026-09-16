require('./instrument'); // must run before express/mongoose are required — see instrument.js
const Sentry = require('@sentry/node');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const connectDB = require('./config/db');
const { globalLimiter } = require('./middleware/rateLimiters');
const { startScheduledJobs } = require('./services/scheduledJobs');
const logger = require('./utils/logger');

// A crash outside any request (a bad timer callback, an unawaited rejected
// promise) would otherwise only ever show up as a stack trace in stdout —
// report it to Sentry before letting Node's default behavior proceed.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  Sentry.captureException(err);
  process.exit(1);
});

const authRoutes = require('./routes/auth');
const styleRoutes = require('./routes/styles');
const variantRoutes = require('./routes/variants');
const customerRoutes = require('./routes/customers');
const salesRoutes = require('./routes/sales');
const inventoryRoutes = require('./routes/inventory');
const auditRoutes = require('./routes/audit');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const shiftRoutes = require('./routes/shifts');
const giftcardRoutes = require('./routes/giftcards');
const paymentsRoutes = require('./routes/payments');
const etimsRoutes = require('./routes/etims');
const layawayRoutes = require('./routes/layaways');
const supplierRoutes = require('./routes/suppliers');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const stockEventsRoutes = require('./routes/stockEvents');
const pushSubscriptionRoutes = require('./routes/pushSubscriptions');
const publicLookupRoutes = require('./routes/publicLookup');
const webhookRoutes = require('./routes/webhooks');
const apiKeyRoutes = require('./routes/apiKeys');
const publicApiRoutes = require('./routes/publicApi');


connectDB();

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json()); //  Parse JSON bodies
app.use(globalLimiter);
// Every request gets a correlation id (from an incoming X-Request-Id header,
// or a fresh uuid) attached to req.id, and req.log is a child logger that
// stamps every line it writes with that id — so a single request's log
// lines (including whatever a controller logs mid-handler) can be grepped
// together, in production or in a log aggregator.
app.use(pinoHttp({ logger }));


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/styles', styleRoutes);
app.use('/api/variants', variantRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/giftcards', giftcardRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/etims', etimsRoutes);
app.use('/api/layaways', layawayRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/stock-events', stockEventsRoutes);
app.use('/api/push-subscriptions', pushSubscriptionRoutes);
app.use('/api/public', publicLookupRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/v1', publicApiRoutes);


//admin assigns role
app.use('/api/admin', adminRoutes);
//admin can delete users
app.use('/api/users', require('./routes/users'));
//audit logging
app.use('/api/audit', auditRoutes);


// Test route
app.get('/', (req, res) => res.send('POS API Running'));

// GET /health — for uptime monitors (UptimeRobot/Better Uptime/etc). Checks
// actual DB connectivity rather than just "the process is alive", since a
// dropped Mongo connection is the failure mode that matters most here.
app.get('/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    db: mongoose.STATES[mongoose.connection.readyState],
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// Every controller already catches its own errors and reports them via
// reportError() (both pino + Sentry) — this is only a safety net for
// anything that somehow still escapes a route handler uncaught.
Sentry.setupExpressErrorHandler(app);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  startScheduledJobs();
});
