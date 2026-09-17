import { useState } from 'react';
import api from '../api/axiosInstance';
import businessSettings from '../config/businessSettings';

const TABS = [
    { key: 'store-credit', label: 'Store Credit' },
    { key: 'gift-card', label: 'Gift Card' },
];

// Public, unauthenticated page — no login required. Deliberately kept
// outside AdminLayout/ProtectedRoute, mirroring LoginPage.jsx's own
// top-level (not nested) route registration in App.jsx.
export default function BalanceCheckPage() {
    const [tab, setTab] = useState('store-credit');
    const [input, setInput] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCheck = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const path = tab === 'store-credit' ? '/public/store-credit' : '/public/gift-card';
            const param = tab === 'store-credit' ? 'phone' : 'code';
            const res = await api.get(`${path}?${param}=${encodeURIComponent(input.trim())}`);
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const switchTab = (key) => {
        setTab(key);
        setInput('');
        setResult(null);
        setError('');
    };

    return (
        <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-sm border border-gray-100 shadow-lg p-6 sm:p-8">
                <div className="text-center mb-6">
                    <h1 className="text-xl font-bold text-gray-900">{businessSettings.name}</h1>
                    <p className="text-sm text-gray-500 mt-1">Check your balance</p>
                </div>

                <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm mb-5">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => switchTab(t.key)}
                            className={`flex-1 py-2 font-medium transition ${
                                tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleCheck} className="space-y-3">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={tab === 'store-credit' ? 'Phone number' : 'Gift card code'}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 transition"
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="w-full bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                        {loading ? 'Checking…' : 'Check Balance'}
                    </button>
                </form>

                {error && (
                    <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
                )}

                {result && tab === 'store-credit' && (
                    <div className="mt-5 text-center bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <p className="text-xs text-emerald-700 uppercase tracking-wide">{result.name}</p>
                        <p className="text-2xl font-bold text-emerald-800 mt-1">
                            {businessSettings.currency} {Number(result.storeCreditBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-emerald-600 mt-1">Store credit balance</p>
                    </div>
                )}

                {result && tab === 'gift-card' && (
                    <div className="mt-5 text-center bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <p className="text-xs text-emerald-700 uppercase tracking-wide font-mono">{result.code}</p>
                        <p className="text-2xl font-bold text-emerald-800 mt-1">
                            {businessSettings.currency} {Number(result.currentBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-emerald-600 mt-1 capitalize">{result.status}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
