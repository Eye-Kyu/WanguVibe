const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Product = require('../models/Product');

// % change from prev to current; null when no previous data
const trendPct = (current, prev) =>
    prev > 0 ? parseFloat(((current - prev) / prev * 100).toFixed(1)) : null;

router.get('/summary', async (req, res) => {
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
                { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            ]),
            Sale.aggregate([
                { $match: { createdAt: { $gte: yesterdayStart, $lt: todayStart } } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } },
            ]),

            Sale.aggregate([
                { $match: { createdAt: { $gte: weekStart } } },
                { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            ]),
            Sale.aggregate([
                { $match: { createdAt: { $gte: prevWeekStart, $lt: weekStart } } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } },
            ]),

            Sale.aggregate([
                { $match: { createdAt: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            ]),
            Sale.aggregate([
                { $match: { createdAt: { $gte: prevMonthStart, $lt: monthStart } } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } },
            ]),

            Product.aggregate([
                { $group: { _id: null, total: { $sum: '$stock' } } },
            ]),

            Sale.aggregate([
                { $match: { createdAt: { $gte: rangeStart } } },
                { $unwind: '$items' },
                { $group: { _id: '$items.product', qty: { $sum: '$items.quantity' } } },
                { $sort: { qty: -1 } },
                { $limit: 5 },
                { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
                { $unwind: '$product' },
                { $project: { name: '$product.name', qty: 1 } },
            ]),

            Product.find({}, 'name stock').lean(),

            Product.find({ stock: { $lt: 10 } }, 'name stock').lean(),

            Sale.aggregate([
                { $match: { createdAt: { $gte: rangeStart } } },
                {
                    $group: {
                        _id: {
                            year:  { $year:  '$createdAt' },
                            month: { $month: '$createdAt' },
                            day:   { $dayOfMonth: '$createdAt' },
                        },
                        total: { $sum: '$totalAmount' },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            ]),

            Sale.aggregate([
                { $match: { createdAt: { $gte: rangeStart } } },
                {
                    $group: {
                        _id:   '$paymentMethod',
                        total: { $sum: '$totalAmount' },
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
        const paymentBreakdown = paymentAgg.map(p => ({
            name:  p._id === 'mpesa' ? 'M-Pesa' : 'Cash',
            total: p.total,
            count: p.count,
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
            stockLevels,
            paymentBreakdown,

            // ── Table + alerts ───────────────────────────────
            recentSales,
            lowStockItems,
        });

    } catch (err) {
        console.error('Dashboard Error:', err);
        return res.status(500).json({ error: 'Dashboard summary failed' });
    }
});

module.exports = router;
