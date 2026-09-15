// src/components/layout/Sidebar.jsx
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    IconHome, IconReceipt, IconHanger, IconUsers, IconBox,
    IconClipboard, IconClock, IconGift, IconRefresh, IconUser, IconChevronLeft, IconTag,
    IconPhone, IconCart,
} from '../icons';

const NAV_ITEMS = [
    { to: '/admin', end: true, label: 'Dashboard', Icon: IconHome },
    { to: '/admin/sales', label: 'Sales', Icon: IconReceipt },
    { to: '/admin/styles', label: 'Styles', Icon: IconHanger },
    { to: '/admin/customers', label: 'Customers', Icon: IconUsers },
    { to: '/admin/inventory', label: 'Inventory', Icon: IconBox },
    { to: '/admin/suppliers', label: 'Suppliers', Icon: IconPhone },
    { to: '/admin/purchase-orders', label: 'Purchase Orders', Icon: IconCart },
    { to: '/admin/audit', label: 'Audit Log', Icon: IconClipboard },
    { to: '/admin/shifts', label: 'Shifts', Icon: IconClock },
    { to: '/admin/giftcards', label: 'Gift Cards', Icon: IconGift },
    { to: '/admin/layaways', label: 'Layaways', Icon: IconTag },
    { to: '/admin/etims', label: 'eTIMS Retry', Icon: IconRefresh },
    { to: '/admin/users', label: 'Users', Icon: IconUser },
];

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
        } ${isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`;

    return (
        <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-white border-r p-4 flex flex-col flex-shrink-0 transition-all duration-200`}>
            <div className={`flex items-center mb-6 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                {!collapsed && <h2 className="text-xl font-bold px-1">Admin Panel</h2>}
                <button
                    onClick={toggleCollapsed}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors flex-shrink-0"
                >
                    <IconChevronLeft className={`w-4 h-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
                </button>
            </div>
            <nav className="space-y-1">
                {NAV_ITEMS.map((item) => (
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
