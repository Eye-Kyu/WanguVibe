// Weekly owner digest: how the week went, what's selling, what's sitting
// unsold, and anything that needs attention — delivered by SMS (to
// OWNER_SUMMARY_PHONES) and as an admin push notification.
const Sale = require('../models/Sale');
const Variant = require('../models/Variant');
const EtimsRetryQueue = require('../models/EtimsRetryQueue');
const PendingPayment = require('../models/PendingPayment');
const JobState = require('../models/JobState');
const { buildExceptionsReport } = require('./exceptionsReport');
const { sendSms } = require('./sms');
const { notifyAdmins } = require('./pushNotifications');
const logger = require('../utils/logger');

const DAY = 24 * 60 * 60 * 1000;
const NET = { $subtract: ['$totalAmount', { $ifNull: ['$refundedAmount', 0] }] };
const fmt = (n) => Math.round(n).toLocaleString('en-KE');

async function revenueBetween(start, end) {
  const [row] = await Sale.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: null, net: { $sum: NET }, count: { $sum: { $cond: [{ $eq: ['$status', 'voided'] }, 0, 1] } } } },
  ]);
  return { net: row?.net || 0, count: row?.count || 0 };
}

async function buildWeeklySummary(now = new Date()) {
  const end = now;
  const start = new Date(end.getTime() - 7 * DAY);
  const prevStart = new Date(start.getTime() - 7 * DAY);

  const [thisWeek, lastWeek, topSellers, soldRecently, exceptions, etimsBacklog, refundsNeeded] = await Promise.all([
    revenueBetween(start, end),
    revenueBetween(prevStart, start),
    Sale.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $unwind: '$items' },
      { $group: {
        _id: { name: '$items.styleName', size: '$items.size', color: '$items.color' },
        units: { $sum: { $subtract: ['$items.quantity', { $ifNull: ['$items.returnedQuantity', 0] }] } },
      } },
      { $match: { units: { $gt: 0 } } },
      { $sort: { units: -1 } },
      { $limit: 5 },
    ]),
    Sale.distinct('items.variant', { createdAt: { $gte: new Date(end.getTime() - 30 * DAY) } }),
    buildExceptionsReport({ start, end }),
    EtimsRetryQueue.countDocuments({ status: { $in: ['pending', 'abandoned'] } }),
    PendingPayment.countDocuments({ status: 'refund_required' }),
  ]);

  // Dead stock: in stock, active, and not one sale in 30 days — ranked by
  // how much money is tied up in it (at cost).
  const unsold = await Variant.find({ active: true, stock: { $gt: 0 }, _id: { $nin: soldRecently } })
    .populate('style', 'name costPrice basePrice')
    .lean();
  const deadStock = unsold
    .map((v) => ({
      name: `${v.style?.name || 'Unknown'} ${v.size}/${v.color}`,
      stock: v.stock,
      valueAtCost: v.stock * (v.style?.costPrice || 0),
    }))
    .sort((a, b) => b.valueAtCost - a.valueAtCost || b.stock - a.stock)
    .slice(0, 5);

  const changePct = lastWeek.net > 0 ? ((thisWeek.net - lastWeek.net) / lastWeek.net) * 100 : null;

  return {
    start,
    end,
    revenue: thisWeek.net,
    salesCount: thisWeek.count,
    previousRevenue: lastWeek.net,
    changePct: changePct === null ? null : Math.round(changePct * 10) / 10,
    topSellers: topSellers.map((t) => ({ name: `${t._id.name} ${t._id.size}/${t._id.color}`, units: t.units })),
    deadStock,
    deadStockValue: unsold.reduce((s, v) => s + v.stock * (v.style?.costPrice || 0), 0),
    exceptions: exceptions.totals,
    worstShortfall: exceptions.staff.reduce((m, s) => (s.worstShortfall < m.value ? { name: s.name, value: s.worstShortfall } : m), { name: null, value: 0 }),
    etimsBacklog,
    refundsNeeded,
  };
}

// Plain text, short enough for a few SMS segments.
function formatWeeklySummary(s) {
  const business = process.env.BUSINESS_NAME || 'Wanguvibe';
  const change = s.changePct === null ? '' : ` (${s.changePct >= 0 ? '+' : ''}${s.changePct}% vs last wk)`;
  const lines = [`${business} week: KES ${fmt(s.revenue)} from ${s.salesCount} sales${change}.`];
  if (s.topSellers.length) lines.push(`Top: ${s.topSellers.slice(0, 3).map((t) => `${t.name} x${t.units}`).join(', ')}.`);
  if (s.deadStock.length) lines.push(`Not selling (30d): ${s.deadStock.slice(0, 2).map((d) => `${d.name} (${d.stock})`).join(', ')}; KES ${fmt(s.deadStockValue)} tied up.`);
  const flags = [];
  if (s.exceptions.discountGiven > 0) flags.push(`discounts KES ${fmt(s.exceptions.discountGiven)}`);
  if (s.exceptions.voidsAmount > 0) flags.push(`voids KES ${fmt(s.exceptions.voidsAmount)}`);
  if (s.worstShortfall.value < 0) flags.push(`till short KES ${fmt(-s.worstShortfall.value)} (${s.worstShortfall.name})`);
  if (s.refundsNeeded > 0) flags.push(`${s.refundsNeeded} M-Pesa refund(s) need action`);
  if (s.etimsBacklog > 0) flags.push(`${s.etimsBacklog} KRA invoice(s) not submitted`);
  if (flags.length) lines.push(`Check: ${flags.join('; ')}.`);
  return lines.join(' ');
}

function ownerPhones() {
  return (process.env.OWNER_SUMMARY_PHONES || '').split(',').map((p) => p.trim()).filter(Boolean);
}

async function sendWeeklySummary(now = new Date()) {
  const summary = await buildWeeklySummary(now);
  const text = formatWeeklySummary(summary);
  const sms = await Promise.all(ownerPhones().map((p) => sendSms(p, text)));
  await notifyAdmins({ title: 'Your week at a glance', body: text.slice(0, 240), tag: 'weekly-summary', data: { url: '/admin/exceptions' } })
    .catch((err) => logger.warn({ err: err.message }, 'Weekly summary push failed'));
  logger.info({ smsSent: sms.filter((r) => r.status === 'sent').length }, 'Weekly owner summary sent');
  return { text, smsSent: sms.filter((r) => r.status === 'sent').length, smsFailed: sms.filter((r) => r.status !== 'sent').length };
}

// ISO-8601 week key ("2026-W47") for a date in Nairobi time.
function nairobiParts(date) {
  const local = new Date(date.getTime() + 3 * 60 * 60 * 1000); // EAT is UTC+3, no DST
  return { day: local.getUTCDay(), hour: local.getUTCHours(), local };
}
function isoWeekKey(date) {
  const { local } = nairobiParts(date);
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Called by the scheduler: sends on Monday from 08:00 Nairobi time, once per week.
async function maybeSendWeeklySummary(now = new Date()) {
  const { day, hour } = nairobiParts(now);
  if (day !== 1 || hour < 8) return { sent: false, reason: 'not yet' };
  const won = await JobState.claim('weekly-owner-summary', isoWeekKey(now));
  if (!won) return { sent: false, reason: 'already sent this week' };
  const result = await sendWeeklySummary(now);
  return { sent: true, ...result };
}

module.exports = { buildWeeklySummary, formatWeeklySummary, sendWeeklySummary, maybeSendWeeklySummary, isoWeekKey };
