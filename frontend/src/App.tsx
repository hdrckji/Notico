import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

// Pages
import SupplierDashboard from './pages/SupplierDashboard';
import SupplierLogin from './pages/SupplierLogin';
import EmployeeDashboard from './pages/EmployeeDashboard';
import AdminDashboard from './pages/AdminDashboard';
import NotFound from './pages/NotFound';

function App() {
  const { user } = useAuthStore();

  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/supplier/login" element={<SupplierLogin />} />

        {/* Protected routes */}
        <Route
          path="/supplier/*"
          element={user?.role === 'SUPPLIER' ? <SupplierDashboard /> : <Navigate to="/supplier/login" />}
        />
        <Route
          path="/employee/*"
          element={user?.role === 'EMPLOYEE' ? <EmployeeDashboard /> : <Navigate to="/" />}
        />
        <Route
          path="/admin/*"
          element={user?.role === 'ADMIN' ? <AdminDashboard /> : <Navigate to="/" />}
        />

        {/* Redirect root */}
        <Route path="/" element={<Navigate to={user ? `/${user.role.toLowerCase()}` : '/supplier/login'} />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
