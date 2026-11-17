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
    // Store credit is verified by SMS: step 'phone' asks for the number,
    // step 'code' for the 6-digit code texted to it.
    const [step, setStep] = useState('phone');
    const [code, setCode] = useState('');
    const [notice, setNotice] = useState('');

    const run = async (fn) => {
        setLoading(true);
        setError('');
        try {
            await fn();
        } catch (err) {
            setError(err.response?.data?.error || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCheck = (e) => {
        e.preventDefault();
        if (!input.trim()) return;
        setResult(null);
        if (tab === 'gift-card') {
            run(async () => {
                const res = await api.get(`/public/gift-card?code=${encodeURIComponent(input.trim())}`);
                setResult(res.data);
            });
            return;
        }
        run(async () => {
            const res = await api.post('/public/store-credit/request-code', { phone: input.trim() });
            setNotice(res.data.message);
            setCode('');
            setStep('code');
        });
    };

    const handleVerify = (e) => {
        e.preventDefault();
        run(async () => {
            const res = await api.post('/public/store-credit/verify', { phone: input.trim(), code });
            setResult(res.data);
            setStep('phone');
            setNotice('');
        });
    };

    const switchTab = (key) => {
        setTab(key);
        setInput('');
        setResult(null);
        setError('');
        setStep('phone');
        setCode('');
        setNotice('');
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

                {tab === 'store-credit' && step === 'code' ? (
                    <form onSubmit={handleVerify} className="space-y-3">
                        <p className="text-sm text-gray-600" role="status">{notice}</p>
                        <label className="block text-sm text-gray-700">
                            6-digit code
                            <input
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                autoFocus
                                className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-lg tracking-[0.4em] text-center outline-none focus:ring-2 focus:ring-indigo-400 transition"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={loading || code.length !== 6}
                            className="w-full bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                            {loading ? 'Checking…' : 'Show my balance'}
                        </button>
                        <button type="button" onClick={() => { setStep('phone'); setError(''); }} className="w-full text-sm text-gray-600 py-1">
                            Use a different number
                        </button>
                    </form>
                ) : (
                <form onSubmit={handleCheck} className="space-y-3">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={tab === 'store-credit' ? 'Phone number (e.g. 0712 345 678)' : 'Gift card code'}
                        aria-label={tab === 'store-credit' ? 'Phone number' : 'Gift card code'}
                        inputMode={tab === 'store-credit' ? 'tel' : 'text'}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 transition"
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="w-full bg-indigo-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                        {loading ? 'Checking…' : tab === 'store-credit' ? 'Text me a code' : 'Check Balance'}
                    </button>
                </form>
                )}

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
