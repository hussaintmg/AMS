/**
 * Main App Component
 * Maintained by Hussain Developer
 * AMS ERP
 */

import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import eventBus from "./utils/eventBus";
import ErrorPopup from "./components/ErrorPopup";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Customers from "./pages/Customers";
import Vehicles from "./pages/Vehicles";
import PartsInventory from "./pages/PartsInventory";
import BarcodeScan from "./pages/BarcodeScan";
import Sales from "./pages/Sales";
import Service from "./pages/Service";
import Reports from "./pages/Reports";
import Employees from "./pages/Employees";
import Leaves from "./pages/Leaves";
import Payroll from "./pages/Payroll";
import Expenses from "./pages/Expenses";
import Ledger from "./pages/Ledger";
import UserManagement from "./pages/UserManagement";
import RoleManagement from "./pages/RoleManagement";
import DepartmentManagement from "./pages/DepartmentManagement";
import StatusManagement from "./pages/StatusManagement";
import WarehouseManagement from "./pages/WarehouseManagement";
import VehicleMasterData from "./pages/VehicleMasterData";
import ServiceMasterData from "./pages/ServiceMasterData";
import LeadMasterData from "./pages/LeadMasterData";
import SalesMasterData from "./pages/SalesMasterData";
import Settings from "./pages/Settings";
import PaymentMethods from "./pages/PaymentMethods";
import Profile from "./pages/Profile";
import DataImport from "./pages/DataImport";
import DispatchReport from "./pages/DispatchReport";
import TableEnhancer from "./components/TableEnhancer";
import MasterDataHub from "./pages/MasterDataHub";
import ServerManagement from "./pages/ServerManagement";
import Logs from "./pages/Logs";
import EmailTemplates from "./pages/EmailTemplates";
import PdfManagement from "./pages/PdfManagement";
import PdfTemplateEditor from "./pages/PdfTemplateEditor";
import NoAccess from "./pages/NoAccess";
import NotificationSettings from "./pages/NotificationSettings";
import SearchResults from "./pages/SearchResults";
import { SearchProvider } from "./context/SearchContext";
import CommandPalette from "./components/CommandPalette";
import { getFirstAllowedPage } from "./utils/permissions";

