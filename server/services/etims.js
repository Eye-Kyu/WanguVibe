// KRA eTIMS (OSCU/VSCU) invoice submission adapter. ETIMS_MODE selects the
// backend:
//   mock — no KRA credentials or network call. Returns an immediate fake
//          control-unit invoice number + QR payload, always accepted (unless
//          simulateFailure is passed, for testing the retry path).
//   live — posts the sale to a KRA OSCU/VSCU endpoint.
//
// ⚠ LIVE MODE MUST BE VERIFIED BEFORE GO-LIVE. The request/response shapes
// below follow KRA's OSCU "save sales transaction" contract as publicly
// documented when this was written (header auth via tin/bhfId/cmcKey, a
// resultCd of "000" for success, a signed receipt block in `data`). KRA
// versions this API and every business is issued its own endpoint, branch
// id and communication key during OSCU/VSCU registration — confirm every
// field name, code and URL against the current KRA eTIMS technical spec and
// your sandbox before switching ETIMS_MODE to live. The mapping is isolated
// in buildSalesPayload()/parseSalesResponse() so that's the only code that
// should need touching.
//
// Calling contract (unchanged for callers):
//   submitInvoice(sale, opts) ->
//     { status: 'accepted', invoiceNumber, qrPayload, error: null }
//     { status: 'unreachable', ..., error }  — transient (network, timeout,
//                                              5xx): safe to retry
//     { status: 'rejected', ..., error }     — KRA refused the data (4xx /
//                                              non-000 result): retrying the
//                                              same payload won't help

const Counter = require('../models/Counter');

// Read per call (not at require time) so the mode can't silently differ
// from the environment, and tests can exercise live mode in-process.
const currentMode = () => process.env.ETIMS_MODE || 'mock';
const requestTimeoutMs = () => Number(process.env.ETIMS_TIMEOUT_MS) || 15000;

