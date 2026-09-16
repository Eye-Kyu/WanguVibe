import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast, ToastContainer } from 'react-toastify';
import ErrorState from '../../components/ErrorState';

const fmt = (n) =>
    Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateOnly = (d) => (d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

const RANGE_LABELS = { day: 'Today', week: 'This Week', month: 'This Month' };

const SECTIONS = [
    { key: 'customer-value', label: 'Customer Value' },
    { key: 'staff', label: 'Staff Leaderboard' },
    { key: 'cohorts', label: 'Cohort Retention' },
];

function CustomerValueSection() {
    const [rows, setRows] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchCustomerValue = useCallback(() => {
        setLoading(true);
        setError(false);
        api.get('/dashboard/customer-value')
            .then((res) => setRows(res.data.customers))
            .catch(() => { toast.error('Failed to load customer value report'); setError(true); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchCustomerValue(); }, [fetchCustomerValue]);

    if (loading) return <p className="text-sm text-gray-400 text-center py-8">Loading…</p>;
    if (error) return <ErrorState message="Failed to load customer value report" onRetry={fetchCustomerValue} />;
    if (!rows?.length) return <p className="text-sm text-gray-400 text-center py-8">No customer purchases yet</p>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        <th className="px-5 pb-2 pt-3 text-left">Customer</th>
                        <th className="px-5 pb-2 pt-3 text-right">Orders</th>
                        <th className="px-5 pb-2 pt-3 text-right">Lifetime Spend</th>
                        <th className="px-5 pb-2 pt-3 text-right">Avg Order</th>
                        <th className="px-5 pb-2 pt-3 text-left">First Purchase</th>
                        <th className="px-5 pb-2 pt-3 text-left">Last Purchase</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {rows.map((r) => (
                        <tr key={r.customerId}>
                            <td className="px-5 py-2.5 font-medium text-gray-800">{r.name}</td>
                            <td className="px-5 py-2.5 text-right text-gray-500">{r.orderCount}</td>
                            <td className="px-5 py-2.5 text-right text-gray-700">KES {fmt(r.totalSpend)}</td>
                            <td className="px-5 py-2.5 text-right text-gray-500">KES {fmt(r.avgOrderValue)}</td>
                            <td className="px-5 py-2.5 text-gray-500">{dateOnly(r.firstPurchase)}</td>
                            <td className="px-5 py-2.5 text-gray-500">{dateOnly(r.lastPurchase)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function StaffLeaderboardSection() {
    const [range, setRange] = useState('month');
    const [rows, setRows] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchStaff = useCallback(() => {
        setLoading(true);
        setError(false);
        api.get(`/dashboard/staff-performance?range=${range}`)
            .then((res) => setRows(res.data.staff))
            .catch(() => { toast.error('Failed to load staff performance report'); setError(true); })
            .finally(() => setLoading(false));
    }, [range]);

    useEffect(() => { fetchStaff(); }, [fetchStaff]);

    return (
        <div>
            <div className="flex justify-end px-5 pt-4">
                <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
                    {Object.entries(RANGE_LABELS).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setRange(key)}
                            className={`px-3 py-1.5 font-medium transition ${
                                range === key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {loading ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
            ) : error ? (
                <ErrorState message="Failed to load staff performance report" onRetry={fetchStaff} />
            ) : !rows?.length ? (
                <p className="text-sm text-gray-400 text-center py-8">No sales in this period</p>
            ) : (
                <div className="overflow-x-auto mt-3">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                                <th className="px-5 pb-2 pt-3 text-left">Cashier</th>
                                <th className="px-5 pb-2 pt-3 text-right">Transactions</th>
                                <th className="px-5 pb-2 pt-3 text-right">Revenue</th>
                                <th className="px-5 pb-2 pt-3 text-right">Avg Sale</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.map((r) => (
                                <tr key={r.cashierId}>
                                    <td className="px-5 py-2.5 font-medium text-gray-800">{r.name}</td>
                                    <td className="px-5 py-2.5 text-right text-gray-500">{r.transactionCount}</td>
                                    <td className="px-5 py-2.5 text-right text-gray-700">KES {fmt(r.revenue)}</td>
                                    <td className="px-5 py-2.5 text-right text-gray-500">KES {fmt(r.avgSaleValue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function CohortRetentionSection() {
    const [cohorts, setCohorts] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchCohorts = useCallback(() => {
        setLoading(true);
        setError(false);
        api.get('/dashboard/cohorts')
            .then((res) => setCohorts(res.data.cohorts))
            .catch(() => { toast.error('Failed to load cohort retention report'); setError(true); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchCohorts(); }, [fetchCohorts]);

    if (loading) return <p className="text-sm text-gray-400 text-center py-8">Loading…</p>;
    if (error) return <ErrorState message="Failed to load cohort retention report" onRetry={fetchCohorts} />;
    if (!cohorts?.length) return <p className="text-sm text-gray-400 text-center py-8">Not enough customer purchase history yet</p>;

    const maxOffset = Math.max(0, ...cohorts.flatMap((c) => c.retention.map((r) => r.monthOffset)));
    const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i);

    const cellFor = (cohort, offset) => cohort.retention.find((r) => r.monthOffset === offset);

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        <th className="px-5 pb-2 pt-3 text-left">Cohort</th>
                        <th className="px-5 pb-2 pt-3 text-right">Size</th>
                        {offsets.map((o) => (
                            <th key={o} className="px-3 pb-2 pt-3 text-right">M{o}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {cohorts.map((c) => (
                        <tr key={c.cohortMonth}>
                            <td className="px-5 py-2.5 font-medium text-gray-800">{c.cohortMonth}</td>
                            <td className="px-5 py-2.5 text-right text-gray-500">{c.cohortSize}</td>
                            {offsets.map((o) => {
                                const cell = cellFor(c, o);
                                return (
                                    <td key={o} className="px-3 py-2.5 text-right text-gray-500">
                                        {cell ? `${cell.retentionPct}%` : <span className="text-gray-300">—</span>}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function AnalyticsPage() {
    const [section, setSection] = useState('customer-value');

    return (
        <div className="space-y-6">
            <ToastContainer position="top-right" autoClose={3000} />

            <div>
                <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
                <p className="text-sm text-gray-500 mt-0.5">Customer lifetime value, staff performance, and repeat-purchase cohorts</p>
            </div>

            <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm w-fit">
                {SECTIONS.map((s) => (
                    <button
                        key={s.key}
                        onClick={() => setSection(s.key)}
                        className={`px-4 py-2 font-medium transition ${
                            section === s.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm">
                {section === 'customer-value' && <CustomerValueSection />}
                {section === 'staff' && <StaffLeaderboardSection />}
                {section === 'cohorts' && <CohortRetentionSection />}
            </div>
        </div>
    );
}
