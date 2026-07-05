# Phase 4: Frontend Architecture Analysis — AMSERP

> **Document version:** 1.0  
> **Analysis date:** 2026-06-30  
> **Scope:** `frontend/src/` — React SPA for OMODA | JAECOO Auto Management System  
> **Companion doc:** [Phase 3 — Backend API Analysis](./Phase_3_Backend_API_Analysis.md)

---

## Table of Contents

1. [Frontend Overview](#1-frontend-overview)
2. [Application Entry Point](#2-application-entry-point)
3. [Routing Analysis](#3-routing-analysis)
4. [Page Inventory](#4-page-inventory)
5. [Layout Analysis](#5-layout-analysis)
6. [Component Analysis](#6-component-analysis)
7. [State Management](#7-state-management)
8. [Context Providers](#8-context-providers)
9. [Hooks Analysis](#9-hooks-analysis)
10. [API Layer](#10-api-layer)
11. [Authentication Flow](#11-authentication-flow)
12. [Authorization](#12-authorization)
13. [Forms Analysis](#13-forms-analysis)
14. [Tables & Data Grids](#14-tables--data-grids)
15. [File Upload Analysis](#15-file-upload-analysis)
16. [Theme & Styling](#16-theme--styling)
17. [Dashboard Analysis](#17-dashboard-analysis)
18. [Module-by-Module UI Flow](#18-module-by-module-ui-flow)
19. [UI Dependency Graph](#19-ui-dependency-graph)
20. [Frontend Health Assessment](#20-frontend-health-assessment)
21. [Responsive Design Review](#21-responsive-design-review)
22. [Learning Guide](#22-learning-guide)
23. [Testing Guide](#23-testing-guide)
24. [Final Summary](#24-final-summary)

---

## 1. Frontend Overview

### 1.1 Stack Summary

| Dimension | Choice |
|-----------|--------|
| **Framework** | React 18.2.0 |
| **Build tool** | Create React App 5.0.1 (react-scripts) |
| **Language** | Plain JavaScript (JSX) — **no TypeScript** |
| **Routing** | React Router DOM v6.21.3 (`BrowserRouter` with v6.4+ data APIs) |
| **HTTP client** | Axios 1.6.2 |
| **State management** | None (single `AuthContext` via React Context; all other state is local) |
| **CSS** | Custom CSS with CSS custom properties (no Tailwind, no Bootstrap, no MUI) |
| **Icons** | `@heroicons/react` v2.1.1 (outline) + Material Icons (via Google Fonts stylesheet) |
| **Charts** | Chart.js 4.4.1 + react-chartjs-2 5.2.0 |
| **Notifications** | react-hot-toast 2.4.1 |
| **Excel/XLSX** | `xlsx` 0.18.5 (client-side parsing for bulk imports) |
| **Printing** | Custom iframe-based print utility |
| **Dev proxy** | CRA proxy (`setupProxy.js`) → `http://localhost:3002` |

### 1.2 Project Statistics

| Metric | Count |
|--------|-------|
| Directories under `src/` | 12 |
| Total source files | 78 |
| Page components | 29 |
| Shared components | 21 |
| Utility modules | 5 |
| Service modules | 2 |
| Custom hooks | 1 |
| Context providers | 1 |
| Constants files | 1 |
| CSS files | 15 |
| Assets (images) | 3 |

### 1.3 Directory Layout

```
frontend/src/
|-- App.js                  # Root component, route definitions
|-- App.css
|-- index.js                # Entry point
|-- index.css               # Global styles (design system tokens)
|-- setupProxy.js           # Dev proxy → localhost:3002
|-- assets/
|   |-- logo.png
|   |-- white_logo.png
|   ``--  icon.png
|-- components/
|   |-- ActionButtons.js
|   |-- BulkUploadModal.js / .css
|   |-- ConfirmModal.js
|   |-- DocumentTemplatesTab.js
|   |-- ErrorPopup.js
|   |-- Header.js
|   |-- InputModal.js
|   |-- Modal.js / .css
|   |-- PrivateRoute.js
|   |-- SearchableSelect.js
|   |-- SearchDropdown.js
|   |-- Sidebar.js
|   |-- Splash.js
|   |-- TableEnhancer.js
|   |-- VehicleBrandingForm.js / .css
|   |-- VehicleBrandingTable.js / .css
|   ``--  sales/
|       |-- CorporateDocumentView.js
|       |-- CorporatePrintHeader.js
|       |-- RenderedHtmlDocumentTemplate.js
|       ``--  SalesFilterBar.js
|-- constants/
|   ``--  bulkImportSamples.js
|-- context/
|   ``--  AuthContext.js
|-- hooks/
|   ``--  useSalesHtmlTemplate.js
|-- pages/
|   |-- Customers.js
|   |-- Dashboard.js
|   |-- DepartmentManagement.js
|   |-- Employees.js
|   |-- Expenses.js
|   |-- LeadMasterData.js
|   |-- Leads.js
|   |-- Leaves.js
|   |-- Ledger.js
|   |-- Login.js
|   |-- MasterDataHub.js
|   |-- OrderFormUpload.js
|   |-- PartsInventory.js
|   |-- Payroll.js
|   |-- Profile.js
|   |-- Reports.js
|   |-- RoleManagement.js
|   |-- Sales.js
|   |-- SalesMasterData.js
|   |-- Service.js
|   |-- ServiceMasterData.js
|   |-- Settings.js
|   |-- StatusManagement.js
|   |-- UserManagement.js
|   |-- VehicleBranding.js
|   |-- VehicleMasterData.js
|   |-- Vehicles.js
|   ``--  WarehouseManagement.js
|-- services/
|   |-- api.js              # Axios instance + 32 API service objects
|   ``--  vehicleBrandingService.js
|-- styles/
|   |-- app.css
|   |-- auth.css
|   |-- dashboard.css
|   |-- dashboard-cards.css
|   |-- dashboard-charts.css
|   |-- dashboard-v2.css
|   |-- pos.css
|   |-- responsive.css
|   |-- sales-print.css
|   |-- tables.css
|   |-- userManagement.css
|   |-- vehicleInventory.css
|   |-- styles.css           # Aggregated import file
|   ``--  (component CSS in components/)  # BulkUploadModal.css, Modal.css, etc.
``--  utils/
    |-- bulkImportClient.js
    |-- documentTemplateRender.js
    |-- eventBus.js
    |-- printSalesModal.js
    ``--  reportsExport.js
```

---

## 2. Application Entry Point

### 2.1 `index.js` — Bootstrap Sequence

```
index.js
  `- createRoot(document.getElementById('root'))
       `- <AuthProvider>              (context/AuthContext.js)
            `- <BrowserRouter>
                 `- <Toaster />        (react-hot-toast — global notifications)
                      `- <App />       (App.js — route definitions)
```

### 2.2 Initialization Details

- **AuthProvider** wraps the entire app, providing `{ user, login, logout, loading, hasRole }` via React Context.
- **Toaster** from `react-hot-toast` renders toast notifications at the document level.
- **BrowserRouter** enables client-side routing.
- Strict Mode (`React.StrictMode`) is **not** used.

### 2.3 Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `REACT_APP_API_URL` | `/api` | Axios base URL |
| `PUBLIC_URL` | (CRA default) | Asset base path |

---

## 3. Routing Analysis

### 3.1 Route Hierarchy

All routes are defined in `App.js` using React Router v6's nested route API:

```
<BrowserRouter>
  <Routes>
    <Route path="/login"       element={<Login />} />            public
    <Route path="/"            element={<AppLayout />}>          protected (Sidebar + Header)
      |-- index                element={<Dashboard />}           dashboard
      |-- leads                element={<Leads />}               CRM
      |-- customers            element={<Customers />}           CRM
      |-- master-data          element={<MasterDataHub />}       master data hub
      |-- lead-master          element={<LeadMasterData />}      master data
      |-- sales-master         element={<SalesMasterData />}     master data
      |-- vehicle-master       element={<VehicleMasterData />}   master data
      |-- service-master       element={<ServiceMasterData />}   master data
      |-- warehouses           element={<WarehouseManagement />} inventory
      |-- admin/users          element={<UserManagement />}      admin
      |-- admin/roles          element={<RoleManagement />}      admin
      |-- admin/departments    element={<DepartmentManagement />} admin
      |-- admin/statuses       element={<StatusManagement />}    admin
      |-- sales/*              element={<Sales />}               sales (nested sub-routes)
      |-- vehicles             element={<Vehicles />}            inventory
      |-- vehicle-branding     element={<VehicleBranding />}     inventory
      |-- parts                element={<PartsInventory />}      inventory
      |-- service              element={<Service />}             service
      |-- service/appointments | /service/job-cards (nested)
      |-- uploader/order-form  element={<OrderFormUpload />}     uploader
      |-- reports              element={<Reports />}             reports
      |-- hr/employees         element={<Employees />}           HR
      |-- hr/payroll           element={<Payroll />}             HR
      |-- hr/leaves            element={<Leaves />}              HR
      |-- hr/expenses          element={<Expenses />}            HR
      |-- hr/ledger            element={<Ledger />}              HR
      |-- settings             element={<Settings />}            settings
      |-- profile              element={<Profile />}             profile
      ``--  *                    element={<Navigate to="/login" />} catch-all
  </Routes>
</BrowserRouter>
```

### 3.2 Sales Sub-Routes

Inside `Sales.js` (rendered at `/sales/*`):

```
<Routes>
  <Route path="quotations" element={<Quotations />} />
  <Route path="bookings"   element={<Bookings />} />
  <Route path="orders"     element={<SalesOrders />} />
  <Route path="invoices"   element={<Invoices />} />
  <Route path="*"          element={<Quotations />} />   default fallback
</Routes>
```

### 3.3 Lazy Loading

All 29 page imports in `App.js` use `React.lazy()`:

```js
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leads = lazy(() => import('./pages/Leads'));
// ... etc.
```

The entire route tree is wrapped in `<Suspense fallback={<div className="spinner" />}>`.

### 3.4 Authentication Guard

`PrivateRoute` (rendered as the `AppLayout` wrapper) checks:
- **Loading state**: shows spinner while session restores
- **No user**: redirects to `/login` (preserves `location.state.from` for post-login redirect)
- **Role mismatch**: redirects to `/` if `allowedRoles` prop is non-empty and user's role is not in the list

The sidebar uses a different authorization mechanism — it **filters nav items** client-side based on `hasRole()`, but does **not** prevent direct URL access to unauthorized pages (that's the route-level `allowedRoles` responsibility).

### 3.5 Route Summary Table

| Route | Page Component | Auth Required | Sidebar Section | Lazy |
|-------|---------------|---------------|-----------------|------|
| `/login` | Login | No | — | Yes |
| `/` | Dashboard | Yes | Main | Yes |
| `/leads` | Leads | Yes | CRM | Yes |
| `/customers` | Customers | Yes | CRM | Yes |
| `/master-data` | MasterDataHub | Yes | Master Data | Yes |
| `/lead-master` | LeadMasterData | Yes | Master Data | Yes |
| `/sales-master` | SalesMasterData | Yes | Master Data | Yes |
| `/vehicle-master` | VehicleMasterData | Yes | Master Data | Yes |
| `/service-master` | ServiceMasterData | Yes | Master Data | Yes |
| `/warehouses` | WarehouseManagement | Yes | Master Data | Yes |
| `/admin/users` | UserManagement | Yes | Master Data | Yes |
| `/admin/roles` | RoleManagement | Yes | Master Data | Yes |
| `/admin/departments` | DepartmentManagement | Yes | Master Data | Yes |
| `/admin/statuses` | StatusManagement | Yes | Master Data | Yes |
| `/sales/*` | Sales (4 sub-pages) | Yes | Sales | Yes |
| `/vehicles` | Vehicles | Yes | Inventory | Yes |
| `/vehicle-branding` | VehicleBranding | Yes | Inventory | Yes |
| `/parts` | PartsInventory | Yes | Inventory | Yes |
| `/service/*` | Service | Yes | Service | Yes |
| `/uploader/order-form` | OrderFormUpload | Yes | Uploader | Yes |
| `/reports` | Reports | Yes | Reports | Yes |
| `/hr/employees` | Employees | Yes | HR & Finance | Yes |
| `/hr/payroll` | Payroll | Yes | HR & Finance | Yes |
| `/hr/leaves` | Leaves | Yes | HR & Finance | Yes |
| `/hr/expenses` | Expenses | Yes | HR & Finance | Yes |
| `/hr/ledger` | Ledger | Yes | HR & Finance | Yes |
| `/settings` | Settings | Yes | ERP Settings | Yes |
| `/profile` | Profile | Yes | (user menu) | Yes |

---

## 4. Page Inventory

### 4.1 Complete Page Listing

| # | File | Route | Lines | Primary API Module | Key Components | Forms | Tables | Charts |
|---|------|-------|-------|--------------------|----------------|-------|--------|--------|
| 1 | `Login.js` | `/login` | 102 | `authAPI` | Splash | Login form | No | No |
| 2 | `Dashboard.js` | `/` | 899 | `dashboardAPI` | StatCard, KPICard | No | Recent leads/sales tables | Line, Doughnut |
| 3 | `Leads.js` | `/leads` | 1047 | `leadAPI` | SearchableSelect, BulkUploadModal, Modal | Lead CRUD | Leads table | No |
| 4 | `Customers.js` | `/customers` | 1014 | `customerAPI` | CustomerModal, ViewCustomerModal, DeleteConfirmModal | Customer CRUD | Customers table | No |
| 5 | `MasterDataHub.js` | `/master-data` | — | `vehicleMasterAPI`, `serviceMasterAPI` | — | No | No | No |
| 6 | `LeadMasterData.js` | `/lead-master` | — | `adminAPI` (statuses) | SearchableSelect | Yes | Yes | No |
| 7 | `SalesMasterData.js` | `/sales-master` | — | `salesAPI` (statuses) | SearchableSelect | Yes | Yes | No |
| 8 | `VehicleMasterData.js` | `/vehicle-master` | — | `vehicleMasterAPI` | SearchableSelect | Makes/Models/Variants/Colors/Suppliers | 5 CRUD tables | No |
| 9 | `ServiceMasterData.js` | `/service-master` | — | `serviceMasterAPI` | SearchableSelect | Types/LaborRates/Packages/Warranties | 4 CRUD tables | No |
| 10 | `WarehouseManagement.js` | `/warehouses` | — | `warehouseAPI` | — | Yes | Yes | No |
| 11 | `UserManagement.js` | `/admin/users` | — | `adminAPI` | — | User CRUD | Yes | No |
| 12 | `RoleManagement.js` | `/admin/roles` | — | `adminAPI` | — | Role + permissions | Yes | No |
| 13 | `DepartmentManagement.js` | `/admin/departments` | — | `adminAPI` | — | Department CRUD | Yes | No |
| 14 | `StatusManagement.js` | `/admin/statuses` | — | `adminAPI` | — | Status CRUD + reorder | Yes | No |
| 15 | `Sales.js` | `/sales/*` | 1600+ | `salesAPI`, `invoiceAPI`, `customerAPI`, `vehicleAPI`, `partsAPI`, `paymentMethodsAPI`, `erpSettingsAPI` | Quotations, Bookings, SalesOrders, Invoices, SalesFilterBar, ActionButtons, ConfirmModal, BulkUploadModal, Modal, CorporateDocumentView, CorporatePrintHeader, RenderedHtmlDocumentTemplate | Quotation/Booking/Order/Invoice forms | 4 data tables | No |
| 16 | `Vehicles.js` | `/vehicles` | 796 | `vehicleAPI`, `adminAPI` | SearchableSelect, ActionButtons, BulkUploadModal, ErrorPopup | Vehicle CRUD | Vehicles table | No |
| 17 | `VehicleBranding.js` | `/vehicle-branding` | — | `vehicleBrandingService` | VehicleBrandingForm, VehicleBrandingTable | Brand CRUD | Brands table | No |
| 18 | `PartsInventory.js` | `/parts` | — | `partsAPI` | SearchableSelect, Modal | Parts CRUD + stock adjust | Parts table | No |
| 19 | `Service.js` | `/service/*` | — | `serviceAPI` | — | Appointment + JobCard CRUD | 2 tables | No |
| 20 | `OrderFormUpload.js` | `/uploader/order-form` | — | `ofCustomerAPI`, `ofProductAPI`, `ofOrderAPI` | — | File upload + order form | Yes | No |
| 21 | `Reports.js` | `/reports` | — | `reportAPI` (legacy), `reportsAPI` | — | Report config | Yes (results) | No |
| 22 | `Settings.js` | `/settings` | 1201 | `erpSettingsAPI`, `paymentMethodsAPI` | DocumentTemplatesTab, Modal, ActionButtons, StatCard | Companies, Branches, Settings, Currencies, Taxes, Document Templates, Payment Methods | 6+ tables | No |
| 23 | `Profile.js` | `/profile` | — | `profileAPI` | — | Profile edit | No | No |
| 24 | `Employees.js` | `/hr/employees` | — | `employeeAPI` | — | Employee CRUD | Yes | No |
| 25 | `Payroll.js` | `/hr/payroll` | — | `payrollAPI` | — | Period mgmt, line edits | Payroll periods table | No |
| 26 | `Leaves.js` | `/hr/leaves` | — | `leavesAPI` | — | Leave request + approval | Leave requests table | No |
| 27 | `Expenses.js` | `/hr/expenses` | — | `expensesAPI` | — | Expense CRUD + categories | Expenses table | No |
| 28 | `Ledger.js` | `/hr/ledger` | — | `ledgerAPI` | — | No | General ledger table | No |
| 29 | `Service.js` | (`/service/appointments`, `/service/job-cards`) | — | `serviceAPI` | — | Appointment + JobCard forms | 2 tables | No |

> *Note: Lines marked `—` have not been exhaustively read but follow the same CRUD-table pattern confirmed by the 9 pages analyzed in depth.*

### 4.2 Page Pattern Taxonomy

All 29 pages fall into one of five patterns:

| Pattern | Pages | Characteristics |
|---------|-------|-----------------|
| **CRUD Table** | Leads, Customers, Vehicles, PartsInventory, WarehouseManagement, UserManagement, RoleManagement, DepartmentManagement, StatusManagement, VehicleBranding, All Master Data pages, All HR pages | Data table + search/filter bar + Add/Edit/View/Delete modal per row |
| **Multi-tab CRUD** | Settings, Sales, Service | Tab navigation (sub-routes) with CRUD tables in each tab |
| **Dashboard** | Dashboard | KPI cards, stat cards, charts, activity feed, quick links |
| **File Upload** | OrderFormUpload | File upload form + data display |
| **Auth** | Login, Profile | Login form, profile edit form |

### 4.3 Key Observations

- **Monolithic pages**: Sales.js is the largest at 1600+ lines with 4 sub-components in one file. Dashboard.js is 899 lines. Leads.js is 1047 lines. Customers.js is 1014 lines. Settings.js is 1201 lines.
- **Inline modals**: Most CRUD modals are defined within the page file rather than using a shared Modal component consistently. Leads.js defines its own Modal inline. Customers.js defines 3 inline modals.
- **Duplicate code**: The debounce hook, pagination bar, and filter bar logic are re-implemented in every page.
- **No separation**: Business logic (API calls), presentation (JSX), and form state are all in single component functions.

---

## 5. Layout Analysis

### 5.1 Layout Hierarchy

```
App.js — <AppLayout> (for protected routes)
  |-- <Sidebar>          (left panel, ~250px)
  |     |-- Logo + title
  |     ``--  9 nav sections, 28 items
  |-- <Header>           (top bar)
  |     |-- Menu toggle (mobile hamburger)
  |     |-- Global search (debounced, dropdown results)
  |     |-- Notification bell (placeholder)
  |     ``--  User dropdown (profile, logout)
  ``--  <main>             (content area)
        ``--  <ErrorPopup />       (global error overlay, controlled by eventBus)
             ``--  <Outlet />       (page content)
```

### 5.2 Sidebar (`components/Sidebar.js`)

**Props**: `{ isOpen, onClose }` — mobile toggle via hamburger button in Header.

**Navigation sections** (9 total, 28 items):

| Section | Items |
|---------|-------|
| Main | Dashboard |
| Master Data | Master data overview, Customer/lead master, Sales master data, Vehicle master data, Service master data, Warehouses, Users, Roles, Departments, Statuses, Expense categories (HR), Print templates, Payment methods |
| CRM | Customers |
| Sales | Quotations, Bookings, Sales Orders, Invoices |
| Inventory | Vehicle Branding, Vehicles, Vehicle Parts Inventory |
| Service | Appointments, Job Cards |
| Uploader | Order Form Upload |
| ERP Settings | Settings |
| Reports | Reports |
| HR & Finance | Employees, Payroll, Leaves, Expenses, Ledger |

**Role-based filtering**: Each nav item has a `roles` array. The sidebar calls `hasRole(item.roles)` — if empty array, visible to all authenticated users. This is a **client-side filter only**; route-level protection via `PrivateRoute` with `allowedRoles` is separate.

**Responsive behavior**: The sidebar is hidden on mobile (`<aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>`). The `Header` hamburger button toggles it. `useEffect` auto-closes on route change.

### 5.3 Header (`components/Header.js`)

**Props**: `{ onMenuClick }` — opens mobile sidebar.

**Sections**:
- **Hamburger button** (mobile only)
- **Global search** — input with 500ms debounce, calls `searchAPI.search()`, results displayed in `<SearchDropdown />` component. Click-outside closes dropdown.
- **Notification bell** — placeholder icon (no badge/count logic)
- **User dropdown** — shows avatar (initials), name, role. On click: "My Profile" link + "Logout" button. Clicks `logout()` from `AuthContext`. Uses `window.location.href = '/profile'` (full page navigation, not `useNavigate`).

---

## 6. Component Analysis

### 6.1 Complete Component Inventory

| # | Component | File | Type | Key Props | Used By Pages | Reusability |
|---|-----------|------|------|-----------|---------------|-------------|
| 1 | `SearchableSelect` | `SearchableSelect.js` | UI | `value, onChange, children, className` | Leads, Customers, Sales, Vehicles, Settings, Master Data, HR | High — wrapper around `<select>` |
| 2 | `SearchDropdown` | `SearchDropdown.js` | UI | `results, loading, error, query, onClose` | Header | Low — tightly coupled to global search |
| 3 | `BulkUploadModal` | `BulkUploadModal.js` | UI | `isOpen, onClose, title, description, templateType, onCompleted` | Leads, Sales, Vehicles | High — reusable import dialog |
| 4 | `ErrorPopup` | `ErrorPopup.js` | UI | `error, onClose` | Vehicles | Medium — error overlay |
| 5 | `ConfirmModal` | `ConfirmModal.js` | UI | `isOpen, title, message, onConfirm, onCancel, type` | Sales | High — confirmation dialog |
| 6 | `Modal` | `Modal.js` | UI | `title, children, onClose, overlayClassName` | Sales, Settings, PartsInventory | Medium — generic modal wrapper |
| 7 | `InputModal` | `InputModal.js` | UI | (form input prompt) | Various | Medium |
| 8 | `ActionButtons` | `ActionButtons.js` | UI | `onView, onEdit, onDelete, showView, showEdit, showDelete, extraActions, title` | Sales, Vehicles | Medium — action button group |
| 9 | `TableEnhancer` | `TableEnhancer.js` | UI | (pagination/sort/filter enhancements) | Various | High — table wrapper |
| 10 | `PrivateRoute` | `PrivateRoute.js` | Auth | `allowedRoles` | App.js | High — route guard |
| 11 | `Header` | `Header.js` | Layout | `onMenuClick` | App.js (in AppLayout) | Low — app shell |
| 12 | `Sidebar` | `Sidebar.js` | Layout | `isOpen, onClose` | App.js (in AppLayout) | Low — app shell |
| 13 | `Splash` | `Splash.js` | UI | (none — timed splash screen) | Login | Low |
| 14 | `SalesFilterBar` | `sales/SalesFilterBar.js` | UI | `filters, onFilterChange, onClear, onRefresh, loading, statusOptions, customers, customFilters` | Sales | Low — coupled to sales pages |
| 15 | `CorporateDocumentView` | `sales/CorporateDocumentView.js` | Print | (utility exports: CorpDocTitleBar, CorpDocSection, CorpDocKvTable, CorpDocFinancialTable, CorpDocNotes, formatPKR, etc.) | Sales | Medium — print document layout |
| 16 | `CorporatePrintHeader` | `sales/CorporatePrintHeader.js` | Print | `company` | Sales | Medium — letterhead |
| 17 | `RenderedHtmlDocumentTemplate` | `sales/RenderedHtmlDocumentTemplate.js` | Print | `htmlString` | Sales | Medium — HTML template renderer |
| 18 | `DocumentTemplatesTab` | `DocumentTemplatesTab.js` | UI | (ERP Settings document template CRUD) | Settings | Low — settings page tab |
| 19 | `VehicleBrandingForm` | `VehicleBrandingForm.js` | Form | (brand create/edit form) | VehicleBranding | Low — page-coupled |
| 20 | `VehicleBrandingTable` | `VehicleBrandingTable.js` | Table | (brand list table) | VehicleBranding | Low — page-coupled |
| 21 | `Modal` (inline in Settings.js) | Settings.js | UI | `title, children, onClose, maxWidth` | Settings (only) | Low — duplicated from Modal.js |

### 6.2 Component Dependency Map

```
App.js
  |-- PrivateRoute (wraps all protected routes)
  |-- Header
  |     ``--  SearchDropdown
  |-- Sidebar
  ``--  Pages
        |-- Leads
        |     |-- SearchableSelect
        |     |-- BulkUploadModal
        |     ``--  Modal (inline)
        |-- Sales
        |     |-- SearchableSelect
        |     |-- BulkUploadModal
        |     |-- ConfirmModal
        |     |-- ActionButtons
        |     |-- SalesFilterBar
        |     |-- CorporateDocumentView
        |     |-- CorporatePrintHeader
        |     |-- RenderedHtmlDocumentTemplate
        |     ``--  Modal
        |-- Vehicles
        |     |-- SearchableSelect
        |     |-- ActionButtons
        |     |-- BulkUploadModal
        |     ``--  ErrorPopup
        |-- Settings
        |     |-- SearchableSelect
        |     |-- DocumentTemplatesTab
        |     |-- Modal (inline)
        |     ``--  ActionButtons (inline)
        ``--  (all other pages follow similar patterns)
```

### 6.3 Reusability Assessment

**Well-reused components**: `SearchableSelect`, `BulkUploadModal`, `ConfirmModal`, `ActionButtons`, `PrivateRoute`, `TableEnhancer`.

**Duplicated components**: Modal is implemented in three places (standalone `Modal.js`, inline in `Leads.js`, inline in `Settings.js`). ActionButtons exists as a shared component (`ActionButtons.js`) but Settings.js duplicates it inline. Pagination controls are hand-written in every page.

---

## 7. State Management

### 7.1 Global State

There is exactly **one** global state provider:

- **`AuthContext`** — provides `{ user, login, logout, loading, hasRole }`. Persisted via `localStorage`. No global state management library (Redux, Zustand, MobX, Jotai) is used.

### 7.2 Local State Patterns

All non-auth state is managed via React hooks local to each page component:

| Pattern | Example |
|---------|---------|
| `useState` for form data | `const [formData, setFormData] = useState({...})` |
| `useState` for lists | `const [leads, setLeads] = useState([])` |
| `useState` for loading | `const [loading, setLoading] = useState(true)` |
| `useState` for pagination | `const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 })` |
| `useState` for filters | `const [filters, setFilters] = useState({ search: '', status: '', ... })` |
| `useState` for modals | `const [showModal, setShowModal] = useState(false)` |
| `useState` for selected item | `const [selectedItem, setSelectedItem] = useState(null)` |

### 7.3 Cross-Component Communication

Two mechanisms exist for cross-component communication:

1. **React Context** — `AuthContext` for auth state (user, login, logout)
2. **Custom Event Bus** (`utils/eventBus.js`) — wraps `document.addEventListener/dispatchEvent`:
   - `eventBus.on(event, callback)` — register listener
   - `eventBus.dispatch(event, data)` — emit event
   - `eventBus.remove(event, callback)` — unregister

   Used by the Axios response interceptor to dispatch `api:error` events caught by `App.js`'s `<ErrorPopup />`.

### 7.4 Server State

There is **no server-state caching** (no React Query, SWR, RTK Query). Every API call is made directly in `useEffect` or click handlers. Data is re-fetched after mutations (CRUD operations call load functions again).

---

## 8. Context Providers

### 8.1 `AuthContext`

**File**: `context/AuthContext.js`

**Provider API**:

```js
const { user, login, logout, loading, hasRole } = useAuth();
```

| Value | Type | Description |
|-------|------|-------------|
| `user` | `Object\|null` | Current user: `{ id, email, firstName, lastName, role, role_name, ... }` |
| `login(email, password)` | `async Function` | Calls `authAPI.login()`, stores token + user in `localStorage`, normalizes user shape |
| `logout()` | `Function` | Clears `localStorage`, navigates to `/login` |
| `loading` | `boolean` | True during initial session restore |
| `hasRole(roles[])` | `Function` | Returns `true` if user's role is in the allowed list (empty list → true for all authenticated) |

**Session restore flow**:
```
App mount
  → AuthContext mount
    → loading = true
    → check localStorage for 'token'
      → if found: call authAPI.getProfile()
        → success: set user, loading = false
        → failure: clear token, loading = false
      → if not found: loading = false
```

**User shape normalization**: The context handles the `firstName`/`first_name` and `role`/`role_name` inconsistencies from the backend, providing a normalized `user` object to consumers.

---

## 9. Hooks Analysis

### 9.1 Custom Hooks

**`useSalesHtmlTemplate(documentType, companyId, enabled)`** — `hooks/useSalesHtmlTemplate.js`

Fetches the active HTML print template from ERP Settings for a sales document type.

| Parameter | Type | Description |
|-----------|------|-------------|
| `documentType` | `string` | `'quotation'`, `'booking'`, `'order'`, or `'invoice'` |
| `companyId` | `number\|string\|undefined` | Company scope for template |
| `enabled` | `boolean` | Skips fetch when `false` (default `true`) |

Returns `{ templateHtml, templateLoading }`.

Used by `Sales.js` in the Quotations, Bookings, SalesOrders, and Invoices sub-components.

### 9.2 Inline Custom Hooks (in page files)

Each page that needs debounced search defines its own `useDebounce` hook:

```js
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}
```

This is defined in **3 page files** (Leads.js, Sales.js, and likely others) — a clear code duplication.

### 9.3 React Built-in Hooks Used

| Hook | Usage |
|------|-------|
| `useState` | Form state, lists, loading, modals, filters, pagination, dropdown options |
| `useEffect` | Data fetching on mount, debounced search, side effects (event listeners, intervals) |
| `useCallback` | Memoized fetch functions (stable references for useEffect dependencies) |
| `useMemo` | Chart data/options, computed display values (user name, role checks) |
| `useRef` | AbortController refs, debounce timeout refs, search dropdown refs, performer skip refs |
| `useNavigate` | Programmatic navigation (post-login redirect) |
| `useSearchParams` | Read URL search params (e.g., `?search=...`) |
| `useLocation` | Current pathname for sidebar active state, redirect state |

### 9.4 Custom Hook Pattern Summary

| Hook | Location | Reusable? | Notes |
|------|----------|-----------|-------|
| `useDebounce` | Inline in Leads.js, Sales.js | No (duplicated) | Same implementation in multiple files |
| `useSalesHtmlTemplate` | `hooks/useSalesHtmlTemplate.js` | Yes | Properly extracted |
| `useCompanyLetterhead` | Inline in Sales.js | No | Fetches active company for print headers |
| `fetchAllCustomersForDropdown` | Inline in Sales.js | No | Customers fetch for form dropdowns |

---

## 10. API Layer

### 10.1 Axios Instance (`services/api.js`)

```js
const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL || '/api',
    headers: { 'Content-Type': 'application/json' }
});
```

**Request interceptor**:
- Reads `token` from `localStorage`
- Sets `Authorization: Bearer ${token}` header

**Response interceptor** error handling:
- **401**: clears `localStorage` + redirects to `/login`
- **403**: silently ignored (no toast, no popup)
- **Other errors**: dispatches `api:error` via `eventBus` + shows `toast.error()` unless suppressed
- **404 GET**: toast suppressed (expected empty results)
- **silentBulkImport flag**: all error handling suppressed (bulk imports handle errors per-row)

### 10.2 Complete API Service Modules

32 service objects exporting 218 endpoint functions:

| Service | Endpoints | Base Path |
|---------|-----------|-----------|
| `authAPI` | 4 | `/auth` |
| `dashboardAPI` | 9 | `/dashboard` |
| `leadAPI` | 9 | `/leads` |
| `customerAPI` | 8 | `/customers` |
| `vehicleAPI` | 9 | `/vehicles` |
| `partsAPI` | 8 | `/parts` |
| `warehouseAPI` | 8 | `/warehouses` |
| `salesAPI` | 21 | `/quotations`, `/bookings`, `/sales`, `/sales-master` |
| `invoiceAPI` | 14 | `/invoices` |
| `financeAPI` | 5 | `/invoices`, `/payments` |
| `serviceAPI` | 19 | `/services` |
| `reportsAPI` | 6 | `/reports` |
| `reportAPI` (legacy) | 11 | `/reports` |
| `adminAPI` | 27 | `/admin` |
| `erpSettingsAPI` | 23 | `/erp-settings` |
| `vehicleMasterAPI` | 16 | `/vehicle-master` |
| `serviceMasterAPI` | 17 | `/service-master` |
| `paymentMethodsAPI` | 7 | `/payment-methods` |
| `profileAPI` | 2 | `/profile` |
| `searchAPI` | 1 | `/search` |
| `ofCustomerAPI` | 5 | `/of-customers` |
| `ofProductAPI` | 5 | `/of-products` |
| `ofOrderAPI` | 8 | `/of-orders` |
| `employeeAPI` | 5 | `/employees` |
| `payrollAPI` | 6 | `/payroll` |
| `leavesAPI` | 5 | `/leaves` |
| `expensesAPI` | 7 | `/expenses` |
| `ledgerAPI` | 1 | `/ledger` |

### 10.3 Proxy Configuration (`setupProxy.js`)

```js
// /api → http://localhost:3002 (development only)
```

All API requests during development are proxied from the CRA dev server (port 3000) to the backend (port 3002).

---

## 11. Authentication Flow

### 11.1 Login Sequence

```
User submits credentials
  → Login.js: handleSubmit()
    → login(email, password)  [AuthContext]
      → authAPI.login({ email, password })
        → POST /api/auth/login
        → response: { token, user }
      → localStorage.setItem('token', token)
      → localStorage.setItem('user', JSON.stringify(user))
      → normalizeUser(user)  [firstName/first_name, role/role_name]
      → setUser(normalized)
    → if success: navigate(from, { replace: true })
    → if error: toast.error(result.message)
```

### 11.2 Session Restore (Page Refresh)

```
App mounts
  → AuthContext mounts
    → restoreSession()
      → token = localStorage.getItem('token')
      → if no token: setUser(null), loading = false
      → if token:
        → authAPI.getProfile()
          → GET /api/auth/me
          → if success: normalizeUser, setUser, loading = false
          → if 401: clear localStorage, setUser(null), loading = false
```

### 11.3 Logout

```js
logout()
  → localStorage.removeItem('token')
  → localStorage.removeItem('user')
  → setUser(null)
  → navigate('/login')
```

### 11.4 Token Storage

- Token stored in `localStorage` under key `'token'`
- User object stored in `localStorage` under key `'user'`
- No refresh token mechanism observed
- No token expiry check on the client side

---

## 12. Authorization

Authorization is implemented at **three layers**:

### 12.1 Route-Level (PrivateRoute)

`PrivateRoute` checks:
1. If `loading` → spinner
2. If `!user` → redirect to `/login` (preserves `location.state.from`)
3. If `allowedRoles.length > 0 && !hasRole(allowedRoles)` → redirect to `/`

Usage in App.js:
```jsx
<Route element={<PrivateRoute allowedRoles={['super_admin']} />}>
    <Route path="admin/users" element={<UserManagement />} />
</Route>
```

### 12.2 Sidebar-Level (Nav Filter)

The sidebar filters nav items based on `hasRole(item.roles)`. Items with empty `roles` array are visible to all authenticated users. This is purely a UX convenience — it does not replace route-level protection.

### 12.3 Page-Level (Inline Role Checks)

Pages perform inline role checks for conditional rendering:

- **Dashboard.js**: `isAdmin` for KPI cards and alerts; `showHrStrip` for HR stats; conditional quick links
- **Sales.js (Quotations)**: `canCreate` and `canEdit` based on `user.role` for button visibility
- **Sales.js (Bookings)**: `canAction` for edit/delete permissions
- **Sidebar**: `hasRole()` for nav item visibility

### 12.4 `hasRole` Implementation

```js
hasRole(allowedRoles) {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    const userRole = (user?.role || user?.role_name || '').toLowerCase();
    return allowedRoles.some(r => r.toLowerCase() === userRole);
}
```

### 12.5 Authorization Gaps

- Page-level `canEdit`/`canCreate` checks use string comparison on `user.role` directly rather than the generic `hasRole()` helper.
- The `hasPermission(module, action)` function exists in AuthContext but is not widely used across pages — most pages use `user.role` string checks instead.
- No permission matrix is enforced client-side beyond role names.

---

## 13. Forms Analysis

### 13.1 Form Library

No form library is used (no Formik, React Hook Form, or any form abstraction). All forms are hand-rolled using plain `<input>`, `<select>`, `<textarea>` elements with `useState` for field values.

### 13.2 Form Pattern (Representative — Leads.js)

```jsx
const [formData, setFormData] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    source_id: '', priority: 'medium', interested_in: '', city: '', notes: ''
});

const handleSubmit = async (e) => {
    e.preventDefault();
    try {
        if (selectedLead) {
            await leadAPI.update(selectedLead.id, formData);
        } else {
            await leadAPI.create(formData);
        }
        handleCloseModal();
        loadLeads();
    } catch (error) {
        toast.error('Operation failed');
    }
};
```

### 13.3 Validation

| Validation Type | Implementation | Frequency |
|----------------|---------------|-----------|
| HTML5 `required` | `required` attribute on inputs | Common |
| Basic empty check | `if (!email \|\| !password)` before submit | Login.js |
| `window.confirm()` | Delete confirmation | Leads.js, Vehicles.js |
| API-side validation | Backend returns errors, displayed via `toast.error()` | All pages |
| No client-side validation library | — | Universal |

### 13.4 Form Submission Pattern

All CRUD forms follow this cycle:
1. User fills fields → `formData` state updated via `onChange`
2. Submit → `e.preventDefault()` → API call (`create` or `update`)
3. Success → `toast.success()`, close modal, reload data
4. Error → `toast.error(error.response?.data?.message)`

### 13.5 Dropdown Select Controls

`SearchableSelect` is a thin wrapper around `<select>` that adds search/filter capability. Used for:
- Status dropdowns
- Source/priority/city filters
- Customer/vehicle/part selection in sales forms
- Make/model/variant cascading selects in vehicle forms

The component receives `value`, `onChange`, `children` (option elements), and optional `className`/`style`/`disabled`.

---

## 14. Tables & Data Grids

### 14.1 Table Implementation

All tables are plain `<table>` elements with CSS styling (class `data-table`). No table library (AG Grid, React Table, MUI Table) is used.

### 14.2 Common Table Pattern

```jsx
<table className="data-table">
    <thead>
        <tr>
            <th>Column A</th>
            <th>Column B</th>
            <th>Actions</th>
        </tr>
    </thead>
    <tbody>
        {data.map(item => (
            <tr key={item.id}>
                <td>{item.fieldA}</td>
                <td>{item.fieldB}</td>
                <td>
                    <ActionButtons
                        onEdit={() => handleEdit(item)}
                        onDelete={() => handleDelete(item.id)}
                    />
                </td>
            </tr>
        ))}
        {data.length === 0 && (
            <tr><td colSpan="3">No records found</td></tr>
        )}
    </tbody>
</table>
```

### 14.3 Pagination

Pagination is implemented **per-page** with no shared component:

```jsx
<div className="pagination-controls">
    <span>Showing X to Y of Z</span>
    <select value={limit} onChange={...}>
        <option>10 per page</option>
        <option>20 per page</option>
        <option>50 per page</option>
    </select>
    <button disabled={page <= 1} onClick={...}>←</button>
    <span>Page {page} of {totalPages}</span>
    <button disabled={page >= totalPages} onClick={...}>→</button>
</div>
```

This block is virtually identical across Leads.js, Sales.js (×4 sub-pages), Vehicles.js, and likely all other pages.

### 14.4 Sort

Client-side sort is not used. Sorting is server-driven via `sort_by` and `sort_order` filter parameters sent to the API.

### 14.5 TableEnhancer Component

`TableEnhancer.js` exists in `components/` but its usage across pages could not be verified in the files read. It likely provides additional table features (column sorting, search, export) as a wrapper.

---

## 15. File Upload Analysis

### 15.1 Bulk Upload Architecture

Bulk uploads are handled **entirely client-side** to avoid 404 errors when the API server hasn't been updated:

```
User selects file (CSV/XLSX)
  → BulkUploadModal
    → parseBulkImportFile(file)   [utils/bulkImportClient.js]
      → XLSX library reads file in browser
      → matrixToObjects(): detect header row → convert to object array
    → runClientBulkImport(templateType, rows)
      → calls individual REST API endpoints per row
      → supports 4 import types:
          - leads        → POST /api/leads (per row)
          - vehicle-brands → POST /api/vehicle-branding (per row)
          - vehicles     → POST /api/vehicles (per row)
          - sales-orders → POST /api/sales/direct (per row)
    → returns { success, summary: { total, created, failed }, errors[] }
```

### 15.2 BulkUploadModal Component

Props:
- `isOpen`, `onClose` — visibility
- `title`, `description` — dialog content
- `templateType` — one of `leads`, `vehicle-brands`, `vehicles`, `sales-orders`
- `onCompleted` — callback after import (refreshes page data)

Features:
- Drag-and-drop zone
- File validation (.csv/.xlsx, max 10MB)
- Downloadable template files from `/public/samples/`
- Row-level error reporting (up to 50 errors shown)
- Spinner during import

### 15.3 Template File Storage

Template sample files are stored in `public/samples/`:
- `bulk-import-leads.csv` / `.xlsx`
- `bulk-import-vehicle-brands.csv` / `.xlsx`
- `bulk-import-vehicles.csv` / `.xlsx`
- `bulk-import-sales-orders.csv` / `.xlsx`

URLs are constructed in `constants/bulkImportSamples.js` using `process.env.PUBLIC_URL`.

### 15.4 Order Form Upload (`OrderFormUpload.js`)

A separate file upload page for processing customer order forms. Uses three API modules (`ofCustomerAPI`, `ofProductAPI`, `ofOrderAPI`) for managing order form data.

---

## 16. Theme & Styling

### 16.1 CSS Architecture

The styling is entirely custom CSS with **no CSS framework**. The design system is defined via CSS custom properties in `index.css`.

**Design tokens** (inferred from usage):

```css
:root {
    /* Primary palette */
    --primary-50: #eff6ff;
    --primary-100: #dbeafe;
    --primary-200: #bfdbfe;
    --primary-500: #3b82f6;
    --primary-600: #2563eb;
    --primary-700: #1d4ed8;

    /* Gray palette */
    --gray-50: #f8fafc;
    --gray-100: #f1f5f9;
    --gray-200: #e2e8f0;
    --gray-500: #64748b;
    --gray-600: #475569;
    --gray-700: #334155;
    --gray-800: #1e293b;

    /* Semantic colors */
    --success-500: #22c55e;
    --warning-500: #f59e0b;
    --error-500: #ef4444;
    --info-500: #3b82f6;

    /* Typography */
    --font-size-xs: 0.75rem;
    --font-size-sm: 0.875rem;

    /* Radii */
    --radius-md: 0.5rem;
    --radius-full: 9999px;

    /* Transitions */
    --transition-fast: 0.15s ease;
}
```

### 16.2 File Organization

| File | Purpose | Lines (approx) |
|------|---------|----------------|
| `index.css` | Global design system, typography, layout, animations | 1500 |
| `app.css` | App-level layout styles | — |
| `auth.css` | Login page styles | — |
| `dashboard.css` | Dashboard page | — |
| `dashboard-v2.css` | Dashboard enhancements | — |
| `dashboard-cards.css` | Stat/KPI card styles | — |
| `dashboard-charts.css` | Chart container styles | — |
| `tables.css` | Data table styles | — |
| `responsive.css` | Media queries | — |
| `sales-print.css` | Print-optimized sales document styles | — |
| `userManagement.css` | User management + ErrorPopup styles | — |
| `vehicleInventory.css` | Vehicle inventory page | — |
| `pos.css` | POS module styles | — |
| `styles.css` | `@import` aggregator for all above | 14 lines |

### 16.3 Component-Level CSS

Some components have their own CSS files:
- `BulkUploadModal.css`
- `Modal.css`
- `VehicleBrandingForm.css`
- `VehicleBrandingTable.css`

### 16.4 Inline Styles

Many pages use inline `style={}` props extensively, particularly for:
- Flexbox layouts (`display: 'flex', gap: '0.75rem'`)
- Spacing (`marginTop: '1rem'`)
- Conditional colors (`color: condition ? 'var(--success-500)' : 'var(--error-500)'`)
- Icon sizing (Heroicons components via `style={{ width: '1.25rem', height: '1.25rem' }}`)

### 16.5 Icon Strategy

Two icon systems are used in parallel:
1. **@heroicons/react** — `import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'`
2. **Material Icons** — `<span className="material-icons">space_dashboard</span>` (loaded via Google Fonts stylesheet)

Leads.js, Customers.js, Sales.js, Settings.js primarily use Heroicons. Dashboard.js primarily uses Material Icons.

### 16.6 Animation

- `@keyframes modalSlideIn` — defined inline in Leads.js (injected via `document.createElement('style')`)
- `@keyframes slideIn` / `@keyframes scaleIn` — defined inline in Customers.js (injected)
- Dashboard buttons: spinning refresh animation
- Chart.js animations: `{ duration: 280 }`

---

## 17. Dashboard Analysis

### 17.1 Data Sources

The Dashboard makes **8 parallel API calls** on mount:

```
dashboardAPI.getStats()                                → stats object
dashboardAPI.getSalesTrend(12)                         → { labels, datasets: { revenue, orders } }
dashboardAPI.getInventoryDistribution()                 → { vehicleStatus: { labels, data } }
dashboardAPI.getActivities(8)                          → activity feed array
dashboardAPI.getRecentLeads()                          → recent leads array
dashboardAPI.getRecentSales()                          → recent sales array
dashboardAPI.getKPIs()         (admin only)            → { revenue, leads, conversionRate }
dashboardAPI.getAlerts()       (admin only)            → alerts array
```

Plus:
```
dashboardAPI.getTopPerformers(period, 5)                → { sales: [], service: [] }
```

### 17.2 Visual Sections

| Section | Data | Visual Treatment |
|---------|------|------------------|
| Welcome banner | User name, date | Header with greeting |
| KPI cards (admin) | Monthly revenue, lead intake, conversion rate | Glassmorphism cards with trend arrows |
| Stat cards | 9-10 metrics (pipeline, customers, vehicles, deliveries, job cards, revenue, orders, appointments, AR, low-stock) | Colored icon cards with formatted values |
| HR & Finance strip | Employees, leaves, payroll, expenses | Sub-section with quick links |
| Revenue trend chart | 12-month revenue | Line chart (Chart.js) |
| Inventory mix chart | Vehicle status distribution | Doughnut chart (Chart.js) |
| Recent leads table | 6 most recent leads | Compact inline table |
| Recent sales orders table | 6 most recent orders | Compact inline table |
| Activity feed | 8 recent activities | Timeline list |
| Top performers | Sales/service leaderboard with period toggle | Ranked list with gold/silver/bronze badges |
| Operational alerts (admin) | Warning/danger/info alerts | Styled alert cards |
| Quick shortcuts | 8-10 navigation links | Grid of icon links |

### 17.3 Auto-Refresh

The dashboard re-fetches data every **10 minutes** (600,000ms) via `setInterval`:

```js
useEffect(() => {
    const t = setInterval(() => {
        loadCore(true).then(() => fetchPerformers());
    }, 600000);
    return () => clearInterval(t);
}, [loadCore, fetchPerformers]);
```

### 17.4 Role-Adaptive Rendering

- **Admin roles** (`super_admin`, `admin`, `manager`): see KPI cards, operational alerts, all 10 stat cards, admin quick links
- **Non-admin roles**: see 8 stat cards, recent tables, activity, performers, shortcuts
- **HR-adjacent roles**: see the HR & Finance strip section

---

## 18. Module-by-Module UI Flow

### 18.1 CRM Module (Leads / Customers)

```
Customers Page → customerAPI.getAll() → GET /api/customers
  |-- Search/filter by name/phone/email/type
  |-- Add → Modal → customerAPI.create() → POST /api/customers
  |-- Edit → Modal (prefilled) → customerAPI.update() → PUT /api/customers/:id
  |-- View → Modal → customerAPI.getById() → GET /api/customers/:id
  ``--  Delete → confirm → customerAPI.delete() → DELETE /api/customers/:id

Leads Page → leadAPI.getAll() → GET /api/leads
  |-- Advanced filters (status, source, priority, city, assigned, date range)
  |-- Add/Edit → Modal → leadAPI.create() / leadAPI.update()
  |-- Delete → confirm → leadAPI.delete()
  |-- Export → leadAPI.export() → GET /api/leads/export
  ``--  Bulk upload → BulkUploadModal → runClientBulkImport('leads', file)
```

### 18.2 Sales Module

```
Sales Page (parent)
  |-- Quotations Tab → salesAPI.getQuotations() → GET /api/quotations
  |     |-- Add/Edit → Modal form → salesAPI.createQuotation() / .updateQuotation()
  |     |-- View → Modal (print layout) with template rendering
  |     |-- Delete → ConfirmModal → salesAPI.deleteQuotation()
  |     ``--  Convert to Booking → ConfirmModal → salesAPI.convertQuotation()
  |-- Bookings Tab → salesAPI.getBookings() → GET /api/bookings
  |     |-- Add/Edit → Modal form → salesAPI.createBooking() / .updateBooking()
  |     ``--  View → Modal (print layout) with template rendering
  |-- Sales Orders Tab → salesAPI.getOrders() → GET /api/sales
  |     |-- Add/Edit → Modal form → salesAPI.createDirectOrder() / .updateOrder()
  |     |-- View → Modal (print layout)
  |     |-- Deliver → salesAPI.deliverOrder()
  |     ``--  Generate Invoice → salesAPI.generateInvoice()
  ``--  Invoices Tab → invoiceAPI.getAll() → GET /api/invoices
        |-- Add/Edit → Modal form
        |-- Record Payment → invoiceAPI.recordPayment()
        ``--  View → Modal (print layout) with template rendering
```

### 18.3 Inventory Module

```
Vehicles Page → vehicleAPI.getAll() → GET /api/vehicles
  |-- Filters: status, make, search (VIN/engine)
  |-- Stats dashboard: totals by status
  |-- Add → Modal form (make→model→variant cascading) → vehicleAPI.create()
  |-- Edit → Modal (prefilled) → vehicleAPI.update()
  |-- Delete → confirm → vehicleAPI.delete()
  |-- Status update → dropdown → vehicleAPI.updateStatus()
  ``--  Bulk upload → BulkUploadModal → runClientBulkImport('vehicles', file)

Parts Page → partsAPI.getAll() → GET /api/parts
  |-- Add/Edit → Modal → partsAPI.create() / .update()
  |-- Stock adjust → partsAPI.adjustStock()
  ``--  Low stock alert → partsAPI.getLowStock()

Vehicle Branding Page → vehicleBrandingService.getAll()
  ``--  CRUD via VehicleBrandingForm + VehicleBrandingTable
```

### 18.4 Service Module

```
Service Page (parent)
  |-- Appointments → serviceAPI.getAppointments()
  |     ``--  CRUD → serviceAPI.create/update/deleteAppointment()
  ``--  Job Cards → serviceAPI.getJobCards()
        |-- CRUD → serviceAPI.create/update/deleteJobCard()
        |-- Add services/parts → serviceAPI.addJobCardService() / .addJobCardPart()
        ``--  Complete → serviceAPI.completeJobCard()
```

### 18.5 HR & Finance Module

```
Employees → employeeAPI.list() → GET /api/employees
Payroll → payrollAPI.listPeriods() → GET /api/payroll/periods
  |-- Generate lines → payrollAPI.generateLines()
  |-- Lock → payrollAPI.lockPeriod()
  ``--  Post → payrollAPI.postPeriod()
Leaves → leavesAPI.listRequests() → GET /api/leaves/requests
  |-- Submit request → leavesAPI.submitRequest()
  ``--  Approve/reject → leavesAPI.setRequestStatus()
Expenses → expensesAPI.listExpenses() → GET /api/expenses/items
  |-- CRUD expenses
  ``--  Post → expensesAPI.postExpense()
Ledger → ledgerAPI.list() → GET /api/ledger
```

### 18.6 Admin Module

```
Users → adminAPI.getUsers()
  |-- CRUD → adminAPI.create/update/deleteUser()
  |-- Toggle status → adminAPI.toggleUserStatus()
  ``--  Assign role/department → adminAPI.assignRole() / .assignDepartment()
Roles → adminAPI.getRoles()
  |-- CRUD → adminAPI.create/update/deleteRole()
  ``--  Permission matrix → adminAPI.updateRolePermissions()
Departments → adminAPI.getDepartments()
  ``--  CRUD + assign manager
Statuses → adminAPI.getStatuses()
  ``--  CRUD + reorder by table
```

### 18.7 Settings Module

```
Settings Page (tabs)
  |-- Companies → erpSettingsAPI.getCompanies()
  |     ``--  CRUD companies
  |-- Branches → erpSettingsAPI.getBranches()
  |     ``--  CRUD branches
  |-- System Settings → erpSettingsAPI.getSettings()
  |     ``--  Update key-value settings
  |-- Currencies → erpSettingsAPI.getCurrencies()
  |     ``--  CRUD currencies
  |-- Taxes → erpSettingsAPI.getTaxes()
  |     ``--  CRUD taxes
  |-- Document Templates → erpSettingsAPI.getDocumentTemplates()
  |     ``--  CRUD HTML templates (quotation/booking/order/invoice)
  ``--  Payment Methods → paymentMethodsAPI.getAll()
        ``--  CRUD + toggle status
```

---

## 19. UI Dependency Graph

### 19.1 Auth Flow Dependencies

```
App.js
  ``--  AuthContext (useContext)
        |-- PrivateRoute (checks user + hasRole)
        |-- Sidebar (calls hasRole for nav filtering)
        |-- Header (calls logout, displays user)
        ``--  Pages (access user for role-based rendering)
```

### 19.2 Sales Module Dependencies (Most Complex)

```
Sales.js
  |-- useSalesHtmlTemplate hook
  |     ``--  erpSettingsAPI.getDocumentTemplateDefault()
  |-- useCompanyLetterhead (inline)
  |     ``--  erpSettingsAPI.getCompanies()
  |-- SearchableSelect component
  |-- SalesFilterBar component
  |-- ActionButtons component
  |-- ConfirmModal component
  |-- BulkUploadModal component
  |-- Modal component
  |-- CorporateDocumentView component
  |     ``--  formatPKR, customerLabelById, resolveQuotationLineItem, etc.
  |-- CorporatePrintHeader component
  |-- RenderedHtmlDocumentTemplate component
  |-- printSalesModal utility
  ``--  renderSalesTemplate utility
        ``--  documentTemplateRender.js
              ``--  buildQuotationTemplateContext / buildBookingTemplateContext / buildOrderTemplateContext / buildInvoiceTemplateContext
```

### 19.3 Leads Data Flow

```
Leads.js
  |-- useDebounce (inline)
  |-- SearchableSelect component
  |-- BulkUploadModal component
  |     ``--  runClientBulkImport util
  |           ``--  parseBulkImportFile util (XLSX)
  |-- Modal (inline)
  ``--  leadAPI service
        |-- leadAPI.getAll() → GET /api/leads
        |-- leadAPI.getFilterOptions() → GET /api/leads/filter-options
        |-- leadAPI.create() → POST /api/leads
        |-- leadAPI.update() → PUT /api/leads/:id
        |-- leadAPI.delete() → DELETE /api/leads/:id
        ``--  leadAPI.export() → GET /api/leads/export
```

### 19.4 Global Event Flow

```
Axios response interceptor (api.js)
  ``--  on error (non-401, non-403):
        ``--  eventBus.dispatch('api:error', { message, resolution, statusCode })
              ``--  App.js listener:
                    ``--  setErrorPopup({ message, resolution })
                          ``--  <ErrorPopup /> renders overlay
```

---

## 20. Frontend Health Assessment

### 20.1 Strengths

| Area | Assessment |
|------|------------|
| **Tech stack** | Modern React 18 with CRA 5, React Router v6, Axios, Chart.js — industry standard |
| **API layer** | Well-structured Axios instance with consistent error handling, interceptors, and organized service objects |
| **Auth flow** | Proper session restore, token management, role-based access control |
| **Bulk import** | Elegant client-side solution that avoids API dependency by parsing XLSX/CSV in the browser |
| **Print system** | Sophisticated iframe-based print system with template interpolation and letterhead support |
| **Dashboard** | 8 parallel API calls, role-adaptive rendering, auto-refresh, professional charting |
| **Icons** | Dual icon system (Heroicons + Material Icons) provides flexibility |
| **CSS** | Custom design system with CSS custom properties |

### 20.2 Observations & Concerns

These are **observations only** — not actionable fix items:

#### Code Organization

| Issue | Example | Impact |
|-------|---------|--------|
| **Monolithic page files** | Sales.js 1600+ lines, Customers.js 1014, Leads.js 1047, Dashboard.js 899, Settings.js 1201 | Poor maintainability; mixing data fetching, UI rendering, business logic in one function |
| **Duplicate inline components** | Modal duplicated in `components/Modal.js`, `Leads.js`, `Settings.js`; ActionButtons duplicated in `components/ActionButtons.js` and inline in Settings.js | Inconsistent behavior, maintenance burden |
| **Duplicate utility hooks** | `useDebounce` defined in 3+ page files | Should be extracted to `hooks/` |
| **Duplicate pagination** | Same pagination HTML/CSS repeated in every page | Estimated 20+ duplications |
| **Duplicate filter bars** | Lead filter bar, sales filter bar, vehicle filter bar — all slightly different | Estimated 10+ duplications |

#### State Management

| Issue | Example | Impact |
|-------|---------|--------|
| **No server state caching** | Every page re-fetches data on mount; no cache layer | Unnecessary network calls, no offline support |
| **No global state beyond auth** | No shared cache for reference data (customers, vehicles, makes, models) | Each page re-fetches the same dropdown data independently |
| **No optimistic updates** | All mutations wait for API response before updating UI | Perceived latency on CRUD operations |

#### Validation & Error Handling

| Issue | Example | Impact |
|-------|---------|--------|
| **No form validation library** | Only HTML5 `required` + basic checks | Inconsistent validation UX, no real-time feedback |
| **`window.confirm()` for deletes** | Leads.js:258, Vehicles.js:293 | Blocking dialog, no customization |
| **Inline style injection** | Leads.js:1005-1045 injects `<style>` tag on mount | Style leakage, no cleanup on unmount |
| **No loading states per section** | Most pages show full-page spinner | Poor perceived performance for partial content |

#### Type Safety & Testing

| Issue | Impact |
|-------|--------|
| **No TypeScript** | No compile-time type checking; API response shapes are guessed |
| **No unit tests** | No test files found in the frontend |
| **No component tests** | No Storybook or component testing setup |
| **No E2E tests** | No Cypress/Playwright configuration |

#### Miscellaneous

| Issue | Example | Impact |
|-------|---------|--------|
| **Full page navigation in SPA** | Header.js uses `window.location.href = '/profile'` (line 145) | Unnecessary full page reload |
| **No error boundaries** | One unhandled JS error crashes entire page | Poor resilience |
| **No accessibility attributes** | ARIA labels, roles, keyboard navigation inconsistent | Poor accessibility |
| **No i18n** | All text hardcoded in English | Internationalization requires code changes |
| **No feature flags** | All features are always visible (role-dependent) | Cannot gradually roll out features |

---

## 21. Responsive Design Review

### 21.1 Breakpoint Strategy

Breakpoints (from `responsive.css` and inline):

| Breakpoint | Target | Changes |
|------------|--------|---------|
| **≤ 1024px** | Tablet landscape | Sidebar collapses (hidden, toggle via hamburger menu). Dashboard grid goes 2-column. |
| **≤ 768px** | Tablet portrait / large phone | Grids become single-column. Stat card grid collapses. Tables become horizontally scrollable. Modal widths adjust. |
| **≤ 480px** | Phone | Further size reduction. Padding/margins shrink. Buttons become full-width. |

### 21.2 Specific Behaviors

- **Sidebar**: Transforms from fixed left panel to overlay drawer with `sidebar-open` class
- **Dashboard layout**: CSS Grid `dashboard-grid` becomes single column
- **Stats grid**: Responsive grid `stats-grid` wraps columns based on available width
- **Tables**: Horizontal scroll on small screens (`overflow-x: auto`)
- **Modals**: `max-width: 90vw` with `padding: 1rem`
- **Filter bars**: Flex-wrap for filter controls

### 21.3 Responsive Concerns

- No mobile-specific navigation pattern (sidebar drawer is the only approach)
- Tables are scrollable but not reflowed (no card layout alternative for small screens)
- Modal forms with 2-column grids collapse to 1-column at 640px (Customers.js)
- No touch-optimized controls (dropdowns, date pickers use native elements)

---

## 22. Learning Guide

### 22.1 Recommended Reading Order

For a developer new to this codebase:

1. **`App.js`** — Understand the high-level route structure and layout
2. **`context/AuthContext.js`** — Understand auth state and session management
3. **`services/api.js`** — See all available API endpoints (218 functions!)
4. **`pages/Leads.js`** — The canonical CRUD page pattern (read all 1047 lines)
5. **`pages/Dashboard.js`** — The most visually complex page with Chart.js
6. **`pages/Sales.js`** — The most architecturally complex page with 4 sub-modules
7. **`components/Sidebar.js`** — Understand the navigation structure and role filtering
8. **`components/BulkUploadModal.js`** + `utils/bulkImportClient.js` — The bulk import pipeline
9. **`utils/documentTemplateRender.js`** + `utils/printSalesModal.js` — The print system
10. **`index.css`** — Design system tokens and global styles

### 22.2 Key Patterns to Understand

**The CRUD Page Pattern** (applies to ~20 pages):
```
1. State: data[], loading, pagination, filters, showModal, formData, selectedItem
2. Effect: fetch data on mount + filter/pagination change
3. Callbacks: loadData(), handleFilter(), handleEdit(), handleDelete(), handleSubmit()
4. Render: page header → stats cards → filter bar → data table → pagination → modal (create/edit/view) → confirm modal (delete)
```

**The Sales Sub-Module Pattern**:
```
1. Parent component provides tab navigation
2. Each sub-component is self-contained with its own data fetching, CRUD, and modal
3. Each sub-component shares common utilities (SalesFilterBar, ActionButtons, DocumentTemplate)
```

### 22.3 Common Gotchas

- `firstName` vs `first_name` — AuthContext normalizes this, but pages may access the raw API response
- `role` vs `role_name` — Same inconsistency; AuthContext provides both
- The Sidebar uses `hasRole()` while pages use direct `user.role` string checks
- Global search uses `searchAPI.search()` — limited to 20 results
- Bulk uploads run client-side — the `silentBulkImport` flag on API calls suppresses global error popups
- The print system creates a hidden iframe — debuggable by inspecting DOM for `#ams-active-sales-print`

---

## 23. Testing Guide

### 23.1 Current State

**No test files exist** in the frontend codebase. There is no test configuration, no test runner setup, and no test scripts in `package.json` beyond CRA defaults (`react-scripts test`).

### 23.2 Suggested Testing Approach

If tests were to be added, the following framework choices would be natural:

| Layer | Framework | Target |
|-------|-----------|--------|
| Unit tests | Jest (bundled with CRA) | Utility functions, API services, hooks |
| Component tests | React Testing Library | Components (SearchableSelect, Modal, BulkUploadModal, etc.) |
| Integration tests | React Testing Library | Page flows (Login, Leads CRUD, Dashboard loading) |
| E2E tests | Playwright or Cypress | Full user journeys (login → view dashboard → CRUD lead → logout) |

### 23.3 What to Test (Priority Order)

1. **AuthContext** — login, logout, session restore, hasRole, normalizeUser
2. **API interceptors** — token injection, 401 redirect, error dispatch
3. **Utility functions** — `parseBulkImportFile`, `renderSalesTemplate`, `exportReportCsv`, `exportReportXlsx`, `calculateOrderGrandTotalFromForm`
4. **Components** — SearchableSelect (search filtering), BulkUploadModal (validation flow), ConfirmModal (button handlers), PrivateRoute (redirects)
5. **Page flows** — Login (success/error), Leads (CRUD cycle), Dashboard (loading → loaded states)

### 23.4 Testability Observations

- **Hard to test**: Pages are large monolithic components with inline API calls and no dependency injection
- **Easy to test**: Utility functions in `utils/` are pure functions with clear inputs/outputs
- **Medium**: Components have clear props but some have side effects (useEffect with API calls)

---

## 24. Final Summary

### 24.1 Architecture Decisions Summary

| Decision | Rationale |
|----------|-----------|
| **CRA + React 18** | Quick bootstrap, no build configuration, broad ecosystem support |
| **No TypeScript** | Faster development velocity (at the cost of type safety) |
| **No state management library** | Auth-only global state; all other state is page-local and doesn't need global sharing |
| **Custom CSS** | Full design control, no framework overhead, small bundle |
| **Client-side bulk import** | Avoids API dependency for file parsing; works even if backend hasn't been updated |
| **Iframe-based printing** | Reliable Chrome print rendering (main-window print with modals often fails) |
| **Custom event bus** | Lightweight Pub/Sub for cross-component communication without adding a dependency |
| **Lazy loading all pages** | Code splitting for faster initial load |

### 24.2 Tech Stack Summary

```
React 18.2 + CRA 5.0
|-- React Router DOM 6.21  (client-side routing)
|-- Axios 1.6              (HTTP)
|-- Chart.js 4.4 + react-chartjs-2 5.2  (dashboard)
|-- @heroicons/react 2.1   (icons)
|-- Material Icons         (icons — via Google Fonts)
|-- react-hot-toast 2.4    (notifications)
|-- xlsx 0.18              (Excel parsing)
``--  Custom CSS             (design system)
```

### 24.3 Backend Integration (Phase 3 Reference)

The frontend consumes all API endpoints documented in Phase 3. Key integration points:

| Phase 3 Module | Frontend Pages | API Services |
|----------------|----------------|-------------|
| Auth | Login, Profile, App (AuthContext) | `authAPI` |
| Dashboard | Dashboard | `dashboardAPI` |
| Leads/CRM | Leads, Customers | `leadAPI`, `customerAPI` |
| Sales | Sales (4 tabs) | `salesAPI`, `invoiceAPI`, `financeAPI` |
| Vehicles | Vehicles, VehicleBranding | `vehicleAPI`, `vehicleBrandingService` |
| Parts | PartsInventory | `partsAPI` |
| Warehouses | WarehouseManagement | `warehouseAPI` |
| Service | Service | `serviceAPI` |
| Reports | Reports | `reportsAPI`, `reportAPI` |
| Admin | UserManagement, RoleManagement, DepartmentManagement, StatusManagement | `adminAPI` |
| ERP Settings | Settings | `erpSettingsAPI`, `paymentMethodsAPI` |
| Vehicle Master | VehicleMasterData | `vehicleMasterAPI` |
| Service Master | ServiceMasterData | `serviceMasterAPI` |
| HR | Employees, Payroll, Leaves, Expenses, Ledger | `employeeAPI`, `payrollAPI`, `leavesAPI`, `expensesAPI`, `ledgerAPI` |
| Order Form Upload | OrderFormUpload | `ofCustomerAPI`, `ofProductAPI`, `ofOrderAPI` |
| Global Search | Header (Header.js) | `searchAPI` |

### 24.4 Known Gaps

- **No TypeScript**: All 78 files are plain JavaScript — no compile-time type safety
- **No state management library**: All non-auth state is local `useState`; no server state caching
- **No test files**: Zero test coverage
- **No form library**: Forms are hand-rolled with `useState` — no validation library
- **No component library**: All UI components (tables, modals, selects, buttons) are custom-built
- **No error boundaries**: Unhandled exceptions crash the entire page
- **No accessibility framework**: ARIA usage is inconsistent
- **No i18n**: All text is hardcoded in English

---

*End of Phase 4 Frontend Architecture Analysis*
