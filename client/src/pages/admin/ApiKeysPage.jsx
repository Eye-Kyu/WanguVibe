import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';

function ConfirmDialog({ message, onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4">
                <p className="text-gray-800 text-sm">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-xl text-sm text-white bg-red-600 hover:bg-red-700 transition-colors">Revoke</button>
                </div>
            </div>
        </div>
    );
}

function CreateKeyModal({ onSave, onClose, submitting }) {
    const [label, setLabel] = useState('');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">New API Key</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>
                <div className="p-5">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Label *</label>
                    <input
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        placeholder="e.g. QuickBooks sync"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                    />
                </div>
                <div className="flex gap-3 px-5 pb-5 justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                        onClick={() => onSave(label.trim())}
                        disabled={!label.trim() || submitting}
                        className="px-5 py-2 rounded-xl text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Creating…' : 'Create Key'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function KeyRevealModal({ apiKey, onClose }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard?.writeText(apiKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                <h2 className="font-semibold text-gray-800">API key created</h2>
                <p className="text-sm text-gray-500">
                    This key is shown once. Send it as the <code className="text-xs bg-gray-100 px-1 rounded">X-API-Key</code> header on requests to <code className="text-xs bg-gray-100 px-1 rounded">/api/v1/*</code> — it won't be shown again. If lost, revoke it and create a new one.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-mono text-xs break-all">{apiKey}</div>
                <div className="flex justify-end gap-3">
                    <button onClick={copy} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">Done</button>
                </div>
            </div>
        </div>
    );
}

export default function ApiKeysPage() {
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [revealKey, setRevealKey] = useState(null);
    const [confirmId, setConfirmId] = useState(null);

    const fetchKeys = useCallback(async () => {
        try {
            const res = await api.get('/api-keys');
            setKeys(res.data);
        } catch {
            toast.error('Failed to load API keys');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchKeys(); }, [fetchKeys]);

    const handleCreate = async (label) => {
        setSubmitting(true);
        try {
            const res = await api.post('/api-keys', { label });
            const { key, ...keyRow } = res.data;
            setKeys((list) => [keyRow, ...list]);
            setShowCreate(false);
            setRevealKey(key);
            toast.success('API key created');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to create API key');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevoke = async () => {
        try {
            const res = await api.delete(`/api-keys/${confirmId}`);
            setKeys((list) => list.map((k) => (k._id === confirmId ? res.data : k)));
            toast.success('API key revoked');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to revoke API key');
        } finally {
            setConfirmId(null);
        }
    };

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">API Keys</h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        For third-party read access to <code className="text-xs bg-gray-100 px-1 rounded">/api/v1/*</code> (sales, styles, variants). See <code className="text-xs bg-gray-100 px-1 rounded">/api/v1/openapi.yaml</code> for docs.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                    <span className="text-lg leading-none">+</span> New Key
                </button>
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
            ) : keys.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-16">No API keys yet</p>
            ) : (
                <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">Label</th>
                                <th className="px-4 py-3 text-left">Last Used</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {keys.map((k) => (
                                <tr key={k._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-gray-800 font-medium">{k.label}</td>
                                    <td className="px-4 py-3 text-gray-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${k.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {k.active ? 'Active' : 'Revoked'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {k.active && (
                                            <button onClick={() => setConfirmId(k._id)} className="text-red-500 hover:text-red-700 text-xs font-semibold">Revoke</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showCreate && <CreateKeyModal onSave={handleCreate} onClose={() => setShowCreate(false)} submitting={submitting} />}
            {revealKey && <KeyRevealModal apiKey={revealKey} onClose={() => setRevealKey(null)} />}
            {confirmId && (
                <ConfirmDialog message="Revoke this API key? Any integration using it will stop working immediately." onConfirm={handleRevoke} onCancel={() => setConfirmId(null)} />
            )}
        </div>
    );
}
