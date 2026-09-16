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

// For public, unauthenticated self-service lookups (e.g. a customer checking
// their own store-credit/gift-card balance) — fundamentally different risk
// profile from every other route in this app (no auth at all gates it), so
// it gets its own tighter-than-globalLimiter ceiling per IP.
const publicLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

module.exports = { globalLimiter, moneyMovingLimiter, publicLookupLimiter };
