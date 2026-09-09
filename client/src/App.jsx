import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import POSPage from './pages/POSPage';
import AdminLayout from './components/layout/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import SalesPage from './pages/admin/SalesPage';
import StylesPage from './pages/admin/StylesPage';
import UsersPage from './pages/admin/UsersPage';
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
        <Route path="/pos" element={<POSPage />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="styles" element={<StylesPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Routes>

    </>
  );
}

export default App;
