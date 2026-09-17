// src/components/layout/Sidebar.jsx
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { IconChevronLeft } from '../icons';
import { ADMIN_NAV_ITEMS } from '../../config/adminNav';

const STORAGE_KEY = 'adminSidebarCollapsed';

const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    });

    const toggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* per-viewer convenience only */ }
            return next;
        });
    };

    const linkClasses = ({ isActive }) =>
        `flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            collapsed ? 'justify-center px-0' : 'px-3'
        } ${isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`;

    return (
        // h-screen + flex-shrink-0 pins this to the full viewport height as
        // its own independent box; only the <nav> list below scrolls
        // internally (overflow-y-auto) when there are more items than fit,
        // so the sidebar never forces the whole page to scroll and the
        // header/collapse toggle stay pinned in place while the nav list moves.
        <aside className={`${collapsed ? 'w-16' : 'w-64'} h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4 flex flex-col flex-shrink-0 transition-all duration-200`}>
            <div className={`flex items-center mb-6 flex-shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                {!collapsed && <h2 className="text-xl font-bold px-1 text-gray-900 dark:text-gray-100">Admin Panel</h2>}
                <button
                    onClick={toggleCollapsed}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                >
                    <IconChevronLeft className={`w-4 h-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
                </button>
            </div>
            <nav className="space-y-1 flex-1 overflow-y-auto overflow-x-hidden min-h-0 no-scrollbar">
                {ADMIN_NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={linkClasses}
                        title={collapsed ? item.label : undefined}
                    >
                        <item.Icon className="w-5 h-5 flex-shrink-0" />
                        {!collapsed && item.label}
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
};

export default Sidebar;
