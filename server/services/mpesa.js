// Safaricom Daraja STK-push adapter. MPESA_MODE selects the backend:
//   mock     — no real credentials, no network call to Safaricom. Returns a
//              fake pending response immediately, then self-posts a callback
//              matching Daraja's real STK-callback shape to our own callback
//              endpoint after a short delay — so the callback handler runs
//              the exact same code path a real Safaricom callback would.
//   sandbox  — real Daraja sandbox (developer.safaricom.co.ke), for testing
//              against Safaricom's actual test environment.
//   production — real Daraja production API.
// Sandbox/production auth flow and payload shape are Daraja's documented
// OAuth + STK-push-v1 contract as of this writing — verify against current
// Daraja developer docs before relying on them in production, since API
// specifics are exactly the kind of thing that can change over time.

const { reportError } = require('../utils/reportError');

const crypto = require('crypto');

const MODE = process.env.MPESA_MODE || 'mock';

// Daraja's STK callback carries no signature, so the callback URL itself is
// the only thing that proves a request came from (or was sent on behalf of)
// Safaricom. A long random path segment, compared in constant time, stops
// anyone who merely knows a CheckoutRequestID from forging a "paid" result.
// Real modes must configure it; mock mode falls back to a per-process
// random value since it only ever posts to itself.
const CALLBACK_TOKEN = process.env.MPESA_CALLBACK_TOKEN
  || (MODE === 'mock' ? crypto.randomBytes(32).toString('hex') : null);

