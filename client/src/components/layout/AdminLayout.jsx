// src/components/layout/AdminLayout.jsx
import { Outlet, useLocation } from 'react-router-dom';
import { ADMIN_NAV_ITEMS } from '../../config/adminNav';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';

// The top bar names the current section, from the same nav config the
// sidebar uses (longest matching path wins, so /admin/sales beats /admin).
const titleFor = (pathname) => {
    const match = ADMIN_NAV_ITEMS
        .filter((item) => pathname === item.to || (!item.end && pathname.startsWith(`${item.to}/`)))
        .sort((a, b) => b.to.length - a.to.length)[0];
    return match?.label ?? 'Dashboard';
};

const AdminLayout = () => {
    const { pathname } = useLocation();
    return (
        <div className="flex h-screen w-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col">
                <Topbar title={titleFor(pathname)} />
                <main className="flex-1 p-4 overflow-y-auto bg-gray-100 dark:bg-gray-950 transition-colors">
                    <Outlet />
                </main>
            </div>
            <CommandPalette />
        </div>
    );
};

export default AdminLayout;