const ProtectedPage = ({ children }) => {
  const { user, canAccess, effectivePermissions } = useAuth();
  const location = useLocation();
  if (!user) return null;
  const enabledPerms = (effectivePermissions || []).filter(
    (p) => p.canView === true && p.isActive !== false,
  );
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
  if (auth.isSuperAdmin || auth.canAccess("/dashboard")) return <Dashboard />;
  return (
    <Navigate to={getFirstAllowedPage(auth.effectivePermissions)} replace />
  );
};

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  const { effectivePermissions } = useAuth();

  return (
    <SearchProvider>
      <div className="app-layout">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
        <div
          className={`sidebar-overlay ${sidebarOpen ? "active" : ""}`}
          onClick={closeSidebar}
        />
        <Header onMenuClick={toggleSidebar} />
        <CommandPalette />
        <TableEnhancer />
        <main className="main-content">
          <Routes>
            <Route index element={<RootRedirect />} />
            <Route path="dashboard" element={<DashboardRoute />} />
            <Route path="no-access" element={<NoAccess />} />
            <Route
              path="masterdata"
              element={
                <ProtectedPage path="/masterdata">
                  <MasterDataHub />
                </ProtectedPage>
              }
            />
            <Route
              path="master-data"
              element={<Navigate to="/masterdata" replace />}
            />
            <Route
              path="leads"
              element={
                <ProtectedPage path="/leads">
                  <Leads />
                </ProtectedPage>
              }
            />
            <Route
              path="lead-master"
              element={
                <ProtectedPage path="/lead-master">
                  <LeadMasterData />
                </ProtectedPage>
              }
            />
            <Route
              path="sales-master"
              element={
                <ProtectedPage path="/sales-master">
                  <SalesMasterData />
                </ProtectedPage>
              }
            />
            <Route
              path="customers"
              element={
                <ProtectedPage path="/customers">
                  <Customers />
                </ProtectedPage>
              }
            />
            <Route
              path="vehicles"
              element={
                <ProtectedPage path="/vehicles">
                  <Vehicles />
                </ProtectedPage>
              }
            />
            <Route
              path="vehicle-master"
              element={
                <ProtectedPage path="/vehicle-master">
                  <VehicleMasterData />
                </ProtectedPage>
              }
            />
            <Route
              path="warehouses"
              element={
                <ProtectedPage path="/warehouses">
                  <WarehouseManagement />
                </ProtectedPage>
              }
            />
            <Route
              path="parts"
              element={
                <ProtectedPage path="/parts">
                  <PartsInventory />
                </ProtectedPage>
              }
            />
            <Route
              path="barcode-scan"
              element={
                <ProtectedPage path="/barcode-scan">
                  <BarcodeScan />
                </ProtectedPage>
              }
            />
            <Route
              path="orders"
              element={
                <ProtectedPage path="/orders">
                  <Sales section="orders" />
                </ProtectedPage>
              }
            />
            <Route
              path="quotations"
              element={
                <ProtectedPage path="/quotations">
                  <Sales section="quotations" />
                </ProtectedPage>
              }
            />
            <Route
              path="invoices"
              element={
                <ProtectedPage path="/invoices">
                  <Sales section="invoices" />
                </ProtectedPage>
              }
            />
            <Route
              path="booking"
              element={
                <ProtectedPage path="/booking">
                  <Sales section="booking" />
                </ProtectedPage>
              }
            />
            <Route
              path="sales/orders"
              element={<Navigate to="/orders" replace />}
            />
            <Route
              path="sales/quotations"
              element={<Navigate to="/quotations" replace />}
            />
            <Route
              path="sales/invoices"
              element={<Navigate to="/invoices" replace />}
            />
            <Route
              path="sales/bookings"
              element={<Navigate to="/booking" replace />}
            />
            <Route
              path="service/*"
              element={
                <ProtectedPage path="/service">
                  <Service />
                </ProtectedPage>
              }
            />
            <Route
              path="service-master"
              element={
                <ProtectedPage path="/service-master">
                  <ServiceMasterData />
                </ProtectedPage>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedPage path="/reports">
                  <Reports />
                </ProtectedPage>
              }
            />
            <Route
              path="hr/employees"
              element={
                <ProtectedPage path="/hr/employees">
                  <Employees />
                </ProtectedPage>
              }
            />
            <Route
              path="hr/leaves"
              element={
                <ProtectedPage path="/hr/leaves">
                  <Leaves />
                </ProtectedPage>
              }
            />
            <Route
              path="hr/payroll"
              element={
                <ProtectedPage path="/hr/payroll">
                  <Payroll />
                </ProtectedPage>
              }
            />
            <Route
              path="hr/expenses"
              element={
                <ProtectedPage path="/hr/expenses">
                  <Expenses />
                </ProtectedPage>
              }
            />
            <Route
              path="hr/ledger"
              element={
                <ProtectedPage path="/hr/ledger">
                  <Ledger />
                </ProtectedPage>
              }
            />
            <Route
              path="data-import"
              element={
                <ProtectedPage path="/data-import">
                  <DataImport />
                </ProtectedPage>
              }
            />
            <Route
              path="dispatch"
              element={
                <ProtectedPage path="/dispatch">
                  <DispatchReport />
                </ProtectedPage>
              }
            />
            <Route
              path="profile"
              element={
                <ProtectedPage path="/profile">
                  <Profile />
                </ProtectedPage>
              }
            />
            <Route
              path="notification-settings"
              element={<NotificationSettings />}
            />
            <Route
              path="search"
              element={
                <ProtectedPage path="/search">
                  <SearchResults />
                </ProtectedPage>
              }
            />

            {/* Admin Routes */}
            <Route
              path="admin/users"
              element={
                <ProtectedPage path="/admin/users">
                  <UserManagement />
                </ProtectedPage>
              }
            />
            <Route
              path="admin/roles"
              element={
                <ProtectedPage path="/admin/roles">
                  <RoleManagement />
                </ProtectedPage>
              }
            />
            <Route
              path="admin/departments"
              element={
                <ProtectedPage path="/admin/departments">
                  <DepartmentManagement />
                </ProtectedPage>
              }
            />
            <Route
              path="admin/statuses"
              element={
                <ProtectedPage path="/admin/statuses">
                  <StatusManagement />
                </ProtectedPage>
              }
            />
            <Route
              path="payment-methods"
              element={
                <ProtectedPage path="/payment-methods">
                  <PaymentMethods />
                </ProtectedPage>
              }
            />
            <Route
              path="settings"
              element={
                <ProtectedPage path="/settings">
                  <Settings />
                </ProtectedPage>
              }
            />
            <Route
              path="email/*"
              element={
                <ProtectedPage path="/email">
                  <EmailTemplates />
                </ProtectedPage>
              }
            />
            <Route
              path="pdf-management"
              element={
                <ProtectedPage path="/pdf-management">
                  <PdfManagement />
                </ProtectedPage>
              }
            />
            <Route
              path="pdf-management/templates/:id/editor"
              element={
                <ProtectedPage path="/pdf-management">
                  <PdfTemplateEditor />
                </ProtectedPage>
              }
            />
            <Route
              path="server-management"
              element={
                <ProtectedPage path="/server-management">
                  <ServerManagement />
                </ProtectedPage>
              }
            />
            <Route
              path="logs"
              element={
                <ProtectedPage path="/logs">
                  <Logs />
                </ProtectedPage>
              }
            />
            <Route
              path="*"
              element={
                <Navigate
                  to={getFirstAllowedPage(effectivePermissions)}
                  replace
                />
              }
            />
          </Routes>
        </main>
      </div>
    </SearchProvider>
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

    eventBus.on("api:error", handleError);

    return () => {
      eventBus.remove("api:error", handleError);
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
      {globalError && (
        <ErrorPopup error={globalError} onClose={() => setGlobalError(null)} />
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