function callbackTokenMatches(candidate) {
  if (!CALLBACK_TOKEN || typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(CALLBACK_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// MPESA_CALLBACK_URL is the base (…/api/payments/mpesa/callback); the token
// is appended as the final path segment.
function callbackUrl() {
  const base = process.env.MPESA_CALLBACK_URL || `http://localhost:${process.env.PORT || 5000}/api/payments/mpesa/callback`;
  return `${base.replace(/\/+$/, '')}/${CALLBACK_TOKEN}`;
}

function randomId(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const host = MODE === 'production' ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(`https://${host}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Daraja auth failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

function mockCallbackBody({ checkoutRequestId, merchantRequestId, amount, phone, simulateFailure }) {
  if (simulateFailure) {
    return {
      Body: { stkCallback: {
        MerchantRequestID: merchantRequestId,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 1032,
        ResultDesc: 'Request cancelled by user (simulated)',
      } },
    };
  }
  return {
    Body: { stkCallback: {
      MerchantRequestID: merchantRequestId,
      CheckoutRequestID: checkoutRequestId,
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
      CallbackMetadata: { Item: [
        { Name: 'Amount', Value: amount },
        { Name: 'MpesaReceiptNumber', Value: randomId('MOCK') },
        { Name: 'TransactionDate', Value: Number(new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)) },
        { Name: 'PhoneNumber', Value: Number(phone.replace(/\D/g, '')) },
      ] },
    } },
  };
}

async function initiateStkPush({ phone, amount, accountReference, simulateFailure }) {
  if (MODE === 'mock') {
    const checkoutRequestId = randomId('ws_CO_mock_');
    const merchantRequestId = randomId('mock_merchant_');

    setTimeout(() => {
      // Hardcoding localhost here would silently break the mock flow the
      // moment this ran as anything other than a single instance on this
      // machine (a real deployment, a second replica, etc). MPESA_CALLBACK_URL
      // is already the real-mode config for exactly this address — reuse it.
      const body = mockCallbackBody({ checkoutRequestId, merchantRequestId, amount, phone, simulateFailure });
      fetch(callbackUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .catch(err => reportError(null, err, 'Mock M-Pesa callback self-post failed'));
    }, 2000);

    return { checkoutRequestId, merchantRequestId, responseCode: '0', responseDescription: 'Success. Request accepted for processing (mock)' };
  }

  // sandbox | production
  if (!process.env.MPESA_CALLBACK_TOKEN) {
    throw new Error('MPESA_CALLBACK_TOKEN must be set outside mock mode');
  }
  const token = await getAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  const host = MODE === 'production' ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';

  const res = await fetch(`https://${host}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl(),
      AccountReference: accountReference,
      TransactionDesc: 'POS sale',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.errorMessage || 'STK push failed');
  return {
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID,
    responseCode: data.ResponseCode,
    responseDescription: data.ResponseDescription,
  };
}

// Asks Daraja directly whether a checkout actually succeeded — the
// callback body is treated as a hint, never as proof of payment. Mock mode
// has no Safaricom to ask, so it trusts its own (token-authenticated)
// self-post. Returns { paid: boolean, resultCode, resultDesc }.
// Payload shape follows Daraja's STK Push Query v1 — verify against current
// developer docs before going live.
async function confirmStkPayment(checkoutRequestId) {
  if (MODE === 'mock') return { paid: true, resultCode: 0, resultDesc: 'mock' };

  const token = await getAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  const host = MODE === 'production' ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';

  const res = await fetch(`https://${host}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId }),
  });
  const data = await res.json().catch(() => ({}));
  const resultCode = Number(data.ResultCode);
  return { paid: res.ok && resultCode === 0, resultCode, resultDesc: data.ResultDesc };
}

// Where Daraja posts the async outcome of a reversal. Same secret-token
// scheme as the STK callback.
function reversalResultUrl() {
  const base = process.env.MPESA_REVERSAL_RESULT_URL || `http://localhost:${process.env.PORT || 5000}/api/payments/mpesa/reversal-result`;
  return `${base.replace(/\/+$/, '')}/${CALLBACK_TOKEN}`;
}

// Sends a customer's money back for a payment we took but couldn't turn
// into a sale. Returns one of:
//   { status: 'completed' }                        — mock: refunded immediately
//   { status: 'requested', conversationId }        — live: Daraja accepted the
//        request; the real outcome arrives later at reversalResultUrl()
// Throws if the request couldn't be made at all (caller leaves the payment
// flagged refund_required for an admin).
// Payload follows Daraja's Transaction Reversal v1 (note Daraja's own
// "RecieverIdentifierType" spelling) — verify against current developer
// docs and your shortcode's initiator setup before going live.
async function reverseTransaction({ receipt, amount, remarks = 'POS sale could not be completed' }) {
  if (!receipt) throw new Error('Cannot reverse a payment with no M-Pesa receipt number');
  if (MODE === 'mock') return { status: 'completed', conversationId: randomId('mock_reversal_') };

  const initiator = process.env.MPESA_INITIATOR_NAME;
  const securityCredential = process.env.MPESA_SECURITY_CREDENTIAL;
  if (!initiator || !securityCredential) {
    throw new Error('MPESA_INITIATOR_NAME and MPESA_SECURITY_CREDENTIAL are required for reversals');
  }
  const token = await getAccessToken();
  const host = MODE === 'production' ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';
  const resultUrl = reversalResultUrl();

  const res = await fetch(`https://${host}/mpesa/reversal/v1/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Initiator: initiator,
      SecurityCredential: securityCredential,
      CommandID: 'TransactionReversal',
      TransactionID: receipt,
      Amount: Math.round(amount),
      ReceiverParty: process.env.MPESA_SHORTCODE,
      RecieverIdentifierType: '11',
      ResultURL: resultUrl,
      QueueTimeOutURL: resultUrl,
      Remarks: remarks.slice(0, 100),
      Occasion: 'POS refund',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || String(data.ResponseCode) !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || `Reversal request failed: HTTP ${res.status}`);
  }
  return { status: 'requested', conversationId: data.ConversationID || data.OriginatorConversationID };
}

module.exports = { initiateStkPush, confirmStkPayment, reverseTransaction, callbackTokenMatches, MODE };
