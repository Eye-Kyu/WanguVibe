const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, refresh, logout, setApprovalPin } = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/authMiddleware'); // ✅ FIXED

// Throttle brute-force login attempts per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// A silent-refresh flow legitimately fires far more often than a login form
// submit (every ~15 min per active tab), so this needs its own, looser limit
// rather than sharing loginLimiter.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts. Please try again later.' },
});

// Public route
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshLimiter, refresh);
router.post('/logout', logout);

// Admin-only route to register users
router.post('/register', protect, adminOnly, register); // ✅ USE FIXED MIDDLEWARE
router.post('/approval-pin', protect, adminOnly, loginLimiter, setApprovalPin);

module.exports = router;
