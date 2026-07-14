/**
 * Main App Component
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 */

import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import eventBus from './utils/eventBus';
import ErrorPopup from './components/ErrorPopup';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Customers from './pages/Customers';
import Vehicles from './pages/Vehicles';
import VehicleBranding from './pages/VehicleBranding';
import PartsInventory from './pages/PartsInventory';
import Sales from './pages/Sales';
import Service from './pages/Service';
import Reports from './pages/Reports';
import Employees from './pages/Employees';
import Leaves from './pages/Leaves';
import Expenses from './pages/Expenses';
import Ledger from './pages/Ledger';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import DepartmentManagement from './pages/DepartmentManagement';
import StatusManagement from './pages/StatusManagement';
import WarehouseManagement from './pages/WarehouseManagement';
import VehicleMasterData from './pages/VehicleMasterData';
import ServiceMasterData from './pages/ServiceMasterData';
import LeadMasterData from './pages/LeadMasterData';
import SalesMasterData from './pages/SalesMasterData';
import Settings from './pages/Settings';
import PaymentMethods from './pages/PaymentMethods';
import Profile from './pages/Profile';
import OrderFormUpload from './pages/OrderFormUpload';
import TableEnhancer from './components/TableEnhancer';
import MasterDataHub from './pages/MasterDataHub';
import ServerManagement from './pages/ServerManagement';
import Logs from './pages/Logs';
import EmailTemplates from './pages/EmailTemplates';
import NoAccess from './pages/NoAccess';
import { getFirstAllowedPage, canViewPage } from './utils/permissions';

const ProtectedPage = ({ children }) => {
    const { user, canAccess, effectivePermissions } = useAuth();
    const location = useLocation();
    if (!user) return null;
    const enabledPerms = (effectivePermissions || []).filter((p) => p.canView === true && p.isActive !== false);
    if (!enabledPerms.length) {
        return <Navigate to="/no-access" replace />;
    }
    if (canAccess(location.pathname)) return children;
    return <Navigate to={getFirstAllowedPage(effectivePermissions)} replace />;
};

// Layout component wrapping authenticated pages
const RootRedirect = () => {
    const { user, effectivePermissions, isSuperAdmin } = useAuth();
    if (!user) return <Navigate to="/login" replace />;
    if (isSuperAdmin) return <Dashboard />;
    return <Navigate to={getFirstAllowedPage(effectivePermissions)} replace />;
};

const DashboardRoute = () => {
    const auth = useAuth();
    if (!auth.user) return null;
    if (auth.isSuperAdmin || auth.canAccess('/dashboard')) return <Dashboard />;
    return <Navigate to={getFirstAllowedPage(auth.effectivePermissions)} replace />;
};

