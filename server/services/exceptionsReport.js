// "Exceptions" report: per staff member, everything that moves money or
// stock outside a plain full-price sale — discounts given (and how many
// needed manager approval), returns processed, voids, and till
// discrepancies. This is where till fraud shows up: one person whose
// discounts, refunds or shortfalls stand out from everyone else's.
// Computed in JS from the period's documents; a boutique's daily/weekly
// volume is far below where a pure aggregation pipeline would matter.
const Sale = require('../models/Sale');
const Shift = require('../models/Shift');
const User = require('../models/User');

const round2 = (n) => Math.round(n * 100) / 100;

function rangeBounds(range, now = new Date()) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'week') {
    const start = new Date(todayStart);
    start.setDate(todayStart.getDate() - 6);
    return { start, end: now };
  }
  if (range === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  return { start: todayStart, end: now };
}

function emptyRow() {
  return {
    salesCount: 0,
    grossMerchandise: 0,
    discountGiven: 0,
    discountedSales: 0,
    approvedDiscounts: 0,
    returnsCount: 0,
    returnsAmount: 0,
    cashRefunds: 0,
    voidsCount: 0,
    voidsAmount: 0,
    shiftsClosed: 0,
    netShiftDiscrepancy: 0,
    worstShortfall: 0,
  };
}

async function buildExceptionsReport({ start, end }) {
  const rows = new Map();
  const row = (id) => {
    const key = id ? id.toString() : 'unknown';
    if (!rows.has(key)) rows.set(key, emptyRow());
    return rows.get(key);
  };

  const [sales, returnSales, voidSales, shifts] = await Promise.all([
    Sale.find({ createdAt: { $gte: start, $lte: end } }, 'cashier items cartDiscount approvedBy').lean(),
    Sale.find({ 'returns.processedAt': { $gte: start, $lte: end } }, 'returns status void').lean(),
    Sale.find({ 'void.at': { $gte: start, $lte: end } }, 'void totalAmount').lean(),
    Shift.find({ closedAt: { $gte: start, $lte: end }, status: 'closed' }, 'openedBy discrepancy').lean(),
  ]);

  for (const sale of sales) {
    const r = row(sale.cashier);
    r.salesCount += 1;
    const cartFactor = 1 - (sale.cartDiscount || 0) / 100;
    let gross = 0;
    let net = 0;
    for (const item of sale.items) {
      const lineGross = item.unitPrice * item.quantity;
      gross += lineGross;
      net += lineGross * (1 - (item.discount || 0) / 100) * cartFactor;
    }
    r.grossMerchandise += gross;
    const discount = gross - net;
    if (discount > 0.005) {
      r.discountGiven += discount;
      r.discountedSales += 1;
    }
    if (sale.approvedBy) r.approvedDiscounts += 1;
  }

  for (const sale of returnSales) {
    for (const ret of sale.returns) {
      if (ret.processedAt < start || ret.processedAt > end) continue;
      // A void's reversal entries are counted as a void below, not a return.
      const isVoidEntry = sale.status === 'voided' && sale.void?.at && Math.abs(new Date(ret.processedAt) - new Date(sale.void.at)) < 60 * 1000 && (!ret.items || ret.items.length === 0);
      if (isVoidEntry) continue;
      const r = row(ret.processedBy);
      r.returnsCount += 1;
      r.returnsAmount += ret.amount;
      if (ret.destination === 'cash') r.cashRefunds += ret.amount;
    }
  }

  for (const sale of voidSales) {
    const r = row(sale.void.by);
    r.voidsCount += 1;
    r.voidsAmount += sale.totalAmount;
  }

  for (const shift of shifts) {
    const r = row(shift.openedBy);
    r.shiftsClosed += 1;
    r.netShiftDiscrepancy += shift.discrepancy || 0;
    r.worstShortfall = Math.min(r.worstShortfall, shift.discrepancy || 0);
  }

  const ids = [...rows.keys()].filter((k) => k !== 'unknown');
  const users = ids.length ? await User.find({ _id: { $in: ids } }, 'name role').lean() : [];
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  const staff = [...rows.entries()].map(([id, r]) => {
    const user = userById.get(id);
    return {
      userId: id === 'unknown' ? null : id,
      name: user?.name || 'Unknown',
      role: user?.role || null,
      ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? round2(v) : v])),
      discountRatePct: r.grossMerchandise > 0 ? round2((r.discountGiven / r.grossMerchandise) * 100) : 0,
    };
  }).sort((a, b) => (b.discountGiven + b.returnsAmount + b.voidsAmount + Math.abs(b.worstShortfall))
    - (a.discountGiven + a.returnsAmount + a.voidsAmount + Math.abs(a.worstShortfall)));

  const totals = staff.reduce((t, s) => ({
    discountGiven: round2(t.discountGiven + s.discountGiven),
    returnsAmount: round2(t.returnsAmount + s.returnsAmount),
    voidsAmount: round2(t.voidsAmount + s.voidsAmount),
    netShiftDiscrepancy: round2(t.netShiftDiscrepancy + s.netShiftDiscrepancy),
  }), { discountGiven: 0, returnsAmount: 0, voidsAmount: 0, netShiftDiscrepancy: 0 });

  return { start, end, staff, totals };
}

module.exports = { buildExceptionsReport, rangeBounds };
