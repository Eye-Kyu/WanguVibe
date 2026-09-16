import { useEffect, useState, useCallback, useContext } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ThemeContext } from '../../context/ThemeContext';
import ErrorState from '../../components/ErrorState';
import api from '../../api/axiosInstance';
import { toast, ToastContainer } from 'react-toastify';
import SalesChart from '../../components/dashboard/SalesChart';
import PieChartBestsellers from '../../components/dashboard/PieChartBestSellers';
import BarChartStockLevels from '../../components/dashboard/BarChartStockLevels';
import KpiCard from '../../components/dashboard/GradientStatCard';
import { isPushSupported, getPushSubscriptionStatus, subscribeToPush, unsubscribeFromPush } from '../../pushNotifications';
import { IconHanger, IconUser, IconReceipt } from '../../components/icons';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n) =>
    Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_COLORS = { Cash: '#2563eb', 'M-Pesa': '#16a34a', Card: '#9333ea' };

const RANGE_LABELS = { day: 'Today', week: 'This Week', month: 'This Month' };

// ─── Stat Pill (inside range analysis row) ──────────────────────────────────

function StatPill({ label, value }) {
    return (
        <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
        </div>
    );
}

// ─── Badge ──────────────────────────────────────────────────────────────────

const PAYMENT_LABELS = { mpesa: 'M-Pesa', cash: 'Cash', card: 'Card' };
const PAYMENT_BADGE_STYLES = {
    mpesa: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
    cash:  'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
    card:  'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
};

function PaymentBadge({ method }) {
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_BADGE_STYLES[method] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
            {PAYMENT_LABELS[method] || method}
        </span>
    );
}

// ─── Notifications toggle ───────────────────────────────────────────────────

function NotificationsToggle() {
    const [status, setStatus] = useState('checking'); // checking | unsupported | denied | unsubscribed | subscribed
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!isPushSupported()) { setStatus('unsupported'); return; }
        getPushSubscriptionStatus().then(setStatus).catch(() => setStatus('unsubscribed'));
    }, []);

    if (status === 'checking' || status === 'unsupported') return null;

    const handleClick = async () => {
        setBusy(true);
        try {
            if (status === 'subscribed') {
                await unsubscribeFromPush();
                setStatus('unsubscribed');
                toast.info('Notifications disabled');
            } else {
                await subscribeToPush();
                setStatus('subscribed');
                toast.success('Notifications enabled');
            }
        } catch (err) {
            toast.error(err.message || 'Failed to update notification settings');
            if (Notification.permission === 'denied') setStatus('denied');
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={busy || status === 'denied'}
            title={status === 'denied' ? 'Notifications blocked in browser settings' : undefined}
            className="self-start sm:self-auto px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition"
        >
            {status === 'denied' ? 'Notifications blocked' : status === 'subscribed' ? 'Disable Notifications' : 'Enable Notifications'}
        </button>
    );
}

// ─── Onboarding banner ──────────────────────────────────────────────────────
// Shown only when the catalog is genuinely empty (data.stockLevels — every
// active variant in the system — has zero entries), not merely "no sales
// today" (which happens on a slow day at an established shop and would be
// the wrong signal). Self-clearing: once the first style/variant exists,
// this condition is false and the banner simply stops rendering — no
// dismiss button or localStorage flag to go stale or be forgotten while the
// shop is still actually empty.
const ONBOARDING_STEPS = [
    { label: 'Add your first style (a product with sizes/colors)', to: '/admin/styles', Icon: IconHanger },
    { label: 'Create cashier accounts for your staff', to: '/admin/users', Icon: IconUser },
    { label: 'Open a shift and ring up your first sale', to: '/pos', Icon: IconReceipt },
];

