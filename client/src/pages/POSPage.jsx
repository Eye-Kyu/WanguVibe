import { useState, useEffect, useCallback, useMemo, useRef, memo, useContext } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useTranslation } from 'react-i18next';
import api from '../api/axiosInstance';
import BarcodeScannerComponent from 'react-qr-barcode-scanner';
import QRCode from 'qrcode';
import { AuthContext } from '../context/AuthContext';
import { ThemeContext } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import businessSettings from '../config/businessSettings';
import { setPosLocale } from '../i18n';
import { IconPhoto, IconGift, IconX, IconCheck, IconCash, IconPhone, IconCard, IconTag, IconPrinter, IconCart, IconCamera, IconSearch, IconSun, IconMoon } from '../components/icons';
import { queueSale, flushQueue, getPendingSales, getFailedSales, cacheStyles, getCachedStyles } from '../offlineQueue';

// ─── helpers ────────────────────────────────────────────────────────────────
// Total stock across a style's variants, and its displayed price (a single
// base price, or a "from X" when any variant overrides it).
const styleStock = (style) => (style.variants || []).reduce((s, v) => s + (v.active === false ? 0 : v.stock), 0);
const stylePriceLabel = (style) => {
    const overrides = (style.variants || []).map(v => v.priceOverride).filter(p => p != null);
    const prices = [style.basePrice, ...overrides];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `KES ${min.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `From KES ${min.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
};
const variantPrice = (style, variant) => variant.priceOverride ?? style.basePrice;

// ─── Style Card ───────────────────────────────────────────────────────────────
const StyleCard = memo(({ style, onOpen }) => {
    const totalStock = styleStock(style);
    const outOfStock = totalStock === 0;

    return (
        <button
            onClick={() => onOpen(style)}
            disabled={outOfStock}
            className={`group relative bg-gradient-to-br from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 rounded-xl border text-left transition-all duration-150 overflow-hidden
                ${outOfStock
                    ? 'border-red-100 bg-red-50/30 opacity-60 cursor-not-allowed'
                    : 'border-gray-100 dark:border-gray-800 hover:border-green-400 hover:shadow-md hover:shadow-green-100 active:scale-[0.97] shadow-sm'}`}
        >
            <div className="relative bg-gray-50 dark:bg-gray-900 aspect-square overflow-hidden">
                {style.images?.[0]
                    ? <img src={style.images[0]} alt={style.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-200 dark:text-gray-300"><IconPhoto className="w-12 h-12" /></div>
                }
                {!outOfStock && (
                    <div className="absolute inset-0 bg-green-600/0 group-hover:bg-green-600/8 transition-colors duration-150 flex items-end justify-end p-2">
                        <div className="w-6 h-6 rounded-full bg-green-600 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center text-sm font-bold shadow">+</div>
                    </div>
                )}
                {outOfStock && (
                    <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center">
                        <span className="text-white text-xs font-semibold px-2 py-0.5 bg-red-600 rounded-full">Out of stock</span>
                    </div>
                )}
                {!outOfStock && totalStock < 5 && (
                    <div className="absolute top-1.5 right-1.5">
                        <span className="text-white text-[10px] font-bold px-1.5 py-0.5 bg-amber-500 rounded-full">{totalStock} left</span>
                    </div>
                )}
            </div>
            <div className="p-2.5">
                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm leading-tight line-clamp-2">{style.name}</p>
                {style.styleCode && <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono mt-0.5 truncate">{style.styleCode}</p>}
                <p className={`font-bold text-sm mt-1.5 ${outOfStock ? 'text-red-400' : 'text-green-700'}`}>
                    {stylePriceLabel(style)}
                </p>
            </div>
        </button>
    );
});
StyleCard.displayName = 'StyleCard';

// ─── Size/Color Picker ────────────────────────────────────────────────────────
const VariantPicker = memo(({ style, onClose, onSelect }) => {
    // Group variants by color so the picker reads as "pick a color, then a size".
    // The hook must run on every render (even when style is null) to satisfy
    // the rules of hooks, so the "closed" bailout comes after it.
    const byColor = useMemo(() => {
        const groups = {};
        (style?.variants || []).forEach(v => {
            (groups[v.color] = groups[v.color] || []).push(v);
        });
        return groups;
    }, [style]);

    if (!style) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-gradient-to-br from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 rounded-sm border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex gap-3 items-center">
                    {style.images?.[0]
                        ? <img src={style.images[0]} alt={style.name} className="w-14 h-14 rounded-xl object-cover border border-gray-100 dark:border-gray-800" />
                        : <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-300 dark:text-gray-400"><IconPhoto className="w-7 h-7" /></div>}
                    <div className="min-w-0">
                        <p className="font-bold text-gray-800 dark:text-gray-100 text-sm truncate">{style.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{stylePriceLabel(style)}</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="ml-auto text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
                </div>
                <div className="p-5 space-y-4">
                    {Object.entries(byColor).map(([color, variants]) => (
                        <div key={color}>
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{color}</p>
                            <div className="flex flex-wrap gap-2">
                                {variants.map(v => {
                                    const disabled = v.active === false || v.stock <= 0;
                                    return (
                                        <button
                                            key={v._id}
                                            disabled={disabled}
                                            onClick={() => onSelect(style, v)}
                                            className={`px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all relative
                                                ${disabled
                                                    ? 'border-gray-100 dark:border-gray-800 text-gray-300 dark:text-gray-400 cursor-not-allowed'
                                                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-green-500 hover:text-green-700'}`}
                                        >
                                            {v.size}
                                            {!disabled && v.stock < 5 && (
                                                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{v.stock}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {Object.keys(byColor).length === 0 && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No size/color variants set up for this style yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
});
VariantPicker.displayName = 'VariantPicker';

// ─── Cart Line ────────────────────────────────────────────────────────────────
const CartLine = memo(({ item, onQtyChange, onRemove, onDiscountChange, calcTotal }) => {
    const { t } = useTranslation();
    return (
    <div className="flex gap-2.5 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
        {item.image
            ? <img src={item.image} alt={item.styleName} className="w-11 h-11 rounded-xl object-cover flex-shrink-0 border border-gray-100 dark:border-gray-800" />
            : <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center text-gray-300 dark:text-gray-400"><IconPhoto className="w-6 h-6" /></div>
        }
        <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
                <div className="min-w-0 pr-2">
                    <p className="font-medium text-gray-800 dark:text-gray-100 text-sm leading-tight truncate">{item.styleName}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{item.size} / {item.color}</p>
                </div>
                <button
                    onClick={() => onRemove(item.variantId)}
                    className="w-5 h-5 rounded-lg flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500 transition-all flex-shrink-0"
                    aria-label={t('pos.cart.removeItem')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">KES {item.unitPrice.toFixed(2)} each</p>
            <div className="flex items-center justify-between mt-1.5 gap-2">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onQtyChange(item.variantId, -1)}
                        disabled={item.quantity <= 1}
                        className="w-6 h-6 rounded-lg border border-red-200 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-red-300 text-sm font-bold flex items-center justify-center transition-all"
                    >-</button>
                    <span className="text-sm font-semibold w-6 text-center tabular-nums">{item.quantity}</span>
                    <button
                        onClick={() => onQtyChange(item.variantId, 1)}
                        disabled={item.quantity >= item.stock}
                        className="w-6 h-6 rounded-lg border border-green-300 text-green-600 hover:bg-green-600 hover:text-white hover:border-green-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-green-400 text-sm font-bold flex items-center justify-center transition-all"
                    >+</button>
                </div>
                <div className="flex items-center gap-1">
                    <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.discount}
                        onChange={e => onDiscountChange(item.variantId, e.target.value)}
                        className="w-10 border border-gray-200 dark:border-gray-700 rounded-lg px-1 py-0.5 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-green-300"
                    />
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">%</span>
                </div>
                <p className="text-sm font-bold text-green-700 tabular-nums">
                    KES {calcTotal(item).toFixed(2)}
                </p>
            </div>
        </div>
    </div>
    );
});
CartLine.displayName = 'CartLine';

// ─── Shift Gate ─────────────────────────────────────────────────────────────
// Blocking modal shown when the cashier has no open till session — not
// dismissable, since checkout is gated on a shift existing.
const OpenShiftModal = memo(({ onOpen, submitting }) => {
    const [openingFloat, setOpeningFloat] = useState('');
    const floatNum = parseFloat(openingFloat) || 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-gradient-to-br from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 rounded-sm border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
                <div className="px-5 py-4 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-t-2xl">
                    <p className="font-bold">Open Shift</p>
                    <p className="text-xs opacity-80 mt-0.5">Count the cash drawer before ringing up any sales</p>
                </div>
                <div className="p-5 space-y-3">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Opening Float (KES)</label>
                    <input
                        type="number"
                        min="0"
                        step="50"
                        autoFocus
                        value={openingFloat}
                        onChange={e => setOpeningFloat(e.target.value)}
                        placeholder="0.00"
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <button
                        onClick={() => onOpen(floatNum)}
                        disabled={submitting || floatNum < 0}
                        className="w-full py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Opening…' : 'Open Shift & Start Selling'}
                    </button>
                </div>
            </div>
        </div>
    );
});
OpenShiftModal.displayName = 'OpenShiftModal';

const CloseShiftModal = memo(({ shift, onClose, onConfirm, submitting }) => {
    const [closingCount, setClosingCount] = useState('');
    const countNum = parseFloat(closingCount) || 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-gradient-to-br from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 rounded-sm border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
                <div className="px-5 py-4 bg-gradient-to-br from-gray-800 to-gray-950 text-white rounded-t-2xl">
                    <p className="font-bold">Close Shift</p>
                    <p className="text-xs opacity-70 mt-0.5">Opened with KES {shift.openingFloat.toFixed(2)} float</p>
                </div>
                <div className="p-5 space-y-3">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Counted Cash (KES)</label>
                    <input
                        type="number"
                        min="0"
                        step="50"
                        autoFocus
                        value={closingCount}
                        onChange={e => setClosingCount(e.target.value)}
                        placeholder="0.00"
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <div className="flex gap-3 pt-1">
                        <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm(countNum)}
                            disabled={submitting || countNum < 0}
                            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {submitting ? 'Closing…' : 'Close Shift'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
CloseShiftModal.displayName = 'CloseShiftModal';

// ─── Sell Gift Card ─────────────────────────────────────────────────────────
const SellGiftCardModal = memo(({ onClose, onAdd }) => {
    const [amount, setAmount] = useState('');
    const amountNum = parseFloat(amount) || 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-gradient-to-br from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 rounded-sm border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
                <div className="px-5 py-4 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-t-2xl flex items-center gap-2">
                    <IconGift className="w-5 h-5" />
                    <p className="font-bold">Sell Gift Card</p>
                </div>
                <div className="p-5 space-y-3">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount (KES)</label>
                    <input
                        type="number"
                        min="0"
                        step="50"
                        autoFocus
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <div className="flex gap-3 pt-1">
                        <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={() => { if (amountNum > 0) onAdd(amountNum); }}
                            disabled={amountNum <= 0}
                            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Add to Sale
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
SellGiftCardModal.displayName = 'SellGiftCardModal';

// ─── M-Pesa waiting state ───────────────────────────────────────────────────
// Shown after an STK push is initiated — checkout can't complete until
// Safaricom's callback confirms the payment, unlike cash/card which finish
// the instant the cashier clicks confirm.
const MpesaWaitingModal = memo(({ status, resultMessage, onCancel, onRetry }) => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
        <div className="bg-gradient-to-br from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 rounded-sm border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center">
            {status === 'waiting' && (
                <>
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full border-4 border-green-200 border-t-green-600 animate-spin" />
                    <p className="font-bold text-gray-800 dark:text-gray-100">Check customer's phone…</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">Waiting for them to enter their M-Pesa PIN</p>
                    <button onClick={onCancel} className="mt-5 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors">Cancel</button>
                </>
            )}
            {(status === 'failed' || status === 'timed_out') && (
                <>
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center text-red-500"><IconX className="w-6 h-6" /></div>
                    <p className="font-bold text-gray-800 dark:text-gray-100">{status === 'timed_out' ? 'No response in time' : 'Payment failed'}</p>
                    {resultMessage && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">{resultMessage}</p>}
                    <div className="flex gap-3 mt-5">
                        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
                        <button onClick={onRetry} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 transition-colors">Try Again</button>
                    </div>
                </>
            )}
        </div>
    </div>
));
MpesaWaitingModal.displayName = 'MpesaWaitingModal';

// Search-as-you-type customer lookup, used by the Store Credit payment branch.
const CustomerPicker = memo(({ selected, onSelect }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!query.trim()) { setResults([]); return; }
        setSearching(true);
        const handle = setTimeout(() => {
            api.get(`/customers?search=${encodeURIComponent(query.trim())}`)
                .then(res => setResults(res.data))
                .catch(() => setResults([]))
                .finally(() => setSearching(false));
        }, 300);
        return () => clearTimeout(handle);
    }, [query]);

    if (selected) {
        return (
            <div className="flex items-center justify-between border border-indigo-200 bg-indigo-50 rounded-xl px-3 py-2.5">
                <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{selected.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Balance: KES {selected.storeCreditBalance.toFixed(2)}</p>
                </div>
                <button onClick={() => onSelect(null)} className="text-xs text-indigo-600 hover:underline">Change</button>
            </div>
        );
    }

    return (
        <div>
            <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search customer by name or phone…"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {query.trim() && (
                <div className="mt-1 border border-gray-100 dark:border-gray-800 rounded-xl divide-y divide-gray-50 dark:divide-gray-800 max-h-40 overflow-y-auto">
                    {searching ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2">Searching…</p>
                    ) : results.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2">No matching customers</p>
                    ) : results.map(c => (
                        <button
                            key={c._id}
                            onClick={() => onSelect(c)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between"
                        >
                            <span className="text-gray-700 dark:text-gray-300">{c.name}{c.phone ? ` · ${c.phone}` : ''}</span>
                            <span className="text-gray-500 dark:text-gray-400">KES {c.storeCreditBalance.toFixed(2)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
});
CustomerPicker.displayName = 'CustomerPicker';

// ─── Payment Modal ────────────────────────────────────────────────────────────
const PaymentModal = memo(({ isOpen, onClose, total, cartDiscount, onCartDiscountChange, paymentMethod, onPaymentMethodChange, onConfirm, processing }) => {
    const { t } = useTranslation();
    const [tendered, setTendered] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [giftCardInput, setGiftCardInput] = useState('');
    const [giftCardInfo, setGiftCardInfo] = useState(null); // card doc | 'notfound' | null
    const [giftCardChecking, setGiftCardChecking] = useState(false);
    const [mpesaPhone, setMpesaPhone] = useState('');
    // Split-tender: any combination of cash/card/store_credit/gift_card
    // (never M-Pesa — its STK-push confirmation is asynchronous, which
    // doesn't fit "one of several lines confirmed together"). Reuses
    // selectedCustomer/giftCardInput/giftCardInfo above for the
    // store_credit/gift_card lines rather than duplicating that state,
    // since only one of (single-method view, split view) is ever visible.
    const [splitMode, setSplitMode] = useState(false);
    const [splitAmounts, setSplitAmounts] = useState({ cash: '', card: '', store_credit: '', gift_card: '' });
    const tenderedNum = parseFloat(tendered) || 0;
    const change = paymentMethod === 'Cash' ? tenderedNum - total : 0;

    useEffect(() => {
        if (!isOpen) {
            setTendered('');
            setSelectedCustomer(null);
            setGiftCardInput('');
            setGiftCardInfo(null);
            setMpesaPhone('');
            setSplitMode(false);
            setSplitAmounts({ cash: '', card: '', store_credit: '', gift_card: '' });
        }
    }, [isOpen]);

    // Dropping a stale selection when the cashier switches payment method or mode
    useEffect(() => { setSelectedCustomer(null); setGiftCardInput(''); setGiftCardInfo(null); }, [paymentMethod, splitMode]);

    useEffect(() => {
        if (!giftCardInput.trim()) { setGiftCardInfo(null); return; }
        setGiftCardChecking(true);
        const handle = setTimeout(() => {
            api.get(`/giftcards/lookup?code=${encodeURIComponent(giftCardInput.trim())}`)
                .then(res => setGiftCardInfo(res.data))
                .catch(() => setGiftCardInfo('notfound'))
                .finally(() => setGiftCardChecking(false));
        }, 400);
        return () => clearTimeout(handle);
    }, [giftCardInput]);

    if (!isOpen) return null;

    const quickAmounts = [500, 1000, 2000, 5000].filter(a => a >= total);
    // Display labels are translated; the underlying value ('Cash'/'M-Pesa'/'Card'/
    // 'Store Credit'/'Gift Card') stays the canonical English string — it's
    // compared against elsewhere in this component and sent to the server,
    // which normalizes it into cash|mpesa|card|store_credit|gift_card and
    // would break on a translated value.
    const methodMeta = {
        'Cash': { Icon: IconCash, label: t('pos.payment.cash') },
        'M-Pesa': { Icon: IconPhone, label: t('pos.payment.mpesa') },
        'Card': { Icon: IconCard, label: t('pos.payment.card') },
        'Store Credit': { Icon: IconTag, label: t('pos.payment.storeCredit') },
        'Gift Card': { Icon: IconGift, label: t('pos.payment.giftCard') },
    };

    const giftCardUsable = giftCardInfo && giftCardInfo !== 'notfound' && giftCardInfo.status === 'active' && giftCardInfo.currentBalance >= total;
    const phoneValid = mpesaPhone.replace(/\D/g, '').length >= 9;

    // Split-tender: one amount field per allowed method — entering a
    // nonzero amount "activates" that line. Simpler and less error-prone
    // than a freeform add/remove line list, and matches finalizeSale's own
    // rule of at most one store_credit and one gift_card line per sale.
    const splitCash = parseFloat(splitAmounts.cash) || 0;
    const splitCard = parseFloat(splitAmounts.card) || 0;
    const splitStoreCredit = parseFloat(splitAmounts.store_credit) || 0;
    const splitGiftCard = parseFloat(splitAmounts.gift_card) || 0;
    const splitSum = splitCash + splitCard + splitStoreCredit + splitGiftCard;
    const splitRemaining = total - splitSum;
    const splitGiftCardUsable = splitGiftCard <= 0 || (giftCardInfo && giftCardInfo !== 'notfound' && giftCardInfo.status === 'active' && giftCardInfo.currentBalance >= splitGiftCard);
    const splitStoreCreditUsable = splitStoreCredit <= 0 || (selectedCustomer && selectedCustomer.storeCreditBalance >= splitStoreCredit);
    const splitValid = Math.abs(splitRemaining) < 0.01 && splitStoreCreditUsable && splitGiftCardUsable;

    const confirmDisabled = processing || (splitMode ? !splitValid : (
        (paymentMethod === 'Cash' && tenderedNum < total)
        || (paymentMethod === 'Store Credit' && (!selectedCustomer || selectedCustomer.storeCreditBalance < total))
        || (paymentMethod === 'Gift Card' && !giftCardUsable)
        || (paymentMethod === 'M-Pesa' && !phoneValid)
    ));

    const handleConfirmClick = () => {
        if (splitMode) {
            const payments = [];
            if (splitCash > 0) payments.push({ method: 'cash', amount: splitCash });
            if (splitCard > 0) payments.push({ method: 'card', amount: splitCard });
            if (splitStoreCredit > 0) payments.push({ method: 'store_credit', amount: splitStoreCredit, customer: selectedCustomer?._id });
            if (splitGiftCard > 0) payments.push({ method: 'gift_card', amount: splitGiftCard, giftCardCode: giftCardInfo?.code });
            onConfirm({ payments });
            return;
        }
        onConfirm({
            customer: paymentMethod === 'Store Credit' ? selectedCustomer?._id : undefined,
            giftCardCode: paymentMethod === 'Gift Card' ? giftCardInfo?.code : undefined,
            phone: paymentMethod === 'M-Pesa' ? mpesaPhone.replace(/\D/g, '') : undefined,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-gradient-to-br from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 rounded-sm border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
                <div className="px-5 py-4 bg-gradient-to-br from-emerald-500 to-green-600 text-white rounded-t-2xl">
                    <p className="text-sm font-medium opacity-80">{t('pos.payment.amountDue')}</p>
                    <p className="text-3xl font-black tabular-nums mt-0.5">
                        KES {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">{t('pos.payment.orderDiscount')}</label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={cartDiscount}
                            onChange={e => onCartDiscountChange(e.target.value)}
                            className="w-full border border-red-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 text-red-700 font-medium"
                            placeholder="0"
                        />
                        {cartDiscount > 0 && (
                            <p className="text-[11px] text-red-500 mt-1">
                                {t('pos.payment.deductedFromOrder', { amount: (total / (1 - cartDiscount / 100) * cartDiscount / 100).toFixed(2) })}
                            </p>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('pos.payment.paymentMethod')}</label>
                            <button
                                onClick={() => setSplitMode(v => !v)}
                                className={`text-[11px] font-bold px-2 py-1 rounded-lg transition-colors ${splitMode ? 'bg-indigo-600 text-white' : 'text-indigo-600 hover:bg-indigo-50'}`}
                            >
                                {splitMode ? t('pos.payment.splitToggleOff') : t('pos.payment.splitToggleOn')}
                            </button>
                        </div>
                        {/* Two deliberate groups — pay-with-money, then pay-with-stored-value —
                            rather than 5 buttons in a 3-col grid, which leaves an empty cell. */}
                        {!splitMode && (
                            <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                    {['Cash', 'M-Pesa', 'Card'].map(m => {
                                        const { Icon } = methodMeta[m];
                                        return (
                                            <button
                                                key={m}
                                                onClick={() => onPaymentMethodChange(m)}
                                                className={`flex flex-col items-center gap-1 py-3 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all ${paymentMethod === m
                                                    ? 'border-green-600 bg-green-600 text-white shadow-sm'
                                                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-green-300 hover:text-green-700'}`}
                                            >
                                                <Icon className="w-4 h-4" />
                                                {methodMeta[m].label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {['Store Credit', 'Gift Card'].map(m => {
                                        const { Icon } = methodMeta[m];
                                        return (
                                            <button
                                                key={m}
                                                onClick={() => onPaymentMethodChange(m)}
                                                className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all ${paymentMethod === m
                                                    ? 'border-green-600 bg-green-600 text-white shadow-sm'
                                                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-green-300 hover:text-green-700'}`}
                                            >
                                                <Icon className="w-4 h-4" />
                                                {methodMeta[m].label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {splitMode && (
                        <div className="space-y-3">
                            <div className={`p-2.5 rounded-xl border flex justify-between items-center text-sm font-semibold ${
                                Math.abs(splitRemaining) < 0.01 ? 'bg-green-50 border-green-200 text-green-700'
                                    : splitRemaining < 0 ? 'bg-red-50 border-red-200 text-red-600'
                                    : 'bg-amber-50 border-amber-200 text-amber-700'
                            }`}>
                                <span>{Math.abs(splitRemaining) < 0.01 ? 'Fully covered' : splitRemaining > 0 ? 'Remaining' : 'Over by'}</span>
                                <span className="tabular-nums">KES {Math.abs(splitRemaining).toFixed(2)}</span>
                            </div>

                            {[
                                { key: 'cash', label: methodMeta['Cash'].label, Icon: methodMeta['Cash'].Icon },
                                { key: 'card', label: methodMeta['Card'].label, Icon: methodMeta['Card'].Icon },
                                { key: 'store_credit', label: methodMeta['Store Credit'].label, Icon: methodMeta['Store Credit'].Icon },
                                { key: 'gift_card', label: methodMeta['Gift Card'].label, Icon: methodMeta['Gift Card'].Icon },
                            ].map((line) => (
                                <div key={line.key}>
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                                        <line.Icon className="w-3.5 h-3.5" /> {line.label}
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={splitAmounts[line.key]}
                                        onChange={e => setSplitAmounts(prev => ({ ...prev, [line.key]: e.target.value }))}
                                        placeholder="0.00"
                                        className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-200"
                                    />
                                    {line.key === 'store_credit' && splitStoreCredit > 0 && (
                                        <div className="mt-1.5">
                                            <CustomerPicker selected={selectedCustomer} onSelect={setSelectedCustomer} />
                                            {selectedCustomer && selectedCustomer.storeCreditBalance < splitStoreCredit && (
                                                <p className="text-[11px] text-red-500 mt-1">
                                                    Insufficient balance — has KES {selectedCustomer.storeCreditBalance.toFixed(2)}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {line.key === 'gift_card' && splitGiftCard > 0 && (
                                        <div className="mt-1.5">
                                            <input
                                                value={giftCardInput}
                                                onChange={e => setGiftCardInput(e.target.value)}
                                                placeholder="e.g. GC-3F9A2B1C0D"
                                                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                            />
                                            {giftCardChecking && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Checking…</p>}
                                            {!giftCardChecking && giftCardInfo === 'notfound' && (
                                                <p className="text-[11px] text-red-500 mt-1">No gift card found for that code</p>
                                            )}
                                            {!giftCardChecking && giftCardInfo && giftCardInfo !== 'notfound' && giftCardInfo.status !== 'active' && (
                                                <p className="text-[11px] text-red-500 mt-1">This card is {giftCardInfo.status}, not active</p>
                                            )}
                                            {!giftCardChecking && giftCardInfo && giftCardInfo !== 'notfound' && giftCardInfo.status === 'active' && giftCardInfo.currentBalance < splitGiftCard && (
                                                <p className="text-[11px] text-red-500 mt-1">
                                                    Card balance KES {giftCardInfo.currentBalance.toFixed(2)} is less than this line's amount
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {!splitMode && paymentMethod === 'M-Pesa' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Customer's M-Pesa Phone</label>
                            <input
                                autoFocus
                                type="tel"
                                value={mpesaPhone}
                                onChange={e => setMpesaPhone(e.target.value)}
                                placeholder="e.g. 0712 345 678"
                                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                            />
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">An STK push prompt will be sent to this number</p>
                        </div>
                    )}

                    {!splitMode && paymentMethod === 'Store Credit' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Customer</label>
                            <CustomerPicker selected={selectedCustomer} onSelect={setSelectedCustomer} />
                            {selectedCustomer && selectedCustomer.storeCreditBalance < total && (
                                <p className="text-[11px] text-red-500 mt-1.5">
                                    Insufficient balance — has KES {selectedCustomer.storeCreditBalance.toFixed(2)}, needs KES {total.toFixed(2)}
                                </p>
                            )}
                        </div>
                    )}

                    {!splitMode && paymentMethod === 'Gift Card' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Gift Card Code</label>
                            <input
                                autoFocus
                                value={giftCardInput}
                                onChange={e => setGiftCardInput(e.target.value)}
                                placeholder="e.g. GC-3F9A2B1C0D"
                                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            {giftCardChecking && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">Checking…</p>}
                            {!giftCardChecking && giftCardInfo === 'notfound' && (
                                <p className="text-[11px] text-red-500 mt-1.5">No gift card found for that code</p>
                            )}
                            {!giftCardChecking && giftCardInfo && giftCardInfo !== 'notfound' && giftCardInfo.status !== 'active' && (
                                <p className="text-[11px] text-red-500 mt-1.5">This card is {giftCardInfo.status}, not active</p>
                            )}
                            {!giftCardChecking && giftCardInfo && giftCardInfo !== 'notfound' && giftCardInfo.status === 'active' && (
                                giftCardInfo.currentBalance >= total ? (
                                    <div className="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-xl flex justify-between text-xs">
                                        <span className="text-green-700 font-semibold">Balance KES {giftCardInfo.currentBalance.toFixed(2)}</span>
                                        <span className="text-gray-500 dark:text-gray-400">Remaining after: KES {(giftCardInfo.currentBalance - total).toFixed(2)}</span>
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-red-500 mt-1.5">
                                        Balance KES {giftCardInfo.currentBalance.toFixed(2)} is less than the sale total — gift cards can't split-pay a sale
                                    </p>
                                )
                            )}
                        </div>
                    )}

                    {!splitMode && paymentMethod === 'Cash' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">{t('pos.payment.cashTendered')}</label>
                            <input
                                type="number"
                                min={0}
                                step="50"
                                value={tendered}
                                onChange={e => setTendered(e.target.value)}
                                className={`w-full border rounded-xl px-3 py-2.5 text-lg font-bold focus:outline-none focus:ring-2 transition-colors ${
                                    tenderedNum > 0 && change < 0
                                        ? 'border-red-300 focus:ring-red-200 text-red-600'
                                        : tenderedNum >= total && tenderedNum > 0
                                        ? 'border-green-300 focus:ring-green-200 text-green-700'
                                        : 'border-gray-200 dark:border-gray-700 focus:ring-green-200'
                                }`}
                                placeholder="0.00"
                                autoFocus
                            />
                            {quickAmounts.length > 0 && (
                                <div className="flex gap-1.5 mt-2">
                                    {quickAmounts.slice(0, 3).map(a => (
                                        <button key={a} onClick={() => setTendered(String(a))}
                                            className="flex-1 py-1.5 rounded-xl text-xs font-semibold border border-green-200 text-green-700 hover:bg-green-50 transition-colors">
                                            {a.toLocaleString()}
                                        </button>
                                    ))}
                                    <button onClick={() => setTendered(String(Math.ceil(total / 50) * 50))}
                                        className="flex-1 py-1.5 rounded-xl text-xs font-semibold border border-green-400 bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                                        {t('pos.payment.exact')}
                                    </button>
                                </div>
                            )}
                            {tenderedNum > 0 && change >= 0 && (
                                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl flex justify-between items-center">
                                    <span className="text-sm font-semibold text-green-700">{t('pos.payment.changeToGive')}</span>
                                    <span className="text-xl font-black text-green-700 tabular-nums">KES {change.toFixed(2)}</span>
                                </div>
                            )}
                            {tenderedNum > 0 && change < 0 && (
                                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex justify-between items-center">
                                    <span className="text-sm font-semibold text-red-600">{t('pos.payment.shortBy')}</span>
                                    <span className="text-xl font-black text-red-600 tabular-nums">KES {Math.abs(change).toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-5 pb-5 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors">
                        {t('pos.payment.cancel')}
                    </button>
                    <button
                        onClick={handleConfirmClick}
                        disabled={confirmDisabled}
                        className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                    >
                        {processing ? t('pos.payment.processing') : <><IconCheck className="w-4 h-4" /> {t('pos.payment.confirmSale')}</>}
                    </button>
                </div>
            </div>
        </div>
    );
});
PaymentModal.displayName = 'PaymentModal';

// ─── Layaway Modal ────────────────────────────────────────────────────────────
// Reserves the cart's items against a deposit — a customer is required
// (unlike a normal sale), and the deposit itself supports the same
// cash/card/store_credit/gift_card methods as split-tender (no M-Pesa: its
// STK-push confirmation is asynchronous, which doesn't fit this
// synchronous "record a deposit now" flow).
const LayawayModal = memo(({ isOpen, onClose, total, onConfirm, processing }) => {
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [depositAmount, setDepositAmount] = useState('');
    const [depositMethod, setDepositMethod] = useState('cash');
    const [giftCardInput, setGiftCardInput] = useState('');
    const [giftCardInfo, setGiftCardInfo] = useState(null);
    const [giftCardChecking, setGiftCardChecking] = useState(false);
    const [dueDate, setDueDate] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setSelectedCustomer(null);
            setDepositAmount('');
            setDepositMethod('cash');
            setGiftCardInput('');
            setGiftCardInfo(null);
            setDueDate('');
        }
    }, [isOpen]);

    useEffect(() => {
        if (!giftCardInput.trim()) { setGiftCardInfo(null); return; }
        setGiftCardChecking(true);
        const handle = setTimeout(() => {
            api.get(`/giftcards/lookup?code=${encodeURIComponent(giftCardInput.trim())}`)
                .then(res => setGiftCardInfo(res.data))
                .catch(() => setGiftCardInfo('notfound'))
                .finally(() => setGiftCardChecking(false));
        }, 400);
        return () => clearTimeout(handle);
    }, [giftCardInput]);

    if (!isOpen) return null;

    const depositNum = parseFloat(depositAmount) || 0;
    const balanceAfterDeposit = total - depositNum;
    const giftCardUsable = depositMethod !== 'gift_card' || (giftCardInfo && giftCardInfo !== 'notfound' && giftCardInfo.status === 'active' && giftCardInfo.currentBalance >= depositNum);
    const storeCreditUsable = depositMethod !== 'store_credit' || (selectedCustomer && selectedCustomer.storeCreditBalance >= depositNum);
    const confirmDisabled = processing
        || !selectedCustomer
        || depositNum <= 0
        || depositNum >= total
        || !giftCardUsable
        || !storeCreditUsable;

    const handleConfirmClick = () => {
        onConfirm({
            customer: selectedCustomer._id,
            deposit: { amount: depositNum, method: depositMethod, giftCardCode: depositMethod === 'gift_card' ? giftCardInfo?.code : undefined },
            dueDate: dueDate || undefined,
        });
    };

    const depositMethods = [
        { key: 'cash', label: 'Cash', Icon: IconCash },
        { key: 'card', label: 'Card', Icon: IconCard },
        { key: 'store_credit', label: 'Store Credit', Icon: IconTag },
        { key: 'gift_card', label: 'Gift Card', Icon: IconGift },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-gradient-to-br from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 rounded-sm border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
                <div className="px-5 py-4 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-t-2xl">
                    <p className="text-sm font-medium opacity-80">Layaway Total</p>
                    <p className="text-3xl font-black tabular-nums mt-0.5">
                        KES {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Customer</label>
                        <CustomerPicker selected={selectedCustomer} onSelect={setSelectedCustomer} />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Deposit Amount</label>
                        <input
                            type="number"
                            min="0"
                            value={depositAmount}
                            onChange={e => setDepositAmount(e.target.value)}
                            placeholder="0.00"
                            autoFocus
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        {depositNum > 0 && depositNum < total && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">Balance due after deposit: KES {balanceAfterDeposit.toFixed(2)}</p>
                        )}
                        {depositNum >= total && depositNum > 0 && (
                            <p className="text-[11px] text-red-500 mt-1">Deposit must be less than the total — pay in full as a normal sale instead</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Deposit Method</label>
                        <div className="grid grid-cols-2 gap-2">
                            {depositMethods.map(m => (
                                <button
                                    key={m.key}
                                    onClick={() => setDepositMethod(m.key)}
                                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all ${depositMethod === m.key
                                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-300 hover:text-indigo-700'}`}
                                >
                                    <m.Icon className="w-4 h-4" />
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {depositMethod === 'store_credit' && selectedCustomer && depositNum > selectedCustomer.storeCreditBalance && (
                        <p className="text-[11px] text-red-500">Insufficient balance — has KES {selectedCustomer.storeCreditBalance.toFixed(2)}</p>
                    )}

                    {depositMethod === 'gift_card' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Gift Card Code</label>
                            <input
                                value={giftCardInput}
                                onChange={e => setGiftCardInput(e.target.value)}
                                placeholder="e.g. GC-3F9A2B1C0D"
                                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            {giftCardChecking && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">Checking…</p>}
                            {!giftCardChecking && giftCardInfo === 'notfound' && (
                                <p className="text-[11px] text-red-500 mt-1.5">No gift card found for that code</p>
                            )}
                            {!giftCardChecking && giftCardInfo && giftCardInfo !== 'notfound' && giftCardInfo.status === 'active' && giftCardInfo.currentBalance < depositNum && (
                                <p className="text-[11px] text-red-500 mt-1.5">Balance KES {giftCardInfo.currentBalance.toFixed(2)} is less than the deposit</p>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Due Date (optional)</label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                    </div>
                </div>

                <div className="px-5 pb-5 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirmClick}
                        disabled={confirmDisabled}
                        className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                    >
                        {processing ? 'Processing…' : <><IconCheck className="w-4 h-4" /> Start Layaway</>}
                    </button>
                </div>
            </div>
        </div>
    );
});
LayawayModal.displayName = 'LayawayModal';

// ─── Receipt Modal ────────────────────────────────────────────────────────────
const ReceiptModal = memo(({ sale, onClose, onPrint }) => {
    const [qrUrl, setQrUrl] = useState('');
    const [etimsQrUrl, setEtimsQrUrl] = useState('');

    useEffect(() => {
        if (sale?._id) {
            QRCode.toDataURL(JSON.stringify({ id: sale._id, total: sale.totalAmount, date: sale.createdAt }))
                .then(setQrUrl)
                .catch(() => {});
        }
        // Distinct from the sale-lookup QR above — this one is KRA's eTIMS
        // control-unit invoice QR, only present once eTIMS submission has
        // succeeded (see server/services/etims.js). Never conflate the two.
        if (sale?.etimsQrPayload) {
            QRCode.toDataURL(sale.etimsQrPayload)
                .then(setEtimsQrUrl)
                .catch(() => {});
        } else {
            setEtimsQrUrl('');
        }
    }, [sale]);

    if (!sale) return null;

    const subtotal = sale.items?.reduce((s, it) => s + it.unitPrice * it.quantity * (1 - it.discount / 100), 0) || 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-gradient-to-br from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 rounded-sm border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
                <div id="receipt-print" className="p-6">
                    <div className="text-center mb-5">
                        <img src={businessSettings.logoPath} alt="Logo" className="w-12 h-12 object-contain mx-auto mb-2" onError={e => e.target.style.display='none'} />
                        <h1 className="font-bold text-base tracking-widest text-gray-800 dark:text-gray-100">{businessSettings.name.toUpperCase()}</h1>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">{businessSettings.address}</p>
                    </div>

                    <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-3 mb-3 font-mono text-[11px] text-gray-500 dark:text-gray-400 space-y-0.5">
                        <div className="flex justify-between">
                            <span>Receipt</span>
                            <span className="font-bold text-gray-700 dark:text-gray-300">#{sale._id?.slice(-8).toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Date</span>
                            <span>{new Date(sale.createdAt || Date.now()).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Cashier</span>
                            <span>{sale.cashier?.name || 'Unknown'}</span>
                        </div>
                        {sale.payments?.length > 1 ? (
                            sale.payments.map((p, i) => (
                                <div key={i} className="flex justify-between">
                                    <span>Payment ({p.method.replace('_', ' ')})</span>
                                    <span className="font-semibold">KES {p.amount.toFixed(2)}</span>
                                </div>
                            ))
                        ) : (
                            <div className="flex justify-between">
                                <span>Payment</span>
                                <span className="font-semibold capitalize">{sale.paymentMethod}</span>
                            </div>
                        )}
                    </div>

                    <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-3 mb-3 font-mono text-[11px] space-y-1">
                        {sale.items?.map((item, i) => (
                            <div key={i}>
                                <div className="flex justify-between">
                                    <span className="flex-1 truncate pr-2">{item.styleName} <span className="text-gray-500 dark:text-gray-400">({item.size}/{item.color})</span></span>
                                    <span className="font-semibold">KES {(item.unitPrice * item.quantity * (1 - item.discount / 100)).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500 dark:text-gray-400 text-[10px]">
                                    <span>{item.quantity} × KES {item.unitPrice.toFixed(2)}{item.discount > 0 ? ` (−${item.discount}%)` : ''}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-3 font-mono text-[11px] space-y-0.5">
                        <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Subtotal</span><span>KES {subtotal.toFixed(2)}</span></div>
                        {sale.cartDiscount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Order Discount ({sale.cartDiscount}%)</span>
                                <span>-KES {(subtotal * sale.cartDiscount / 100).toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-black text-sm text-gray-800 dark:text-gray-100 mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
                            <span>TOTAL</span>
                            <span>KES {sale.totalAmount?.toFixed(2)}</span>
                        </div>
                        {sale.giftCardRedeemed?.code && (
                            <div className="flex justify-between text-gray-500 dark:text-gray-400">
                                <span>Paid via Gift Card {sale.giftCardRedeemed.code}</span>
                                <span>-KES {sale.giftCardRedeemed.amount?.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {sale.giftCardsSold?.length > 0 && (
                        <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-3 mt-3 font-mono text-[11px] space-y-1">
                            <p className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><IconGift className="w-3.5 h-3.5" /> Gift Card{sale.giftCardsSold.length > 1 ? 's' : ''} Issued</p>
                            {sale.giftCardsSold.map((g, i) => (
                                <div key={i} className="flex justify-between">
                                    <span className="font-bold tracking-wider">{g.code}</span>
                                    <span>KES {g.amount.toFixed(2)}</span>
                                </div>
                            ))}
                            <p className="text-gray-500 dark:text-gray-400 text-[10px]">Keep this code safe — it's required to redeem the card.</p>
                        </div>
                    )}

                    {qrUrl && (
                        <div className="mt-4 flex flex-col items-center">
                            <img src={qrUrl} alt="Receipt lookup QR" className="w-16 h-16" />
                            <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1">Scan to look up this receipt</p>
                        </div>
                    )}

                    {sale.etimsStatus === 'accepted' && etimsQrUrl && (
                        <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-3 mt-3 flex flex-col items-center">
                            <img src={etimsQrUrl} alt="KRA eTIMS QR" className="w-16 h-16" />
                            <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1 font-mono">eTIMS Invoice: {sale.etimsInvoiceNumber}</p>
                        </div>
                    )}
                    {sale.etimsStatus === 'unreachable' && (
                        <p className="text-center text-[9px] text-amber-500 mt-3">eTIMS invoice pending — will be submitted when reachable</p>
                    )}

                    <p className="text-center text-[10px] text-gray-500 dark:text-gray-400 mt-3">{businessSettings.receiptFooter}</p>
                </div>

                <div className="flex gap-3 px-5 pb-5">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Close</button>
                    <button onClick={onPrint} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5">
                        <IconPrinter className="w-4 h-4" /> Print
                    </button>
                </div>
            </div>
        </div>
    );
});
ReceiptModal.displayName = 'ReceiptModal';

// ─── Main POS ─────────────────────────────────────────────────────────────────
export default function POSPage() {
    const { t, i18n } = useTranslation();
    const { user, logout } = useContext(AuthContext);
    const { theme, toggleTheme } = useContext(ThemeContext);
    const navigate = useNavigate();

    // All styles (with embedded variants) from server — never filtered
    const [allStyles, setAllStyles] = useState([]);
    const [cart, setCart] = useState([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [sortBy, setSortBy] = useState('name_asc');
    const [showScanner, setShowScanner] = useState(false);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [showPayment, setShowPayment] = useState(false);
    const [showLayaway, setShowLayaway] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [saleDetails, setSaleDetails] = useState(null);
    const [cartDiscount, setCartDiscount] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [mobileCartOpen, setMobileCartOpen] = useState(false);
    const [pickerStyle, setPickerStyle] = useState(null); // style currently open in the size/color picker

    // undefined = not yet loaded, null = no open shift, object = open shift
    const [currentShift, setCurrentShift] = useState(undefined);
    const [shiftSubmitting, setShiftSubmitting] = useState(false);
    const [showCloseShift, setShowCloseShift] = useState(false);

    // Gift cards being sold in this transaction — independent of the cart's
    // merchandise items and of however the sale itself gets paid for.
    const [giftCardsToSell, setGiftCardsToSell] = useState([]); // [{ tempId, amount }]
    const [showSellGiftCard, setShowSellGiftCard] = useState(false);

    // M-Pesa STK-push wait state — null when not mid-payment, otherwise
    // { pendingId, status: 'waiting'|'failed'|'timed_out', resultMessage }
    const [mpesaWaiting, setMpesaWaiting] = useState(null);

    const searchRef = useRef(null);

    // ── Shift gate: load the caller's own open shift (if any) on mount ──
    useEffect(() => {
        api.get('/shifts/current')
            .then(res => setCurrentShift(res.data))
            .catch(() => setCurrentShift(null));
    }, []);

    const handleOpenShift = useCallback(async (openingFloat) => {
        setShiftSubmitting(true);
        try {
            const res = await api.post('/shifts/open', { openingFloat });
            setCurrentShift(res.data);
            toast.success('Shift opened');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to open shift');
        } finally {
            setShiftSubmitting(false);
        }
    }, []);

    const handleCloseShift = useCallback(async (closingCount) => {
        if (!currentShift?._id) return;
        setShiftSubmitting(true);
        try {
            const res = await api.post(`/shifts/${currentShift._id}/close`, { closingCount });
            const { discrepancy } = res.data;
            if (Math.abs(discrepancy) < 0.01) {
                toast.success('Shift closed — drawer balanced');
            } else {
                toast.warning(`Shift closed — ${discrepancy > 0 ? 'over' : 'short'} by KES ${Math.abs(discrepancy).toFixed(2)}`);
            }
            setShowCloseShift(false);
            setCurrentShift(null);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to close shift');
        } finally {
            setShiftSubmitting(false);
        }
    }, [currentShift]);

    // ── Load all styles (called on mount + after each sale) ──
    // Falls back to the last-cached catalog when the request fails outright
    // (offline) rather than just erroring — stock counts shown this way are
    // "as of last sync", surfaced via isOffline/cacheAge below, not claimed live.
    const [isOffline, setIsOffline] = useState(false);
    const [cachedAt, setCachedAt] = useState(null);

    const loadStyles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/styles');
            setAllStyles(res.data);
            setIsOffline(false);
            setCachedAt(null);
            cacheStyles(res.data).catch(() => {});
        } catch {
            const cached = await getCachedStyles().catch(() => null);
            if (cached) {
                setAllStyles(cached.styles);
                setIsOffline(true);
                setCachedAt(cached.cachedAt);
            } else {
                toast.error(t('pos.toast.stylesLoadFailed'));
            }
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { loadStyles(); }, [loadStyles]);

    // ── Offline sales queue: sync status + auto-flush on reconnect ──
    const [offlineCounts, setOfflineCounts] = useState({ pending: 0, failed: 0 });
    const refreshOfflineCounts = useCallback(async () => {
        const [pending, failed] = await Promise.all([getPendingSales(), getFailedSales()]);
        setOfflineCounts({ pending: pending.length, failed: failed.length });
    }, []);

    const syncOfflineQueue = useCallback(async () => {
        const result = await flushQueue((payload) => api.post('/sales', payload));
        if (result.synced > 0) toast.success(`${result.synced} queued sale${result.synced !== 1 ? 's' : ''} synced`);
        if (result.failed > 0) toast.error(`${result.failed} queued sale${result.failed !== 1 ? 's' : ''} could not sync — needs attention`);
        await refreshOfflineCounts();
        if (result.synced > 0) loadStyles(); // stock changed
    }, [refreshOfflineCounts, loadStyles]);

    useEffect(() => {
        refreshOfflineCounts();
        window.addEventListener('online', syncOfflineQueue);
        if (navigator.onLine) syncOfflineQueue(); // catch anything queued from a previous session
        return () => window.removeEventListener('online', syncOfflineQueue);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Live stock sync (SSE) — patches allStyles in place, no refetch/flicker ──
    const applyStockChanges = useCallback((changes) => {
        setAllStyles(prev => prev.map(style => {
            const relevant = changes.filter(c => c.styleId === style._id);
            if (relevant.length === 0) return style;
            return {
                ...style,
                variants: style.variants.map(v => {
                    const change = relevant.find(c => c.variantId === v._id);
                    return change ? { ...v, stock: change.stock } : v;
                }),
            };
        }));
    }, []);

    useEffect(() => {
        let cancelled = false;
        let reader = null;

        // Reads the stream via fetch (not native EventSource) specifically so
        // the access token can go in a normal Authorization header instead of
        // the URL — EventSource can't set custom headers, and a token in a
        // query string can leak into logs/proxies/browser history.
        async function connect() {
            try {
                const token = localStorage.getItem('token');
                if (!token) { if (!cancelled) setTimeout(connect, 3000); return; }
                const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/stock-events`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (!cancelled) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split('\n\n');
                    buffer = parts.pop();
                    for (const part of parts) {
                        const line = part.split('\n').find(l => l.startsWith('data: '));
                        if (!line) continue;
                        try {
                            const msg = JSON.parse(line.slice(6));
                            if (msg.type === 'stock_update') applyStockChanges(msg.changes);
                        } catch { /* not JSON (e.g. the ": connected" comment) */ }
                    }
                }
            } catch { /* connection dropped — fall through to the reconnect below */ }
            if (!cancelled) setTimeout(connect, 3000); // simple fixed-delay reconnect, not full backoff
        }
        connect();

        return () => {
            cancelled = true;
            reader?.cancel().catch(() => {});
        };
    }, [applyStockChanges]);

    // ── Derived: categories with counts ──
    const categories = useMemo(
        () => [...new Set(allStyles.map(s => s.category).filter(Boolean))].sort(),
        [allStyles]
    );

    const categoryCounts = useMemo(() => {
        const counts = {};
        allStyles.forEach(s => { if (s.category) counts[s.category] = (counts[s.category] || 0) + 1; });
        return counts;
    }, [allStyles]);

    // ── Derived: filtered + sorted style list ──
    const styles = useMemo(() => {
        let list = allStyles;

        if (category !== 'all') {
            list = list.filter(s => (s.category || '').toLowerCase() === category.toLowerCase());
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(s =>
                s.name.toLowerCase().includes(q) ||
                (s.styleCode || '').toLowerCase().includes(q) ||
                (s.brand || '').toLowerCase().includes(q)
            );
        }

        return [...list].sort((a, b) => {
            switch (sortBy) {
                case 'name_asc':   return a.name.localeCompare(b.name);
                case 'name_desc':  return b.name.localeCompare(a.name);
                case 'price_asc':  return a.basePrice - b.basePrice;
                case 'price_desc': return b.basePrice - a.basePrice;
                case 'stock_asc':  return styleStock(a) - styleStock(b);
                default:           return 0;
            }
        });
    }, [allStyles, category, search, sortBy]);

    // ── Add a specific variant to the cart ──
    const addVariantToCart = useCallback((style, variant) => {
        const label = `${style.name} (${variant.size}/${variant.color})`;
        if (variant.stock < 1) { toast.error(t('pos.toast.outOfStock', { name: label })); return; }
        setCart(prev => {
            const ex = prev.find(i => i.variantId === variant._id);
            if (ex) {
                if (ex.quantity >= variant.stock) {
                    toast.warning(t('pos.toast.onlyInStock', { count: variant.stock }));
                    return prev;
                }
                return prev.map(i => i.variantId === variant._id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            toast.success(t('pos.toast.itemAdded', { name: label }), { autoClose: 1000, hideProgressBar: true });
            return [...prev, {
                variantId: variant._id,
                styleId: style._id,
                styleName: style.name,
                size: variant.size,
                color: variant.color,
                image: style.images?.[0] || '',
                unitPrice: variantPrice(style, variant),
                stock: variant.stock,
                quantity: 1,
                discount: 0,
            }];
        });
        setPickerStyle(null);
    }, [t]);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const allCats = ['all', ...categories];
        const down = e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            if (e.ctrlKey && e.key === 'b') { e.preventDefault(); setShowScanner(v => !v); }
            if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); if (cart.length > 0) setShowPayment(true); }
            if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
            if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey) {
                const idx = parseInt(e.key) - 1;
                if (idx < allCats.length) setCategory(allCats[idx]);
            }
        };
        window.addEventListener('keydown', down);
        return () => window.removeEventListener('keydown', down);
    }, [cart, categories]);

    // ── Cart computations ──
    const calcTotal = useCallback(item => item.unitPrice * item.quantity * (1 - item.discount / 100), []);
    const subtotal  = useMemo(() => cart.reduce((s, it) => s + calcTotal(it), 0), [cart, calcTotal]);
    const giftCardsTotal = useMemo(() => giftCardsToSell.reduce((s, g) => s + g.amount, 0), [giftCardsToSell]);
    // Gift cards sold are added at face value after the merchandise discount —
    // a gift card isn't merchandise and shouldn't be discounted (must match
    // the server's calculatedTotal in salesController.createSale exactly).
    const grandTotal = useMemo(() => subtotal * (1 - cartDiscount / 100) + giftCardsTotal, [subtotal, cartDiscount, giftCardsTotal]);
    const cartCount  = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

    // ── Quantity change ──
    const changeQty = useCallback((variantId, delta) => {
        setCart(prev => prev.map(item => {
            if (item.variantId !== variantId) return item;
            const newQ = item.quantity + delta;
            if (newQ < 1) return item;
            if (newQ > item.stock) { toast.warning(t('pos.toast.onlyInStock', { count: item.stock })); return item; }
            return { ...item, quantity: newQ };
        }));
    }, [t]);

    const removeFromCart = useCallback(variantId => setCart(prev => prev.filter(i => i.variantId !== variantId)), []);

    const changeDiscount = useCallback((variantId, val) => {
        const d = Math.min(100, Math.max(0, parseFloat(val) || 0));
        setCart(prev => prev.map(i => i.variantId === variantId ? { ...i, discount: d } : i));
    }, []);

    // ── Resolve a barcode straight to its variant (garment-level tagging means
    // a scan should skip the size/color picker entirely) ──
    const resolveBarcode = useCallback(async (barcode) => {
        // First check what's already loaded, to avoid a round trip on the common case
        for (const style of allStyles) {
            const variant = (style.variants || []).find(v => v.barcode === barcode);
            if (variant) return { style, variant };
        }
        try {
            const res = await api.get(`/variants/lookup?barcode=${encodeURIComponent(barcode)}`);
            const variant = res.data;
            const style = variant.style; // populated by the lookup endpoint
            return { style, variant };
        } catch {
            return null;
        }
    }, [allStyles]);

    // ── Barcode scan ──
    const handleScan = useCallback(async (err, result) => {
        if (!result?.text) return;
        setShowScanner(false);
        const barcode = result.text.trim();
        const match = await resolveBarcode(barcode);
        if (match) {
            addVariantToCart(match.style, match.variant);
        } else {
            toast.error(t('pos.toast.noItemForBarcode', { barcode }));
        }
    }, [resolveBarcode, addVariantToCart, t]);

    // ── Manual barcode: type in search box + Enter ──
    const handleSearchKeyDown = useCallback(async e => {
        if (e.key !== 'Enter' || !search.trim()) return;
        const match = await resolveBarcode(search.trim());
        if (match) { addVariantToCart(match.style, match.variant); setSearch(''); }
    }, [search, resolveBarcode, addVariantToCart]);

    // ── Confirm payment ──
    const handleConfirmPayment = useCallback(async ({ customer, giftCardCode, phone, payments } = {}) => {
        // M-Pesa can't complete synchronously — it starts an STK push and
        // waits for Safaricom's async callback instead of creating the sale
        // right away. Cash/Card/Store Credit/Gift Card all still complete
        // the instant the cashier confirms. A split-tender submission
        // (payments present) never includes M-Pesa by design — checked here
        // too, not just relying on `paymentMethod`, since that parent state
        // can be stale (e.g. left on 'M-Pesa' from before the cashier
        // switched into split mode).
        if (!payments && paymentMethod === 'M-Pesa') {
            setProcessing(true);
            try {
                const payload = {
                    phone,
                    items: cart.map(({ variantId, quantity, discount }) => ({ variant: variantId, quantity, discount })),
                    totalAmount: grandTotal,
                    cartDiscount,
                    shift: currentShift?._id,
                    giftCardsSold: giftCardsToSell.map(({ amount }) => ({ amount })),
                };
                const res = await api.post('/payments/mpesa/initiate', payload);
                setShowPayment(false);
                setMpesaWaiting({ pendingId: res.data.pendingPaymentId, status: 'waiting', resultMessage: null });
            } catch (err) {
                toast.error(err.response?.data?.error || 'Failed to initiate M-Pesa payment');
            } finally {
                setProcessing(false);
            }
            return;
        }

        setProcessing(true);
        const payload = {
            items: cart.map(({ variantId, quantity, discount }) => ({ variant: variantId, quantity, discount })),
            totalAmount: grandTotal,
            cartDiscount,
            shift: currentShift?._id,
            giftCardsSold: giftCardsToSell.map(({ amount }) => ({ amount })),
            ...(payments ? { payments } : { paymentMethod, customer, giftCardCode }),
        };
        // Only cash/card single-method sales with no gift card being sold
        // alongside are safe to queue offline — everything else needs a live
        // balance check (store credit, gift card) or is impossible offline
        // (M-Pesa, already routed away above).
        const offlineQueueable = !payments && (paymentMethod === 'Cash' || paymentMethod === 'Card') && giftCardsToSell.length === 0;
        try {
            const res = await api.post('/sales', payload);
            setSaleDetails(res.data);
            toast.success(t('pos.toast.saleCompleted'));
            setCart([]);
            setCartDiscount(0);
            setGiftCardsToSell([]);
            setShowPayment(false);
            setMobileCartOpen(false);
            setShowReceipt(true);
            loadStyles(); // refresh stock counts
        } catch (err) {
            if (!err.response && offlineQueueable) {
                await queueSale(payload);
                toast.info('No connection — sale queued, will sync automatically once back online');
                setCart([]);
                setCartDiscount(0);
                setShowPayment(false);
                setMobileCartOpen(false);
                refreshOfflineCounts();
            } else {
                toast.error(err.response?.data?.error || t('pos.toast.saleFailed'));
            }
        } finally {
            setProcessing(false);
        }
    }, [cart, grandTotal, cartDiscount, paymentMethod, currentShift, giftCardsToSell, loadStyles, t, refreshOfflineCounts]);

    // Reserves the cart's items against a deposit instead of completing a
    // sale — doesn't touch giftCardsToSell (a separate, still-pending
    // concern the cashier would complete via a normal checkout afterward).
    const handleConfirmLayaway = useCallback(async ({ customer, deposit, dueDate }) => {
        setProcessing(true);
        try {
            const payload = {
                items: cart.map(({ variantId, quantity, discount }) => ({ variant: variantId, quantity, discount })),
                totalAmount: grandTotal,
                cartDiscount,
                customer,
                deposit,
                dueDate,
            };
            await api.post('/layaways', payload);
            toast.success('Layaway created');
            setCart([]);
            setCartDiscount(0);
            setShowLayaway(false);
            setMobileCartOpen(false);
            loadStyles(); // refresh stock counts — items are reserved immediately
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to create layaway');
        } finally {
            setProcessing(false);
        }
    }, [cart, grandTotal, cartDiscount, loadStyles]);

    // ── Poll for M-Pesa STK-push confirmation while mpesaWaiting is active ──
    useEffect(() => {
        if (!mpesaWaiting || mpesaWaiting.status !== 'waiting') return undefined;
        let cancelled = false;

        const poll = async () => {
            try {
                const res = await api.get(`/payments/mpesa/${mpesaWaiting.pendingId}/status`);
                if (cancelled) return;
                if (res.data.status === 'confirmed') {
                    const saleRes = await api.get(`/sales/${res.data.saleId}`);
                    if (cancelled) return;
                    setSaleDetails(saleRes.data);
                    setCart([]);
                    setCartDiscount(0);
                    setGiftCardsToSell([]);
                    setMobileCartOpen(false);
                    setMpesaWaiting(null);
                    setShowReceipt(true);
                    toast.success(t('pos.toast.saleCompleted'));
                    loadStyles();
                } else if (res.data.status === 'failed' || res.data.status === 'timed_out') {
                    setMpesaWaiting(prev => prev && { ...prev, status: res.data.status, resultMessage: res.data.resultMessage });
                }
                // else still pending — keep polling
            } catch {
                // transient network error on a single poll — try again rather than failing the whole wait
            }
        };

        poll();
        const interval = setInterval(poll, 2500);
        return () => { cancelled = true; clearInterval(interval); };
    }, [mpesaWaiting, t, loadStyles]);

    // ── Print receipt ──
    const handlePrint = useCallback(() => {
        const el = document.getElementById('receipt-print');
        if (!el) return;
        const w = window.open('', '', 'width=420,height=650');
        w.document.write(`<html><head><title>Receipt</title><style>
            body { font-family: 'Courier New', monospace; font-size: 11px; margin: 16px; color: #111; }
            img { display: block; margin: 0 auto; }
        </style></head><body>${el.innerHTML}</body></html>`);
        w.document.close();
        w.onload = () => { setTimeout(() => { w.print(); w.close(); }, 300); };
    }, []);

    const handleLogout = useCallback(() => { logout(); navigate('/'); }, [logout, navigate]);

    const initials = user?.name
        ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
        : '??';

    const allCats = ['all', ...categories];

    return (
        <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden select-none">

            {/* ══ Header ══════════════════════════════════════════════════════ */}
            <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 flex-shrink-0 z-30 shadow-sm">
                <div className="flex items-center gap-3">
                    <img src={businessSettings.logoPath} alt="Logo" className="w-8 h-8 object-contain rounded-lg"
                        onError={e => { e.target.style.display = 'none'; }} />
                    <div className="leading-tight">
                        <p className="font-black text-gray-800 dark:text-gray-100 text-sm">{businessSettings.name}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">{businessSettings.tagline}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="hidden lg:flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 mr-2">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono">F2</kbd><span>search</span>
                        <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono">1–9</kbd><span>category</span>
                        <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono">Ctrl+B</kbd><span>scan</span>
                        <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono">Ctrl+↵</kbd><span>pay</span>
                    </div>

                    <button
                        onClick={() => setMobileCartOpen(v => !v)}
                        className="relative lg:hidden w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <IconCart className="w-4 h-4" />
                        {cartCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                {cartCount > 9 ? '9+' : cartCount}
                            </span>
                        )}
                    </button>

                    {(offlineCounts.pending > 0 || offlineCounts.failed > 0) && (
                        <button
                            onClick={syncOfflineQueue}
                            title="Click to retry syncing now"
                            className={`flex items-center gap-1.5 text-xs font-semibold rounded-xl px-2.5 py-1.5 transition-colors flex-shrink-0 border ${
                                offlineCounts.failed > 0
                                    ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50'
                                    : 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                            }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${offlineCounts.failed > 0 ? 'bg-red-500' : 'bg-amber-500'}`} />
                            <span className="hidden sm:inline">
                                {offlineCounts.pending > 0 && `${offlineCounts.pending} sale${offlineCounts.pending !== 1 ? 's' : ''} pending sync`}
                                {offlineCounts.pending > 0 && offlineCounts.failed > 0 && ' · '}
                                {offlineCounts.failed > 0 && `${offlineCounts.failed} failed`}
                            </span>
                            <span className="sm:hidden">Sync</span>
                        </button>
                    )}

                    {isOffline && (
                        <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 flex-shrink-0" title={cachedAt ? `Cached ${new Date(cachedAt).toLocaleString()}` : undefined}>
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                            Offline — cached stock
                        </div>
                    )}

                    {currentShift && (
                        <button
                            onClick={() => setShowCloseShift(true)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-xl px-2.5 py-1.5 transition-colors flex-shrink-0"
                            title="Click to close this shift"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                            <span className="hidden sm:inline">Shift open · KES {currentShift.openingFloat.toFixed(2)} float</span>
                            <span className="sm:hidden">Shift</span>
                        </button>
                    )}

                    <div className="hidden sm:flex items-center gap-2 border-l border-gray-100 dark:border-gray-800 pl-3 ml-1">
                        <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">
                            {initials}
                        </div>
                        <div className="hidden md:block leading-tight">
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{user?.name || 'Cashier'}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{user?.role || ''}</p>
                        </div>
                    </div>

                    <button
                        onClick={toggleTheme}
                        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0 ml-1"
                    >
                        {theme === 'dark' ? <IconSun className="w-4 h-4" /> : <IconMoon className="w-4 h-4" />}
                    </button>

                    <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden text-xs font-bold ml-1">
                        {['en', 'sw'].map(lng => (
                            <button
                                key={lng}
                                onClick={() => setPosLocale(lng)}
                                className={`px-2 py-1.5 transition-colors ${i18n.language === lng ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                            >
                                {lng.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 border border-gray-200 dark:border-gray-700 hover:border-red-300 rounded-xl px-2.5 py-1.5 transition-colors ml-1"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                        </svg>
                        <span className="hidden sm:inline">Logout</span>
                    </button>
                </div>
            </header>

            {/* ══ Body ════════════════════════════════════════════════════════ */}
            <div className="flex-1 flex overflow-hidden">

                {/* ── Left: Styles ───────────────────────────────────────────── */}
                <main className="flex-1 flex flex-col overflow-hidden min-w-0">

                    <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-2.5 flex gap-2 flex-shrink-0">
                        <div className="relative flex-1">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder="Search styles or type barcode + Enter… (F2)"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                className="w-full pl-9 pr-8 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-gray-50 dark:bg-gray-900 focus:bg-white dark:focus:bg-gray-800 transition-colors"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none">×</button>
                            )}
                        </div>

                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            className="hidden sm:block border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            <option value="name_asc">A → Z</option>
                            <option value="name_desc">Z → A</option>
                            <option value="price_asc">Price ↑</option>
                            <option value="price_desc">Price ↓</option>
                            <option value="stock_asc">Stock ↑</option>
                        </select>

                        <button
                            onClick={() => setShowScanner(v => !v)}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${showScanner
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300 bg-white dark:bg-gray-900'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h.01M4 10h.01M4 14h.01M4 18h.01M8 6h8M8 10h8M8 14h8M8 18h8M20 6h.01M20 10h.01M20 14h.01M20 18h.01" />
                            </svg>
                            <span className="hidden sm:inline">{showScanner ? 'Close' : 'Scan'}</span>
                        </button>

                        <button
                            onClick={loadStyles}
                            disabled={loading}
                            title="Refresh stock"
                            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-indigo-600 hover:border-indigo-300 bg-white dark:bg-gray-900 transition-colors disabled:opacity-40"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>

                    <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-2 flex gap-1.5 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
                        {allCats.map((c, idx) => {
                            const count = c === 'all' ? allStyles.length : (categoryCounts[c] || 0);
                            const active = category === c;
                            return (
                                <button
                                    key={c}
                                    onClick={() => setCategory(c)}
                                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border capitalize transition-all ${active
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300 bg-white dark:bg-gray-900'}`}
                                >
                                    <span className={`hidden lg:inline text-[10px] font-mono opacity-60 ${active ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>{idx + 1}</span>
                                    {c === 'all' ? t('pos.categories.all') : c}
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white dark:bg-gray-900/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {showScanner && (
                        <div className="flex-shrink-0 bg-gray-900 flex justify-center items-center py-4 gap-4">
                            <div className="rounded-xl overflow-hidden border-2 border-indigo-400 shadow-xl">
                                <BarcodeScannerComponent width={300} height={200} onUpdate={handleScan} />
                            </div>
                            {/* This panel's bg-gray-900 backdrop is fixed regardless of
                                site theme (a camera view needs a dark surround
                                either way), so its own text intentionally has no
                                dark: variant — pairing one here would have made
                                dark-site-theme text harder to read against the
                                exact same background, not easier. */}
                            <div className="text-white text-xs space-y-1 hidden md:block">
                                <p className="font-semibold text-indigo-300 flex items-center gap-1.5"><IconCamera className="w-4 h-4" /> Camera Scanner</p>
                                <p className="text-gray-400">Point camera at a garment's barcode</p>
                                <p className="text-gray-400 text-[10px]">Or type it in search + Enter</p>
                                <button onClick={() => setShowScanner(false)} className="mt-2 flex items-center gap-1 text-gray-400 hover:text-white text-xs border border-gray-600 rounded-lg px-2 py-1 transition-colors">
                                    <IconX className="w-3 h-3" /> Close
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4">
                        {loading && allStyles.length === 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                                {[...Array(12)].map((_, i) => (
                                    <div key={i} className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden animate-pulse">
                                        <div className="aspect-square bg-gray-100 dark:bg-gray-800" />
                                        <div className="p-2.5 space-y-2">
                                            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full w-4/5" />
                                            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full w-1/2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : styles.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 py-20">
                                <IconSearch className="w-12 h-12 mb-4 text-gray-300 dark:text-gray-400" />
                                <p className="font-semibold text-gray-500 dark:text-gray-400">No styles found</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {category !== 'all' ? `No items in "${category}"` : 'Try a different search'}
                                </p>
                                {(search || category !== 'all') && (
                                    <button
                                        onClick={() => { setSearch(''); setCategory('all'); }}
                                        className="mt-3 text-indigo-500 text-sm hover:text-indigo-700 font-medium"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                {(search || category !== 'all') && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                        {styles.length} style{styles.length !== 1 ? 's' : ''}
                                        {category !== 'all' ? ` in ${category}` : ''}
                                        {search ? ` matching "${search}"` : ''}
                                    </p>
                                )}
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {styles.map(s => (
                                        <StyleCard key={s._id} style={s} onOpen={setPickerStyle} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </main>

                {/* ── Right: Order Panel ──────────────────────────────────────── */}
                <aside className={`
                    ${mobileCartOpen ? 'flex' : 'hidden'} lg:flex
                    fixed inset-0 z-40 lg:static lg:z-auto
                    flex-col bg-gradient-to-b from-white dark:from-gray-900 to-gray-50 dark:to-gray-900 lg:w-[360px] xl:w-[400px] border-l border-gray-200 dark:border-gray-700
                `}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-gray-800 dark:text-gray-100">{t('pos.cart.title')}</h2>
                            {cartCount > 0 && (
                                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                    {cartCount}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSellGiftCard(true)}
                                title="Sell a gift card"
                                aria-label="Sell a gift card"
                                className="w-7 h-7 flex items-center justify-center text-indigo-600 hover:text-white hover:bg-indigo-500 rounded-xl transition-all border border-indigo-200 hover:border-indigo-500 flex-shrink-0"
                            >
                                <IconGift className="w-4 h-4" />
                            </button>
                            {cart.length > 0 && (
                                <button onClick={() => { setCart([]); setCartDiscount(0); }} className="text-xs text-red-500 hover:text-white hover:bg-red-500 px-2 py-0.5 rounded-lg font-semibold transition-all border border-red-200 hover:border-red-500">
                                    {t('pos.cart.clear')}
                                </button>
                            )}
                            <button onClick={() => setMobileCartOpen(false)} className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-1">
                        {cart.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-16">
                                <div className="w-16 h-16 rounded-sm bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-300 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <p className="font-semibold text-gray-500 dark:text-gray-400 text-sm">{t('pos.cart.emptyTitle')}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('pos.cart.emptySubtitle')}</p>
                            </div>
                        ) : (
                            cart.map(item => (
                                <CartLine
                                    key={item.variantId}
                                    item={item}
                                    onQtyChange={changeQty}
                                    onRemove={removeFromCart}
                                    onDiscountChange={changeDiscount}
                                    calcTotal={calcTotal}
                                />
                            ))
                        )}
                    </div>

                    {giftCardsToSell.length > 0 && (
                        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-1">
                            {giftCardsToSell.map(g => (
                                <div key={g.tempId} className="flex items-center justify-between text-xs bg-indigo-50 border border-indigo-100 rounded-xl px-2.5 py-1.5">
                                    <span className="text-indigo-700 font-semibold flex items-center gap-1.5"><IconGift className="w-3.5 h-3.5" /> Gift Card · KES {g.amount.toFixed(2)}</span>
                                    <button onClick={() => setGiftCardsToSell(prev => prev.filter(x => x.tempId !== g.tempId))} aria-label="Remove gift card" className="text-indigo-400 hover:text-red-500 transition-colors">×</button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="border-t border-gray-100 dark:border-gray-800 px-4 pt-3 pb-4 flex-shrink-0 space-y-3 bg-white dark:bg-gray-900">
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between text-gray-500 dark:text-gray-400">
                                <span>{t('pos.cart.subtotal')}</span>
                                <span className="tabular-nums text-green-700 font-medium">KES {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                            {cartDiscount > 0 && (
                                <div className="flex justify-between text-red-500">
                                    <span>{t('pos.cart.discount', { pct: cartDiscount })}</span>
                                    <span className="tabular-nums">-KES {(subtotal * cartDiscount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            {giftCardsTotal > 0 && (
                                <div className="flex justify-between text-indigo-600">
                                    <span>Gift Cards</span>
                                    <span className="tabular-nums">+KES {giftCardsTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-baseline border-t border-gray-100 dark:border-gray-800 pt-3">
                            <span className="font-bold text-gray-800 dark:text-gray-100 text-base">{t('pos.cart.total')}</span>
                            <span className="font-black text-xl text-green-700 tabular-nums">
                                KES {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <button
                            onClick={() => setShowPayment(true)}
                            disabled={cart.length === 0}
                            className="w-full py-3.5 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm shadow-sm"
                        >
                            {cart.length === 0
                                ? (giftCardsToSell.length > 0 ? 'Add an item to check out with this gift card' : t('pos.cart.checkoutEmpty'))
                                : `${t('pos.cart.checkout')}  ·  KES ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                        </button>
                        {cart.length > 0 && (
                            <button
                                onClick={() => setShowLayaway(true)}
                                className="w-full py-2 rounded-xl font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors text-xs"
                            >
                                Put on layaway instead
                            </button>
                        )}
                    </div>
                </aside>
            </div>

            {/* ══ Modals ══════════════════════════════════════════════════════ */}
            {currentShift === null && (
                <OpenShiftModal onOpen={handleOpenShift} submitting={shiftSubmitting} />
            )}

            {showCloseShift && currentShift && (
                <CloseShiftModal
                    shift={currentShift}
                    onClose={() => setShowCloseShift(false)}
                    onConfirm={handleCloseShift}
                    submitting={shiftSubmitting}
                />
            )}

            {showSellGiftCard && (
                <SellGiftCardModal
                    onClose={() => setShowSellGiftCard(false)}
                    onAdd={(amount) => {
                        setGiftCardsToSell(prev => [...prev, { tempId: `${Date.now()}-${Math.random()}`, amount }]);
                        setShowSellGiftCard(false);
                        toast.success(`Gift card (KES ${amount.toFixed(2)}) added to sale`);
                    }}
                />
            )}

            {mpesaWaiting && (
                <MpesaWaitingModal
                    status={mpesaWaiting.status}
                    resultMessage={mpesaWaiting.resultMessage}
                    onCancel={() => setMpesaWaiting(null)}
                    onRetry={() => { setMpesaWaiting(null); setShowPayment(true); }}
                />
            )}

            <VariantPicker
                style={pickerStyle}
                onClose={() => setPickerStyle(null)}
                onSelect={addVariantToCart}
            />

            <PaymentModal
                isOpen={showPayment}
                onClose={() => setShowPayment(false)}
                total={grandTotal}
                cartDiscount={cartDiscount}
                onCartDiscountChange={val => setCartDiscount(Math.min(100, Math.max(0, parseFloat(val) || 0)))}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                onConfirm={handleConfirmPayment}
                processing={processing}
            />

            <LayawayModal
                isOpen={showLayaway}
                onClose={() => setShowLayaway(false)}
                total={grandTotal}
                onConfirm={handleConfirmLayaway}
                processing={processing}
            />

            {showReceipt && saleDetails && (
                <ReceiptModal
                    sale={saleDetails}
                    onClose={() => setShowReceipt(false)}
                    onPrint={handlePrint}
                />
            )}

            <ToastContainer
                position="bottom-right"
                autoClose={2000}
                hideProgressBar
                theme={theme}
                toastClassName="text-sm font-medium rounded-xl shadow-lg"
            />
        </div>
    );
}
