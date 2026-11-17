const express = require('express');
const { reportError } = require('../utils/reportError');
const router = express.Router();
const Sale = require('../models/Sale');
const Variant = require('../models/Variant');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { buildExceptionsReport, rangeBounds } = require('../services/exceptionsReport');
const { buildWeeklySummary, formatWeeklySummary, sendWeeklySummary } = require('../services/ownerSummary');

// % change from prev to current; null when no previous data
const trendPct = (current, prev) =>
    prev > 0 ? parseFloat(((current - prev) / prev * 100).toFixed(1)) : null;

// Revenue net of refunds — refundedAmount may be absent on sales created
// before returns existed, hence the $ifNull.
const NET_AMOUNT = { $subtract: ['$totalAmount', { $ifNull: ['$refundedAmount', 0] }] };

router.get('/summary', protect, async (req, res) => {
    try {
        const range = req.query.range || 'day';
        const now = new Date();

        // ── Date boundaries ──────────────────────────────────────────
        const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(todayStart.getDate() - 1);

        const weekStart     = new Date(todayStart);
        weekStart.setDate(todayStart.getDate() - 6);
        const prevWeekStart = new Date(weekStart);
        prevWeekStart.setDate(weekStart.getDate() - 7);

        const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        let rangeStart;
        if (range === 'week')       rangeStart = weekStart;
        else if (range === 'month') rangeStart = monthStart;
        else                        rangeStart = todayStart;

        // ── All queries in parallel ──────────────────────────────────
        const [
            todayAgg,
            yesterdayAgg,
            weekAgg,
            prevWeekAgg,
            monthAgg,
            prevMonthAgg,
            totalStockAgg,
            topProducts,
            stockLevels,
            lowStockItems,
            chartAgg,
            paymentAgg,
            recentSales,
        ] = await Promise.all([

            Sale.aggregate([
                { $match: { createdAt: { $gte: todayStart } } },
                { $group: { _id: null, total: { $sum: NET_AMOUNT }, count: { $sum: 1 } } },
            ]),
            Sale.aggregate([
                { $match: { createdAt: { $gte: yesterdayStart, $lt: todayStart } } },
                { $group: { _id: null, total: { $sum: NET_AMOUNT } } },
            ]),

            Sale.aggregate([
                { $match: { createdAt: { $gte: weekStart } } },
                { $group: { _id: null, total: { $sum: NET_AMOUNT }, count: { $sum: 1 } } },
            ]),
            Sale.aggregate([
                { $match: { createdAt: { $gte: prevWeekStart, $lt: weekStart } } },
                { $group: { _id: null, total: { $sum: NET_AMOUNT } } },
            ]),

            Sale.aggregate([
                { $match: { createdAt: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: NET_AMOUNT }, count: { $sum: 1 } } },
            ]),
            Sale.aggregate([
                { $match: { createdAt: { $gte: prevMonthStart, $lt: monthStart } } },
                { $group: { _id: null, total: { $sum: NET_AMOUNT } } },
            ]),

            Variant.aggregate([
                { $group: { _id: null, total: { $sum: '$stock' } } },
            ]),

            // Best sellers grouped by style name (denormalized onto each sale
            // line at checkout, so this doesn't need a $lookup against a
            // style that may have since changed or been deleted)
            Sale.aggregate([
                { $match: { createdAt: { $gte: rangeStart } } },
                { $unwind: '$items' },
                { $group: { _id: '$items.styleName', qty: { $sum: { $subtract: ['$items.quantity', { $ifNull: ['$items.returnedQuantity', 0] }] } } } },
                { $sort: { qty: -1 } },
                { $limit: 5 },
                { $project: { name: '$_id', qty: 1, _id: 0 } },
            ]),

            Variant.find({ active: true }, 'size color stock')
                .populate('style', 'name')
                .lean(),

            // Low stock is per-variant against that variant's own reorderThreshold
            // (a boutique's "low" for one size/color is much smaller than a
            // mini-mart's flat count), not a hardcoded "< 10"
            Variant.find({ $expr: { $lt: ['$stock', '$reorderThreshold'] }, active: true }, 'size color stock reorderThreshold')
                .populate('style', 'name')
                .lean(),

            Sale.aggregate([
                { $match: { createdAt: { $gte: rangeStart } } },
                {
                    $group: {
                        _id: {
                            year:  { $year:  '$createdAt' },
                            month: { $month: '$createdAt' },
                            day:   { $dayOfMonth: '$createdAt' },
                        },
                        total: { $sum: NET_AMOUNT },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            ]),

            // Unwinds payments[] rather than grouping by the whole-sale
            // paymentMethod field, so a split-tender sale's cash/card/etc
            // portions each land in their real bucket instead of an opaque
            // 'split' one. Reports gross amounts at sale time — a return
            // doesn't say which original payment line it reduces, so
            // attributing a refund back across split lines isn't attempted
            // here (refunds are already visible in the returns/refund
            // reporting elsewhere). `count` is now "how many times this
            // method was used as a tender line", which for the common
            // single-method sale is identical to "how many sales used it".
            Sale.aggregate([
                { $match: { createdAt: { $gte: rangeStart } } },
                { $unwind: '$payments' },
                {
                    $group: {
                        _id:   '$payments.method',
                        total: { $sum: '$payments.amount' },
                        count: { $sum: 1 },
                    },
                },
            ]),

            Sale.find()
                .populate('cashier', 'name')
                .sort({ createdAt: -1 })
                .limit(8)
                .lean(),
        ]);

        // ── Derive range metrics from the right bucket ───────────────
        const rangeAgg =
            range === 'week'  ? weekAgg  :
            range === 'month' ? monthAgg :
            todayAgg;

        const rangeRevenue      = rangeAgg[0]?.total || 0;
        const rangeTransactions = rangeAgg[0]?.count  || 0;

        // ── Trends ───────────────────────────────────────────────────
        const todayTrend = trendPct(todayAgg[0]?.total || 0, yesterdayAgg[0]?.total || 0);
        const weekTrend  = trendPct(weekAgg[0]?.total  || 0, prevWeekAgg[0]?.total  || 0);

        // ── Format response ──────────────────────────────────────────
        const paymentLabels = { mpesa: 'M-Pesa', cash: 'Cash', card: 'Card' };
        const paymentBreakdown = paymentAgg.map(p => ({
            name:  paymentLabels[p._id] || p._id,
            total: p.total,
            count: p.count,
        }));

        // Variant stock levels/low-stock read as "Style Name (Size/Color)" —
        // the boutique equivalent of the mini-mart's flat product name
        const nameVariant = v => `${v.style?.name || 'Unknown'} (${v.size}/${v.color})`;
        const stockLevelsFormatted = stockLevels.map(v => ({ name: nameVariant(v), stock: v.stock }));
        const lowStockItemsFormatted = lowStockItems.map(v => ({
            name: nameVariant(v),
            stock: v.stock,
            reorderThreshold: v.reorderThreshold,
        }));

        const chartData = chartAgg.map(({ _id, total, count }) => ({
            date: new Date(_id.year, _id.month - 1, _id.day).toLocaleDateString('en-US', {
                month: 'short',
                day:   'numeric',
            }),
            total,
            count,
        }));

        return res.json({
            // ── Fixed KPI cards (always today / this-week) ──
            todaySales:        todayAgg[0]?.total || 0,
            todayTransactions: todayAgg[0]?.count || 0,
            todayTrend,
            weekSales:         weekAgg[0]?.total  || 0,
            weekTransactions:  weekAgg[0]?.count  || 0,
            weekTrend,
            totalStock:        totalStockAgg[0]?.total || 0,
            bestSeller:        topProducts[0]?.name    || '',

            // ── Range-driven metrics (change with selector) ──
            rangeRevenue,
            rangeTransactions,
            avgOrderValue: rangeTransactions > 0
                ? parseFloat((rangeRevenue / rangeTransactions).toFixed(2))
                : 0,

            // ── Charts ──────────────────────────────────────
            chartData,
            topProducts,
            stockLevels: stockLevelsFormatted,
            paymentBreakdown,

            // ── Table + alerts ───────────────────────────────
            recentSales,
            lowStockItems: lowStockItemsFormatted,
        });

    } catch (err) {
        reportError(req, err, 'Dashboard summary failed');
        return res.status(500).json({ error: 'Dashboard summary failed' });
    }
});

// GET /api/dashboard/margins — adminOnly (unlike /summary): actual supplier
// cost data is more sensitive than aggregate revenue, matching the adminOnly
// gate already used for shifts/gift cards/audit/suppliers/POs elsewhere.
// Cost basis is Style.costPrice as it stands TODAY (Sale.items doesn't
// snapshot cost at sale time) — a supplier-cost change recalculates margin on
// past sales too. A deliberate v1 trade-off, not an oversight.
// Named (not inline) specifically so tests can call it directly with a
// mock req/res, same convention the controllers in this app already use —
// none of the aggregation math depends on the protect/adminOnly middleware.
async function getMarginReport(req, res) {
    try {
        const range = req.query.range || 'day';
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(todayStart.getDate() - 6);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        let rangeStart;
        if (range === 'week') rangeStart = weekStart;
        else if (range === 'month') rangeStart = monthStart;
        else rangeStart = todayStart;

        // Shared preprocessing down to one row per sale line, with its net
        // quantity/revenue/cost/margin computed — reused below with a
        // different terminal $group for each of the three output shapes.
        const basePipeline = [
            { $match: { createdAt: { $gte: rangeStart } } },
            { $unwind: '$items' },
            {
                // Nets out returns, same convention /summary's topProducts
                // already uses — a returned line contributes zero here too,
                // so a fully-returned sale needs no separate status filter.
                $addFields: {
                    netQty: { $subtract: ['$items.quantity', { $ifNull: ['$items.returnedQuantity', 0] }] },
                },
            },
            {
                // Reproduces finalizeSale's exact revenue formula (per-line
                // discount, then the whole-cart discount) so this report's
                // revenue figures foot to real sale totals.
                $addFields: {
                    lineRevenue: {
                        $multiply: [
                            '$items.unitPrice',
                            '$netQty',
                            { $subtract: [1, { $divide: [{ $ifNull: ['$items.discount', 0] }, 100] }] },
                            { $subtract: [1, { $divide: [{ $ifNull: ['$cartDiscount', 0] }, 100] }] },
                        ],
                    },
                },
            },
            { $lookup: { from: 'variants', localField: 'items.variant', foreignField: '_id', as: 'variantDoc' } },
            { $unwind: { path: '$variantDoc', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'styles', localField: 'variantDoc.style', foreignField: '_id', as: 'styleDoc' } },
            // preserveNullAndEmptyArrays so a sale line whose variant/style
            // has since been deleted isn't dropped from the report — it just
            // contributes zero cost and lands in an Uncategorized bucket,
            // the same graceful-degradation convention as /summary's
            // `v.style?.name || 'Unknown'`.
            { $unwind: { path: '$styleDoc', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    category: { $ifNull: ['$styleDoc.category', 'Uncategorized'] },
                    lineCost: { $multiply: [{ $ifNull: ['$styleDoc.costPrice', 0] }, '$netQty'] },
                },
            },
            { $addFields: { lineMargin: { $subtract: ['$lineRevenue', '$lineCost'] } } },
        ];

        const [totalsAgg, byStyleAgg, byCategoryAgg] = await Promise.all([
            Sale.aggregate([
                ...basePipeline,
                { $group: { _id: null, revenue: { $sum: '$lineRevenue' }, cost: { $sum: '$lineCost' }, grossProfit: { $sum: '$lineMargin' } } },
            ]),
            Sale.aggregate([
                ...basePipeline,
                {
                    $group: {
                        _id: '$items.styleName',
                        category: { $first: '$category' },
                        qty: { $sum: '$netQty' },
                        revenue: { $sum: '$lineRevenue' },
                        cost: { $sum: '$lineCost' },
                        grossProfit: { $sum: '$lineMargin' },
                    },
                },
                { $sort: { grossProfit: -1 } },
                { $limit: 50 },
                { $project: { _id: 0, name: '$_id', category: 1, qty: 1, revenue: 1, cost: 1, grossProfit: 1 } },
            ]),
            Sale.aggregate([
                ...basePipeline,
                {
                    $group: {
                        _id: '$category',
                        qty: { $sum: '$netQty' },
                        revenue: { $sum: '$lineRevenue' },
                        cost: { $sum: '$lineCost' },
                        grossProfit: { $sum: '$lineMargin' },
                    },
                },
                { $sort: { grossProfit: -1 } },
                { $project: { _id: 0, category: '$_id', qty: 1, revenue: 1, cost: 1, grossProfit: 1 } },
            ]),
        ]);

        const marginPct = (revenue, grossProfit) => (revenue > 0 ? parseFloat(((grossProfit / revenue) * 100).toFixed(1)) : 0);
        const withMarginPct = (rows) => rows.map((r) => ({ ...r, marginPct: marginPct(r.revenue, r.grossProfit) }));

        const totalsRow = totalsAgg[0] || { revenue: 0, cost: 0, grossProfit: 0 };
        const totals = {
            revenue: totalsRow.revenue || 0,
            cost: totalsRow.cost || 0,
            grossProfit: totalsRow.grossProfit || 0,
            marginPct: marginPct(totalsRow.revenue || 0, totalsRow.grossProfit || 0),
        };

        res.json({
            range,
            totals,
            byStyle: withMarginPct(byStyleAgg),
            byCategory: withMarginPct(byCategoryAgg),
        });
    } catch (err) {
        reportError(req, err, 'Margin report failed');
        res.status(500).json({ error: 'Margin report failed' });
    }
}

router.get('/margins', protect, adminOnly, getMarginReport);

// GET /api/dashboard/customer-value — adminOnly. Deliberately NOT
// range-filtered: "lifetime" value by definition covers every sale a
// customer ever made. Sales with no customer attached (walk-ins) have no
// identity to attribute value to and are excluded.
async function getCustomerValue(req, res) {
    try {
        const agg = await Sale.aggregate([
            { $match: { customer: { $ne: null } } },
            {
                $group: {
                    _id: '$customer',
                    totalSpend: { $sum: NET_AMOUNT },
                    orderCount: { $sum: 1 },
                    firstPurchase: { $min: '$createdAt' },
                    lastPurchase: { $max: '$createdAt' },
                },
            },
            { $sort: { totalSpend: -1 } },
            { $limit: 50 },
        ]);

        const customerIds = agg.map((a) => a._id).filter(Boolean);
        const customers = customerIds.length
            ? await Customer.find({ _id: { $in: customerIds } }, 'name phone').lean()
            : [];
        const customerById = new Map(customers.map((c) => [c._id.toString(), c]));

        // A customer deleted since their sales were made is skipped rather
        // than shown as "Unknown" — there's no real remaining identity to
        // report lifetime value against.
        const customersOut = agg
            .map((a) => {
                const customer = a._id && customerById.get(a._id.toString());
                if (!customer) return null;
                return {
                    customerId: a._id,
                    name: customer.name,
                    phone: customer.phone || null,
                    totalSpend: a.totalSpend,
                    orderCount: a.orderCount,
                    avgOrderValue: parseFloat((a.totalSpend / a.orderCount).toFixed(2)),
                    firstPurchase: a.firstPurchase,
                    lastPurchase: a.lastPurchase,
                };
            })
            .filter(Boolean);

        res.json({ customers: customersOut });
    } catch (err) {
        reportError(req, err, 'Customer value report failed');
        res.status(500).json({ error: 'Customer value report failed' });
    }
}

router.get('/customer-value', protect, adminOnly, getCustomerValue);

// GET /api/dashboard/staff-performance?range=day|week|month — adminOnly
// (individual cashier performance is HR-adjacent, sensitive data). Reuses
// the exact range/boundary logic already used by /summary and /margins.
async function getStaffPerformance(req, res) {
    try {
        const range = req.query.range || 'day';
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(todayStart.getDate() - 6);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        let rangeStart;
        if (range === 'week') rangeStart = weekStart;
        else if (range === 'month') rangeStart = monthStart;
        else rangeStart = todayStart;

        const agg = await Sale.aggregate([
            { $match: { createdAt: { $gte: rangeStart } } },
            {
                $group: {
                    _id: '$cashier',
                    revenue: { $sum: NET_AMOUNT },
                    transactionCount: { $sum: 1 },
                },
            },
            { $sort: { revenue: -1 } },
        ]);

        const cashierIds = agg.map((a) => a._id).filter(Boolean);
        const cashiers = cashierIds.length ? await User.find({ _id: { $in: cashierIds } }, 'name').lean() : [];
        const cashierById = new Map(cashiers.map((c) => [c._id.toString(), c]));

        const staff = agg.map((a) => {
            const cashier = a._id && cashierById.get(a._id.toString());
            return {
                cashierId: a._id,
                name: cashier?.name || 'Unknown',
                revenue: a.revenue,
                transactionCount: a.transactionCount,
                avgSaleValue: parseFloat((a.revenue / a.transactionCount).toFixed(2)),
            };
        });

        res.json({ range, staff });
    } catch (err) {
        reportError(req, err, 'Staff performance report failed');
        res.status(500).json({ error: 'Staff performance report failed' });
    }
}

router.get('/staff-performance', protect, adminOnly, getStaffPerformance);

// GET /api/dashboard/cohorts — adminOnly. Monthly acquisition-cohort
// retention: a customer's cohort is the calendar month of their FIRST
// purchase; retention at monthOffset N is how many of that cohort made ANY
// purchase N months after their own cohort month. Computed in plain JS
// after one aggregate (rather than one giant pipeline) for maintainability
// — a boutique's customer count doesn't need pipeline-level scale here.
// Only sales with a customer attached are cohortable, same exclusion as
// getCustomerValue.
async function getCohortRetention(req, res) {
    try {
        const agg = await Sale.aggregate([
            { $match: { customer: { $ne: null } } },
            {
                $group: {
                    _id: '$customer',
                    // $addToSet already dedupes, so a customer with 3 sales
                    // in the same month contributes that month exactly once.
                    months: { $addToSet: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } },
                },
            },
        ]);

        // cohortMonth ('YYYY-MM') -> { cohortSize, retainedByOffset: Map<offset, count> }
        const cohorts = new Map();

        for (const { months } of agg) {
            if (!months || months.length === 0) continue;
            const sortedMonths = [...months].sort(); // 'YYYY-MM' strings sort chronologically as plain strings
            const cohortMonth = sortedMonths[0];
            const [cohortYear, cohortMon] = cohortMonth.split('-').map(Number);

            if (!cohorts.has(cohortMonth)) cohorts.set(cohortMonth, { cohortSize: 0, retainedByOffset: new Map() });
            const cohort = cohorts.get(cohortMonth);
            cohort.cohortSize += 1;

            for (const month of sortedMonths) {
                const [year, mon] = month.split('-').map(Number);
                const monthOffset = (year - cohortYear) * 12 + (mon - cohortMon);
                cohort.retainedByOffset.set(monthOffset, (cohort.retainedByOffset.get(monthOffset) || 0) + 1);
            }
        }

        const cohortRows = [...cohorts.entries()]
            .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // most recent cohort month first
            .slice(0, 12)
            .map(([cohortMonth, { cohortSize, retainedByOffset }]) => ({
                cohortMonth,
                cohortSize,
                // monthOffset 0 is always exactly cohortSize by construction
                // (every member's first purchase month IS their cohort
                // month) — a correctness sanity-check baked into the shape
                // of this output, not just asserted separately in tests.
                retention: [...retainedByOffset.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([monthOffset, customersReturned]) => ({
                        monthOffset,
                        customersReturned,
                        retentionPct: parseFloat(((customersReturned / cohortSize) * 100).toFixed(1)),
                    })),
            }));

        res.json({ cohorts: cohortRows });
    } catch (err) {
        reportError(req, err, 'Cohort retention report failed');
        res.status(500).json({ error: 'Cohort retention report failed' });
    }
}

