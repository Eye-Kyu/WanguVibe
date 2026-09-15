const bcrypt = require('bcryptjs');
const authController = require('../controllers/authController');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { REFRESH_COOKIE_NAME, hashToken } = require('../utils/refreshToken');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
}

async function makeLoginableUser(password = 'correct-horse') {
  const hashed = await bcrypt.hash(password, 4); // low cost factor — speed, not security, in tests
  return User.create({ name: 'Auth Test User', username: `authtest-${Date.now()}-${Math.random()}`, password: hashed, role: 'cashier' });
}

describe('login', () => {
  test('issues a short-lived access token in the body and a refresh cookie, backed by a hashed DB row', async () => {
    const user = await makeLoginableUser('correct-horse');
    const res = mockRes();

    await authController.login({ body: { username: user.username, password: 'correct-horse' } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      token: expect.any(String),
      user: expect.objectContaining({ name: user.name, role: user.role }),
    }));

    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, expect.any(String), expect.objectContaining({ httpOnly: true }));
    const rawToken = res.cookie.mock.calls[0][1];

    const stored = await RefreshToken.findOne({ user: user._id });
    expect(stored).toBeTruthy();
    expect(stored.tokenHash).toBe(hashToken(rawToken));
    expect(stored.revokedAt).toBeNull();
  });

  test('rejects a wrong password without issuing any tokens', async () => {
    const user = await makeLoginableUser('correct-horse');
    const res = mockRes();

    await authController.login({ body: { username: user.username, password: 'wrong' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(await RefreshToken.countDocuments({ user: user._id })).toBe(0);
  });
});

describe('refresh — rotation and revocation', () => {
  async function loginAndGetRawToken() {
    const user = await makeLoginableUser();
    const res = mockRes();
    await authController.login({ body: { username: user.username, password: 'correct-horse' } }, res);
    return { user, rawToken: res.cookie.mock.calls[0][1] };
  }

  test('exchanges a valid refresh cookie for a new access token and rotates it', async () => {
    const { rawToken } = await loginAndGetRawToken();
    const res = mockRes();

    await authController.refresh({ cookies: { [REFRESH_COOKIE_NAME]: rawToken } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: expect.any(String) }));
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, expect.any(String), expect.anything());

    const newRawToken = res.cookie.mock.calls[0][1];
    expect(newRawToken).not.toBe(rawToken);

    const oldStored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
    expect(oldStored.revokedAt).toBeTruthy();
    const newStored = await RefreshToken.findOne({ tokenHash: hashToken(newRawToken) });
    expect(newStored.revokedAt).toBeNull();
  });

  test('rejects reuse of an already-rotated (revoked) refresh token', async () => {
    const { rawToken } = await loginAndGetRawToken();
    await authController.refresh({ cookies: { [REFRESH_COOKIE_NAME]: rawToken } }, mockRes());

    const res = mockRes();
    await authController.refresh({ cookies: { [REFRESH_COOKIE_NAME]: rawToken } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects a missing refresh cookie', async () => {
    const res = mockRes();
    await authController.refresh({ cookies: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects an unrecognized refresh token and clears the cookie', async () => {
    const res = mockRes();
    await authController.refresh({ cookies: { [REFRESH_COOKIE_NAME]: 'not-a-real-token' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, expect.anything());
  });

  test('rejects an expired refresh token', async () => {
    const { rawToken, user } = await loginAndGetRawToken();
    await RefreshToken.updateOne({ user: user._id }, { expiresAt: new Date(Date.now() - 1000) });

    const res = mockRes();
    await authController.refresh({ cookies: { [REFRESH_COOKIE_NAME]: rawToken } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('logout', () => {
  test('revokes the refresh token and clears the cookie', async () => {
    const user = await makeLoginableUser();
    const loginRes = mockRes();
    await authController.login({ body: { username: user.username, password: 'correct-horse' } }, loginRes);
    const rawToken = loginRes.cookie.mock.calls[0][1];

    const res = mockRes();
    await authController.logout({ cookies: { [REFRESH_COOKIE_NAME]: rawToken } }, res);

    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, expect.anything());
    const stored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
    expect(stored.revokedAt).toBeTruthy();

    // The now-revoked token must no longer work for a refresh.
    const refreshRes = mockRes();
    await authController.refresh({ cookies: { [REFRESH_COOKIE_NAME]: rawToken } }, refreshRes);
    expect(refreshRes.status).toHaveBeenCalledWith(401);
  });

  test('is a no-op (no error) when there is no refresh cookie at all', async () => {
    const res = mockRes();
    await authController.logout({ cookies: {} }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ msg: expect.any(String) }));
  });
});