function randomInvoiceNumber() {
  return `KRAEX${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function liveConfig() {
  const cfg = {
    baseUrl: process.env.ETIMS_BASE_URL,
    tin: process.env.ETIMS_TIN,
    branchId: process.env.ETIMS_BRANCH_ID || '00',
    cmcKey: process.env.ETIMS_CMC_KEY,
    // KRA tax type for everything this boutique sells unless overridden —
    // 'B' is the standard-rated VAT band (16%) in KRA's A–E scheme.
    taxType: process.env.ETIMS_DEFAULT_TAX_TYPE || 'B',
    taxRate: Number(process.env.ETIMS_DEFAULT_TAX_RATE ?? 16),
    // KRA item classification code (UNSPSC-based). Apparel is commonly
    // classified under segment 53; confirm the right code for your goods.
    itemClassCode: process.env.ETIMS_DEFAULT_ITEM_CLASS || '5310000000',
  };
  const missing = ['baseUrl', 'tin', 'cmcKey'].filter((k) => !cfg[k]);
  if (missing.length) {
    throw new Error(`ETIMS_MODE=live requires ${missing.map((k) => `ETIMS_${k === 'baseUrl' ? 'BASE_URL' : k === 'cmcKey' ? 'CMC_KEY' : 'TIN'}`).join(', ')}`);
  }
  return cfg;
}

const yyyymmdd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const yyyymmddhhmmss = (d) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
const round2 = (n) => Math.round(n * 100) / 100;

// KRA payment type codes: 01 cash, 02 credit, 03 cash/credit, 04 bank
// check, 05 debit/credit card, 06 mobile money, 07 other.
const PAYMENT_TYPE_CODES = { cash: '01', card: '05', mpesa: '06', store_credit: '07', gift_card: '07', split: '07' };

// Prices in this app are VAT-inclusive (what the customer pays), so tax is
// backed out of each line rather than added on top.
function buildSalesPayload(sale, invoiceSeq, cfg) {
  const cartFactor = 1 - (sale.cartDiscount || 0) / 100;
  const created = new Date(sale.createdAt || Date.now());

  const itemList = sale.items.map((item, idx) => {
    const gross = item.unitPrice * item.quantity;
    const discountRate = round2(100 - (100 - (item.discount || 0)) * cartFactor);
    const discountAmt = round2(gross * (discountRate / 100));
    const total = round2(gross - discountAmt);
    const taxable = round2(total / (1 + cfg.taxRate / 100));
    return {
      itemSeq: idx + 1,
      itemCd: String(item.variant),
      itemClsCd: cfg.itemClassCode,
      itemNm: `${item.styleName} ${item.size}/${item.color}`.slice(0, 200),
      pkgUnitCd: 'NT',
      pkg: item.quantity,
      qtyUnitCd: 'U',
      qty: item.quantity,
      prc: item.unitPrice,
      splyAmt: round2(gross),
      dcRt: discountRate,
      dcAmt: discountAmt,
      taxTyCd: cfg.taxType,
      taxblAmt: taxable,
      taxAmt: round2(total - taxable),
      totAmt: total,
    };
  });

  const totTaxblAmt = round2(itemList.reduce((s, i) => s + i.taxblAmt, 0));
  const totTaxAmt = round2(itemList.reduce((s, i) => s + i.taxAmt, 0));
  const totAmt = round2(itemList.reduce((s, i) => s + i.totAmt, 0));
  const band = cfg.taxType;
  const bandFields = {};
  for (const b of ['A', 'B', 'C', 'D', 'E']) {
    bandFields[`taxblAmt${b}`] = b === band ? totTaxblAmt : 0;
    bandFields[`taxAmt${b}`] = b === band ? totTaxAmt : 0;
    bandFields[`taxRt${b}`] = b === band ? cfg.taxRate : 0;
  }

  return {
    tin: cfg.tin,
    bhfId: cfg.branchId,
    invcNo: invoiceSeq,
    orgInvcNo: 0,
    trdInvcNo: String(sale._id),
    custTin: null,
    custNm: null,
    salesTyCd: 'N', // normal sale
    rcptTyCd: 'S', // sale (a return would be 'R' — not yet submitted, see README)
    pmtTyCd: PAYMENT_TYPE_CODES[sale.paymentMethod] || '07',
    salesSttsCd: '02', // approved
    cfmDt: yyyymmddhhmmss(created),
    salesDt: yyyymmdd(created),
    totItemCnt: itemList.length,
    ...bandFields,
    totTaxblAmt,
    totTaxAmt,
    totAmt,
    prchrAcptcYn: 'N',
    regrId: 'POS',
    regrNm: 'POS',
    modrId: 'POS',
    modrNm: 'POS',
    receipt: { rptNo: invoiceSeq, trdeNm: process.env.ETIMS_TRADE_NAME || '', adrs: '', topMsg: '', btmMsg: '', prchrAcptcYn: 'N' },
    itemList,
  };
}

// Returns the adapter's own result shape from KRA's response body.
function parseSalesResponse(body, invoiceSeq) {
  if (body?.resultCd === '000' && body.data) {
    const d = body.data;
    const invoiceNumber = `${d.sdcId || 'SCU'}/${d.rcptNo ?? invoiceSeq}`;
    // What KRA expects on the printed receipt QR: the control unit id,
    // receipt number and its signature, so anyone can verify the invoice.
    const qrPayload = JSON.stringify({
      sdcId: d.sdcId, rcptNo: d.rcptNo, rcptSign: d.rcptSign, intrlData: d.intrlData, sdcDateTime: d.sdcDateTime, mrcNo: d.mrcNo,
    });
    return { status: 'accepted', invoiceNumber, qrPayload, error: null };
  }
  return {
    status: 'rejected',
    invoiceNumber: null,
    qrPayload: null,
    error: `KRA rejected invoice: ${body?.resultCd || 'no result code'} ${body?.resultMsg || ''}`.trim(),
  };
}

async function submitLive(sale) {
  const cfg = liveConfig();

  // An invoice number is assigned once per sale and reused on every retry,
  // so a submission KRA actually accepted (but whose response we lost) is
  // resent with the same number rather than becoming a second invoice.
  if (!sale.etimsInvoiceSeq) {
    sale.etimsInvoiceSeq = await Counter.next(`etims-invoice-${cfg.branchId}`);
    await sale.save();
  }
  const payload = buildSalesPayload(sale, sale.etimsInvoiceSeq, cfg);

  let res;
  try {
    res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/trnsSales/saveSales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', tin: cfg.tin, bhfId: cfg.branchId, cmcKey: cfg.cmcKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(requestTimeoutMs()),
    });
  } catch (err) {
    return { status: 'unreachable', invoiceNumber: null, qrPayload: null, error: `KRA eTIMS unreachable: ${err.message}` };
  }

  if (res.status >= 500 || res.status === 429) {
    return { status: 'unreachable', invoiceNumber: null, qrPayload: null, error: `KRA eTIMS returned HTTP ${res.status}` };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok && !body) {
    return { status: 'rejected', invoiceNumber: null, qrPayload: null, error: `KRA eTIMS returned HTTP ${res.status}` };
  }
  return parseSalesResponse(body, sale.etimsInvoiceSeq);
}

async function submitInvoice(sale, { simulateFailure } = {}) {
  const MODE = currentMode();
  if (MODE === 'mock') {
    if (simulateFailure) {
      return { status: 'unreachable', invoiceNumber: null, qrPayload: null, error: 'Simulated KRA eTIMS outage' };
    }
    const invoiceNumber = randomInvoiceNumber();
    // Distinct from the existing receipt-lookup QR ({id, total, date}) —
    // this one encodes what a real eTIMS QR would (the control-unit invoice
    // number), so the two are never conflated on the printed receipt.
    const qrPayload = JSON.stringify({
      invoiceNumber,
      saleId: sale._id.toString(),
      total: sale.totalAmount,
      date: sale.createdAt,
    });
    return { status: 'accepted', invoiceNumber, qrPayload, error: null };
  }
  if (MODE === 'live') return submitLive(sale);
  throw new Error(`Unknown ETIMS_MODE "${MODE}" — expected mock or live`);
}

module.exports = { submitInvoice, buildSalesPayload, parseSalesResponse, currentMode };
