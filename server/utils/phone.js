// Kenyan phone numbers arrive in several shapes (0712…, 712…, 254712…,
// +254 712 …). Customers are stored however staff typed them, so lookups
// try every equivalent form, and outbound SMS always uses E.164 (+254…).

function digitsOnly(input) {
  return String(input ?? '').replace(/\D/g, '');
}

// Returns '+2547XXXXXXXX' style, or null if it isn't a plausible KE mobile.
function toE164Kenya(input) {
  let d = digitsOnly(input);
  if (d.startsWith('254')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!/^[17]\d{8}$/.test(d)) return null;
  return `+254${d}`;
}

// Every stored form that means the same number, for an exact-match query.
function phoneVariants(input) {
  const e164 = toE164Kenya(input);
  const raw = String(input ?? '').trim();
  if (!e164) return raw ? [raw] : [];
  const local = e164.slice(4);
  return [...new Set([raw, e164, `254${local}`, `0${local}`, local])];
}

// For display/logging without exposing the whole number.
function maskPhone(input) {
  const e164 = toE164Kenya(input) || String(input ?? '');
  return e164.length > 4 ? `${e164.slice(0, 4)}••••${e164.slice(-3)}` : '••••';
}

module.exports = { toE164Kenya, phoneVariants, maskPhone, digitsOnly };
