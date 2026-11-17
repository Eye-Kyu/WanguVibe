const crypto = require('crypto');
const Customer = require('../models/Customer');
const PublicOtp = require('../models/PublicOtp');
const { sendSms } = require('../services/sms');
const { toE164Kenya, phoneVariants } = require('../utils/phone');
const businessName = () => process.env.BUSINESS_NAME || 'Wanguvibe';
const GiftCard = require('../models/GiftCard');
const { reportError } = require('../utils/reportError');

// Store-credit balance check is a two-step, SMS-verified flow. A phone
// number alone used to be enough to read a customer's name and balance,
// which let anyone enumerate who shops here; now the balance is only shown
// to whoever holds that phone.
//
// POST /api/public/store-credit/request-code { phone }
//   Always answers the same way, whether or not the number has an account,
//   so the response can't be used to probe for customers.
// POST /api/public/store-credit/verify { phone, code }
//   Returns { name, storeCreditBalance } for a valid, unexpired code.
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const GENERIC_SENT = { message: "If that number has an account with us, we've sent it a 6-digit code." };

const hashCode = (code) => crypto.createHmac('sha256', process.env.JWT_SECRET || 'otp').update(String(code)).digest('hex');

async function findCustomerByPhone(phone) {
  const variants = phoneVariants(phone);
  if (variants.length === 0) return null;
  return Customer.findOne({ phone: { $in: variants } });
}

exports.requestStoreCreditCode = async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (typeof phone !== 'string' || !toE164Kenya(phone)) {
      return res.status(400).json({ error: 'Enter a valid Kenyan mobile number' });
    }
    const customer = await findCustomerByPhone(phone);
    if (!customer) return res.json(GENERIC_SENT);

    const recent = await PublicOtp.findOne({
      customer: customer._id,
      purpose: 'store_credit_balance',
      createdAt: { $gte: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
    });
    if (recent) return res.json(GENERIC_SENT);

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await PublicOtp.create({
      purpose: 'store_credit_balance',
      customer: customer._id,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await sendSms(customer.phone, `${businessName()}: your balance check code is ${code}. It expires in 5 minutes. Don't share it with anyone.`);
    res.json(GENERIC_SENT);
  } catch (err) {
    reportError(req, err, 'Error sending store-credit code');
    res.status(500).json({ error: 'Server error sending code' });
  }
};

exports.verifyStoreCreditCode = async (req, res) => {
  const invalid = () => res.status(400).json({ error: 'That code is invalid or has expired. Request a new one.' });
  try {
    const { phone, code } = req.body || {};
    if (typeof phone !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) return invalid();
    const customer = await findCustomerByPhone(phone);
    if (!customer) return invalid();

    // Count the attempt before comparing, atomically, so parallel guesses
    // can't each slip in under the limit.
    const otp = await PublicOtp.findOneAndUpdate(
      { customer: customer._id, purpose: 'store_credit_balance', usedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: OTP_MAX_ATTEMPTS } },
      { $inc: { attempts: 1 } },
      { sort: { createdAt: -1 }, new: true }
    );
    if (!otp) return invalid();

    const a = Buffer.from(otp.codeHash, 'hex');
    const b = Buffer.from(hashCode(code), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return invalid();

    otp.usedAt = new Date();
    await otp.save();
    res.json({ name: customer.name, storeCreditBalance: customer.storeCreditBalance });
  } catch (err) {
    reportError(req, err, 'Error verifying store-credit code');
    res.status(500).json({ error: 'Server error verifying code' });
  }
};

// GET /api/public/gift-card?code=... — PUBLIC, no auth. GiftCard carries no
// PII, but this still only echoes back the minimal safe fields rather than
// the raw document (no _id, issuedBySale, etc.).
exports.getGiftCardBalance = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'code query param required' });
    const card = await GiftCard.findOne({ code: code.trim().toUpperCase() });
    if (!card) return res.status(404).json({ error: 'No gift card found for that code' });
    res.json({ code: card.code, currentBalance: card.currentBalance, status: card.status });
  } catch (err) {
    reportError(req, err, 'Error looking up public gift-card balance');
    res.status(500).json({ error: 'Server error looking up balance' });
  }
};