function OnboardingBanner() {
    return (
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-950/10 animate-fade-in">
            <h2 className="text-lg font-bold">Welcome to Wanguvibe POS 👋</h2>
            <p className="text-sm text-white/80 mt-1 mb-4">Your catalog is empty — here's how to get selling:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ONBOARDING_STEPS.map((step, i) => (
                    <Link
                        key={step.to}
                        to={step.to}
                        className="flex items-start gap-3 bg-white/10 hover:bg-white/20 rounded-xl p-3 transition-colors"
                    >
                        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 text-xs font-bold">
                            {i + 1}
                        </div>
                        <div className="min-w-0">
                            <step.Icon className="w-4 h-4 mb-1 text-white/70" />
                            <p className="text-sm font-medium leading-tight">{step.label}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────

const AdminDashboard = () => {
    const [data, setData]     = useState(null);
    const [range, setRange]   = useState('day');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    // Recharts' default Tooltip renders its own inline-styled box, which
    // Tailwind's dark: variant can't reach — pass an explicit contentStyle.
    const { theme } = useContext(ThemeContext);
    const isDark = theme === 'dark';
    const tooltipContentStyle = isDark
        ? { background: '#1f2937', border: '1px solid #374151', borderRadius: '0.75rem', color: '#f3f4f6' }
        : undefined;

    const fetchDashboard = useCallback(() => {
        setLoading(true);
        setError(false);
        api.get(`/dashboard/summary?range=${range}`)
            .then(res => setData(res.data))
            .catch(() => { toast.error('Failed to load dashboard data'); setError(true); })
            .finally(() => setLoading(false));
    }, [range]);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    const exportCSV = () => {
        if (!data?.chartData?.length) return;
        const rows = [['Date', 'Revenue', 'Transactions'],
            ...data.chartData.map(r => [r.date, r.total.toFixed(2), r.count])];
        const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sales-${range}.csv`;
        a.click();
    };

    // ── Loading skeleton ──────────────────────────────────────────────────
    if (loading && !data) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg w-48" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-28 bg-gray-200 dark:bg-gray-800 rounded-xl" />
                    ))}
                </div>
                <div className="h-72 bg-gray-200 dark:bg-gray-800 rounded-xl" />
            </div>
        );
    }

    if (error && !data) {
        return <ErrorState message="Failed to load dashboard data" onRetry={fetchDashboard} />;
    }

    // ── Page ─────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            <ToastContainer position="top-right" autoClose={3000} theme={theme} />

            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Dashboard</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {new Date().toLocaleDateString('en-US', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                        })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <NotificationsToggle />
                    <button
                        onClick={fetchDashboard}
                        disabled={loading}
                        className="self-start sm:self-auto px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </div>

            {data?.stockLevels?.length === 0 && <OnboardingBanner />}

            {/* ── KPI Cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    variant="indigo"
                    label="Today's Revenue"
                    value={`KES ${fmt(data?.todaySales)}`}
                    trend={data?.todayTrend}
                    trendLabel="vs yesterday"
                    sub={`${data?.todayTransactions ?? 0} transaction${data?.todayTransactions !== 1 ? 's' : ''}`}
                />
                <KpiCard
                    variant="violet"
                    label="This Week's Revenue"
                    value={`KES ${fmt(data?.weekSales)}`}
                    trend={data?.weekTrend}
                    trendLabel="vs last week"
                    sub={`${data?.weekTransactions ?? 0} transaction${data?.weekTransactions !== 1 ? 's' : ''}`}
                />
                <KpiCard
                    variant="emerald"
                    label="Total Stock"
                    value={`${(data?.totalStock ?? 0).toLocaleString()} units`}
                    sub={
                        data?.lowStockItems?.length > 0
                            ? `${data.lowStockItems.length} item${data.lowStockItems.length !== 1 ? 's' : ''} running low`
                            : 'All stock levels healthy'
                    }
                />
                <KpiCard
                    variant="amber"
                    label="Best Seller"
                    value={data?.bestSeller || '—'}
                    sub={data?.bestSeller ? `Top style — ${RANGE_LABELS[range]}` : 'No sales this period'}
                />
            </div>

            {/* ── Range Analysis ────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                {/* Controls row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">Sales Overview</h2>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
                            {Object.entries(RANGE_LABELS).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setRange(key)}
                                    className={`px-3 py-1.5 font-medium transition ${
                                        range === key
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={exportCSV}
                            className="px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                        >
                            Export CSV
                        </button>
                    </div>
                </div>

                {/* Range mini-KPIs */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800 border-b border-gray-100 dark:border-gray-800">
                    <div className="px-5 py-4">
                        <StatPill label="Revenue" value={`KES ${fmt(data?.rangeRevenue)}`} />
                    </div>
                    <div className="px-5 py-4">
                        <StatPill label="Transactions" value={(data?.rangeTransactions ?? 0).toLocaleString()} />
                    </div>
                    <div className="px-5 py-4">
                        <StatPill label="Avg Order Value" value={`KES ${fmt(data?.avgOrderValue)}`} />
                    </div>
                </div>

                {/* Sales trend chart */}
                <div className="p-5">
                    <SalesChart data={data?.chartData ?? []} range={range} />
                </div>
            </div>

            {/* ── Charts Row ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top 5 Products */}
                <PieChartBestsellers data={data?.topProducts ?? []} />

                {/* Payment Methods Donut */}
                <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">Payment Methods</h2>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">{RANGE_LABELS[range]}</p>
                    {!data?.paymentBreakdown?.length ? (
                        <p className="text-gray-400 dark:text-gray-500 text-center py-16 text-sm">No payment data for this period.</p>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie
                                        data={data.paymentBreakdown}
                                        dataKey="total"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={90}
                                        paddingAngle={3}
                                    >
                                        {data.paymentBreakdown.map((entry) => (
                                            <Cell
                                                key={entry.name}
                                                fill={PAYMENT_COLORS[entry.name] ?? '#94a3b8'}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(val) => `KES ${fmt(val)}`} contentStyle={tooltipContentStyle} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                            {/* Breakdown rows */}
                            <div className="mt-2 space-y-2">
                                {data.paymentBreakdown.map(p => (
                                    <div key={p.name} className="flex items-center justify-between text-sm">
                                        <span className="flex items-center gap-2">
                                            <span
                                                className="inline-block w-3 h-3 rounded-full"
                                                style={{ background: PAYMENT_COLORS[p.name] ?? '#94a3b8' }}
                                            />
                                            <span className="text-gray-700 dark:text-gray-300">{p.name}</span>
                                        </span>
                                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                                            KES {fmt(p.total)}
                                            <span className="font-normal text-gray-400 dark:text-gray-500 ml-1">
                                                ({p.count} txn{p.count !== 1 ? 's' : ''})
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Stock Levels ──────────────────────────────────────────── */}
            <BarChartStockLevels data={data?.stockLevels ?? []} />

            {/* ── Bottom Row: Recent Sales + Low Stock ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Recent Sales table */}
                <div className="lg:col-span-2 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Recent Sales</h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Last {data?.recentSales?.length ?? 0} transactions
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-800/50 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                                    <th className="px-5 py-3">ID</th>
                                    <th className="px-5 py-3">Date & Time</th>
                                    <th className="px-5 py-3">Items</th>
                                    <th className="px-5 py-3">Payment</th>
                                    <th className="px-5 py-3 text-right">Amount</th>
                                    <th className="px-5 py-3">Cashier</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                {!data?.recentSales?.length ? (
                                    <tr>
                                        <td colSpan={6} className="px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
                                            No sales recorded yet
                                        </td>
                                    </tr>
                                ) : (
                                    data.recentSales.map(sale => (
                                        <tr key={sale._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                                            <td className="px-5 py-3 font-mono text-xs text-gray-400 dark:text-gray-500">
                                                #{sale._id.slice(-6).toUpperCase()}
                                            </td>
                                            <td className="px-5 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                {new Date(sale.createdAt).toLocaleString('en-US', {
                                                    month: 'short', day: 'numeric',
                                                    hour: '2-digit', minute: '2-digit',
                                                })}
                                            </td>
                                            <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                                                {sale.items?.length ?? 0} item{sale.items?.length !== 1 ? 's' : ''}
                                            </td>
                                            <td className="px-5 py-3">
                                                <PaymentBadge method={sale.paymentMethod} />
                                            </td>
                                            <td className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                                KES {fmt(sale.totalAmount)}
                                            </td>
                                            <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                                                {sale.cashier?.name || '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Low Stock Alerts */}
                <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Low Stock Alerts</h2>
                        {data?.lowStockItems?.length > 0 && (
                            <span className="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                                {data.lowStockItems.length}
                            </span>
                        )}
                    </div>
                    {!data?.lowStockItems?.length ? (
                        <div className="px-5 py-10 text-center">
                            <p className="text-green-600 dark:text-green-400 font-semibold text-sm">All stock healthy</p>
                            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">No variants below their reorder threshold</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                            {data.lowStockItems.map((item, idx) => (
                                <li
                                    key={item._id || idx}
                                    className="px-5 py-3 flex items-center justify-between"
                                >
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate mr-2">
                                        {item.name}
                                    </span>
                                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                                        item.stock === 0
                                            ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                                            : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                                    }`}>
                                        {item.stock === 0 ? 'Out of stock' : `${item.stock} left`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
