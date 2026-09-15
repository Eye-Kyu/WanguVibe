import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES = {
    active: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
};

const PAYMENT_METHODS = [
    { key: 'cash', label: 'Cash' },
    { key: 'card', label: 'Card' },
    { key: 'store_credit', label: 'Store Credit' },
    { key: 'gift_card', label: 'Gift Card' },
];

function LayawayDetailModal({ layaway, onClose, onUpdated }) {
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('cash');
    const [giftCardCode, setGiftCardCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [confirmingCancel, setConfirmingCancel] = useState(false);

    const isActive = layaway.status === 'active';
    const fullyPaid = layaway.balanceRemaining <= 0.5;

    const handleRecordPayment = async () => {
        const amountNum = parseFloat(amount) || 0;
        if (amountNum <= 0) return toast.error('Enter a payment amount greater than 0');
        if (method === 'gift_card' && !giftCardCode.trim()) return toast.error('Enter a gift card code');

        setSubmitting(true);
        try {
            const res = await api.post(`/layaways/${layaway._id}/payment`, { amount: amountNum, method, giftCardCode: giftCardCode.trim() || undefined });
            onUpdated(res.data);
            setAmount('');
            setGiftCardCode('');
            toast.success('Payment recorded');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to record payment');
        } finally {
            setSubmitting(false);
        }
    };

    const handleComplete = async () => {
        setSubmitting(true);
        try {
            const res = await api.post(`/layaways/${layaway._id}/complete`);
            onUpdated(res.data.layaway);
            toast.success('Layaway completed — sale created');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to complete layaway');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async (destination) => {
        setSubmitting(true);
        try {
            const res = await api.post(`/layaways/${layaway._id}/cancel`, { destination });
            onUpdated(res.data);
            toast.success(`Layaway cancelled (${destination === 'forfeit' ? 'deposit forfeited' : 'refunded as store credit'})`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to cancel layaway');
        } finally {
            setSubmitting(false);
            setConfirmingCancel(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                    <div>
                        <h2 className="font-semibold text-gray-800">Layaway</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{layaway.customer?.name || 'Unknown customer'}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="overflow-y-auto flex-1">
                    <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-xs text-indigo-500 uppercase tracking-wide font-semibold">Total</p>
                            <p className="text-lg font-bold text-indigo-700">KES {fmt(layaway.totalAmount)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-indigo-500 uppercase tracking-wide font-semibold">Balance Remaining</p>
                            <p className="text-lg font-bold text-indigo-700">KES {fmt(layaway.balanceRemaining)}</p>
                        </div>
                    </div>

                    <div className="px-5 py-3 border-b border-gray-100">
                        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Items</p>
                        {layaway.items?.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm py-1">
                                <span className="text-gray-600">{item.styleName} <span className="text-gray-400">({item.size}/{item.color})</span> × {item.quantity}</span>
                                <span className="font-medium text-gray-700">KES {fmt(item.unitPrice * item.quantity * (1 - item.discount / 100))}</span>
                            </div>
                        ))}
                    </div>

                    <div className="px-5 py-3 border-b border-gray-100">
                        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Payment History</p>
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-gray-50">
                                {layaway.payments?.map((p, i) => (
                                    <tr key={i}>
                                        <td className="py-1.5 text-gray-400 text-xs whitespace-nowrap">{new Date(p.paidAt).toLocaleString()}</td>
                                        <td className="py-1.5 text-gray-600 text-xs capitalize">{p.method.replace('_', ' ')}</td>
                                        <td className="py-1.5 text-gray-500 text-xs">{p.cashier?.name || '—'}</td>
                                        <td className="py-1.5 text-right font-semibold text-green-600">+KES {fmt(p.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {isActive && (
                        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
                            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Record Payment</p>
                            <div className="flex gap-2">
                                <input
                                    type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                                    placeholder="Amount"
                                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                                <select
                                    value={method} onChange={e => setMethod(e.target.value)}
                                    className="border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                >
                                    {PAYMENT_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                                </select>
                            </div>
                            {method === 'gift_card' && (
                                <input
                                    value={giftCardCode} onChange={e => setGiftCardCode(e.target.value)}
                                    placeholder="Gift card code"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                            )}
                            <button
                                onClick={handleRecordPayment}
                                disabled={submitting}
                                className="w-full py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                Record Payment
                            </button>
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t shrink-0 space-y-2">
                    {isActive && confirmingCancel ? (
                        <div className="space-y-2">
                            <p className="text-xs text-gray-500 text-center">Cancel and...</p>
                            <div className="flex gap-2">
                                <button onClick={() => handleCancel('forfeit')} disabled={submitting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors">
                                    Forfeit deposit
                                </button>
                                <button onClick={() => handleCancel('store_credit')} disabled={submitting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 transition-colors">
                                    Refund as store credit
                                </button>
                            </div>
                            <button onClick={() => setConfirmingCancel(false)} className="w-full text-xs text-gray-400 hover:text-gray-600">Never mind</button>
                        </div>
                    ) : isActive ? (
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmingCancel(true)} disabled={submitting} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors">
                                Cancel Layaway
                            </button>
                            <button onClick={handleComplete} disabled={submitting || !fullyPaid} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                                Complete
                            </button>
                        </div>
                    ) : (
                        <button onClick={onClose} className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors">Close</button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function LayawaysPage() {
    const [layaways, setLayaways] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [detailLayaway, setDetailLayaway] = useState(null);

    const LIMIT = 25;

    const fetchLayaways = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: LIMIT });
            if (statusFilter) params.set('status', statusFilter);
            const res = await api.get(`/layaways?${params}`);
            setLayaways(res.data.layaways);
            setPages(res.data.pages || 1);
            setTotal(res.data.total || 0);
        } catch {
            toast.error('Failed to load layaways');
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter]);

    useEffect(() => { fetchLayaways(); }, [fetchLayaways]);

    const handleUpdated = (updated) => {
        setLayaways(list => list.map(l => l._id === updated._id ? updated : l));
        setDetailLayaway(updated);
    };

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Layaways</h1>
                    <p className="text-sm text-gray-400 mt-0.5">{total.toLocaleString()} layaway{total !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button onClick={fetchLayaways} className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                        Refresh
                    </button>
                </div>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                ) : layaways.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">No layaways found.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Customer</th>
                                <th className="px-4 py-3 text-right">Total</th>
                                <th className="px-4 py-3 text-right">Balance</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-left">Created</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {layaways.map((l) => (
                                <tr key={l._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-2.5 text-gray-800">{l.customer?.name || '—'}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600">KES {fmt(l.totalAmount)}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-600">KES {fmt(l.balanceRemaining)}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[l.status]}`}>
                                            {l.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <button onClick={() => setDetailLayaway(l)} className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold">
                                            View
                                        </button>
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
                            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">Prev</button>
                            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">Next</button>
                        </div>
                    </div>
                )}
            </div>

            {detailLayaway && (
                <LayawayDetailModal
                    layaway={detailLayaway}
                    onClose={() => setDetailLayaway(null)}
                    onUpdated={handleUpdated}
                />
            )}
        </div>
    );
}