const AppLayout = () => {
    const [sidebarOpen, setSidebarOpen] = React.useState(false);

    const toggleSidebar = () => setSidebarOpen(prev => !prev);
    const closeSidebar = () => setSidebarOpen(false);

    const { effectivePermissions } = useAuth();

    return (
        <div className="app-layout">
            <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
            <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={closeSidebar} />
            <Header onMenuClick={toggleSidebar} />
            <TableEnhancer />
            <main className="main-content">
                <Routes>
                    <Route index element={<RootRedirect />} />
                    <Route path="dashboard" element={<DashboardRoute />} />
                    <Route path="no-access" element={<NoAccess />} />
                    <Route path="master-data" element={<ProtectedPage path="/master-data"><MasterDataHub /></ProtectedPage>} />
                    <Route path="leads" element={<ProtectedPage path="/leads"><Leads /></ProtectedPage>} />
                    <Route path="lead-master" element={<ProtectedPage path="/lead-master"><LeadMasterData /></ProtectedPage>} />
                    <Route path="sales-master" element={<ProtectedPage path="/sales-master"><SalesMasterData /></ProtectedPage>} />
                    <Route path="customers" element={<ProtectedPage path="/customers"><Customers /></ProtectedPage>} />
                    <Route path="vehicle-branding" element={<ProtectedPage path="/vehicle-branding"><VehicleBranding /></ProtectedPage>} />
                    <Route path="vehicles" element={<ProtectedPage path="/vehicles"><Vehicles /></ProtectedPage>} />
                    <Route path="vehicle-master" element={<ProtectedPage path="/vehicle-master"><VehicleMasterData /></ProtectedPage>} />
                    <Route path="warehouses" element={<ProtectedPage path="/warehouses"><WarehouseManagement /></ProtectedPage>} />
                    <Route path="parts" element={<ProtectedPage path="/parts"><PartsInventory /></ProtectedPage>} />
                    <Route path="sales/*" element={<ProtectedPage path="/sales"><Sales /></ProtectedPage>} />
                    <Route path="service/*" element={<ProtectedPage path="/service"><Service /></ProtectedPage>} />
                    <Route path="service-master" element={<ProtectedPage path="/service-master"><ServiceMasterData /></ProtectedPage>} />
                    <Route path="reports" element={<ProtectedPage path="/reports"><Reports /></ProtectedPage>} />
                    <Route path="hr/employees" element={<ProtectedPage path="/hr/employees"><Employees /></ProtectedPage>} />
                    <Route path="hr/leaves" element={<ProtectedPage path="/hr/leaves"><Leaves /></ProtectedPage>} />
                    <Route path="hr/expenses" element={<ProtectedPage path="/hr/expenses"><Expenses /></ProtectedPage>} />
                    <Route path="hr/ledger" element={<ProtectedPage path="/hr/ledger"><Ledger /></ProtectedPage>} />
                    <Route path="uploader/order-form" element={<ProtectedPage path="/uploader/order-form"><OrderFormUpload /></ProtectedPage>} />
                    <Route path="profile" element={<ProtectedPage path="/profile"><Profile /></ProtectedPage>} />

                    {/* Admin Routes */}
                    <Route path="admin/users" element={<ProtectedPage path="/admin/users"><UserManagement /></ProtectedPage>} />
                    <Route path="admin/roles" element={<ProtectedPage path="/admin/roles"><RoleManagement /></ProtectedPage>} />
                    <Route path="admin/departments" element={<ProtectedPage path="/admin/departments"><DepartmentManagement /></ProtectedPage>} />
                    <Route path="admin/statuses" element={<ProtectedPage path="/admin/statuses"><StatusManagement /></ProtectedPage>} />
                    <Route path="payment-methods" element={<ProtectedPage path="/payment-methods"><PaymentMethods /></ProtectedPage>} />
                    <Route path="settings" element={<ProtectedPage path="/settings"><Settings /></ProtectedPage>} />
                    <Route path="email/*" element={<ProtectedPage path="/email"><EmailTemplates /></ProtectedPage>} />
                    <Route path="server-management" element={<ProtectedPage path="/server-management"><ServerManagement /></ProtectedPage>} />
                    <Route path="logs" element={<ProtectedPage path="/logs"><Logs /></ProtectedPage>} />
                    <Route path="*" element={<Navigate to={getFirstAllowedPage(effectivePermissions)} replace />} />
                </Routes>
            </main>
        </div>
    );
};

function App() {
    const { user, loading } = useAuth();
    const [globalError, setGlobalError] = React.useState(null);

    React.useEffect(() => {
        const handleError = (error) => {
            // Only show popup if there is a resolution or it's a critical error (500)
            if (error.resolution || error.statusCode === 500) {
                setGlobalError(error);
            }
        };

        eventBus.on('api:error', handleError);

        return () => {
            eventBus.remove('api:error', handleError);
        };
    }, []);

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="spinner"></div>
            </div>
        );
    }

    // If not logged in, show login page
    if (!user) {
        return (
            <>
                <Toaster position="top-right" />
                {globalError && (
                    <ErrorPopup
                        error={globalError}
                        onClose={() => setGlobalError(null)}
                    />
                )}
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/no-access" element={<NoAccess />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </>
        );
    }

    // User is logged in, show main app
    return (
        <>
            <Toaster position="top-right" />
            {globalError && (
                <ErrorPopup
                    error={globalError}
                    onClose={() => setGlobalError(null)}
                />
            )}
            <Routes>
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/forgot-password" element={<Navigate to="/" replace />} />
                <Route path="/reset-password" element={<Navigate to="/" replace />} />
                <Route path="/*" element={<AppLayout />} />
            </Routes>
        </>
    );
}

export default App;
