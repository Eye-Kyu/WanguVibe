import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import BalanceCheckPage from './pages/BalanceCheckPage';
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
import MarginReportPage from './pages/admin/MarginReportPage';
import ForecastPage from './pages/admin/ForecastPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import WebhooksPage from './pages/admin/WebhooksPage';
import ApiKeysPage from './pages/admin/ApiKeysPage';
import RefundsPage from './pages/admin/RefundsPage';
import ExceptionsPage from './pages/admin/ExceptionsPage';
import ApprovalPrompt from './components/ApprovalPrompt';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
//import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';
import './index.css';
// Coral base rules load after Tailwind's preflight so it can't reset them.
import './base.css';




function App() {
  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />
      <ApprovalPrompt />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/balance" element={<BalanceCheckPage />} />
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
          <Route path="margins" element={<MarginReportPage />} />
          <Route path="forecast" element={<ForecastPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="etims" element={<EtimsRetryPage />} />
          <Route path="refunds" element={<RefundsPage />} />
          <Route path="exceptions" element={<ExceptionsPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Routes>

    </>
  );
}

export default App;
