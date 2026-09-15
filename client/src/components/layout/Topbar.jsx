import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import businessSettings from '../../config/businessSettings';

const Topbar = ({ title = 'Dashboard' }) => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const initials = user?.name
        ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
        : '??';

    return (
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
            <div>
                <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest leading-tight">{businessSettings.name}</p>
                <h1 className="text-lg font-semibold text-gray-800 leading-tight">{title}</h1>
            </div>

            <div className="flex items-center gap-3">
                {/* Avatar + name */}
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center select-none">
                        {initials}
                    </div>
                    <div className="hidden sm:block text-right">
                        <p className="text-sm font-medium text-gray-800 leading-tight">
                            {user?.name || 'User'}
                        </p>
                        <p className="text-xs text-gray-400 capitalize leading-tight">
                            {user?.role || 'unknown'}
                        </p>
                    </div>
                </div>

                {/* Logout */}
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded-xl px-3 py-1.5 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                    </svg>
                    <span className="hidden sm:inline">Logout</span>
                </button>
            </div>
        </header>
    );
};

export default Topbar;
