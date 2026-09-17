import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast, ToastContainer } from 'react-toastify';
import ErrorState from '../../components/ErrorState';

// Rows within this many days of stockout get a visual urgency cue — purely
// a display threshold, unrelated to the server's REORDER_TARGET_COVERAGE_DAYS.
const URGENT_DAYS = 7;

export default function ForecastPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchForecast = useCallback(() => {
        setLoading(true);
        setError(false);
        api.get('/variants/forecast')
            .then((res) => setData(res.data))
            .catch(() => { toast.error('Failed to load reorder forecast'); setError(true); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchForecast(); }, [fetchForecast]);

    if (loading && !data) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-8 bg-gray-200 rounded-lg w-56" />
                <div className="h-96 bg-gray-200 rounded-xl" />
            </div>
        );
    }

    if (error && !data) {
        return <ErrorState message="Failed to load reorder forecast" onRetry={fetchForecast} />;
    }

    const forecast = data?.forecast ?? [];
    const urgentCount = forecast.filter((r) => r.daysUntilStockout <= URGENT_DAYS).length;

    return (
        <div className="space-y-6">
            <ToastContainer position="top-right" autoClose={3000} />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Reorder Forecast</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Based on sales velocity over the last {data?.windowDays ?? 30} days — only variants with recent sales are shown
                    </p>
                </div>
                <button
                    onClick={fetchForecast}
                    disabled={loading}
                    className="self-start sm:self-auto px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            {urgentCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
                    {urgentCount} variant{urgentCount !== 1 ? 's' : ''} projected to sell out within {URGENT_DAYS} days at current pace.
                </div>
            )}

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-sm border border-gray-100 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-800">At-risk variants, most urgent first</h2>
                </div>
                {!forecast.length ? (
                    <p className="text-sm text-gray-500 px-5 py-8 text-center">No variants with recent sales momentum to forecast</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                                    <th className="px-5 pb-2 pt-3 text-left">Variant</th>
                                    <th className="px-5 pb-2 pt-3 text-right">Stock</th>
                                    <th className="px-5 pb-2 pt-3 text-right">Velocity/day</th>
                                    <th className="px-5 pb-2 pt-3 text-right">Days Until Stockout</th>
                                    <th className="px-5 pb-2 pt-3 text-right">Suggested Reorder Qty</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {forecast.map((row) => (
                                    <tr key={row.variantId}>
                                        <td className="px-5 py-2.5 font-medium text-gray-800">{row.name}</td>
                                        <td className="px-5 py-2.5 text-right text-gray-500">{row.stock}</td>
                                        <td className="px-5 py-2.5 text-right text-gray-500">{row.velocityPerDay}</td>
                                        <td className={`px-5 py-2.5 text-right font-medium ${row.daysUntilStockout <= URGENT_DAYS ? 'text-red-600' : 'text-gray-700'}`}>
                                            {row.daysUntilStockout}
                                        </td>
                                        <td className="px-5 py-2.5 text-right text-gray-700">
                                            {row.suggestedReorderQty > 0 ? row.suggestedReorderQty : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
