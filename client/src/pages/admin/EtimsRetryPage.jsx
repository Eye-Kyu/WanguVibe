import { useState, useEffect, useCallback } from "react";
import api from "../../api/axiosInstance";
import { toast } from "react-toastify";
import ErrorState from "../../components/ErrorState";

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES = {
    pending: "bg-amber-100 text-amber-700",
    resolved: "bg-green-100 text-green-700",
    abandoned: "bg-gray-100 text-gray-600",
};

function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}>
            {status}
        </span>
    );
}

export default function EtimsRetryPage() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [retryingId, setRetryingId] = useState(null);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [statusFilter, setStatusFilter] = useState("pending");

    const LIMIT = 25;

    const fetchQueue = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const params = new URLSearchParams({ page, limit: LIMIT });
            if (statusFilter) params.set("status", statusFilter);
            const res = await api.get(`/etims/retry-queue?${params.toString()}`);
            setEntries(res.data.entries);
            setPages(res.data.pages || 1);
            setTotal(res.data.total || 0);
        } catch {
            toast.error("Failed to load eTIMS retry queue");
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter]);

    useEffect(() => { fetchQueue(); }, [fetchQueue]);
    useEffect(() => { setPage(1); }, [statusFilter]);

    const handleRetry = async (saleId) => {
        setRetryingId(saleId);
        try {
            const res = await api.post(`/etims/retry/${saleId}`);
            toast.success(`Resolved — invoice ${res.data.sale.etimsInvoiceNumber}`);
            fetchQueue();
        } catch (err) {
            toast.error(err.response?.data?.error || "Retry failed — still unreachable");
        } finally {
            setRetryingId(null);
        }
    };

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">eTIMS Retry Queue</h1>
                    <p className="text-sm text-gray-400 mt-0.5">{total.toLocaleString()} entr{total !== 1 ? "ies" : "y"}</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                        <option value="pending">Pending</option>
                        <option value="resolved">Resolved</option>
                        <option value="abandoned">Abandoned</option>
                        <option value="">All</option>
                    </select>
                    <button
                        onClick={fetchQueue}
                        className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                ) : error ? (
                    <ErrorState message="Failed to load eTIMS retry queue" onRetry={fetchQueue} />
                ) : entries.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">
                        {statusFilter === "pending" ? "Nothing waiting on retry — all invoices submitted." : "No entries match this filter."}
                    </p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Sale</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-left">Last Attempt</th>
                                <th className="px-4 py-3 text-left">Attempts</th>
                                <th className="px-4 py-3 text-left">Last Error</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {entries.map((e) => (
                                <tr key={e._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">#{e.sale?._id?.slice(-8).toUpperCase() || "—"}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600">KES {fmt(e.sale?.totalAmount)}</td>
                                    <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{new Date(e.lastAttemptAt).toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-gray-600">{e.attempts}</td>
                                    <td className="px-4 py-2.5 text-red-500 text-xs max-w-[240px] truncate" title={e.lastError}>{e.lastError || "—"}</td>
                                    <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                                    <td className="px-4 py-2.5 text-right">
                                        {e.status === "pending" && e.sale?._id && (
                                            <button
                                                onClick={() => handleRetry(e.sale._id)}
                                                disabled={retryingId === e.sale._id}
                                                className="px-3 py-1 rounded-xl text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {retryingId === e.sale._id ? "Retrying…" : "Retry Now"}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {pages > 1 && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                        <span>Page <span className="font-medium text-gray-700">{page}</span> of <span className="font-medium text-gray-700">{pages}</span></span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                            >
                                Prev
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                                disabled={page === pages}
                                className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
