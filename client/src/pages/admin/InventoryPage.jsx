import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';

const variantLabel = (v, styleName) => `${styleName} — ${v.size}/${v.color}`;

function RestockModal({ variants, preselected, onSave, onClose, submitting }) {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(preselected || null);
    const [quantity, setQuantity] = useState('');

    const matches = useMemo(() => {
        if (!query.trim()) return variants.slice(0, 8);
        const q = query.toLowerCase();
        return variants.filter(v =>
            v.styleName.toLowerCase().includes(q) ||
            v.sku?.toLowerCase().includes(q) ||
            v.barcode?.toLowerCase().includes(q) ||
            v.size.toLowerCase().includes(q) ||
            v.color.toLowerCase().includes(q)
        ).slice(0, 8);
    }, [variants, query]);

    const qty = parseInt(quantity, 10);
    const valid = !!selected && Number.isInteger(qty) && qty > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">Restock Variant</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="p-5 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Variant *</label>
                        {selected ? (
                            <div className="flex items-center justify-between border border-indigo-200 bg-indigo-50 rounded-xl px-3 py-2 text-sm">
                                <span className="text-gray-800">{variantLabel(selected, selected.styleName)} <span className="text-gray-400">(current: {selected.stock})</span></span>
                                <button onClick={() => setSelected(null)} className="text-xs text-indigo-600 hover:underline">Change</button>
                            </div>
                        ) : (
                            <>
                                <input
                                    autoFocus
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    placeholder="Search style, size, color, or SKU…"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                />
                                <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-48 overflow-y-auto">
                                    {matches.length === 0 ? (
                                        <p className="text-xs text-gray-400 px-3 py-3">No matching variants</p>
                                    ) : matches.map(v => (
                                        <button
                                            key={v._id}
                                            onClick={() => setSelected(v)}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between"
                                        >
                                            <span className="text-gray-700">{variantLabel(v, v.styleName)}</span>
                                            <span className="text-gray-400">stock: {v.stock}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Quantity to add *</label>
                        <input
                            type="number"
                            min="1"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="e.g. 10"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex gap-3 px-5 pb-5 justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                        onClick={() => onSave(selected._id, qty)}
                        disabled={!valid || submitting}
                        className="px-5 py-2 rounded-xl text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Saving…' : 'Restock'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function InventoryPage() {
    const [variants, setVariants] = useState([]);
    const [lowStock, setLowStock] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [modalPreselect, setModalPreselect] = useState(undefined); // undefined = closed

    const fetchAll = useCallback(async () => {
        try {
            const [stylesRes, lowStockRes, logsRes] = await Promise.all([
                api.get('/styles'),
                api.get('/variants/low-stock'),
                api.get('/inventory/logs'),
            ]);

            const flat = stylesRes.data.flatMap(style =>
                (style.variants || []).map(v => ({ ...v, styleName: style.name }))
            );
            setVariants(flat);
            setLowStock(lowStockRes.data);
            setLogs(logsRes.data);
        } catch {
            toast.error('Failed to load inventory data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleRestock = async (variantId, quantity) => {
        setSubmitting(true);
        try {
            await api.post('/inventory/restock', { variantId, quantity });
            toast.success('Variant restocked');
            setModalPreselect(undefined);
            fetchAll();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to restock');
        } finally {
            setSubmitting(false);
        }
    };

    const openRestock = (variant) => {
        if (!variant) return setModalPreselect(null);
        const full = variants.find(v => v._id === variant._id) || { ...variant, styleName: variant.style?.name || '' };
        setModalPreselect(full);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Inventory</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Restock variants and review stock movement history</p>
                </div>
                <button
                    onClick={() => setModalPreselect(null)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                    <span className="text-lg leading-none">+</span> Restock Variant
                </button>
            </div>

            {/* Low stock */}
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-amber-50/60">
                    <h2 className="text-sm font-semibold text-amber-800">Low Stock ({lowStock.length})</h2>
                </div>
                {loading ? (
                    <div className="p-4 space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                ) : lowStock.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Nothing below its reorder threshold right now.</p>
                ) : (
                    <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-50">
                            {lowStock.map(v => (
                                <tr key={v._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-2.5 text-gray-800">{v.style?.name} — {v.size}/{v.color}</td>
                                    <td className="px-4 py-2.5 text-gray-400 text-xs">{v.stock} in stock (reorder at {v.reorderThreshold})</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <button
                                            onClick={() => openRestock(v)}
                                            className="px-3 py-1 rounded-xl text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
                                        >
                                            Restock
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Logs */}
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-sm font-semibold text-gray-700">Inventory Log</h2>
                </div>
                {loading ? (
                    <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                ) : logs.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No inventory activity yet.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Variant</th>
                                <th className="px-4 py-3 text-left">Action</th>
                                <th className="px-4 py-3 text-right">Quantity</th>
                                <th className="px-4 py-3 text-left">By</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {logs.map(log => (
                                <tr key={log._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-2.5 text-gray-400 text-xs">{new Date(log.date).toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-gray-800">
                                        {log.variant?.style?.name || 'Unknown'} — {log.variant?.size}/{log.variant?.color}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-500 capitalize text-xs">{log.action}</td>
                                    <td className="px-4 py-2.5 text-right font-medium text-green-600">+{log.quantity}</td>
                                    <td className="px-4 py-2.5 text-gray-500 text-xs">{log.user?.name || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {modalPreselect !== undefined && (
                <RestockModal
                    variants={variants}
                    preselected={modalPreselect}
                    onSave={handleRestock}
                    onClose={() => setModalPreselect(undefined)}
                    submitting={submitting}
                />
            )}
        </div>
    );
}
