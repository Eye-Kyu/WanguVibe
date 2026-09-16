import { IconAlertTriangle } from './icons';

// A real "something went wrong, retry" affordance for a failed fetch —
// replacing the previous behavior across every admin page, where a failed
// load only showed a toast and then silently rendered the same empty-state
// message a genuinely-empty list would show, with no way to tell the two
// apart or retry without a full page reload.
export default function ErrorState({ message = 'Something went wrong', onRetry }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4 animate-fade-in">
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center mb-3">
                <IconAlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{message}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4">Check your connection and try again</p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                >
                    Retry
                </button>
            )}
        </div>
    );
}
