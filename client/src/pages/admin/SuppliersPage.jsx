import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import ErrorState from '../../components/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

const EMPTY_FORM = { name: '', contactName: '', phone: '', email: '', address: '', notes: '' };

function SupplierModal({ initial, onSave, onClose, submitting }) {
    const isEdit = !!initial?._id;
    const [form, setForm] = useState(
        isEdit
            ? { name: initial.name, contactName: initial.contactName || '', phone: initial.phone || '', email: initial.email || '', address: initial.address || '', notes: initial.notes || '' }
            : EMPTY_FORM
    );

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const valid = form.name.trim().length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h2>
                    <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="p-5 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Name *</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="e.g. Acme Textiles Ltd"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            value={form.contactName}
                            onChange={e => set('contactName', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="e.g. 0712 345 678"
                            value={form.phone}
                            onChange={e => set('phone', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                        <input
                            type="email"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            value={form.email}
                            onChange={e => set('email', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            value={form.address}
                            onChange={e => set('address', e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                        <textarea
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                            rows={2}
                            value={form.notes}
                            onChange={e => set('notes', e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex gap-3 px-5 pb-5 justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                        onClick={() => onSave(form)}
                        disabled={!valid || submitting}
                        className="px-5 py-2 rounded-xl text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Saving…' : isEdit ? 'Update Supplier' : 'Add Supplier'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState('');
    const [modalSupplier, setModalSupplier] = useState(null);
    const [confirmId, setConfirmId] = useState(null);

    const fetchSuppliers = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.get('/suppliers');
            setSuppliers(res.data);
        } catch {
            toast.error('Failed to load suppliers');
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

    const filtered = useMemo(() => {
        if (!search.trim()) return suppliers;
        const q = search.toLowerCase();
        return suppliers.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.contactName || '').toLowerCase().includes(q) ||
            (s.phone || '').toLowerCase().includes(q)
        );
    }, [suppliers, search]);

    const handleSave = async (form) => {
        setSubmitting(true);
        try {
            const payload = {
                name: form.name.trim(),
                contactName: form.contactName.trim(),
                phone: form.phone.trim(),
                email: form.email.trim(),
                address: form.address.trim(),
                notes: form.notes,
            };
            if (modalSupplier?._id) {
                const res = await api.put(`/suppliers/${modalSupplier._id}`, payload);
                setSuppliers(list => list.map(s => s._id === modalSupplier._id ? res.data : s));
                toast.success('Supplier updated');
            } else {
                const res = await api.post('/suppliers', payload);
                setSuppliers(list => [res.data, ...list]);
                toast.success('Supplier added');
            }
            setModalSupplier(null);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save supplier');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/suppliers/${confirmId}`);
            setSuppliers(list => list.filter(s => s._id !== confirmId));
            toast.success('Supplier deleted');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to delete supplier');
        } finally {
            setConfirmId(null);
        }
    };

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Suppliers</h1>
                    <p className="text-sm text-gray-400 mt-0.5">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={() => setModalSupplier({})}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                    <span className="text-lg leading-none">+</span> Add Supplier
                </button>
            </div>

            <input
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Search name, contact, or phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
            />

            {loading ? (
                <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
            ) : error ? (
                <ErrorState message="Failed to load suppliers" onRetry={fetchSuppliers} />
            ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-16">No suppliers found</p>
            ) : (
                <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Supplier</th>
                                <th className="px-4 py-3 text-left">Contact</th>
                                <th className="px-4 py-3 text-left">Phone</th>
                                <th className="px-4 py-3 text-left">Email</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(s => (
                                <tr key={s._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-gray-800 font-medium">{s.name}</td>
                                    <td className="px-4 py-3 text-gray-600">{s.contactName || '—'}</td>
                                    <td className="px-4 py-3 text-gray-600">{s.phone || '—'}</td>
                                    <td className="px-4 py-3 text-gray-600">{s.email || '—'}</td>
                                    <td className="px-4 py-3 text-right space-x-3">
                                        <button onClick={() => setModalSupplier(s)} className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold">Edit</button>
                                        <button onClick={() => setConfirmId(s._id)} className="text-red-500 hover:text-red-700 text-xs font-semibold">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modalSupplier && (
                <SupplierModal
                    initial={modalSupplier}
                    onSave={handleSave}
                    onClose={() => setModalSupplier(null)}
                    submitting={submitting}
                />
            )}

            {confirmId && (
                <ConfirmDialog
                    message="Delete this supplier? This can't be undone."
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmId(null)}
                />
            )}
        </div>
    );
}
