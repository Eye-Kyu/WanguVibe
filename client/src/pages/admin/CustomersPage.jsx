import { useState, useEffect, useMemo, useContext, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import { AuthContext } from '../../context/AuthContext';
import ErrorState from '../../components/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StoreCreditLedgerModal({ customer, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchLedger = useCallback(() => {
        setLoading(true);
        setError(false);
        api.get(`/customers/${customer._id}/store-credit-ledger`)
            .then(res => setData(res.data))
            .catch(() => { toast.error('Failed to load store credit ledger'); setError(true); })
            .finally(() => setLoading(false));
    }, [customer._id]);

    useEffect(() => { fetchLedger(); }, [fetchLedger]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-white rounded-sm shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                    <div>
                        <h2 className="font-semibold text-gray-800">Store Credit Ledger</h2>
                        <p className="text-xs text-gray-500 mt-0.5">{customer.name}</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 shrink-0">
                    <p className="text-xs text-indigo-500 uppercase tracking-wide font-semibold">Current Balance</p>
                    <p className="text-xl font-bold text-indigo-700">KES {fmt(data?.balance)}</p>
                </div>

                <div className="overflow-y-auto flex-1">
                    {loading ? (
                        <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
                    ) : error ? (
                        <ErrorState message="Failed to load store credit ledger" onRetry={fetchLedger} />
                    ) : !data?.entries?.length ? (
                        <p className="text-sm text-gray-500 text-center py-10">No store credit activity yet.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                                    <th className="px-5 py-2 text-left">Date</th>
                                    <th className="px-5 py-2 text-left">Reason</th>
                                    <th className="px-5 py-2 text-left">By</th>
                                    <th className="px-5 py-2 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.entries.map(e => (
                                    <tr key={e._id}>
                                        <td className="px-5 py-2 text-gray-500 text-xs whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                                        <td className="px-5 py-2 text-gray-600 text-xs capitalize">{e.reason.replace(/_/g, ' ')}</td>
                                        <td className="px-5 py-2 text-gray-500 text-xs">{e.createdBy?.name || '—'}</td>
                                        <td className={`px-5 py-2 text-right font-semibold ${e.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {e.amount >= 0 ? '+' : ''}KES {fmt(e.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="px-5 py-4 border-t shrink-0">
                    <button onClick={onClose} className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors">Close</button>
                </div>
            </div>
        </div>
    );
}

const EMPTY_FORM = { name: '', phone: '', email: '', notes: '' };

function CustomerModal({ initial, onSave, onClose, submitting }) {
    const isEdit = !!initial?._id;
    const [form, setForm] = useState(
        isEdit
            ? { name: initial.name, phone: initial.phone || '', email: initial.email || '', notes: initial.notes || '' }
            : EMPTY_FORM
    );

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const valid = form.name.trim().length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">{isEdit ? 'Edit Customer' : 'Add Customer'}</h2>
                    <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="p-5 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="e.g. Wanjiru Kamau"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
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
                            placeholder="e.g. wanjiru@example.com"
                            value={form.email}
                            onChange={e => set('email', e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                        <textarea
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                            rows={3}
                            placeholder="Sizing, preferences, etc."
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
                        {submitting ? 'Saving…' : isEdit ? 'Update Customer' : 'Add Customer'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function CustomersPage() {
    const { user: currentUser } = useContext(AuthContext);
    const isAdmin = currentUser?.role === 'admin';

    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState('');
    const [modalCustomer, setModalCustomer] = useState(null);
    const [confirmId, setConfirmId] = useState(null);
    const [ledgerCustomer, setLedgerCustomer] = useState(null);

    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.get('/customers');
            setCustomers(res.data);
        } catch {
            toast.error('Failed to load customers');
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

    const filtered = useMemo(() => {
        if (!search.trim()) return customers;
        const q = search.toLowerCase();
        return customers.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
        );
    }, [customers, search]);

    const handleSave = async (form) => {
        setSubmitting(true);
        try {
            const payload = {
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email.trim(),
                notes: form.notes,
            };
            if (modalCustomer?._id) {
                const res = await api.put(`/customers/${modalCustomer._id}`, payload);
                setCustomers(list => list.map(c => c._id === modalCustomer._id ? res.data : c));
                toast.success('Customer updated');
            } else {
                const res = await api.post('/customers', payload);
                setCustomers(list => [res.data, ...list]);
                toast.success('Customer added');
            }
            setModalCustomer(null);
        } catch (err) {
            const msg = err.response?.data?.error || 'Failed to save customer';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/customers/${confirmId}`);
            setCustomers(list => list.filter(c => c._id !== confirmId));
            toast.success('Customer deleted');
        } catch (err) {
            const msg = err.response?.data?.error || 'Failed to delete customer';
            toast.error(msg);
        } finally {
            setConfirmId(null);
        }
    };

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Customers</h1>
                    <p className="text-sm text-gray-500 mt-0.5">{customers.length} customer{customers.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={() => setModalCustomer({})}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                    <span className="text-lg leading-none">+</span> Add Customer
                </button>
            </div>

            <input
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Search name, phone, or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
            />

            {loading ? (
                <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
            ) : error ? (
                <ErrorState message="Failed to load customers" onRetry={fetchCustomers} />
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    <p className="text-sm">No customers found</p>
                </div>
            ) : (
                <div className="bg-gradient-to-br from-white to-gray-50 rounded-sm border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Customer</th>
                                <th className="px-4 py-3 text-left">Phone</th>
                                <th className="px-4 py-3 text-left">Email</th>
                                <th className="px-4 py-3 text-left">Notes</th>
                                <th className="px-4 py-3 text-right">Store Credit</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(c => (
                                <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center select-none">
                                                {c.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                                            </div>
                                            <p className="font-medium text-gray-800 text-sm leading-tight">{c.name}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-xs">{c.phone || '—'}</td>
                                    <td className="px-4 py-3 text-gray-500 text-xs">{c.email || '—'}</td>
                                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate" title={c.notes}>{c.notes || '—'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => setLedgerCustomer(c)}
                                            className="font-semibold text-indigo-700 hover:underline"
                                            title="View ledger"
                                        >
                                            KES {fmt(c.storeCreditBalance)}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setModalCustomer(c)}
                                                className="px-3 py-1 rounded-xl text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => setConfirmId(c._id)}
                                                disabled={!isAdmin}
                                                title={!isAdmin ? 'Admin only' : ''}
                                                className="px-3 py-1 rounded-xl text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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

            {modalCustomer !== null && (
                <CustomerModal
                    initial={modalCustomer._id ? modalCustomer : null}
                    onSave={handleSave}
                    onClose={() => setModalCustomer(null)}
                    submitting={submitting}
                />
            )}

            {confirmId && (
                <ConfirmDialog
                    message="Delete this customer? This cannot be undone."
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmId(null)}
                />
            )}

            {ledgerCustomer && (
                <StoreCreditLedgerModal customer={ledgerCustomer} onClose={() => setLedgerCustomer(null)} />
            )}
        </div>
    );
}
