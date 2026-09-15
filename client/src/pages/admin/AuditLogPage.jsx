import { useState, useEffect, useCallback } from "react";
import api from "../../api/axiosInstance";
import { toast } from "react-toastify";

const ACTION_LABELS = {
    user_created: "User created",
    user_updated: "User updated",
    user_deleted: "User deleted",
    style_created: "Style created",
    style_updated: "Style updated",
    style_deleted: "Style deleted",
    variant_created: "Variant created",
    variant_updated: "Variant updated",
    variant_deleted: "Variant deleted",
    stock_restocked: "Stock restocked",
    sale_deleted: "Sale deleted",
    sale_return_processed: "Return processed",
};

const actionLabel = (action) => ACTION_LABELS[action] || action;

function DetailsCell({ details }) {
    if (!details || typeof details !== "object") return <span className="text-gray-400">—</span>;
    const text = Object.entries(details)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ");
    return <span className="text-xs text-gray-500 truncate block max-w-[360px]" title={text}>{text}</span>;
}

export default function AuditLogPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [actionFilter, setActionFilter] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const LIMIT = 25;

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: LIMIT });
            if (actionFilter) params.set("action", actionFilter);
            if (startDate) params.set("startDate", startDate);
            if (endDate) params.set("endDate", endDate);
            const res = await api.get(`/audit?${params.toString()}`);
            setLogs(res.data.logs);
            setPages(res.data.pages || 1);
            setTotal(res.data.total || 0);
        } catch {
            toast.error("Failed to load audit log");
        } finally {
            setLoading(false);
        }
    }, [page, actionFilter, startDate, endDate]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);
    useEffect(() => { setPage(1); }, [actionFilter, startDate, endDate]);

    const hasFilters = actionFilter || startDate || endDate;
    const clearFilters = () => { setActionFilter(""); setStartDate(""); setEndDate(""); };

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Audit Log</h1>
                    <p className="text-sm text-gray-400 mt-0.5">{total.toLocaleString()} recorded action{total !== 1 ? "s" : ""}</p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                    Refresh
                </button>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                        <option value="">All actions</option>
                        {Object.keys(ACTION_LABELS).map((a) => (
                            <option key={a} value={a}>{actionLabel(a)}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                </div>
                {hasFilters && (
                    <button
                        onClick={clearFilters}
                        className="px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                ) : logs.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">No audit entries match these filters.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Action</th>
                                <th className="px-4 py-3 text-left">User</th>
                                <th className="px-4 py-3 text-left">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {logs.map((log) => (
                                <tr key={log._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                                    <td className="px-4 py-2.5">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                                            {actionLabel(log.action)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-700">{log.userId?.name || "—"}</td>
                                    <td className="px-4 py-2.5"><DetailsCell details={log.details} /></td>
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
