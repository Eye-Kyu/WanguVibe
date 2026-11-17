const HttpError = require('./httpError');

// Shared money/quantity guards for every path that prices a cart (sales,
// M-Pesa-backed sales, layaways). Every check is a strict *type* check, not
// a loose comparison: `undefined < 0` and `NaN > 0.5` are both false in JS,
// so a missing or non-numeric field used to slip straight past the old
// range checks and turn the computed total into NaN — which then made the
// "total matches calculated total" comparison pass for any totalAmount.

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const isPositiveAmount = (n) => isFiniteNumber(n) && n > 0;

// Returns a new array of { variant, quantity, discount } with discount
// defaulted to 0 when omitted. Throws HttpError(400) on anything else.
function normalizeLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'Invalid or empty items');
  }
  return items.map((item, idx) => {
    if (!item || !item.variant) throw new HttpError(400, 'Each item must reference a variant');
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new HttpError(400, 'Item quantity must be a positive whole number');
    }
    const discount = item.discount ?? 0;
    if (!isFiniteNumber(discount) || discount < 0 || discount > 100) {
      throw new HttpError(400, `Discount for item ${idx + 1} must be a number between 0 and 100%`);
    }
    return { variant: item.variant, quantity: item.quantity, discount };
  });
}

function normalizeCartDiscount(cartDiscount) {
  const d = cartDiscount ?? 0;
  if (!isFiniteNumber(d) || d < 0 || d > 100) {
    throw new HttpError(400, 'Cart discount must be between 0 and 100%');
  }
  return d;
}

// Final guard on the server-computed total — never trust a comparison
// against a value that could be NaN/Infinity.
function assertTotalMatches(calculatedTotal, totalAmount) {
  if (!isFiniteNumber(calculatedTotal) || Math.abs(calculatedTotal - totalAmount) > 0.5) {
    throw new HttpError(400, 'Total amount does not match calculated total');
  }
}

module.exports = { isFiniteNumber, isPositiveAmount, normalizeLineItems, normalizeCartDiscount, assertTotalMatches };
