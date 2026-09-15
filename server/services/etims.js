// KRA eTIMS (OSCU/VSCU) invoice submission adapter. ETIMS_MODE selects the
// backend:
//   mock — no real KRA credentials or network call. Returns an immediate
//          fake control-unit invoice number + QR payload, always accepted
//          (unless simulateFailure is passed, for testing the retry path).
//   live — NOT IMPLEMENTED. KRA's actual OSCU/VSCU auth flow, invoice
//          payload shape, and endpoint URLs are specific, versioned, and the
//          kind of thing that changes — they must be looked up against
//          current KRA eTIMS developer documentation (kra.go.ke) at the time
//          this is actually wired up, not assumed here. Only this adapter's
//          calling contract (a Sale in, {status, invoiceNumber, qrPayload}
//          out) is fixed today so checkout/receipt/retry-queue code can be
//          built and demoed against mock mode in the meantime.

const MODE = process.env.ETIMS_MODE || 'mock';

function randomInvoiceNumber() {
  return `KRAEX${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// submitInvoice(sale, opts) -> { status: 'accepted' | 'unreachable', invoiceNumber, qrPayload, error }
async function submitInvoice(sale, { simulateFailure } = {}) {
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

  throw new Error('ETIMS_MODE=live is not implemented — verify current KRA eTIMS (OSCU/VSCU) API documentation before wiring this up');
}

module.exports = { submitInvoice, MODE };
