import { useState, useEffect, useCallback } from "react";
import api from "../../api/axiosInstance";
import { toast } from "react-toastify";
import ErrorState from "../../components/ErrorState";

// M-Pesa payments that were charged but never became a sale (stock ran out
// mid-PIN, or the customer paid after the till stopped waiting). Most are
// reversed automatically; anything left at "Needs action" needs a human.
const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS = {
    refund_required: { label: "Needs action", cls: "bg-red-100 text-red-700" },
    refund_requested: { label: "Requested", cls: "bg-amber-100 text-amber-700" },
    refunded: { label: "Refunded", cls: "bg-green-100 text-green-700" },
};

export default function RefundsPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [statusFilter, setStatusFilter] = useState("refund_required");
    const [busyId, setBusyId] = useState(null);
    const [settlingId, setSettlingId] = useState(null);
    const [note, setNote] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const params = statusFilter ? `?status=${statusFilter}` : "";
            const res = await api.get(`/payments/mpesa/refunds${params}`);
            setRows(res.data);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { load(); }, [load]);

    const retry = async (id) => {
        setBusyId(id);
        try {
            const res = await api.post(`/payments/mpesa/${id}/refund`, {});
            if (res.data.status === "refund_required") toast.error(res.data.refund?.lastError || "Refund still failing");
            else toast.success(res.data.status === "refunded" ? "Refunded" : "Refund requested from M-Pesa");
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || "Retry failed");
        } finally {
            setBusyId(null);
        }
    };

    const settleManually = async (id) => {
        if (!note.trim()) { toast.error("Add a note saying how the money was returned"); return; }
        setBusyId(id);
        try {
            await api.post(`/payments/mpesa/${id}/refund`, { manual: true, note });
            toast.success("Marked as refunded");
            setSettlingId(null);
            setNote("");
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || "Could not update");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">M-Pesa Refunds</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Customers charged for a sale that didn&apos;t complete</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        aria-label="Filter by status"
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                        <option value="refund_required">Needs action</option>
                        <option value="refund_requested">Requested</option>
                        <option value="refunded">Refunded</option>
                        <option value="">All</option>
                    </select>
                    <button onClick={load} className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                        Refresh
                    </button>
                </div>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-sm border border-gray-100 shadow-sm overflow-x-auto">
                {loading ? (
                    <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                ) : error ? (
                    <ErrorState message="Failed to load refunds" onRetry={load} />
                ) : rows.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-12">
                        {statusFilter === "refund_required" ? "No refunds waiting on you." : "Nothing matches this filter."}
                    </p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs">
                                <th className="px-4 py-3 text-left">When</th>
                                <th className="px-4 py-3 text-left">Phone</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-left">Receipt</th>
                                <th className="px-4 py-3 text-left">Reason</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.map((r) => (
                                <tr key={r._id} className="align-top">
                                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(r.updatedAt).toLocaleString()}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.phone}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-700">KES {fmt(r.amount)}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{r.mpesaReceiptNumber || "—"}</td>
                                    <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[260px]">
                                        {r.refund?.reason || r.resultMessage}
                                        {r.refund?.lastError && <div className="text-red-600 mt-1">Last error: {r.refund.lastError}</div>}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS[r.status]?.cls || "bg-gray-100 text-gray-600"}`}>
                                            {STATUS[r.status]?.label || r.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        {r.status === "refund_required" && (
                                            settlingId === r._id ? (
                                                <div className="flex flex-col items-end gap-2">
                                                    <input
                                                        value={note}
                                                        onChange={(e) => setNote(e.target.value)}
                                                        placeholder="e.g. Cash handed back by Jane"
                                                        aria-label="How was the money returned?"
                                                        className="w-56 border border-gray-200 rounded-lg px-2 py-1 text-xs"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button onClick={() => { setSettlingId(null); setNote(""); }} className="px-2 py-1 text-xs text-gray-600">Cancel</button>
                                                        <button
                                                            onClick={() => settleManually(r._id)}
                                                            disabled={busyId === r._id}
                                                            className="px-3 py-1 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                                                        >
                                                            Confirm
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => retry(r._id)}
                                                        disabled={busyId === r._id}
                                                        className="px-3 py-1 rounded-xl text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                                                    >
                                                        {busyId === r._id ? "Retrying…" : "Retry refund"}
                                                    </button>
                                                    <button
                                                        onClick={() => { setSettlingId(r._id); setNote(""); }}
                                                        className="px-3 py-1 rounded-xl text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
                                                    >
                                                        Settled manually
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
