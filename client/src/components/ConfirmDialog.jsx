import { useEffect, useRef } from 'react';

// Was previously copy-pasted verbatim (bar the confirm button's label) across
// six admin pages — extracted here for the same reason ErrorState.jsx was:
// six independent copies is six chances for one to drift, and none of them
// closed on Escape or clicking the backdrop, or carried any ARIA role at
// all, unlike every other modal in this app (VariantPicker, PaymentModal, etc).
export default function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Delete' }) {
    const cancelRef = useRef(null);

    useEffect(() => {
        cancelRef.current?.focus();
        const handler = (e) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onCancel]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
            onClick={onCancel}
            role="presentation"
        >
            <div
                className="bg-white dark:bg-gray-900 rounded-sm shadow-xl p-6 w-80 space-y-4 animate-scale-in"
                onClick={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-label={message}
            >
                <p className="text-gray-800 dark:text-gray-100 text-sm">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        ref={cancelRef}
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-xl text-sm text-white bg-red-600 hover:bg-red-700 transition-colors"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
