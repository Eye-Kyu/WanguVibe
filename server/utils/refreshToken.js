const crypto = require('crypto');

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_COOKIE_NAME = 'refreshToken';

const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

function generateRawToken() {
  return crypto.randomBytes(48).toString('hex');
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: '/api/auth',
  };
}

module.exports = { REFRESH_TOKEN_TTL_MS, REFRESH_COOKIE_NAME, hashToken, generateRawToken, refreshCookieOptions };
