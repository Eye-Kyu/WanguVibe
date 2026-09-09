import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';

const CATEGORIES = ['beverages', 'snacks', 'dairy', 'bakery', 'other'];
const ITEMS_PER_PAGE = 12;

function StockBadge({ stock }) {
    if (stock === 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Out of stock</span>;
    if (stock < 10) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{stock} — Critical</span>;
    if (stock < 30) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{stock} — Low</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">{stock} — OK</span>;
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
                <p className="text-gray-800 text-sm">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm text-white bg-red-600 hover:bg-red-700 transition-colors">Delete</button>
                </div>
            </div>
        </div>
    );
}

const EMPTY_FORM = { name: '', barcode: '', price: '', stock: '', category: '', image: null };

function ProductFormModal({ initial, onSave, onClose, submitting }) {
    const [form, setForm] = useState(initial || EMPTY_FORM);

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
    const valid = form.name.trim() && form.price !== '' && form.stock !== '';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">{initial?._id ? 'Edit Product' : 'Add Product'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="p-5 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Product Name *</label>
                        <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="e.g. Chocolate Croissant"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Barcode</label>
                        <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="Scan or type barcode (optional)"
                            value={form.barcode}
                            onChange={e => set('barcode', e.target.value)}
                        />
                        <p className="text-xs text-gray-400 mt-1">Leave blank to remove existing barcode on update.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Price (KES) *</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="0.00"
                                value={form.price}
                                onChange={e => set('price', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Stock *</label>
                            <input
                                type="number"
                                min="0"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="0"
                                value={form.stock}
                                onChange={e => set('stock', e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                        <select
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            value={form.category}
                            onChange={e => set('category', e.target.value)}
                        >
                            <option value="">— Select category —</option>
                            {CATEGORIES.map(c => (
                                <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Product Image</label>
                        <input
                            type="file"
                            accept="image/*"
                            className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                            onChange={e => set('image', e.target.files[0] || null)}
                        />
                    </div>

                    {/* Image preview */}
                    {(form.image || (initial?.image && !form.image)) && (
                        <img
                            src={form.image instanceof File ? URL.createObjectURL(form.image) : (initial?.image || '')}
                            alt="Preview"
                            className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                        />
                    )}
                </div>

                <div className="flex gap-3 px-5 pb-5 justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                        onClick={() => onSave(form)}
                        disabled={!valid || submitting}
                        className="px-5 py-2 rounded-lg text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Saving…' : initial?._id ? 'Update Product' : 'Add Product'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ProductsPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [sortBy, setSortBy] = useState('name_asc');
    const [page, setPage] = useState(1);

    const [modalProduct, setModalProduct] = useState(null); // null = closed, {} = new, {...product} = edit
    const [confirmId, setConfirmId] = useState(null);

    const fetchProducts = useCallback(async () => {
        try {
            const res = await api.get('/products');
            setProducts(res.data);
        } catch {
            toast.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    const filtered = useMemo(() => {
        let list = products;

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.barcode || '').toLowerCase().includes(q)
            );
        }

        if (categoryFilter) {
            list = list.filter(p => (p.category || '').toLowerCase() === categoryFilter);
        }

        list = [...list].sort((a, b) => {
            switch (sortBy) {
                case 'name_asc':  return a.name.localeCompare(b.name);
                case 'name_desc': return b.name.localeCompare(a.name);
                case 'price_asc':  return a.price - b.price;
                case 'price_desc': return b.price - a.price;
                case 'stock_asc':  return a.stock - b.stock;
                case 'stock_desc': return b.stock - a.stock;
                default: return 0;
            }
        });

        return list;
    }, [products, search, categoryFilter, sortBy]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Reset page when filter changes
    useEffect(() => { setPage(1); }, [search, categoryFilter, sortBy]);

    const handleSave = async (form) => {
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('name', form.name.trim());
            fd.append('barcode', form.barcode.trim());
            fd.append('price', parseFloat(form.price));
            fd.append('stock', parseInt(form.stock));
            fd.append('category', form.category);
            if (form.image instanceof File) fd.append('image', form.image);

            const config = { headers: { 'Content-Type': 'multipart/form-data' } };

            if (modalProduct?._id) {
                await api.put(`/products/${modalProduct._id}`, fd, config);
                toast.success('Product updated');
            } else {
                await api.post('/products', fd, config);
                toast.success('Product added');
            }
            setModalProduct(null);
            fetchProducts();
        } catch (err) {
            const msg = err.response?.data?.error || 'Failed to save product';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/products/${confirmId}`);
            setProducts(p => p.filter(x => x._id !== confirmId));
            toast.success('Product deleted');
        } catch {
            toast.error('Failed to delete product');
        } finally {
            setConfirmId(null);
        }
    };

    const lowStockCount = products.filter(p => p.stock < 10).length;

    return (
        <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Products</h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {products.length} products
                        {lowStockCount > 0 && (
                            <span className="ml-2 text-amber-600 font-medium">· {lowStockCount} low/out of stock</span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => setModalProduct({})}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                    <span className="text-lg leading-none">+</span> Add Product
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <input
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="Search name or barcode…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />

                <select
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
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

            {/* Category chips */}
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
                        className={`px-3 py-1 rounded-full text-xs font-medium border capitalize transition-colors ${categoryFilter === c ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {/* Table */}
            {loading ? (
                <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                    <p className="text-sm">No products found</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left w-16">Image</th>
                                <th className="px-4 py-3 text-left">Name</th>
                                <th className="px-4 py-3 text-left">Barcode</th>
                                <th className="px-4 py-3 text-left">Category</th>
                                <th className="px-4 py-3 text-right">Price</th>
                                <th className="px-4 py-3 text-left">Stock</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {paginated.map(p => (
                                <tr
                                    key={p._id}
                                    className={`hover:bg-gray-50 transition-colors ${p.stock === 0 ? 'bg-red-50/40' : p.stock < 10 ? 'bg-amber-50/40' : ''}`}
                                >
                                    <td className="px-4 py-3">
                                        {p.image
                                            ? <img src={p.image} alt={p.name} className="w-10 h-10 object-cover rounded-lg" />
                                            : <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-lg">?</div>
                                        }
                                    </td>
                                    <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                                    <td className="px-4 py-3 font-mono text-gray-500 text-xs">{p.barcode || <span className="text-gray-300">—</span>}</td>
                                    <td className="px-4 py-3 capitalize text-gray-500">{p.category || <span className="text-gray-300">—</span>}</td>
                                    <td className="px-4 py-3 text-right text-gray-800">KES {Number(p.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-3"><StockBadge stock={p.stock} /></td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setModalProduct(p)}
                                                className="px-3 py-1 rounded-lg text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => setConfirmId(p._id)}
                                                className="px-3 py-1 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Page {currentPage} of {totalPages} · {filtered.length} results</span>
                    <div className="flex gap-1">
                        <button onClick={() => setPage(1)} disabled={currentPage === 1} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">«</button>
                        <button onClick={() => setPage(p => p - 1)} disabled={currentPage === 1} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">‹</button>
                        <button onClick={() => setPage(p => p + 1)} disabled={currentPage === totalPages} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">›</button>
                        <button onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">»</button>
                    </div>
                </div>
            )}

            {/* Modal */}
            {modalProduct !== null && (
                <ProductFormModal
                    initial={modalProduct._id ? modalProduct : null}
                    onSave={handleSave}
                    onClose={() => setModalProduct(null)}
                    submitting={submitting}
                />
            )}

            {/* Confirm delete dialog */}
            {confirmId && (
                <ConfirmDialog
                    message="Delete this product? This action cannot be undone."
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmId(null)}
                />
            )}
        </div>
    );
}