router.get('/cohorts', protect, adminOnly, getCohortRetention);

// GET /api/dashboard/exceptions?range=day|week|month — adminOnly. Discounts,
// approvals, returns, voids and till discrepancies per staff member.
async function getExceptionsReport(req, res) {
    try {
        const range = ['day', 'week', 'month'].includes(req.query.range) ? req.query.range : 'day';
        const report = await buildExceptionsReport(rangeBounds(range));
        res.json({ range, ...report });
    } catch (err) {
        reportError(req, err, 'Exceptions report failed');
        res.status(500).json({ error: 'Exceptions report failed' });
    }
}

router.get('/exceptions', protect, adminOnly, getExceptionsReport);

// GET /api/dashboard/weekly-summary — preview of the owner's weekly digest.
// POST /api/dashboard/weekly-summary/send — send it now (SMS + push).
router.get('/weekly-summary', protect, adminOnly, async (req, res) => {
    try {
        const summary = await buildWeeklySummary();
        res.json({ ...summary, text: formatWeeklySummary(summary) });
    } catch (err) {
        reportError(req, err, 'Weekly summary failed');
        res.status(500).json({ error: 'Weekly summary failed' });
    }
});
router.post('/weekly-summary/send', protect, adminOnly, async (req, res) => {
    try {
        const result = await sendWeeklySummary();
        res.json(result);
    } catch (err) {
        reportError(req, err, 'Sending weekly summary failed');
        res.status(500).json({ error: 'Sending weekly summary failed' });
    }
});

module.exports = router;
module.exports.getMarginReport = getMarginReport;
module.exports.getCustomerValue = getCustomerValue;
module.exports.getStaffPerformance = getStaffPerformance;
module.exports.getCohortRetention = getCohortRetention;
module.exports.getExceptionsReport = getExceptionsReport;
