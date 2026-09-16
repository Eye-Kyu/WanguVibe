import { useState, useEffect, useCallback, memo } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import ErrorState from '../../components/ErrorState';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES = {
    ordered: 'bg-indigo-100 text-indigo-700',
    partially_received: 'bg-amber-100 text-amber-700',
    received: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
};

// Debounced style search, listing each matching style's variants as
// addable lines — mirrors the CustomerPicker search idiom in POSPage.jsx.
const VariantSearchPicker = memo(({ onAdd }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!query.trim()) { setResults([]); return; }
        setSearching(true);
        const handle = setTimeout(() => {
            api.get(`/styles?search=${encodeURIComponent(query.trim())}`)
                .then(res => setResults(res.data))
                .catch(() => setResults([]))
                .finally(() => setSearching(false));
        }, 300);
        return () => clearTimeout(handle);
    }, [query]);

    return (
        <div>
            <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search style by name to add items…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {query.trim() && (
                <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-40 overflow-y-auto">
                    {searching ? (
                        <p className="text-xs text-gray-400 px-3 py-2">Searching…</p>
                    ) : results.length === 0 ? (
                        <p className="text-xs text-gray-400 px-3 py-2">No matching styles</p>
                    ) : results.map(style => (
                        style.variants?.map(v => (
                            <button
                                key={v._id}
                                onClick={() => onAdd(v, style)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between"
                            >
                                <span className="text-gray-700">{style.name} <span className="text-gray-400">({v.size}/{v.color})</span></span>
                                <span className="text-gray-400">Stock: {v.stock}</span>
                            </button>
                        ))
                    ))}
                </div>
            )}
        </div>
    );
});
VariantSearchPicker.displayName = 'VariantSearchPicker';

