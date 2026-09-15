import { useState, useEffect, useCallback } from "react";
import api from "../../api/axiosInstance";
import { toast } from "react-toastify";

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function DiscrepancyBadge({ discrepancy }) {
    if (discrepancy === null || discrepancy === undefined) {
        return <span className="text-xs text-gray-400">—</span>;
    }
    if (Math.abs(discrepancy) < 0.01) {
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Balanced</span>;
    }
    const over = discrepancy > 0;
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${over ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
            {over ? "Over" : "Short"} KES {fmt(Math.abs(discrepancy))}
        </span>
    );
}

export default function ShiftsPage() {
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);

    const LIMIT = 25;

    const fetchShifts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/shifts?page=${page}&limit=${LIMIT}`);
            setShifts(res.data.shifts);
            setPages(res.data.pages || 1);
            setTotal(res.data.total || 0);
        } catch {
            toast.error("Failed to load shifts");
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => { fetchShifts(); }, [fetchShifts]);

    const discrepancyCount = shifts.filter(s => s.discrepancy !== null && Math.abs(s.discrepancy) >= 0.01).length;

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Shifts</h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {total.toLocaleString()} shift{total !== 1 ? "s" : ""}
                        {discrepancyCount > 0 && <span className="ml-2 text-amber-600 font-medium">· {discrepancyCount} with a discrepancy on this page</span>}
                    </p>
                </div>
                <button
                    onClick={fetchShifts}
                    className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                    Refresh
                </button>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                ) : shifts.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">No shifts recorded yet.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Opened</th>
                                <th className="px-4 py-3 text-left">Cashier</th>
                                <th className="px-4 py-3 text-right">Opening Float</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Expected Cash</th>
                                <th className="px-4 py-3 text-right">Counted</th>
                                <th className="px-4 py-3 text-left">Discrepancy</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {shifts.map((s) => {
                                const hasDiscrepancy = s.discrepancy !== null && Math.abs(s.discrepancy) >= 0.01;
                                return (
                                    <tr key={s._id} className={`hover:bg-gray-50 transition-colors ${hasDiscrepancy ? "bg-red-50/40" : ""}`}>
                                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(s.openedAt).toLocaleString()}</td>
                                        <td className="px-4 py-2.5 text-gray-800">{s.openedBy?.name || "—"}</td>
                                        <td className="px-4 py-2.5 text-right text-gray-600">KES {fmt(s.openingFloat)}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.status === "open" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                                                {s.status === "open" ? "Open" : "Closed"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-gray-600">{s.expectedCash !== null ? `KES ${fmt(s.expectedCash)}` : "—"}</td>
                                        <td className="px-4 py-2.5 text-right text-gray-600">{s.closingCount !== null ? `KES ${fmt(s.closingCount)}` : "—"}</td>
                                        <td className="px-4 py-2.5"><DiscrepancyBadge discrepancy={s.discrepancy} /></td>
                                    </tr>
                                );
                            })}
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
