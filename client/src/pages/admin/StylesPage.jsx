import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import JsBarcode from 'jsbarcode';
import ErrorState from '../../components/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

const CATEGORIES = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Accessories', 'Footwear', 'Other'];
const ITEMS_PER_PAGE = 12;

const totalStock = (style) => (style.variants || []).reduce((s, v) => s + (v.active === false ? 0 : v.stock), 0);

function StockBadge({ stock }) {
    if (stock === 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Out of stock</span>;
    if (stock < 5) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Critical: {stock}</span>;
    if (stock < 15) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Low: {stock}</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">In stock: {stock}</span>;
}

// ─── Style create/edit form ──────────────────────────────────────────────────
const EMPTY_FORM = { name: '', styleCode: '', brand: '', description: '', category: '', season: '', material: '', basePrice: '', costPrice: '', image: null };

function StyleFormModal({ initial, onSave, onClose, submitting }) {
    const [form, setForm] = useState(initial?._id ? { ...EMPTY_FORM, ...initial, image: null } : EMPTY_FORM);
    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
    const valid = form.name.trim() && form.basePrice !== '';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">{initial?._id ? 'Edit Style' : 'Add Style'}</h2>
                    <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="p-5 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Style Name *</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="e.g. Floral Wrap Dress"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Style Code</label>
                            <input
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="e.g. DRS-0042"
                                value={form.styleCode}
                                onChange={e => set('styleCode', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
                            <input
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                value={form.brand}
                                onChange={e => set('brand', e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                        <textarea
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            rows={2}
                            value={form.description}
                            onChange={e => set('description', e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Base Price (KES) *</label>
                            <input
                                type="number" min="0" step="0.01"
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                value={form.basePrice}
                                onChange={e => set('basePrice', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price (KES)</label>
                            <input
                                type="number" min="0" step="0.01"
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                value={form.costPrice}
                                onChange={e => set('costPrice', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                            <select
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                value={form.category}
                                onChange={e => set('category', e.target.value)}
                            >
                                <option value="">Select…</option>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Season</label>
                            <input
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="e.g. SS26"
                                value={form.season}
                                onChange={e => set('season', e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="e.g. 100% Cotton"
                            value={form.material}
                            onChange={e => set('material', e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Style Image</label>
                        <input
                            type="file"
                            accept="image/*"
                            className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                            onChange={e => set('image', e.target.files[0] || null)}
                        />
                    </div>

                    {(form.image || (initial?.images?.[0] && !form.image)) && (
                        <img
                            src={form.image instanceof File ? URL.createObjectURL(form.image) : (initial?.images?.[0] || '')}
                            alt="Preview"
                            className="w-20 h-20 object-cover rounded-xl border border-gray-200"
                        />
                    )}
                </div>

                <div className="flex gap-3 px-5 pb-5 justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                        onClick={() => onSave(form)}
                        disabled={!valid || submitting}
                        className="px-5 py-2 rounded-xl text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Saving…' : initial?._id ? 'Update Style' : 'Add Style'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Variant matrix manager ──────────────────────────────────────────────────
const EMPTY_VARIANT = { size: '', color: '', sku: '', barcode: '', stock: '', priceOverride: '' };

function VariantManagerModal({ style, onClose, onChanged }) {
    const [variants, setVariants] = useState(style.variants || []);
    const [newRow, setNewRow] = useState(EMPTY_VARIANT);
    const [editingId, setEditingId] = useState(null);
    const [editRow, setEditRow] = useState(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        const res = await api.get(`/styles/${style._id}/variants`);
        setVariants(res.data);
        onChanged();
    }, [style._id, onChanged]);

    const addVariant = async () => {
        if (!newRow.size.trim() || !newRow.color.trim() || !newRow.sku.trim()) {
            toast.error('Size, color and SKU are required');
            return;
        }
        setBusy(true);
        try {
            await api.post(`/styles/${style._id}/variants`, {
                ...newRow,
                stock: parseInt(newRow.stock) || 0,
                priceOverride: newRow.priceOverride === '' ? null : parseFloat(newRow.priceOverride),
            });
            setNewRow(EMPTY_VARIANT);
            toast.success('Variant added');
            await refresh();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to add variant');
        } finally {
            setBusy(false);
        }
    };

    const saveEdit = async (id) => {
        setBusy(true);
        try {
            await api.put(`/variants/${id}`, {
                ...editRow,
                stock: parseInt(editRow.stock) || 0,
                priceOverride: editRow.priceOverride === '' || editRow.priceOverride == null ? null : parseFloat(editRow.priceOverride),
            });
            setEditingId(null);
            toast.success('Variant updated');
            await refresh();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update variant');
        } finally {
            setBusy(false);
        }
    };

    const deleteVariant = async (id) => {
        setBusy(true);
        try {
            await api.delete(`/variants/${id}`);
            toast.success('Variant deleted');
            await refresh();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to delete variant');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
                    <div>
                        <h2 className="font-semibold text-gray-800">Sizes &amp; Colors: {style.name}</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Each row is one sellable size/color, with its own barcode and stock</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="p-5">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs font-semibold text-gray-500 border-b border-gray-100">
                                <th className="pb-2 text-left">Size</th>
                                <th className="pb-2 text-left">Color</th>
                                <th className="pb-2 text-left">SKU</th>
                                <th className="pb-2 text-left">Barcode</th>
                                <th className="pb-2 text-right">Stock</th>
                                <th className="pb-2 text-right">Price Override</th>
                                <th className="pb-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {variants.map(v => {
                                const isEditing = editingId === v._id;
                                const row = isEditing ? editRow : v;
                                return (
                                    <tr key={v._id}>
                                        {isEditing ? (
                                            <>
                                                <td className="py-2 pr-2"><input className="w-16 border border-gray-200 rounded-lg px-1.5 py-1 text-xs" value={row.size} onChange={e => setEditRow({ ...row, size: e.target.value })} /></td>
                                                <td className="py-2 pr-2"><input className="w-20 border border-gray-200 rounded-lg px-1.5 py-1 text-xs" value={row.color} onChange={e => setEditRow({ ...row, color: e.target.value })} /></td>
                                                <td className="py-2 pr-2"><input className="w-24 border border-gray-200 rounded-lg px-1.5 py-1 text-xs font-mono" value={row.sku} onChange={e => setEditRow({ ...row, sku: e.target.value })} /></td>
                                                <td className="py-2 pr-2"><input className="w-24 border border-gray-200 rounded-lg px-1.5 py-1 text-xs font-mono" value={row.barcode || ''} onChange={e => setEditRow({ ...row, barcode: e.target.value })} /></td>
                                                <td className="py-2 pr-2"><input type="number" className="w-16 border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-right" value={row.stock} onChange={e => setEditRow({ ...row, stock: e.target.value })} /></td>
                                                <td className="py-2 pr-2"><input type="number" className="w-20 border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-right" placeholder="—" value={row.priceOverride ?? ''} onChange={e => setEditRow({ ...row, priceOverride: e.target.value })} /></td>
                                                <td className="py-2 text-right whitespace-nowrap">
                                                    <button disabled={busy} onClick={() => saveEdit(v._id)} className="text-xs font-semibold text-green-600 hover:text-green-800 mr-2">Save</button>
                                                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-600">Cancel</button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="py-2.5 font-medium text-gray-800">{v.size}</td>
                                                <td className="py-2.5 text-gray-600">{v.color}</td>
                                                <td className="py-2.5 font-mono text-xs text-gray-500">{v.sku}</td>
                                                <td className="py-2.5 font-mono text-xs text-gray-500">{v.barcode || '—'}</td>
                                                <td className="py-2.5 text-right"><StockBadge stock={v.stock} /></td>
                                                <td className="py-2.5 text-right text-gray-500">{v.priceOverride != null ? `KES ${v.priceOverride}` : '—'}</td>
                                                <td className="py-2.5 text-right whitespace-nowrap">
                                                    <button onClick={() => { setEditingId(v._id); setEditRow(v); }} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 mr-3">Edit</button>
                                                    <button disabled={busy} onClick={() => deleteVariant(v._id)} className="text-xs font-medium text-red-600 hover:text-red-800">Delete</button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}

                            {/* New row */}
                            <tr className="bg-indigo-50/30">
                                <td className="py-2 pr-2"><input className="w-16 border border-gray-200 rounded-lg px-1.5 py-1 text-xs" placeholder="M" value={newRow.size} onChange={e => setNewRow({ ...newRow, size: e.target.value })} /></td>
                                <td className="py-2 pr-2"><input className="w-20 border border-gray-200 rounded-lg px-1.5 py-1 text-xs" placeholder="Red" value={newRow.color} onChange={e => setNewRow({ ...newRow, color: e.target.value })} /></td>
                                <td className="py-2 pr-2"><input className="w-24 border border-gray-200 rounded-lg px-1.5 py-1 text-xs font-mono" placeholder="SKU" value={newRow.sku} onChange={e => setNewRow({ ...newRow, sku: e.target.value })} /></td>
                                <td className="py-2 pr-2"><input className="w-24 border border-gray-200 rounded-lg px-1.5 py-1 text-xs font-mono" placeholder="optional" value={newRow.barcode} onChange={e => setNewRow({ ...newRow, barcode: e.target.value })} /></td>
                                <td className="py-2 pr-2"><input type="number" className="w-16 border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-right" placeholder="0" value={newRow.stock} onChange={e => setNewRow({ ...newRow, stock: e.target.value })} /></td>
                                <td className="py-2 pr-2"><input type="number" className="w-20 border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-right" placeholder="—" value={newRow.priceOverride} onChange={e => setNewRow({ ...newRow, priceOverride: e.target.value })} /></td>
                                <td className="py-2 text-right">
                                    <button disabled={busy} onClick={addVariant} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">+ Add</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    {variants.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-6">No variants yet. Add the first size/color above.</p>
                    )}
                </div>

                <div className="px-5 pb-5 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white bg-gray-800 hover:bg-gray-900 transition-colors">Done</button>
                </div>
            </div>
        </div>
    );
}

// ─── Barcode/Label Printing ─────────────────────────────────────────────────
// Renders each label's barcode to an offscreen canvas (JsBarcode has no
// direct data-URL API, unlike the `qrcode` package used elsewhere in this
// app — canvas.toDataURL() is the bridge), then reuses the exact
// popup-window print pattern already established for receipts in
// POSPage.jsx (write the sheet's HTML into a blank window, print, close).
function LabelPrintModal({ style, onClose }) {
    const [variants, setVariants] = useState([]);
    const [quantities, setQuantities] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchVariants = useCallback(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        api.get(`/styles/${style._id}/variants`).then(res => {
            if (cancelled) return;
            setVariants(res.data);
            const initialQty = {};
            // Defaults to current stock (one label per unit on hand) capped
            // at 50 so a huge restock doesn't silently queue an enormous
            // print job — still fully editable per row.
            res.data.forEach(v => { initialQty[v._id] = Math.min(v.stock || 0, 50); });
            setQuantities(initialQty);
        }).catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [style._id]);

    useEffect(() => fetchVariants(), [fetchVariants]);

    const setQty = (id, val) => setQuantities(q => ({ ...q, [id]: Math.max(0, parseInt(val, 10) || 0) }));

    const handlePrint = () => {
        const lines = [];
        variants.forEach(v => {
            const qty = quantities[v._id] || 0;
            // A variant's barcode field is optional (sparse/unique) — fall
            // back to its always-present sku so every variant can still get
            // a scannable label even before a separate barcode is assigned.
            const code = v.barcode || v.sku;
            for (let i = 0; i < qty; i++) lines.push({ variant: v, code });
        });
        if (lines.length === 0) {
            toast.error('Set a quantity for at least one size/color');
            return;
        }

        const price = (v) => Number(v.priceOverride ?? style.basePrice).toFixed(2);
        const labelHtml = lines.map(({ variant: v, code }) => {
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, code, { format: 'CODE128', displayValue: false, width: 2, height: 40, margin: 0 });
            return `<div class="label">
                <img src="${canvas.toDataURL('image/png')}" />
                <div class="label-name">${style.name}</div>
                <div class="label-sub">${v.size}/${v.color}, KES ${price(v)}</div>
                <div class="label-code">${code}</div>
            </div>`;
        }).join('');

        const w = window.open('', '', 'width=800,height=600');
        w.document.write(`<html><head><title>Labels: ${style.name}</title><style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 8px; }
            .sheet { display: flex; flex-wrap: wrap; gap: 4px; }
            .label { width: 190px; padding: 6px 4px; border: 1px dashed #ccc; text-align: center; page-break-inside: avoid; }
            .label img { max-width: 100%; height: 40px; }
            .label-name { font-size: 11px; font-weight: bold; margin-top: 2px; }
            .label-sub { font-size: 10px; color: #333; }
            .label-code { font-size: 9px; color: #666; font-family: 'Courier New', monospace; }
        </style></head><body><div class="sheet">${labelHtml}</div></body></html>`);
        w.document.close();
        w.onload = () => { setTimeout(() => { w.print(); w.close(); }, 300); };
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
                    <div>
                        <h2 className="font-semibold text-gray-800">Print Labels: {style.name}</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Set how many labels to print for each size/color</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="p-5">
                    {loading ? (
                        <p className="text-sm text-gray-500 text-center py-6">Loading…</p>
                    ) : error ? (
                        <ErrorState message="Failed to load sizes/colors" onRetry={fetchVariants} />
                    ) : variants.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-6">This style has no sizes/colors yet</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs font-semibold text-gray-500 border-b border-gray-100">
                                    <th className="pb-2 text-left">Size/Color</th>
                                    <th className="pb-2 text-left">Code</th>
                                    <th className="pb-2 text-right">Stock</th>
                                    <th className="pb-2 text-right">Qty to Print</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {variants.map(v => (
                                    <tr key={v._id}>
                                        <td className="py-2">{v.size}/{v.color}</td>
                                        <td className="py-2 font-mono text-xs text-gray-500">{v.barcode || v.sku}</td>
                                        <td className="py-2 text-right text-gray-500">{v.stock}</td>
                                        <td className="py-2 text-right">
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-16 border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-right"
                                                value={quantities[v._id] ?? 0}
                                                onChange={e => setQty(v._id, e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                        onClick={handlePrint}
                        disabled={loading || variants.length === 0}
                        className="px-4 py-2 rounded-xl text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                        Print Labels
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ProductsPage() {
    const [styles, setStyles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [sortBy, setSortBy] = useState('name_asc');
    const [page, setPage] = useState(1);

    const [modalStyle, setModalStyle] = useState(null); // null = closed, {} = new, {...style} = edit
    const [variantStyle, setVariantStyle] = useState(null); // style whose variant manager is open
    const [labelStyle, setLabelStyle] = useState(null); // style whose label-print modal is open
    const [confirmId, setConfirmId] = useState(null);

    const fetchStyles = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.get('/styles', { params: { activeOnly: 'false' } });
            setStyles(res.data);
        } catch {
            toast.error('Failed to load styles');
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchStyles(); }, [fetchStyles]);

    const filtered = useMemo(() => {
        let list = styles;

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(s =>
                s.name.toLowerCase().includes(q) ||
                (s.styleCode || '').toLowerCase().includes(q) ||
                (s.brand || '').toLowerCase().includes(q)
            );
        }

        if (categoryFilter) {
            list = list.filter(s => (s.category || '') === categoryFilter);
        }

        list = [...list].sort((a, b) => {
            switch (sortBy) {
                case 'name_asc':  return a.name.localeCompare(b.name);
                case 'name_desc': return b.name.localeCompare(a.name);
                case 'price_asc':  return a.basePrice - b.basePrice;
                case 'price_desc': return b.basePrice - a.basePrice;
                case 'stock_asc':  return totalStock(a) - totalStock(b);
                case 'stock_desc': return totalStock(b) - totalStock(a);
                default: return 0;
            }
        });

        return list;
    }, [styles, search, categoryFilter, sortBy]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setPage(1); }, [search, categoryFilter, sortBy]);

    const handleSave = async (form) => {
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('name', form.name.trim());
            fd.append('styleCode', (form.styleCode || '').trim());
            fd.append('brand', form.brand || '');
            fd.append('description', form.description || '');
            fd.append('category', form.category || '');
            fd.append('season', form.season || '');
            fd.append('material', form.material || '');
            fd.append('basePrice', parseFloat(form.basePrice));
            fd.append('costPrice', parseFloat(form.costPrice) || 0);
            if (form.image instanceof File) fd.append('image', form.image);

            const config = { headers: { 'Content-Type': 'multipart/form-data' } };

            if (modalStyle?._id) {
                await api.put(`/styles/${modalStyle._id}`, fd, config);
                toast.success('Style updated');
            } else {
                await api.post('/styles', fd, config);
                toast.success('Style added. Now add its sizes/colors.');
            }
            setModalStyle(null);
            fetchStyles();
        } catch (err) {
            const msg = err.response?.data?.error || 'Failed to save style';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/styles/${confirmId}`);
            setStyles(s => s.filter(x => x._id !== confirmId));
            toast.success('Style and its variants deleted');
        } catch {
            toast.error('Failed to delete style');
        } finally {
            setConfirmId(null);
        }
    };

    const lowStockCount = styles.filter(s => totalStock(s) < 5).length;

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Styles</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {styles.length} styles
                        {lowStockCount > 0 && (
                            <span className="ml-2 text-amber-700 font-medium">({lowStockCount} low or out of stock)</span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => setModalStyle({})}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                    <span className="text-lg leading-none">+</span> Add Style
                </button>
            </div>

            <div className="flex flex-wrap gap-3">
                <input
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="Search name, code or brand…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />

                <select
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                >
                    <option value="name_asc">Name A–Z</option>
                    <option value="name_desc">Name Z–A</option>
                    <option value="price_asc">Price ↑</option>
                    <option value="price_desc">Price ↓</option>
                    <option value="stock_asc">Stock ↑</option>
                    <option value="stock_desc">Stock ↓</option>
                </select>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setCategoryFilter('')}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${categoryFilter === '' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                >
                    All
                </button>
                {CATEGORIES.map(c => (
                    <button
                        key={c}
                        onClick={() => setCategoryFilter(c)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${categoryFilter === c ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <ErrorState message="Failed to load styles" onRetry={fetchStyles} />
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                    <p className="text-sm">No styles found</p>
                </div>
            ) : (
                <div className="bg-gradient-to-br from-white to-gray-50 rounded-sm border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs">
                                <th className="px-4 py-3 text-left w-16">Image</th>
                                <th className="px-4 py-3 text-left">Name</th>
                                <th className="px-4 py-3 text-left">Style Code</th>
                                <th className="px-4 py-3 text-left">Category</th>
                                <th className="px-4 py-3 text-right">Base Price</th>
                                <th className="px-4 py-3 text-left">Variants</th>
                                <th className="px-4 py-3 text-left">Total Stock</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {paginated.map(s => {
                                const stock = totalStock(s);
                                return (
                                    <tr
                                        key={s._id}
                                        className={`hover:bg-gray-50 transition-colors ${stock === 0 ? 'bg-red-50/40' : stock < 5 ? 'bg-amber-50/40' : ''}`}
                                    >
                                        <td className="px-4 py-3">
                                            {s.images?.[0]
                                                ? <img src={s.images[0]} alt={s.name} className="w-10 h-10 object-cover rounded-xl" />
                                                : <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 text-lg">?</div>
                                            }
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                                        <td className="px-4 py-3 font-mono text-gray-500 text-xs">{s.styleCode || <span className="text-gray-500">—</span>}</td>
                                        <td className="px-4 py-3 text-gray-500">{s.category || <span className="text-gray-500">—</span>}</td>
                                        <td className="px-4 py-3 text-right text-gray-800">KES {Number(s.basePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-3 text-gray-500">{(s.variants || []).length}</td>
                                        <td className="px-4 py-3"><StockBadge stock={stock} /></td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setVariantStyle(s)}
                                                    className="px-3 py-1 rounded-xl text-xs font-medium text-purple-600 border border-purple-200 hover:bg-purple-50 transition-colors"
                                                >
                                                    Sizes/Colors
                                                </button>
                                                <button
                                                    onClick={() => setLabelStyle(s)}
                                                    className="px-3 py-1 rounded-xl text-xs font-medium text-teal-600 border border-teal-200 hover:bg-teal-50 transition-colors"
                                                >
                                                    Labels
                                                </button>
                                                <button
                                                    onClick={() => setModalStyle(s)}
                                                    className="px-3 py-1 rounded-xl text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => setConfirmId(s._id)}
                                                    className="px-3 py-1 rounded-xl text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Page {currentPage} of {totalPages} ({filtered.length} results)</span>
                    <div className="flex gap-1">
                        <button onClick={() => setPage(1)} disabled={currentPage === 1} aria-label="First page" className="px-2 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">First</button>
                        <button onClick={() => setPage(p => p - 1)} disabled={currentPage === 1} aria-label="Previous page" className="px-2 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Prev</button>
                        <button onClick={() => setPage(p => p + 1)} disabled={currentPage === totalPages} aria-label="Next page" className="px-2 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
                        <button onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} aria-label="Last page" className="px-2 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Last</button>
                    </div>
                </div>
            )}

            {modalStyle !== null && (
                <StyleFormModal
                    initial={modalStyle._id ? modalStyle : null}
                    onSave={handleSave}
                    onClose={() => setModalStyle(null)}
                    submitting={submitting}
                />
            )}

            {variantStyle && (
                <VariantManagerModal
                    style={variantStyle}
                    onClose={() => setVariantStyle(null)}
                    onChanged={fetchStyles}
                />
            )}

            {labelStyle && (
                <LabelPrintModal
                    style={labelStyle}
                    onClose={() => setLabelStyle(null)}
                />
            )}

            {confirmId && (
                <ConfirmDialog
                    message="Delete this style and all of its sizes/colors? This action cannot be undone."
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmId(null)}
                />
            )}
        </div>
    );
}
