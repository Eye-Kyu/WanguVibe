import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { IconBell } from '../icons';

// Unifies three alerts that used to live on separate pages an admin had to
// go looking for (low stock, failed eTIMS submissions, shift discrepancies)
// into one bell-icon feed — purely a client-side aggregation over three
// existing endpoints, no new backend logic. Refreshed periodically rather
// than on every render; none of these conditions change second-to-second.
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

// Same threshold shiftController.js uses to trigger a push notification for
// a shift discrepancy — kept in sync so this in-app feed and that push
// alert agree on what counts as notable, rather than defining "notable"
// twice with two different numbers.
const SHIFT_DISCREPANCY_ALERT_THRESHOLD = 200;

const CATEGORY_LABELS = { low_stock: 'Low Stock', etims: 'eTIMS Retry', shift: 'Shift Discrepancy' };

export default function NotificationCenter() {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const panelRef = useRef(null);

    const fetchAll = useCallback(async () => {
        try {
            const [lowStockRes, etimsRes, shiftsRes] = await Promise.all([
                api.get('/variants/low-stock'),
                api.get('/etims/retry-queue?status=pending&limit=50'),
                // Only the most recent closed shifts are checked — an old
                // discrepancy from months ago isn't an actionable "notification"
                // anymore, and there's no dedicated filtered endpoint for this
                // (a known, accepted v1 limitation, not an oversight).
                api.get('/shifts?limit=20'),
            ]);

            const lowStock = lowStockRes.data.map((v) => ({
                id: `low_stock_${v._id}`,
                category: 'low_stock',
                title: `${v.style?.name || 'Unknown'} (${v.size}/${v.color})`,
                subtitle: v.stock === 0 ? 'Out of stock' : `${v.stock} left`,
                href: '/admin/forecast',
            }));

            const etims = etimsRes.data.entries.map((e) => ({
                id: `etims_${e._id}`,
                category: 'etims',
                title: e.sale ? `Sale KES ${Number(e.sale.totalAmount).toFixed(2)}` : 'Sale no longer exists',
                subtitle: `${e.attempts} attempt${e.attempts !== 1 ? 's' : ''} · ${e.lastError || 'pending retry'}`,
                href: '/admin/etims',
            }));

            const shifts = shiftsRes.data.shifts
                .filter((s) => s.status === 'closed' && Math.abs(s.discrepancy ?? 0) >= SHIFT_DISCREPANCY_ALERT_THRESHOLD)
                .map((s) => ({
                    id: `shift_${s._id}`,
                    category: 'shift',
                    title: `${s.openedBy?.name || 'Cashier'}'s shift`,
                    subtitle: `KES ${Math.abs(s.discrepancy).toFixed(2)} ${s.discrepancy > 0 ? 'over' : 'short'}`,
                    href: '/admin/shifts',
                }));

            setItems([...shifts, ...etims, ...lowStock]);
        } catch {
            // A failed background refresh shouldn't interrupt whatever the
            // admin is doing — the bell just keeps showing its last-known state.
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchAll]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const goTo = (href) => {
        setOpen(false);
        navigate(href);
    };

    return (
        <div className="relative" ref={panelRef}>
            <button
                onClick={() => setOpen((v) => !v)}
                title="Notifications"
                aria-label="Notifications"
                className="relative w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
                <IconBell className="w-4.5 h-4.5" />
                {!loading && items.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                        {items.length > 9 ? '9+' : items.length}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 animate-scale-in origin-top-right">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-semibold text-sm text-gray-800 dark:text-gray-100 sticky top-0 bg-white dark:bg-gray-900">
                        Notifications{items.length > 0 ? ` (${items.length})` : ''}
                    </div>
                    {items.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">All clear — nothing needs attention</p>
                    ) : (
                        <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                            {items.map((n) => (
                                <li key={n.id}>
                                    <button
                                        onClick={() => goTo(n.href)}
                                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">{CATEGORY_LABELS[n.category]}</p>
                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{n.title}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{n.subtitle}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
