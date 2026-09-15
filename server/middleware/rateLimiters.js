const rateLimit = require('express-rate-limit');

// A conservative floor applied to every request, so no single route is ever
// completely unbounded even if it forgets its own limiter.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter limit for routes that move real money or stock — a sale, a
// return/refund, or an M-Pesa STK push. Authenticated routes, so a
// legitimate cashier ringing up a busy till is well under this; it's aimed
// at a compromised/scripted client hammering the endpoint.
const moneyMovingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

module.exports = { globalLimiter, moneyMovingLimiter };
