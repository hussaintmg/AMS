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

            {/*
              Sales documents are split by what is being sold: /vehicle-sales
              and /parts-sales. The `category` prop is the only thing that
              differs between the two, and it decides which API namespace every
              screen below talks to.

              These sit apart from the /vehicles and /parts inventory pages on
              purpose. Page access is matched by path prefix, so nesting them
              under the inventory paths would have handed the sales screens to
              anyone who could merely see stock.
            */}
            {/* The parts flow is deliberately shorter than the vehicle one:
                a parts quotation converts straight to an invoice, so the
                parts side has no booking or sales-order screens. */}
            {[
              { base: "vehicle-sales", category: "vehicle", sections: ["quotations", "booking", "orders", "invoices"] },
              { base: "parts-sales", category: "parts", sections: ["quotations", "invoices"] },
            ].flatMap(({ base, category, sections }) => [
              ...sections.map((section) => (
                <Route
                  key={`${base}-${section}`}
                  path={`${base}/${section}`}
                  element={
                    <ProtectedPage path={`/${base}/${section}`}>
                      <Sales section={section} category={category} />
                    </ProtectedPage>
                  }
                />
              )),
              <Route
                key={`${base}-scan`}
                path={`${base}/barcode-scan`}
                element={
                  <ProtectedPage path={`/${base}/barcode-scan`}>
                    <BarcodeScan category={category} />
                  </ProtectedPage>
                }
              />,
              // Removed or renamed sections land somewhere sensible.
              ...(sections.includes("booking")
                ? [<Route key={`${base}-bookings-alias`} path={`${base}/bookings`} element={<Navigate to={`/${base}/booking`} replace />} />]
                : [
                  <Route key={`${base}-booking-gone`} path={`${base}/booking`} element={<Navigate to={`/${base}/quotations`} replace />} />,
                  <Route key={`${base}-bookings-gone`} path={`${base}/bookings`} element={<Navigate to={`/${base}/quotations`} replace />} />,
                  <Route key={`${base}-orders-gone`} path={`${base}/orders`} element={<Navigate to={`/${base}/invoices`} replace />} />,
                ]),
            ])}

            {/* Old links and bookmarks keep working: the plain top-level paths
                and the first /vehicles|/parts layout both land on the current
                screens. */}
            <Route path="vehicles/orders" element={<Navigate to="/vehicle-sales/orders" replace />} />
            <Route path="vehicles/quotations" element={<Navigate to="/vehicle-sales/quotations" replace />} />
            <Route path="vehicles/invoices" element={<Navigate to="/vehicle-sales/invoices" replace />} />
            <Route path="vehicles/booking" element={<Navigate to="/vehicle-sales/booking" replace />} />
            <Route path="vehicles/barcode-scan" element={<Navigate to="/vehicle-sales/barcode-scan" replace />} />
            <Route path="parts/orders" element={<Navigate to="/parts-sales/orders" replace />} />
            <Route path="parts/quotations" element={<Navigate to="/parts-sales/quotations" replace />} />
            <Route path="parts/invoices" element={<Navigate to="/parts-sales/invoices" replace />} />
            <Route path="parts/booking" element={<Navigate to="/parts-sales/booking" replace />} />
            <Route path="parts/barcode-scan" element={<Navigate to="/parts-sales/barcode-scan" replace />} />
            <Route path="orders" element={<Navigate to="/vehicle-sales/orders" replace />} />
            <Route path="quotations" element={<Navigate to="/vehicle-sales/quotations" replace />} />
            <Route path="invoices" element={<Navigate to="/vehicle-sales/invoices" replace />} />
            <Route path="booking" element={<Navigate to="/vehicle-sales/booking" replace />} />
            <Route path="barcode-scan" element={<Navigate to="/vehicle-sales/barcode-scan" replace />} />
            <Route path="sales/orders" element={<Navigate to="/vehicle-sales/orders" replace />} />
            <Route path="sales/quotations" element={<Navigate to="/vehicle-sales/quotations" replace />} />
            <Route path="sales/invoices" element={<Navigate to="/vehicle-sales/invoices" replace />} />
            <Route path="sales/bookings" element={<Navigate to="/vehicle-sales/booking" replace />} />
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
