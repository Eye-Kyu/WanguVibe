import { useState, useEffect, useCallback, useMemo, useRef, memo, useContext } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import api from '../api/axiosInstance';
import BarcodeScannerComponent from 'react-qr-barcode-scanner';
import QRCode from 'qrcode';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import businessSettings from '../config/businessSettings';

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
            className={`group relative bg-white rounded-xl border text-left transition-all duration-150 overflow-hidden
                ${outOfStock
                    ? 'border-red-100 bg-red-50/30 opacity-60 cursor-not-allowed'
                    : 'border-gray-200 hover:border-green-400 hover:shadow-md hover:shadow-green-100 active:scale-[0.97] shadow-sm'}`}
        >
            <div className="relative bg-gray-50 aspect-square overflow-hidden">
                {style.images?.[0]
                    ? <img src={style.images[0]} alt={style.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center text-5xl text-gray-200">👗</div>
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
                <p className="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">{style.name}</p>
                {style.styleCode && <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{style.styleCode}</p>}
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-100 flex gap-3 items-center">
                    {style.images?.[0]
                        ? <img src={style.images[0]} alt={style.name} className="w-14 h-14 rounded-lg object-cover border border-gray-100" />
                        : <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-2xl">👗</div>}
                    <div className="min-w-0">
                        <p className="font-bold text-gray-800 text-sm truncate">{style.name}</p>
                        <p className="text-xs text-gray-400">{stylePriceLabel(style)}</p>
                    </div>
                    <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>
                <div className="p-5 space-y-4">
                    {Object.entries(byColor).map(([color, variants]) => (
                        <div key={color}>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{color}</p>
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
                                                    ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                                                    : 'border-gray-200 text-gray-700 hover:border-green-500 hover:text-green-700'}`}
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
                        <p className="text-sm text-gray-400 text-center py-6">No size/color variants set up for this style yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
});
VariantPicker.displayName = 'VariantPicker';

// ─── Cart Line ────────────────────────────────────────────────────────────────
const CartLine = memo(({ item, onQtyChange, onRemove, onDiscountChange, calcTotal }) => (
    <div className="flex gap-2.5 py-3 border-b border-gray-100 last:border-0">
        {item.image
            ? <img src={item.image} alt={item.styleName} className="w-11 h-11 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
            : <div className="w-11 h-11 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300 text-lg">👗</div>
        }
        <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
                <div className="min-w-0 pr-2">
                    <p className="font-medium text-gray-800 text-sm leading-tight truncate">{item.styleName}</p>
                    <p className="text-[10px] text-gray-400">{item.size} / {item.color}</p>
                </div>
                <button
                    onClick={() => onRemove(item.variantId)}
                    className="w-5 h-5 rounded flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500 transition-all flex-shrink-0"
                    aria-label="Remove item"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">KES {item.unitPrice.toFixed(2)} each</p>
            <div className="flex items-center justify-between mt-1.5 gap-2">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onQtyChange(item.variantId, -1)}
                        disabled={item.quantity <= 1}
                        className="w-6 h-6 rounded border border-red-200 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-red-300 text-sm font-bold flex items-center justify-center transition-all"
                    >−</button>
                    <span className="text-sm font-semibold w-6 text-center tabular-nums">{item.quantity}</span>
                    <button
                        onClick={() => onQtyChange(item.variantId, 1)}
                        disabled={item.quantity >= item.stock}
                        className="w-6 h-6 rounded border border-green-300 text-green-600 hover:bg-green-600 hover:text-white hover:border-green-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-green-400 text-sm font-bold flex items-center justify-center transition-all"
                    >+</button>
                </div>
                <div className="flex items-center gap-1">
                    <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.discount}
                        onChange={e => onDiscountChange(item.variantId, e.target.value)}
                        className="w-10 border border-gray-200 rounded px-1 py-0.5 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-green-300"
                    />
                    <span className="text-[11px] text-gray-400">%</span>
                </div>
                <p className="text-sm font-bold text-green-700 tabular-nums">
                    KES {calcTotal(item).toFixed(2)}
                </p>
            </div>
        </div>
    </div>
));
CartLine.displayName = 'CartLine';

// ─── Payment Modal ────────────────────────────────────────────────────────────
const PaymentModal = memo(({ isOpen, onClose, total, cartDiscount, onCartDiscountChange, paymentMethod, onPaymentMethodChange, onConfirm, processing }) => {
    const [tendered, setTendered] = useState('');
    const tenderedNum = parseFloat(tendered) || 0;
    const change = paymentMethod === 'Cash' ? tenderedNum - total : 0;

    useEffect(() => { if (!isOpen) setTendered(''); }, [isOpen]);

    if (!isOpen) return null;

    const quickAmounts = [500, 1000, 2000, 5000].filter(a => a >= total);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="px-5 py-4 bg-green-600 text-white">
                    <p className="text-sm font-medium opacity-80">Amount Due</p>
                    <p className="text-3xl font-black tabular-nums mt-0.5">
                        KES {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Order Discount (%)</label>
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
                                −KES {(total / (1 - cartDiscount / 100) * cartDiscount / 100).toFixed(2)} deducted from order
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Payment Method</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['Cash', 'M-Pesa', 'Card'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => onPaymentMethodChange(m)}
                                    className={`py-3 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all ${paymentMethod === m
                                        ? 'border-green-600 bg-green-600 text-white shadow-sm'
                                        : 'border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-700'}`}
                                >
                                    {m === 'Cash' ? '💵 Cash' : m === 'M-Pesa' ? '📱 M-Pesa' : '💳 Card'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {paymentMethod === 'Cash' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Cash Tendered</label>
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
                                        : 'border-gray-200 focus:ring-green-200'
                                }`}
                                placeholder="0.00"
                                autoFocus
                            />
                            {quickAmounts.length > 0 && (
                                <div className="flex gap-1.5 mt-2">
                                    {quickAmounts.slice(0, 3).map(a => (
                                        <button key={a} onClick={() => setTendered(String(a))}
                                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-green-200 text-green-700 hover:bg-green-50 transition-colors">
                                            {a.toLocaleString()}
                                        </button>
                                    ))}
                                    <button onClick={() => setTendered(String(Math.ceil(total / 50) * 50))}
                                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-green-400 bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                                        Exact
                                    </button>
                                </div>
                            )}
                            {tenderedNum > 0 && change >= 0 && (
                                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl flex justify-between items-center">
                                    <span className="text-sm font-semibold text-green-700">Change to give</span>
                                    <span className="text-xl font-black text-green-700 tabular-nums">KES {change.toFixed(2)}</span>
                                </div>
                            )}
                            {tenderedNum > 0 && change < 0 && (
                                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex justify-between items-center">
                                    <span className="text-sm font-semibold text-red-600">Short by</span>
                                    <span className="text-xl font-black text-red-600 tabular-nums">KES {Math.abs(change).toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-5 pb-5 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={processing || (paymentMethod === 'Cash' && tenderedNum < total)}
                        className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                        {processing ? 'Processing…' : '✓ Confirm Sale'}
                    </button>
                </div>
            </div>
        </div>
    );
});
PaymentModal.displayName = 'PaymentModal';

// ─── Receipt Modal ────────────────────────────────────────────────────────────
const ReceiptModal = memo(({ sale, onClose, onPrint }) => {
    const [qrUrl, setQrUrl] = useState('');

    useEffect(() => {
        if (sale?._id) {
            QRCode.toDataURL(JSON.stringify({ id: sale._id, total: sale.totalAmount, date: sale.createdAt }))
                .then(setQrUrl)
                .catch(() => {});
        }
    }, [sale]);

    if (!sale) return null;

    const subtotal = sale.items?.reduce((s, it) => s + it.unitPrice * it.quantity * (1 - it.discount / 100), 0) || 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
                <div id="receipt-print" className="p-6">
                    <div className="text-center mb-5">
                        <img src={businessSettings.logoPath} alt="Logo" className="w-12 h-12 object-contain mx-auto mb-2" onError={e => e.target.style.display='none'} />
                        <h1 className="font-bold text-base tracking-widest text-gray-800">{businessSettings.name.toUpperCase()}</h1>
                        <p className="text-[11px] text-gray-400">{businessSettings.address}</p>
                    </div>

                    <div className="border-t border-dashed border-gray-200 pt-3 mb-3 font-mono text-[11px] text-gray-500 space-y-0.5">
                        <div className="flex justify-between">
                            <span>Receipt</span>
                            <span className="font-bold text-gray-700">#{sale._id?.slice(-8).toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Date</span>
                            <span>{new Date(sale.createdAt || Date.now()).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Cashier</span>
                            <span>{sale.cashier?.name || 'Unknown'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Payment</span>
                            <span className="font-semibold capitalize">{sale.paymentMethod}</span>
                        </div>
                    </div>

                    <div className="border-t border-dashed border-gray-200 pt-3 mb-3 font-mono text-[11px] space-y-1">
                        {sale.items?.map((item, i) => (
                            <div key={i}>
                                <div className="flex justify-between">
                                    <span className="flex-1 truncate pr-2">{item.styleName} <span className="text-gray-400">({item.size}/{item.color})</span></span>
                                    <span className="font-semibold">KES {(item.unitPrice * item.quantity * (1 - item.discount / 100)).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-400 text-[10px]">
                                    <span>{item.quantity} × KES {item.unitPrice.toFixed(2)}{item.discount > 0 ? ` (−${item.discount}%)` : ''}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-dashed border-gray-200 pt-3 font-mono text-[11px] space-y-0.5">
                        <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>KES {subtotal.toFixed(2)}</span></div>
                        {sale.cartDiscount > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Order Discount ({sale.cartDiscount}%)</span>
                                <span>−KES {(subtotal * sale.cartDiscount / 100).toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-black text-sm text-gray-800 mt-1 pt-1 border-t border-gray-200">
                            <span>TOTAL</span>
                            <span>KES {sale.totalAmount?.toFixed(2)}</span>
                        </div>
                    </div>

                    {qrUrl && (
                        <div className="mt-4 flex justify-center">
                            <img src={qrUrl} alt="QR" className="w-16 h-16" />
                        </div>
                    )}
                    <p className="text-center text-[10px] text-gray-400 mt-3">{businessSettings.receiptFooter}</p>
                </div>

                <div className="flex gap-3 px-5 pb-5">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">Close</button>
                    <button onClick={onPrint} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">🖨️ Print</button>
                </div>
            </div>
        </div>
    );
});
ReceiptModal.displayName = 'ReceiptModal';

// ─── Main POS ─────────────────────────────────────────────────────────────────
export default function POSPage() {
    const { user, logout } = useContext(AuthContext);
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
    const [showReceipt, setShowReceipt] = useState(false);
    const [saleDetails, setSaleDetails] = useState(null);
    const [cartDiscount, setCartDiscount] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [mobileCartOpen, setMobileCartOpen] = useState(false);
    const [pickerStyle, setPickerStyle] = useState(null); // style currently open in the size/color picker

    const searchRef = useRef(null);

    // ── Load all styles (called on mount + after each sale) ──
    const loadStyles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/styles');
            setAllStyles(res.data);
        } catch {
            toast.error('Failed to load styles');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadStyles(); }, [loadStyles]);

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
        if (variant.stock < 1) { toast.error(`${style.name} (${variant.size}/${variant.color}) is out of stock`); return; }
        setCart(prev => {
            const ex = prev.find(i => i.variantId === variant._id);
            if (ex) {
                if (ex.quantity >= variant.stock) {
                    toast.warning(`Only ${variant.stock} unit${variant.stock !== 1 ? 's' : ''} in stock`);
                    return prev;
                }
                return prev.map(i => i.variantId === variant._id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            toast.success(`${style.name} (${variant.size}/${variant.color}) added`, { autoClose: 1000, hideProgressBar: true });
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
    }, []);

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
    const grandTotal = useMemo(() => subtotal * (1 - cartDiscount / 100), [subtotal, cartDiscount]);
    const cartCount  = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

    // ── Quantity change ──
    const changeQty = useCallback((variantId, delta) => {
        setCart(prev => prev.map(item => {
            if (item.variantId !== variantId) return item;
            const newQ = item.quantity + delta;
            if (newQ < 1) return item;
            if (newQ > item.stock) { toast.warning(`Only ${item.stock} in stock`); return item; }
            return { ...item, quantity: newQ };
        }));
    }, []);

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
            toast.error(`No item found for barcode: ${barcode}`);
        }
    }, [resolveBarcode, addVariantToCart]);

    // ── Manual barcode: type in search box + Enter ──
    const handleSearchKeyDown = useCallback(async e => {
        if (e.key !== 'Enter' || !search.trim()) return;
        const match = await resolveBarcode(search.trim());
        if (match) { addVariantToCart(match.style, match.variant); setSearch(''); }
    }, [search, resolveBarcode, addVariantToCart]);

    // ── Confirm payment ──
    const handleConfirmPayment = useCallback(async () => {
        setProcessing(true);
        try {
            const payload = {
                items: cart.map(({ variantId, quantity, discount }) => ({ variant: variantId, quantity, discount })),
                totalAmount: grandTotal,
                cartDiscount,
                paymentMethod,
            };
            const res = await api.post('/sales', payload);
            setSaleDetails(res.data);
            toast.success('Sale completed!');
            setCart([]);
            setCartDiscount(0);
            setShowPayment(false);
            setMobileCartOpen(false);
            setShowReceipt(true);
            loadStyles(); // refresh stock counts
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to complete sale');
        } finally {
            setProcessing(false);
        }
    }, [cart, grandTotal, cartDiscount, paymentMethod, loadStyles]);

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
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden select-none">

            {/* ══ Header ══════════════════════════════════════════════════════ */}
            <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0 z-30 shadow-sm">
                <div className="flex items-center gap-3">
                    <img src={businessSettings.logoPath} alt="Logo" className="w-8 h-8 object-contain rounded"
                        onError={e => { e.target.style.display = 'none'; }} />
                    <div className="leading-tight">
                        <p className="font-black text-gray-800 text-sm">{businessSettings.name}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{businessSettings.tagline}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="hidden lg:flex items-center gap-2 text-[10px] text-gray-400 mr-2">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">F2</kbd><span>search</span>
                        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">1–9</kbd><span>category</span>
                        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">Ctrl+B</kbd><span>scan</span>
                        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">Ctrl+↵</kbd><span>pay</span>
                    </div>

                    <button
                        onClick={() => setMobileCartOpen(v => !v)}
                        className="relative lg:hidden w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        🛒
                        {cartCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                {cartCount > 9 ? '9+' : cartCount}
                            </span>
                        )}
                    </button>

                    <div className="hidden sm:flex items-center gap-2 border-l border-gray-100 pl-3 ml-1">
                        <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">
                            {initials}
                        </div>
                        <div className="hidden md:block leading-tight">
                            <p className="text-xs font-semibold text-gray-800">{user?.name || 'Cashier'}</p>
                            <p className="text-[10px] text-gray-400 capitalize">{user?.role || ''}</p>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded-lg px-2.5 py-1.5 transition-colors ml-1"
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

                    <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex gap-2 flex-shrink-0">
                        <div className="relative flex-1">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder="Search styles or type barcode + Enter… (F2)"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-gray-50 focus:bg-white transition-colors"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
                            )}
                        </div>

                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            className="hidden sm:block border border-gray-200 rounded-xl px-2 py-2 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
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
                                : 'text-gray-600 border-gray-200 hover:border-indigo-300 bg-white'}`}
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
                            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-300 bg-white transition-colors disabled:opacity-40"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>

                    <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-1.5 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
                        {allCats.map((c, idx) => {
                            const count = c === 'all' ? allStyles.length : (categoryCounts[c] || 0);
                            const active = category === c;
                            return (
                                <button
                                    key={c}
                                    onClick={() => setCategory(c)}
                                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border capitalize transition-all ${active
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'text-gray-500 border-gray-200 hover:border-indigo-300 bg-white'}`}
                                >
                                    <span className={`hidden lg:inline text-[10px] font-mono opacity-60 ${active ? 'text-indigo-200' : 'text-gray-400'}`}>{idx + 1}</span>
                                    {c === 'all' ? 'All' : c}
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
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
                            <div className="text-white text-xs space-y-1 hidden md:block">
                                <p className="font-semibold text-indigo-300">📷 Camera Scanner</p>
                                <p className="text-gray-400">Point camera at a garment's barcode</p>
                                <p className="text-gray-500 text-[10px]">Or type it in search + Enter</p>
                                <button onClick={() => setShowScanner(false)} className="mt-2 text-gray-400 hover:text-white text-xs border border-gray-600 rounded px-2 py-1 transition-colors">
                                    Close ✕
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4">
                        {loading && allStyles.length === 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                                {[...Array(12)].map((_, i) => (
                                    <div key={i} className="rounded-xl bg-white border border-gray-100 overflow-hidden animate-pulse">
                                        <div className="aspect-square bg-gray-100" />
                                        <div className="p-2.5 space-y-2">
                                            <div className="h-3 bg-gray-100 rounded-full w-4/5" />
                                            <div className="h-3 bg-gray-100 rounded-full w-1/2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : styles.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-20">
                                <div className="text-5xl mb-4">🔍</div>
                                <p className="font-semibold text-gray-500">No styles found</p>
                                <p className="text-xs text-gray-400 mt-1">
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
                                    <p className="text-xs text-gray-400 mb-3">
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
                    flex-col bg-white lg:w-[360px] xl:w-[400px] border-l border-gray-200
                `}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-gray-800">Current Order</h2>
                            {cartCount > 0 && (
                                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                    {cartCount}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {cart.length > 0 && (
                                <button onClick={() => { setCart([]); setCartDiscount(0); }} className="text-xs text-red-500 hover:text-white hover:bg-red-500 px-2 py-0.5 rounded font-semibold transition-all border border-red-200 hover:border-red-500">
                                    Clear
                                </button>
                            )}
                            <button onClick={() => setMobileCartOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-1">
                        {cart.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center py-16">
                                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <p className="font-semibold text-gray-400 text-sm">Cart is empty</p>
                                <p className="text-xs text-gray-300 mt-1">Tap a style to pick a size/color</p>
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

                    <div className="border-t border-gray-100 px-4 pt-3 pb-4 flex-shrink-0 space-y-3 bg-white">
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between text-gray-500">
                                <span>Subtotal</span>
                                <span className="tabular-nums text-green-700 font-medium">KES {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                            {cartDiscount > 0 && (
                                <div className="flex justify-between text-red-500">
                                    <span>Discount ({cartDiscount}%)</span>
                                    <span className="tabular-nums">−KES {(subtotal * cartDiscount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-baseline border-t border-gray-100 pt-3">
                            <span className="font-bold text-gray-800 text-base">Total</span>
                            <span className="font-black text-xl text-green-700 tabular-nums">
                                KES {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <button
                            onClick={() => setShowPayment(true)}
                            disabled={cart.length === 0}
                            className="w-full py-3.5 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm shadow-sm"
                        >
                            {cart.length === 0 ? 'Add items to checkout' : `Checkout  ·  KES ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                        </button>
                    </div>
                </aside>
            </div>

            {/* ══ Modals ══════════════════════════════════════════════════════ */}
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
                theme="light"
                toastClassName="text-sm font-medium rounded-xl shadow-lg"
            />
        </div>
    );
}
