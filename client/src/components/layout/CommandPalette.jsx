import { useState, useEffect, useMemo, useRef, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ADMIN_NAV_ITEMS } from '../../config/adminNav';
import { AuthContext } from '../../context/AuthContext';
import { ThemeContext } from '../../context/ThemeContext';
import { IconSearch, IconSun, IconMoon, IconReceipt, IconUser } from '../icons';

// Ctrl+K (Cmd+K on Mac) opens this from anywhere in the admin panel — the
// admin-panel counterpart to the POS screen's existing F2/Ctrl+B/1-9/Ctrl+Enter
// shortcuts, which the admin side never had despite being used all day by
// the same staff. Reuses ADMIN_NAV_ITEMS (the same list Sidebar.jsx renders)
// rather than a second hardcoded route list, plus a couple of quick actions
// only meaningful here (theme toggle, jump to POS, log out).
export default function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef(null);
    const navigate = useNavigate();
    const { logout } = useContext(AuthContext);
    const { toggleTheme } = useContext(ThemeContext);

    const actions = useMemo(() => [
        ...ADMIN_NAV_ITEMS.map((item) => ({
            id: `nav_${item.to}`,
            label: item.label,
            hint: 'Go to page',
            Icon: item.Icon,
            run: () => navigate(item.to),
        })),
        { id: 'action_pos', label: 'Open POS', hint: 'Action', Icon: IconReceipt, run: () => navigate('/pos') },
        { id: 'action_theme', label: 'Toggle dark/light mode', hint: 'Action', Icon: IconSun, run: () => toggleTheme() },
        { id: 'action_logout', label: 'Log out', hint: 'Action', Icon: IconUser, run: () => { logout(); navigate('/'); } },
    ], [navigate, toggleTheme, logout]);

    const filtered = useMemo(() => {
        if (!query.trim()) return actions;
        const q = query.toLowerCase();
        return actions.filter((a) => a.label.toLowerCase().includes(q));
    }, [actions, query]);

    const close = useCallback(() => {
        setOpen(false);
        setQuery('');
        setActiveIndex(0);
    }, []);

    // Global Ctrl+K / Cmd+K toggle — works from anywhere in the admin panel,
    // not just while the palette itself is focused.
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((v) => !v);
            } else if (e.key === 'Escape' && open) {
                close();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, close]);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [open]);

    useEffect(() => { setActiveIndex(0); }, [query]);

    const runAction = (action) => {
        close();
        action.run();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && filtered[activeIndex]) {
            e.preventDefault();
            runAction(filtered[activeIndex]);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 bg-black/40 animate-fade-in" onClick={close} role="presentation">
            <div
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
            >
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <IconSearch className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Jump to a page or action…"
                        className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    />
                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded-lg">Esc</kbd>
                </div>

                <div className="overflow-y-auto flex-1 py-1">
                    {filtered.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No matches</p>
                    ) : (
                        filtered.map((action, i) => (
                            <button
                                key={action.id}
                                onClick={() => runAction(action)}
                                onMouseEnter={() => setActiveIndex(i)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                    i === activeIndex ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                                }`}
                            >
                                <action.Icon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                <span className="text-sm text-gray-800 dark:text-gray-100 flex-1">{action.label}</span>
                                <span className="text-[10px] text-gray-300 dark:text-gray-600 uppercase tracking-wide">{action.hint}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
