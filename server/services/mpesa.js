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

const MODE = process.env.MPESA_MODE || 'mock';

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
      const callbackUrl = process.env.MPESA_CALLBACK_URL || `http://localhost:${process.env.PORT || 5000}/api/payments/mpesa/callback`;
      const body = mockCallbackBody({ checkoutRequestId, merchantRequestId, amount, phone, simulateFailure });
      fetch(callbackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .catch(err => reportError(null, err, 'Mock M-Pesa callback self-post failed'));
    }, 2000);

    return { checkoutRequestId, merchantRequestId, responseCode: '0', responseDescription: 'Success. Request accepted for processing (mock)' };
  }

  // sandbox | production
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
      CallBackURL: process.env.MPESA_CALLBACK_URL,
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

module.exports = { initiateStkPush, MODE };