function CreatePOModal({ suppliers, onSave, onClose, submitting }) {
    const [supplierId, setSupplierId] = useState('');
    const [items, setItems] = useState([]); // [{ variant, styleName, size, color, quantityOrdered, unitCost }]
    const [expectedDate, setExpectedDate] = useState('');
    const [notes, setNotes] = useState('');

    const addItem = (variant, style) => {
        if (items.some(i => i.variant === variant._id)) return toast.info('Already added');
        setItems(list => [...list, { variant: variant._id, styleName: style.name, size: variant.size, color: variant.color, quantityOrdered: 1, unitCost: 0 }]);
    };
    const updateItem = (variant, field, value) => {
        setItems(list => list.map(i => i.variant === variant ? { ...i, [field]: value } : i));
    };
    const removeItem = (variant) => setItems(list => list.filter(i => i.variant !== variant));

    const valid = supplierId && items.length > 0 && items.every(i => i.quantityOrdered > 0 && i.unitCost >= 0);

    const handleSubmit = () => {
        onSave({
            supplier: supplierId,
            items: items.map(({ variant, quantityOrdered, unitCost }) => ({ variant, quantityOrdered: Number(quantityOrdered), unitCost: Number(unitCost) })),
            expectedDate: expectedDate || undefined,
            notes,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                    <h2 className="font-semibold text-gray-800">New Purchase Order</h2>
                    <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="p-5 space-y-3 overflow-y-auto flex-1">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
                        <select
                            value={supplierId}
                            onChange={e => setSupplierId(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            <option value="">Select a supplier…</option>
                            {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Items *</label>
                        <VariantSearchPicker onAdd={addItem} />
                    </div>

                    {items.length > 0 && (
                        <div className="space-y-2">
                            {items.map(i => (
                                <div key={i.variant} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs">
                                    <span className="flex-1 text-gray-700 truncate">{i.styleName} <span className="text-gray-400">({i.size}/{i.color})</span></span>
                                    <input
                                        type="number" min="1" value={i.quantityOrdered}
                                        onChange={e => updateItem(i.variant, 'quantityOrdered', e.target.value)}
                                        placeholder="Qty"
                                        className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs"
                                    />
                                    <input
                                        type="number" min="0" value={i.unitCost}
                                        onChange={e => updateItem(i.variant, 'unitCost', e.target.value)}
                                        placeholder="Unit cost"
                                        className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs"
                                    />
                                    <button onClick={() => removeItem(i.variant)} aria-label="Remove item" className="text-gray-400 hover:text-red-500">&times;</button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Expected Date (optional)</label>
                        <input
                            type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                        <textarea
                            rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                        />
                    </div>
                </div>

                <div className="flex gap-3 px-5 py-4 border-t shrink-0 justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!valid || submitting}
                        className="px-5 py-2 rounded-xl text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Creating…' : 'Create Purchase Order'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PODetailModal({ po, onClose, onUpdated }) {
    const [receiveQty, setReceiveQty] = useState({}); // { variantId: qty }
    const [submitting, setSubmitting] = useState(false);

    const outstanding = (item) => item.quantityOrdered - item.quantityReceived;
    const canReceive = po.status === 'ordered' || po.status === 'partially_received';
    const canCancel = po.status === 'ordered' || po.status === 'partially_received';

    const handleReceive = async () => {
        const items = Object.entries(receiveQty)
            .filter(([, qty]) => parseInt(qty, 10) > 0)
            .map(([variant, qty]) => ({ variant, quantity: parseInt(qty, 10) }));
        if (items.length === 0) return toast.error('Enter a quantity to receive for at least one item');

        setSubmitting(true);
        try {
            const res = await api.post(`/purchase-orders/${po._id}/receive`, { items });
            onUpdated(res.data);
            setReceiveQty({});
            toast.success('Receipt recorded');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to record receipt');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async () => {
        setSubmitting(true);
        try {
            const res = await api.post(`/purchase-orders/${po._id}/cancel`);
            onUpdated(res.data);
            toast.success('Purchase order cancelled');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to cancel purchase order');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                    <div>
                        <h2 className="font-semibold text-gray-800">Purchase Order</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{po.supplier?.name || 'Unknown supplier'}</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                                <th className="px-5 py-2 text-left">Item</th>
                                <th className="px-5 py-2 text-right">Ordered</th>
                                <th className="px-5 py-2 text-right">Received</th>
                                {canReceive && <th className="px-5 py-2 text-right">Receive Now</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {po.items?.map((item) => (
                                <tr key={item._id}>
                                    <td className="px-5 py-2 text-gray-700">{item.styleName} <span className="text-gray-400 text-xs">({item.size}/{item.color})</span></td>
                                    <td className="px-5 py-2 text-right text-gray-600">{item.quantityOrdered}</td>
                                    <td className="px-5 py-2 text-right text-gray-600">{item.quantityReceived}</td>
                                    {canReceive && (
                                        <td className="px-5 py-2 text-right">
                                            {outstanding(item) > 0 ? (
                                                <input
                                                    type="number" min="0" max={outstanding(item)}
                                                    value={receiveQty[item.variant?._id || item.variant] || ''}
                                                    onChange={e => setReceiveQty(prev => ({ ...prev, [item.variant?._id || item.variant]: e.target.value }))}
                                                    placeholder={`≤${outstanding(item)}`}
                                                    className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right"
                                                />
                                            ) : <span className="text-xs text-green-600">Complete</span>}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="px-5 py-4 border-t shrink-0 space-y-2">
                    {canReceive && (
                        <button onClick={handleReceive} disabled={submitting} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                            Record Receipt
                        </button>
                    )}
                    {canCancel ? (
                        <button onClick={handleCancel} disabled={submitting} className="w-full py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors">
                            Cancel Purchase Order
                        </button>
                    ) : (
                        <button onClick={onClose} className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors">Close</button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function PurchaseOrdersPage() {
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [detailPO, setDetailPO] = useState(null);

    const LIMIT = 25;

    const fetchPurchaseOrders = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const params = new URLSearchParams({ page, limit: LIMIT });
            if (statusFilter) params.set('status', statusFilter);
            const res = await api.get(`/purchase-orders?${params}`);
            setPurchaseOrders(res.data.purchaseOrders);
            setPages(res.data.pages || 1);
            setTotal(res.data.total || 0);
        } catch {
            toast.error('Failed to load purchase orders');
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter]);

    useEffect(() => { fetchPurchaseOrders(); }, [fetchPurchaseOrders]);
    useEffect(() => { api.get('/suppliers').then(res => setSuppliers(res.data)).catch(() => {}); }, []);

    const handleCreate = async (payload) => {
        setCreating(true);
        try {
            const res = await api.post('/purchase-orders', payload);
            setPurchaseOrders(list => [res.data, ...list]);
            setTotal(t => t + 1);
            setShowCreate(false);
            toast.success('Purchase order created');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to create purchase order');
        } finally {
            setCreating(false);
        }
    };

    const handleUpdated = (updated) => {
        setPurchaseOrders(list => list.map(po => po._id === updated._id ? updated : po));
        setDetailPO(updated);
    };

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Purchase Orders</h1>
                    <p className="text-sm text-gray-400 mt-0.5">{total.toLocaleString()} order{total !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                        <option value="">All statuses</option>
                        <option value="ordered">Ordered</option>
                        <option value="partially_received">Partially Received</option>
                        <option value="received">Received</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                        <span className="text-lg leading-none">+</span> New PO
                    </button>
                </div>
            </div>

            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                ) : error ? (
                    <ErrorState message="Failed to load purchase orders" onRetry={fetchPurchaseOrders} />
                ) : purchaseOrders.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">No purchase orders found.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Supplier</th>
                                <th className="px-4 py-3 text-left">Items</th>
                                <th className="px-4 py-3 text-right">Total Cost</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-left">Created</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {purchaseOrders.map((po) => {
                                const totalCost = po.items?.reduce((s, i) => s + i.quantityOrdered * i.unitCost, 0) || 0;
                                return (
                                    <tr key={po._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-2.5 text-gray-800">{po.supplier?.name || '—'}</td>
                                        <td className="px-4 py-2.5 text-gray-600">{po.items?.length || 0} line{po.items?.length !== 1 ? 's' : ''}</td>
                                        <td className="px-4 py-2.5 text-right text-gray-600">KES {fmt(totalCost)}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[po.status]}`}>
                                                {po.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{new Date(po.createdAt).toLocaleString()}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <button onClick={() => setDetailPO(po)} className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold">View</button>
                                        </td>
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
                            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">Prev</button>
                            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">Next</button>
                        </div>
                    </div>
                )}
            </div>

            {showCreate && (
                <CreatePOModal
                    suppliers={suppliers}
                    onSave={handleCreate}
                    onClose={() => setShowCreate(false)}
                    submitting={creating}
                />
            )}

            {detailPO && (
                <PODetailModal
                    po={detailPO}
                    onClose={() => setDetailPO(null)}
                    onUpdated={handleUpdated}
                />
            )}
        </div>
    );
}
