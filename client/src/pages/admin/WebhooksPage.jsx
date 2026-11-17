import { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import ErrorState from '../../components/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

const EVENT_OPTIONS = [
    { value: 'sale.completed', label: 'Sale completed' },
    { value: 'stock.changed', label: 'Stock changed' },
];

function CreateWebhookModal({ onSave, onClose, submitting }) {
    const [url, setUrl] = useState('');
    const [events, setEvents] = useState([]);

    const toggleEvent = (ev) => setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
    const valid = url.trim().length > 0 && events.length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">Add Webhook</h2>
                    <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Endpoint URL *</label>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="https://example.com/webhooks/wanguvibe"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Events *</label>
                        <div className="space-y-2">
                            {EVENT_OPTIONS.map((opt) => (
                                <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox" checked={events.includes(opt.value)} onChange={() => toggleEvent(opt.value)} />
                                    {opt.label}
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 px-5 pb-5 justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                        onClick={() => onSave({ url: url.trim(), events })}
                        disabled={!valid || submitting}
                        className="px-5 py-2 rounded-xl text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Creating…' : 'Create Webhook'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function SecretRevealModal({ secret, onClose }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard?.writeText(secret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-md p-6 space-y-4">
                <h2 className="font-semibold text-gray-800">Webhook created</h2>
                <p className="text-sm text-gray-500">
                    This signing secret is shown once. Use it to verify the <code className="text-xs bg-gray-100 px-1 rounded">X-Webhook-Signature</code> header on deliveries. It won’t be shown again.
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-mono text-xs break-all">{secret}</div>
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

export default function WebhooksPage() {
    const [webhooks, setWebhooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [revealSecret, setRevealSecret] = useState(null);
    const [confirmId, setConfirmId] = useState(null);

    const fetchWebhooks = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.get('/webhooks');
            setWebhooks(res.data);
        } catch {
            toast.error('Failed to load webhooks');
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

    const handleCreate = async (payload) => {
        setSubmitting(true);
        try {
            const res = await api.post('/webhooks', payload);
            const { secret, ...webhook } = res.data;
            setWebhooks((list) => [webhook, ...list]);
            setShowCreate(false);
            setRevealSecret(secret);
            toast.success('Webhook created');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to create webhook');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleActive = async (webhook) => {
        try {
            const res = await api.patch(`/webhooks/${webhook._id}`, { active: !webhook.active });
            setWebhooks((list) => list.map((w) => (w._id === webhook._id ? res.data : w)));
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update webhook');
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/webhooks/${confirmId}`);
            setWebhooks((list) => list.filter((w) => w._id !== confirmId));
            toast.success('Webhook deleted');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to delete webhook');
        } finally {
            setConfirmId(null);
        }
    };

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Webhooks</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Notify a third-party system when a sale completes or stock changes. See <code className="text-xs bg-gray-100 px-1 rounded">/api/v1/openapi.yaml</code> for payload shapes.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                    <span className="text-lg leading-none">+</span> Add Webhook
                </button>
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
            ) : error ? (
                <ErrorState message="Failed to load webhooks" onRetry={fetchWebhooks} />
            ) : webhooks.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-16">No webhooks configured</p>
            ) : (
                <div className="bg-gradient-to-br from-white to-gray-50 rounded-sm border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 text-xs">
                                <th className="px-4 py-3 text-left">URL</th>
                                <th className="px-4 py-3 text-left">Events</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {webhooks.map((w) => (
                                <tr key={w._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-gray-800 font-mono text-xs break-all max-w-xs">{w.url}</td>
                                    <td className="px-4 py-3 text-gray-600 text-xs">{w.events.join(', ')}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${w.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {w.active ? 'Active' : 'Paused'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right space-x-3">
                                        <button onClick={() => toggleActive(w)} className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold">
                                            {w.active ? 'Pause' : 'Resume'}
                                        </button>
                                        <button onClick={() => setConfirmId(w._id)} className="text-red-500 hover:text-red-700 text-xs font-semibold">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showCreate && <CreateWebhookModal onSave={handleCreate} onClose={() => setShowCreate(false)} submitting={submitting} />}
            {revealSecret && <SecretRevealModal secret={revealSecret} onClose={() => setRevealSecret(null)} />}
            {confirmId && (
                <ConfirmDialog message="Delete this webhook? This can't be undone." onConfirm={handleDelete} onCancel={() => setConfirmId(null)} />
            )}
        </div>
    );
}
