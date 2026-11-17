const bcrypt = require('bcryptjs');
const User = require('../models/User');
const HttpError = require('./httpError');

// Manager override: an admin standing at the till authorizes something a
// cashier can't do alone (e.g. a large discount) by entering their username
// and approval PIN. The PIN is separate from the admin's login password so
// it can be typed in front of staff without exposing the account itself.

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Percent; a line whose *effective* discount (line × cart) exceeds this
// needs approval unless an admin is ringing the sale up themselves.
const discountApprovalThreshold = () => {
  const n = Number(process.env.DISCOUNT_APPROVAL_THRESHOLD);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 20;
};

const APPROVAL_REQUIRED = 'APPROVAL_REQUIRED';
const APPROVAL_INVALID = 'APPROVAL_INVALID';

class ApprovalError extends HttpError {
  constructor(message, code) {
    super(403, message);
    this.code = code;
  }
}

const isValidPin = (pin) => typeof pin === 'string' && /^\d{4,8}$/.test(pin);

// Returns the approving admin's id, or throws ApprovalError. Failed PINs
// count toward a per-admin lockout so a PIN can't be brute-forced from the
// till.
async function verifyApproval(approval) {
  const username = approval?.username;
  const pin = approval?.pin;
  if (typeof username !== 'string' || typeof pin !== 'string') {
    throw new ApprovalError('Manager approval details are missing', APPROVAL_INVALID);
  }
  const admin = await User.findOne({ username, role: 'admin' });
  if (!admin || !admin.approvalPinHash) {
    throw new ApprovalError('Invalid manager approval', APPROVAL_INVALID);
  }
  if (admin.approvalPinLockedUntil && admin.approvalPinLockedUntil > new Date()) {
    throw new ApprovalError('Approval PIN locked after too many attempts — try again later', APPROVAL_INVALID);
  }
  const ok = await bcrypt.compare(pin, admin.approvalPinHash);
  if (!ok) {
    const failures = (admin.approvalPinFailures || 0) + 1;
    const update = failures >= MAX_FAILED_ATTEMPTS
      ? { approvalPinFailures: 0, approvalPinLockedUntil: new Date(Date.now() + LOCKOUT_MS) }
      : { approvalPinFailures: failures };
    await User.updateOne({ _id: admin._id }, { $set: update });
    throw new ApprovalError('Invalid manager approval', APPROVAL_INVALID);
  }
  if (admin.approvalPinFailures || admin.approvalPinLockedUntil) {
    await User.updateOne({ _id: admin._id }, { $set: { approvalPinFailures: 0, approvalPinLockedUntil: null } });
  }
  return admin._id.toString();
}

// Highest effective discount across a cart, as a percentage.
function maxEffectiveDiscount(items, cartDiscount = 0) {
  const cartFactor = 1 - (cartDiscount || 0) / 100;
  return items.reduce((max, item) => Math.max(max, 100 - (100 - (item.discount || 0)) * cartFactor), 0);
}

// Throws APPROVAL_REQUIRED if this cart needs a manager and none was given.
function assertDiscountAllowed(items, cartDiscount, { role, approvedBy }) {
  if (role === 'admin' || approvedBy) return;
  const threshold = discountApprovalThreshold();
  const max = maxEffectiveDiscount(items, cartDiscount);
  if (max > threshold + 1e-9) {
    throw new ApprovalError(`Discounts over ${threshold}% need manager approval`, APPROVAL_REQUIRED);
  }
}

// For a route handler: if the body carries an `approval`, verify it up
// front and return the approver's id (or null when none was supplied).
async function resolveApproval(body) {
  if (!body?.approval) return null;
  return verifyApproval(body.approval);
}

module.exports = {
  ApprovalError,
  APPROVAL_REQUIRED,
  APPROVAL_INVALID,
  MAX_FAILED_ATTEMPTS,
  isValidPin,
  verifyApproval,
  resolveApproval,
  assertDiscountAllowed,
  maxEffectiveDiscount,
  discountApprovalThreshold,
};
