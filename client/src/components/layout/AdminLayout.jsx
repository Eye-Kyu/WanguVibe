// src/components/layout/AdminLayout.jsx
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';

const AdminLayout = () => {
    return (
        <div className="flex h-screen w-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col">
                <Topbar />
                <main className="flex-1 p-4 overflow-y-auto bg-gray-100 dark:bg-gray-950 transition-colors">
                    <Outlet />
                </main>
            </div>
            <CommandPalette />
        </div>
    );
};

export default AdminLayout;
