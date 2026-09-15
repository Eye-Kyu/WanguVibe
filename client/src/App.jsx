import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import POSPage from './pages/POSPage';
import AdminLayout from './components/layout/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import SalesPage from './pages/admin/SalesPage';
import StylesPage from './pages/admin/StylesPage';
import UsersPage from './pages/admin/UsersPage';
import CustomersPage from './pages/admin/CustomersPage';
import InventoryPage from './pages/admin/InventoryPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import ShiftsPage from './pages/admin/ShiftsPage';
import GiftCardsPage from './pages/admin/GiftCardsPage';
import EtimsRetryPage from './pages/admin/EtimsRetryPage';
import LayawaysPage from './pages/admin/LayawaysPage';
import SuppliersPage from './pages/admin/SuppliersPage';
import PurchaseOrdersPage from './pages/admin/PurchaseOrdersPage';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
//import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';
import './index.css';




function App() {
  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/pos" element={<ProtectedRoute><POSPage /></ProtectedRoute>} />

        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="styles" element={<StylesPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="shifts" element={<ShiftsPage />} />
          <Route path="giftcards" element={<GiftCardsPage />} />
          <Route path="layaways" element={<LayawaysPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="etims" element={<EtimsRetryPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Routes>

    </>
  );
}

export default App;
