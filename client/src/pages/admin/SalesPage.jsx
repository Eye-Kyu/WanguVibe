import { useState, useEffect, useMemo, useCallback } from "react";
import api from "../../api/axiosInstance";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from "xlsx";
import GradientStatCard from "../../components/dashboard/GradientStatCard";
import ErrorState from "../../components/ErrorState";

const ITEMS_PER_PAGE = 10;

const fmt = (n) =>
    Number(n || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const SORT_OPTIONS = [
    { value: "date_desc",   label: "Newest First" },
    { value: "date_asc",    label: "Oldest First" },
    { value: "amount_desc", label: "Amount: High → Low" },
    { value: "amount_asc",  label: "Amount: Low → High" },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

const PAYMENT_LABELS = { mpesa: "M-Pesa", cash: "Cash", card: "Card" };
const PAYMENT_STYLES = {
    mpesa: "bg-green-100 text-green-700",
    cash:  "bg-blue-100 text-blue-700",
    card:  "bg-purple-100 text-purple-700",
};

function PaymentBadge({ method }) {
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${PAYMENT_STYLES[method] || "bg-gray-100 text-gray-700"}`}>
            {PAYMENT_LABELS[method] || method}
        </span>
    );
}

const STATUS_LABELS = { completed: "Completed", partially_returned: "Partially Returned", returned: "Returned" };
const STATUS_STYLES = {
    completed: "bg-gray-100 text-gray-600",
    partially_returned: "bg-amber-100 text-amber-700",
    returned: "bg-red-100 text-red-700",
};

function StatusBadge({ status }) {
    if (!status || status === "completed") return null;
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABELS[status] || status}
        </span>
    );
}

// A sale line item's display name — "Style Name (Size/Color)" — built from
// fields denormalized onto the sale at checkout time (see Sale model), so it
// stays correct even if the style/variant is edited or deleted afterward.
const lineItemName = (item) => `${item.styleName || "Unknown item"} (${item.size}/${item.color})`;

// ─── Sale Detail Modal ───────────────────────────────────────────────────────

const REFUND_DESTINATIONS = [
    { value: "cash", label: "Cash" },
    { value: "original_payment", label: "Original payment method" },
    { value: "store_credit", label: "Store credit" },
];

function SaleModal({ sale, onClose, onReturned }) {
    const [returnQtys, setReturnQtys] = useState({});
    const [destination, setDestination] = useState("cash");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { setReturnQtys({}); setDestination("cash"); }, [sale?._id]);

    if (!sale) return null;

    const hasDiscounts = sale.items.some((i) => (i.discount ?? 0) > 0);
    const isFullyReturned = sale.status === "returned";

    const remainingFor = (item) => item.quantity - (item.returnedQuantity || 0);

    const itemsToReturn = Object.entries(returnQtys)
        .filter(([, qty]) => qty > 0)
        .map(([variantId, qty]) => ({ variant: variantId, quantity: qty }));

    const handleProcessReturn = async () => {
        if (itemsToReturn.length === 0) return;
        setSubmitting(true);
        try {
            const res = await api.post(`/sales/${sale._id}/return`, { items: itemsToReturn, destination });
            toast.success(`Refunded KES ${fmt(res.data.refundAmount)}`);
            setReturnQtys({});
            onReturned(res.data.sale);
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to process return");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-sm shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between shrink-0">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-gray-900">Sale Receipt</h2>
                            <StatusBadge status={sale.status} />
                        </div>
                        <p className="text-xs font-mono text-gray-500 mt-0.5">
                            #{sale._id.toUpperCase()}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-2xl leading-none mt-0.5"
                    >
                        &times;
                    </button>
                </div>

                {/* Meta row */}
                <div className="px-6 py-4 bg-gray-50 grid grid-cols-3 gap-4 text-sm shrink-0">
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Date</p>
                        <p className="font-medium text-gray-800">
                            {new Date(sale.createdAt).toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                            })}
                        </p>
                        <p className="text-xs text-gray-500">
                            {new Date(sale.createdAt).toLocaleTimeString("en-US", {
                                hour: "2-digit", minute: "2-digit",
                            })}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cashier</p>
                        <p className="font-medium text-gray-800">{sale.cashier?.name || "—"}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Payment</p>
                        <PaymentBadge method={sale.paymentMethod} />
                    </div>
                </div>

                {/* Items table */}
                <div className="px-6 py-4 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                                <th className="pb-2 text-left">Item</th>
                                <th className="pb-2 text-right">Qty</th>
                                <th className="pb-2 text-right">Unit Price</th>
                                {hasDiscounts && (
                                    <th className="pb-2 text-right">Disc.</th>
                                )}
                                <th className="pb-2 text-right">Subtotal</th>
                                <th className="pb-2 text-right">Return</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {sale.items.map((item, idx) => {
                                const name  = lineItemName(item);
                                const price = item.unitPrice ?? 0;
                                const disc  = item.discount ?? 0;
                                const subtotal = price * item.quantity * (1 - disc / 100);
                                const remaining = remainingFor(item);

                                return (
                                    <tr key={idx}>
                                        <td className="py-2.5 font-medium text-gray-800">
                                            {name}
                                            {item.returnedQuantity > 0 && (
                                                <span className="block text-[11px] font-normal text-red-500">
                                                    {item.returnedQuantity} returned
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2.5 text-right text-gray-500">{item.quantity}</td>
                                        <td className="py-2.5 text-right text-gray-500">
                                            KES {fmt(price)}
                                        </td>
                                        {hasDiscounts && (
                                            <td className="py-2.5 text-right text-amber-600 text-xs">
                                                {disc > 0 ? `${disc}%` : "—"}
                                            </td>
                                        )}
                                        <td className="py-2.5 text-right font-semibold text-gray-900">
                                            KES {fmt(subtotal)}
                                        </td>
                                        <td className="py-2.5 text-right">
                                            {remaining > 0 ? (
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={remaining}
                                                    placeholder="0"
                                                    value={returnQtys[item.variant?._id] || ""}
                                                    onChange={(e) => {
                                                        const raw = parseInt(e.target.value, 10);
                                                        const qty = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(remaining, raw));
                                                        setReturnQtys((q) => ({ ...q, [item.variant?._id]: qty }));
                                                    }}
                                                    className="w-16 border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-red-200"
                                                />
                                            ) : (
                                                <span className="text-xs text-gray-500">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Totals */}
                <div className="px-6 pb-2 border-t border-gray-100 shrink-0">
                    {sale.cartDiscount > 0 && (
                        <div className="flex justify-between text-sm text-amber-600 py-2">
                            <span>Cart Discount</span>
                            <span>−{sale.cartDiscount}%</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-base py-3 border-t border-gray-200">
                        <span>Total</span>
                        <span>KES {fmt(sale.totalAmount)}</span>
                    </div>
                    {sale.refundedAmount > 0 && (
                        <div className="flex justify-between text-sm text-red-600 pb-3">
                            <span>Refunded</span>
                            <span>−KES {fmt(sale.refundedAmount)}</span>
                        </div>
                    )}
                </div>

                {/* Refund destination — only shown once at least one return qty is entered */}
                {!isFullyReturned && itemsToReturn.length > 0 && (
                    <div className="px-6 pb-3 shrink-0">
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Refund to</label>
                        <div className="flex gap-2">
                            {REFUND_DESTINATIONS.map((d) => {
                                const disabled = d.value === "store_credit" && !sale.customer;
                                return (
                                    <button
                                        key={d.value}
                                        type="button"
                                        disabled={disabled}
                                        title={disabled ? "This sale has no customer on file" : ""}
                                        onClick={() => setDestination(d.value)}
                                        className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                                            destination === d.value
                                                ? "bg-red-600 text-white border-red-600"
                                                : "text-gray-600 border-gray-200 hover:border-red-300"
                                        } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200`}
                                    >
                                        {d.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="px-6 pb-5 shrink-0 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition"
                    >
                        Close
                    </button>
                    {!isFullyReturned && itemsToReturn.length > 0 && (
                        <button
                            onClick={handleProcessReturn}
                            disabled={submitting || (destination === "store_credit" && !sale.customer)}
                            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? "Processing…" : "Process Return"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const SalesPage = () => {
    const [sales, setSales]           = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState(false);
    const [selectedSale, setSelectedSale] = useState(null);
    const [page, setPage]             = useState(1);

    const [search, setSearch]               = useState("");
    const [paymentFilter, setPaymentFilter] = useState("");
    const [startDate, setStartDate]         = useState("");
    const [endDate, setEndDate]             = useState("");
    const [sortBy, setSortBy]               = useState("date_desc");

    // ── Data fetch ────────────────────────────────────────────────────────
    // /sales already carries denormalized items.styleName/size/color/unitPrice
    // plus populated cashier (name) — no separate /styles call needed
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.get("/sales");
            setSales(res.data);
        } catch {
            toast.error("Failed to load sales data");
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Reset to page 1 whenever any filter or sort changes
    useEffect(() => { setPage(1); }, [search, paymentFilter, startDate, endDate, sortBy]);

    // ── Filter + sort ─────────────────────────────────────────────────────
    const filteredSales = useMemo(() => {
        const q = search.trim().toLowerCase();

        const result = sales.filter((sale) => {
            if (paymentFilter && sale.paymentMethod !== paymentFilter) return false;

            const saleDate = new Date(sale.createdAt);
            if (startDate && saleDate < new Date(startDate)) return false;
            if (endDate) {
                // include the full end day by rolling to next day midnight
                const end = new Date(endDate);
                end.setDate(end.getDate() + 1);
                if (saleDate >= end) return false;
            }

            if (q) {
                const matchesId      = sale._id.slice(-6).toLowerCase().includes(q);
                const matchesCashier = sale.cashier?.name?.toLowerCase().includes(q);
                const matchesItem = sale.items.some(
                    (item) => item.styleName?.toLowerCase().includes(q)
                );
                if (!matchesId && !matchesCashier && !matchesItem) return false;
            }

            return true;
        });

        switch (sortBy) {
            case "date_asc":    result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
            case "amount_desc": result.sort((a, b) => b.totalAmount - a.totalAmount); break;
            case "amount_asc":  result.sort((a, b) => a.totalAmount - b.totalAmount); break;
            default:            result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
        }

        return result;
    }, [sales, search, paymentFilter, startDate, endDate, sortBy]);

    const totalPages   = Math.ceil(filteredSales.length / ITEMS_PER_PAGE);
    const currentSales = filteredSales.slice(
        (page - 1) * ITEMS_PER_PAGE,
        page * ITEMS_PER_PAGE
    );

    // ── Summary ───────────────────────────────────────────────────────────
    const summary = useMemo(() => {
        const total = filteredSales.reduce((sum, s) => sum + (s.totalAmount || 0) - (s.refundedAmount || 0), 0);
        const count = filteredSales.length;
        return { total, count, average: count > 0 ? total / count : 0 };
    }, [filteredSales]);

    // ── Helpers ───────────────────────────────────────────────────────────
    const hasFilters = search || paymentFilter || startDate || endDate;

    const clearFilters = () => {
        setSearch(""); setPaymentFilter(""); setStartDate(""); setEndDate("");
    };

    // ── Export — one row per line item so item names are included ──────────
    const handleExport = () => {
        if (!filteredSales.length) {
            toast.info("Nothing to export.");
            return;
        }

        const rows = filteredSales.flatMap((sale) =>
            sale.items.map((item) => ({
                "Sale ID":       sale._id,
                "Date":          new Date(sale.createdAt).toLocaleString(),
                "Item":          item.styleName || "Unknown",
                "Size":          item.size,
                "Color":         item.color,
                "Qty":           item.quantity,
                "Unit Price":    item.unitPrice ?? 0,
                "Item Discount": item.discount > 0 ? `${item.discount}%` : "—",
                "Cart Discount": sale.cartDiscount > 0 ? `${sale.cartDiscount}%` : "—",
                "Payment":       PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod,
                "Sale Total":    sale.totalAmount,
                "Cashier":       sale.cashier?.name || "—",
            }))
        );

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sales");
        XLSX.writeFile(wb, `sales-${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // ── Loading skeleton ──────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="space-y-4 animate-pulse">
                <div className="h-8 bg-gray-200 rounded-lg w-40" />
                <div className="grid grid-cols-3 gap-4">
                    {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
                </div>
                <div className="h-16 bg-gray-200 rounded-xl" />
                <div className="h-64 bg-gray-200 rounded-xl" />
            </div>
        );
    }

    if (error) {
        return <ErrorState message="Failed to load sales data" onRetry={fetchData} />;
    }

    return (
        <div className="space-y-6">
            <ToastContainer position="top-right" autoClose={3000} />

            {/* ── Page header ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sales History</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {sales.length.toLocaleString()} total records
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition"
                >
                    Refresh
                </button>
            </div>

            {/* ── Summary cards ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <GradientStatCard
                    variant="indigo"
                    label="Total Revenue"
                    value={`KES ${fmt(summary.total)}`}
                    sub={hasFilters ? "Filtered results" : "All time"}
                />
                <GradientStatCard
                    variant="violet"
                    label="Transactions"
                    value={summary.count.toLocaleString()}
                    sub={hasFilters ? `of ${sales.length.toLocaleString()} total` : undefined}
                />
                <GradientStatCard
                    variant="emerald"
                    label="Avg Order Value"
                    value={`KES ${fmt(summary.average)}`}
                />
            </div>

            {/* ── Filters ──────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-sm border border-gray-100 shadow-sm p-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[180px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                            Search
                        </label>
                        <input
                            type="text"
                            placeholder="Item name, sale ID, cashier…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                            Payment
                        </label>
                        <select
                            value={paymentFilter}
                            onChange={(e) => setPaymentFilter(e.target.value)}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            <option value="">All Methods</option>
                            <option value="cash">Cash</option>
                            <option value="mpesa">M-Pesa</option>
                            <option value="card">Card</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Sort</label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            {SORT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        {hasFilters && (
                            <button
                                onClick={clearFilters}
                                className="px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition"
                            >
                                Clear filters
                            </button>
                        )}
                        <button
                            onClick={handleExport}
                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition"
                        >
                            Export Excel
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Table ────────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-sm border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                <th className="px-5 py-3">Sale ID</th>
                                <th className="px-5 py-3">Date & Time</th>
                                <th className="px-5 py-3">Items Sold</th>
                                <th className="px-5 py-3">Payment</th>
                                <th className="px-5 py-3">Cashier</th>
                                <th className="px-5 py-3 text-right">Total</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {currentSales.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-gray-500 text-sm">
                                        {hasFilters
                                            ? "No sales match your current filters."
                                            : "No sales recorded yet."}
                                    </td>
                                </tr>
                            ) : (
                                currentSales.map((sale) => {
                                    // Build item name preview directly from denormalized data
                                    const names = sale.items
                                        .map((i) => i.styleName)
                                        .filter(Boolean);
                                    const preview = names.slice(0, 2).join(", ");
                                    const overflow = names.length > 2
                                        ? ` +${names.length - 2} more`
                                        : "";

                                    return (
                                        <tr
                                            key={sale._id}
                                            className="hover:bg-gray-50 transition cursor-pointer"
                                            onClick={() => setSelectedSale(sale)}
                                        >
                                            <td className="px-5 py-3">
                                                <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">
                                                    #{sale._id.slice(-6).toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                                                {new Date(sale.createdAt).toLocaleString("en-US", {
                                                    month: "short", day: "numeric", year: "numeric",
                                                    hour: "2-digit", minute: "2-digit",
                                                })}
                                            </td>
                                            <td className="px-5 py-3 max-w-[220px]">
                                                <p className="font-medium text-gray-800 truncate">
                                                    {preview || "—"}
                                                </p>
                                                {overflow && (
                                                    <p className="text-xs text-gray-500">{overflow}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <PaymentBadge method={sale.paymentMethod} />
                                                    <StatusBadge status={sale.status} />
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-gray-600">
                                                {sale.cashier?.name || "—"}
                                            </td>
                                            <td className="px-5 py-3 text-right font-bold text-gray-900 whitespace-nowrap">
                                                KES {fmt(sale.totalAmount)}
                                            </td>
                                            <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => setSelectedSale(sale)}
                                                    className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold transition"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ───────────────────────────────────────── */}
                {totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                        <span>
                            Showing{" "}
                            <span className="font-medium text-gray-700">
                                {(page - 1) * ITEMS_PER_PAGE + 1}–
                                {Math.min(page * ITEMS_PER_PAGE, filteredSales.length)}
                            </span>{" "}
                            of{" "}
                            <span className="font-medium text-gray-700">
                                {filteredSales.length.toLocaleString()}
                            </span>
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(1)}
                                disabled={page === 1}
                                className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition"
                            >
                                «
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                                disabled={page === 1}
                                className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition"
                            >
                                Prev
                            </button>
                            <span className="px-3 py-1 text-xs">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                                disabled={page === totalPages}
                                className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition"
                            >
                                Next
                            </button>
                            <button
                                onClick={() => setPage(totalPages)}
                                disabled={page === totalPages}
                                className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition"
                            >
                                »
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Sale detail modal ────────────────────────────────────── */}
            <SaleModal
                sale={selectedSale}
                onClose={() => setSelectedSale(null)}
                onReturned={(updatedSale) => {
                    setSelectedSale(updatedSale);
                    setSales((list) => list.map((s) => (s._id === updatedSale._id ? updatedSale : s)));
                }}
            />
        </div>
    );
};

export default SalesPage;
