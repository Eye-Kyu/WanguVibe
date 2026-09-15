import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext.jsx';

// Guards a route against unauthenticated access, and optionally against
// the wrong role (e.g. a cashier trying to reach /admin by typing the URL).
const ProtectedRoute = ({ children, adminOnly = false }) => {
    const { token, user } = useContext(AuthContext);

    if (!token) return <Navigate to="/" replace />;
    if (adminOnly && user?.role !== 'admin') return <Navigate to="/pos" replace />;

    return children;
};

export default ProtectedRoute;
