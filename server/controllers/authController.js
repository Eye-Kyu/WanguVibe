const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { REFRESH_TOKEN_TTL_MS, REFRESH_COOKIE_NAME, hashToken, generateRawToken, refreshCookieOptions } = require('../utils/refreshToken');

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_TTL = '15m';

const signAccessToken = (user) => jwt.sign(
  { id: user._id, role: user.role, name: user.name },
  JWT_SECRET,
  { expiresIn: ACCESS_TOKEN_TTL }
);

// Issues a new refresh token for a user, persists its hash, and sets the
// httpOnly cookie on the response. Returns nothing — purely a side effect,
// called from both login and refresh (rotation).
async function issueRefreshToken(res, user) {
  const rawToken = generateRawToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  res.cookie(REFRESH_COOKIE_NAME, rawToken, refreshCookieOptions());
}

// Register new user
exports.register = async (req, res) => {
    try {
        const { name, username, password, role } = req.body;

        if (typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ msg: 'Username and password must be strings' });
        }

        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ msg: 'User already exists' });

        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ name, username, password: hashed, role });

        await user.save();
        res.status(201).json({ msg: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Login — issues a short-lived access token in the JSON body (kept in memory
// / localStorage by the client, sent as a Bearer header) plus a long-lived
// refresh token in an httpOnly cookie the client's JS never touches.
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const user = await User.findOne({ username });

        if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

        const token = signAccessToken(user);
        await issueRefreshToken(res, user);

        res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/auth/refresh — exchanges the httpOnly refresh cookie for a new
// access token. Rotates the refresh token on every use (old row revoked, a
// fresh one issued + cookie reset) so a stolen-but-unused cookie can't be
// replayed indefinitely alongside the legitimate client.
exports.refresh = async (req, res) => {
    try {
        const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
        if (!rawToken) return res.status(401).json({ error: 'No refresh token' });

        const tokenHash = hashToken(rawToken);
        const stored = await RefreshToken.findOne({ tokenHash });
        if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
            res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
            return res.status(401).json({ error: 'Refresh token invalid or expired' });
        }

        const user = await User.findById(stored.user);
        if (!user) {
            return res.status(401).json({ error: 'Refresh token invalid or expired' });
        }

        stored.revokedAt = new Date();
        await stored.save();

        const token = signAccessToken(user);
        await issueRefreshToken(res, user);

        res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/auth/logout — revokes the refresh token server-side (so a copy
// of the cookie taken before logout can't be replayed) and clears it.
exports.logout = async (req, res) => {
    try {
        const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
        if (rawToken) {
            await RefreshToken.findOneAndUpdate({ tokenHash: hashToken(rawToken), revokedAt: null }, { revokedAt: new Date() });
        }
        res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
        res.json({ msg: 'Logged out' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
