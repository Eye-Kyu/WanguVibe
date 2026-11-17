import { useState, useEffect, useCallback } from "react";
import api from "../../api/axiosInstance";
import ErrorState from "../../components/ErrorState";
import { toast } from "react-toastify";

// Per-person discounts, approvals, returns, voids and till shortfalls — the
// numbers to scan for "one person's figures stand out from everyone else's".
const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RANGES = [
    { value: "day", label: "Today" },
    { value: "week", label: "Last 7 days" },
    { value: "month", label: "This month" },
];

function Stat({ label, value, tone = "text-gray-900" }) {
    return (
        <div className="bg-white border border-gray-100 rounded-sm p-4 shadow-sm">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-xl font-semibold mt-1 ${tone}`}>{value}</p>
        </div>
    );
}

// Preview of the Monday-morning owner digest, with a manual "send now".
function WeeklySummaryCard() {
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);

    useEffect(() => {
        api.get("/dashboard/weekly-summary").then((res) => setText(res.data.text)).catch(() => setText(""));
    }, []);

    const send = async () => {
        setSending(true);
        try {
            const res = await api.post("/dashboard/weekly-summary/send");
            toast.success(res.data.smsSent > 0 ? `Sent by SMS to ${res.data.smsSent} number(s) and push` : "Sent as a push notification (no owner phones configured)");
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to send summary");
        } finally {
            setSending(false);
        }
    };

    if (!text) return null;
    return (
        <div className="bg-indigo-50 border border-indigo-100 rounded-sm p-4 flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1">
                <p className="text-xs text-indigo-700 font-semibold">Weekly summary (sent Mondays 8am)</p>
                <p className="text-sm text-gray-800 mt-1">{text}</p>
            </div>
            <button onClick={send} disabled={sending} className="self-start px-3 py-1.5 text-sm rounded-xl border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 disabled:opacity-50">
                {sending ? "Sending…" : "Send now"}
            </button>
        </div>
    );
}

export default function ExceptionsPage() {
    const [range, setRange] = useState("day");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.get(`/dashboard/exceptions?range=${range}`);
            setData(res.data);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [range]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Exceptions</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Discounts, refunds, voids and till differences by person</p>
                </div>
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1" role="group" aria-label="Date range">
                    {RANGES.map((r) => (
                        <button
                            key={r.value}
                            onClick={() => setRange(r.value)}
                            aria-pressed={range === r.value}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${range === r.value ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            <WeeklySummaryCard />

            {loading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : error ? (
                <ErrorState message="Failed to load the exceptions report" onRetry={load} />
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Stat label="Discounts given" value={`KES ${fmt(data.totals.discountGiven)}`} />
                        <Stat label="Returns" value={`KES ${fmt(data.totals.returnsAmount)}`} />
                        <Stat label="Voids" value={`KES ${fmt(data.totals.voidsAmount)}`} />
                        <Stat
                            label="Net till difference"
                            value={`KES ${fmt(data.totals.netShiftDiscrepancy)}`}
                            tone={data.totals.netShiftDiscrepancy < 0 ? "text-red-600" : "text-gray-900"}
                        />
                    </div>

                    <div className="bg-white rounded-sm border border-gray-100 shadow-sm overflow-x-auto">
                        {data.staff.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-12">No activity in this period.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs">
                                        <th className="px-4 py-3 text-left">Person</th>
                                        <th className="px-4 py-3 text-right">Sales</th>
                                        <th className="px-4 py-3 text-right">Discounts</th>
                                        <th className="px-4 py-3 text-right">Discount rate</th>
                                        <th className="px-4 py-3 text-right">Approved</th>
                                        <th className="px-4 py-3 text-right">Returns</th>
                                        <th className="px-4 py-3 text-right">Cash refunds</th>
                                        <th className="px-4 py-3 text-right">Voids</th>
                                        <th className="px-4 py-3 text-right">Worst shortfall</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {data.staff.map((s) => (
                                        <tr key={s.userId || "unknown"}>
                                            <td className="px-4 py-2.5 text-gray-800 font-medium">{s.name}{s.role === "admin" && <span className="ml-1 text-xs text-gray-500">(admin)</span>}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-600">{s.salesCount}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-700">KES {fmt(s.discountGiven)} <span className="text-xs text-gray-500">({s.discountedSales})</span></td>
                                            <td className="px-4 py-2.5 text-right text-gray-700">{s.discountRatePct}%</td>
                                            <td className="px-4 py-2.5 text-right text-gray-600">{s.approvedDiscounts}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-700">KES {fmt(s.returnsAmount)} <span className="text-xs text-gray-500">({s.returnsCount})</span></td>
                                            <td className="px-4 py-2.5 text-right text-gray-700">KES {fmt(s.cashRefunds)}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-700">KES {fmt(s.voidsAmount)} <span className="text-xs text-gray-500">({s.voidsCount})</span></td>
                                            <td className={`px-4 py-2.5 text-right ${s.worstShortfall < 0 ? "text-red-600 font-medium" : "text-gray-600"}`}>KES {fmt(s.worstShortfall)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
