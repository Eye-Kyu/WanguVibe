// Outbound SMS via Africa's Talking. SMS_MODE selects the backend:
//   mock — nothing leaves the machine; messages are logged and kept in an
//          in-memory outbox (tests read it via getOutbox()).
//   live — Africa's Talking bulk SMS API. Set AT_USERNAME to 'sandbox' to
//          use their sandbox (messages appear in the AT simulator, not on
//          real phones).
// Endpoint, form fields and the apiKey header follow Africa's Talking's
// documented SMS v1 API — confirm against their current docs when going
// live, and register a sender ID (AT_SENDER_ID) if you want one.
const logger = require('../utils/logger');
const { toE164Kenya, maskPhone } = require('../utils/phone');

const currentMode = () => process.env.SMS_MODE || 'mock';
const outbox = [];
const MAX_LENGTH = 459; // three concatenated GSM segments — keep costs bounded

function getOutbox() { return outbox; }
function clearOutbox() { outbox.length = 0; }

// Returns { status: 'sent' | 'failed', messageId, error }. Never throws for a
// delivery problem — callers treat SMS as best-effort.
async function sendSms(to, message) {
  const phone = toE164Kenya(to);
  if (!phone) return { status: 'failed', messageId: null, error: 'Invalid phone number' };
  const text = String(message).slice(0, MAX_LENGTH);

  if (currentMode() === 'mock') {
    const messageId = `mock-sms-${Date.now()}-${outbox.length}`;
    outbox.push({ to: phone, message: text, messageId, at: new Date() });
    logger.info({ to: maskPhone(phone), messageId }, 'SMS (mock) queued');
    return { status: 'sent', messageId, error: null };
  }

  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  if (!username || !apiKey) return { status: 'failed', messageId: null, error: 'AT_USERNAME and AT_API_KEY are required for SMS_MODE=live' };
  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';

  const form = new URLSearchParams({ username, to: phone, message: text });
  if (process.env.AT_SENDER_ID) form.set('from', process.env.AT_SENDER_ID);

  try {
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    const recipient = data?.SMSMessageData?.Recipients?.[0];
    if (!res.ok || !recipient || recipient.status !== 'Success') {
      const error = recipient?.status || data?.SMSMessageData?.Message || `HTTP ${res.status}`;
      logger.warn({ to: maskPhone(phone), error }, 'SMS delivery failed');
      return { status: 'failed', messageId: null, error };
    }
    return { status: 'sent', messageId: recipient.messageId, error: null };
  } catch (err) {
    logger.warn({ to: maskPhone(phone), err: err.message }, 'SMS request failed');
    return { status: 'failed', messageId: null, error: err.message };
  }
}

module.exports = { sendSms, getOutbox, clearOutbox, currentMode };
