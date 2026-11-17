import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast, ToastContainer } from 'react-toastify';
import GradientStatCard from '../../components/dashboard/GradientStatCard';
import ErrorState from '../../components/ErrorState';

const fmt = (n) =>
    Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RANGE_LABELS = { day: 'Today', week: 'This Week', month: 'This Month' };

function MarginTable({ title, rows, nameKey, nameLabel }) {
    return (
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-sm border border-gray-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">{title}</h2>
            </div>
            {!rows.length ? (
                <p className="text-sm text-gray-500 px-5 py-8 text-center">No sales in this period</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs font-semibold text-gray-500 border-b border-gray-100">
                                <th className="px-5 pb-2 pt-3 text-left">{nameLabel}</th>
                                {nameKey === 'name' && <th className="px-5 pb-2 pt-3 text-left">Category</th>}
                                <th className="px-5 pb-2 pt-3 text-right">Qty Sold</th>
                                <th className="px-5 pb-2 pt-3 text-right">Revenue</th>
                                <th className="px-5 pb-2 pt-3 text-right">Cost</th>
                                <th className="px-5 pb-2 pt-3 text-right">Gross Profit</th>
                                <th className="px-5 pb-2 pt-3 text-right">Margin %</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.map((row) => (
                                <tr key={row[nameKey]}>
                                    <td className="px-5 py-2.5 font-medium text-gray-800">{row[nameKey]}</td>
                                    {nameKey === 'name' && <td className="px-5 py-2.5 text-gray-500">{row.category}</td>}
                                    <td className="px-5 py-2.5 text-right text-gray-500">{row.qty}</td>
                                    <td className="px-5 py-2.5 text-right text-gray-700">KES {fmt(row.revenue)}</td>
                                    <td className="px-5 py-2.5 text-right text-gray-500">KES {fmt(row.cost)}</td>
                                    <td className={`px-5 py-2.5 text-right font-medium ${row.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        KES {fmt(row.grossProfit)}
                                    </td>
                                    <td className="px-5 py-2.5 text-right text-gray-500">{row.marginPct}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default function MarginReportPage() {
    const [data, setData] = useState(null);
    const [range, setRange] = useState('month');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchReport = useCallback(() => {
        setLoading(true);
        setError(false);
        api.get(`/dashboard/margins?range=${range}`)
            .then((res) => setData(res.data))
            .catch(() => { toast.error('Failed to load margin report'); setError(true); })
            .finally(() => setLoading(false));
    }, [range]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    if (loading && !data) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-8 bg-gray-200 rounded-lg w-48" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-28 bg-gray-200 rounded-xl" />
                    ))}
                </div>
                <div className="h-72 bg-gray-200 rounded-xl" />
            </div>
        );
    }

    if (error && !data) {
        return <ErrorState message="Failed to load margin report" onRetry={fetchReport} />;
    }

    return (
        <div className="space-y-6">
            <ToastContainer position="top-right" autoClose={3000} />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Margin Report</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Cost basis is each style's current cost price, not a historical snapshot</p>
                </div>
                <div className="flex items-center gap-2">
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
                    <button
                        onClick={fetchReport}
                        disabled={loading}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <GradientStatCard variant="indigo" label="Revenue" value={`KES ${fmt(data?.totals?.revenue)}`} sub={RANGE_LABELS[range]} />
                <GradientStatCard variant="amber" label="Cost of Goods" value={`KES ${fmt(data?.totals?.cost)}`} sub={RANGE_LABELS[range]} />
                <GradientStatCard
                    variant="emerald"
                    label="Gross Profit"
                    value={`KES ${fmt(data?.totals?.grossProfit)}`}
                    sub={`${data?.totals?.marginPct ?? 0}% margin`}
                />
            </div>

            <MarginTable title="By Style" rows={data?.byStyle ?? []} nameKey="name" nameLabel="Style" />
            <MarginTable title="By Category" rows={data?.byCategory ?? []} nameKey="category" nameLabel="Category" />
        </div>
    );
}
