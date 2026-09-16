import { useState, useEffect, useCallback } from "react";
import api from "../../api/axiosInstance";
import { toast } from "react-toastify";
import ErrorState from "../../components/ErrorState";

const fmt = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES = {
    active: "bg-green-100 text-green-700",
    redeemed: "bg-gray-100 text-gray-600",
    expired: "bg-amber-100 text-amber-700",
    void: "bg-red-100 text-red-700",
};

function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}>
            {status}
        </span>
    );
}

export default function GiftCardsPage() {
    const [cards, setCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);

    const LIMIT = 25;

    const fetchCards = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.get(`/giftcards?page=${page}&limit=${LIMIT}`);
            setCards(res.data.giftCards);
            setPages(res.data.pages || 1);
            setTotal(res.data.total || 0);
        } catch {
            toast.error("Failed to load gift cards");
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => { fetchCards(); }, [fetchCards]);

    const activeBalance = cards.filter(c => c.status === "active").reduce((s, c) => s + c.currentBalance, 0);

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Gift Cards</h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {total.toLocaleString()} card{total !== 1 ? "s" : ""} issued
                        {activeBalance > 0 && <span className="ml-2 text-indigo-600 font-medium">· KES {fmt(activeBalance)} active on this page</span>}
                    </p>
                </div>
                <button
                    onClick={fetchCards}
                    className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                    Refresh
                </button>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                ) : error ? (
                    <ErrorState message="Failed to load gift cards" onRetry={fetchCards} />
                ) : cards.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">No gift cards sold yet — sell one from the POS screen.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Code</th>
                                <th className="px-4 py-3 text-left">Issued</th>
                                <th className="px-4 py-3 text-right">Initial Balance</th>
                                <th className="px-4 py-3 text-right">Current Balance</th>
                                <th className="px-4 py-3 text-left">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {cards.map((c) => (
                                <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{c.code}</td>
                                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(c.issuedAt).toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600">KES {fmt(c.initialBalance)}</td>
                                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">KES {fmt(c.currentBalance)}</td>
                                    <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
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
