import { useState, useEffect, useMemo, useContext, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import { AuthContext } from '../../context/AuthContext';
import ErrorState from '../../components/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

function RoleBadge({ role }) {
    if (role === 'admin') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Admin</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700">Cashier</span>;
}

const EMPTY_FORM = { name: '', username: '', password: '', role: 'cashier' };

function UserModal({ initial, onSave, onClose, submitting, isSelf }) {
    const isEdit = !!initial?._id;
    const [form, setForm] = useState(
        isEdit ? { name: initial.name, username: initial.username, password: '', role: initial.role } : EMPTY_FORM
    );
    const [showPw, setShowPw] = useState(false);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const valid = form.name.trim() && form.username.trim() && (!isEdit ? form.password.length >= 6 : true);
    const pwHint = isEdit ? 'Leave blank to keep current password (min 6 chars to change)' : 'Minimum 6 characters';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">{isEdit ? 'Edit User' : 'Create User'}</h2>
                    <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                <div className="p-5 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="e.g. Jane Wanjiku"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Username *</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="e.g. janew"
                            value={form.username}
                            onChange={e => set('username', e.target.value)}
                            disabled={isEdit}
                        />
                        {isEdit && <p className="text-xs text-gray-400 mt-1">Username cannot be changed after creation.</p>}
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Password {isEdit ? '' : '*'}
                        </label>
                        <div className="relative">
                            <input
                                type={showPw ? 'text' : 'password'}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder={isEdit ? 'Leave blank to keep unchanged' : 'Min 6 characters'}
                                value={form.password}
                                onChange={e => set('password', e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPw(v => !v)}
                                className="absolute inset-y-0 right-3 text-xs text-gray-400 hover:text-gray-600"
                            >
                                {showPw ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{pwHint}</p>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
                        <select
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50 disabled:text-gray-400"
                            value={form.role}
                            onChange={e => set('role', e.target.value)}
                            disabled={isSelf}
                        >
                            <option value="cashier">Cashier</option>
                            <option value="admin">Admin</option>
                        </select>
                        {isSelf && <p className="text-xs text-amber-600 mt-1">You cannot change your own role.</p>}
                    </div>
                </div>

                <div className="flex gap-3 px-5 pb-5 justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                        onClick={() => onSave(form)}
                        disabled={!valid || submitting}
                        className="px-5 py-2 rounded-xl text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Saving…' : isEdit ? 'Update User' : 'Create User'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function UsersPage() {
    const { user: currentUser } = useContext(AuthContext);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [modalUser, setModalUser] = useState(null);
    const [confirmId, setConfirmId] = useState(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.get('/users');
            setUsers(res.data);
        } catch {
            toast.error('Failed to load users');
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const filtered = useMemo(() => {
        let list = users;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(u => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
        }
        if (roleFilter) list = list.filter(u => u.role === roleFilter);
        return list;
    }, [users, search, roleFilter]);

    const handleSave = async (form) => {
        setSubmitting(true);
        try {
            if (modalUser?._id) {
                const payload = { name: form.name, role: form.role };
                if (form.password && form.password.length >= 6) payload.password = form.password;
                const res = await api.put(`/users/${modalUser._id}`, payload);
                setUsers(u => u.map(x => x._id === modalUser._id ? res.data : x));
                toast.success('User updated');
            } else {
                await api.post('/auth/register', { name: form.name, username: form.username, password: form.password, role: form.role });
                toast.success('User created');
                fetchUsers();
            }
            setModalUser(null);
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.msg || 'Failed to save user';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/users/${confirmId}`);
            setUsers(u => u.filter(x => x._id !== confirmId));
            toast.success('User deleted');
        } catch (err) {
            const msg = err.response?.data?.error || 'Failed to delete user';
            toast.error(msg);
        } finally {
            setConfirmId(null);
        }
    };

    const isSelf = (userId) => currentUser?._id === userId || currentUser?.id === userId;

    return (
        <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Users</h1>
                    <p className="text-sm text-gray-400 mt-0.5">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={() => setModalUser({})}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                    <span className="text-lg leading-none">+</span> Add User
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <input
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="Search name or username…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <div className="flex gap-2">
                    {['', 'admin', 'cashier'].map(r => (
                        <button
                            key={r}
                            onClick={() => setRoleFilter(r)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors capitalize ${roleFilter === r ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                        >
                            {r || 'All roles'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
            ) : error ? (
                <ErrorState message="Failed to load users" onRetry={fetchUsers} />
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
                    <p className="text-sm">No users found</p>
                </div>
            ) : (
                <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">User</th>
                                <th className="px-4 py-3 text-left">Username</th>
                                <th className="px-4 py-3 text-left">Role</th>
                                <th className="px-4 py-3 text-left">Member Since</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(u => (
                                <tr key={u._id} className={`hover:bg-gray-50 transition-colors ${isSelf(u._id) ? 'bg-indigo-50/40' : ''}`}>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center select-none">
                                                {u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-800 text-sm leading-tight">
                                                    {u.name}
                                                    {isSelf(u._id) && <span className="ml-1.5 text-xs text-indigo-500 font-normal">(you)</span>}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.username}</td>
                                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                                    <td className="px-4 py-3 text-gray-400 text-xs">
                                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setModalUser(u)}
                                                className="px-3 py-1 rounded-xl text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => setConfirmId(u._id)}
                                                disabled={isSelf(u._id)}
                                                title={isSelf(u._id) ? 'Cannot delete your own account' : ''}
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

            {/* Modals */}
            {modalUser !== null && (
                <UserModal
                    initial={modalUser._id ? modalUser : null}
                    onSave={handleSave}
                    onClose={() => setModalUser(null)}
                    submitting={submitting}
                    isSelf={modalUser._id ? isSelf(modalUser._id) : false}
                />
            )}

            {confirmId && (
                <ConfirmDialog
                    message="Delete this user? They will lose access immediately. This cannot be undone."
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmId(null)}
                />
            )}
        </div>
    );
}
