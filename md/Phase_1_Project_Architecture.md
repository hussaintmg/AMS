# Phase 1 — Project Architecture Analysis

## Auto Management System (AMS)

**Prepared by:** Phase 1 Architecture Analysis  
**Date:** 2026-06-30  
**Status:** Completed — Phase 1 Only

---

# SECTION 1 — Executive Summary

### What is this project?

**AMS (Auto Management System)** is a full-stack web application designed for automobile dealerships. It combines **Customer Relationship Management (CRM)** and **Enterprise Resource Planning (ERP)** functionality specifically tailored for the automotive industry.

### Estimated Purpose

The software manages the entire lifecycle of vehicle sales, service, inventory, and human resources for an automobile dealership. It is deployed for **OMODA | JAECOO GULBERG**, a car dealership in Lahore, Pakistan. The application handles:

- Lead generation and customer management
- Vehicle inventory and parts inventory
- Sales quotations, bookings, orders, and invoicing
- Service appointments and job cards
- Employee management, payroll, leaves, and expenses
- Warehouse management
- Reports and dashboards
- ERP settings (companies, branches, currencies, taxes)

### High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser                       │
│        (React SPA — Admin Panel)                │
└──────────────────────┬──────────────────────────┘
                       │ HTTP / API
                       ▼
┌─────────────────────────────────────────────────┐
│         React Development Server (Port 3000)    │
│    (react-scripts / Create React App)           │
│    Proxies /api/* -> localhost:3002             │
└──────────────────────┬──────────────────────────┘
                       │ Proxy (dev) / Direct (prod)
                       ▼
┌─────────────────────────────────────────────────┐
│   Express.js API Server (Port 3002)             │
│   +----------+  +---------+ +----------------+  │
│   |Middleware|  | Routes  | | Controllers    |  │
│   | - Auth   |  | - Auth  | | - Vehicle      |  │
│   | - CORS   |  | - Sales | | - Sales        |  │
│   | - Logger |  | - Leads | | - Leads        |  │
│   | - Error  |  | - Admin | | - Admin        |  │
│   +----------+  +---------+ +----------------+  │
└──────────────────────┬──────────────────────────┘
                       │ SQL Queries
                       ▼
┌─────────────────────────────────────────────────┐
│         MySQL Database (MySQL 8.x)              │
│         Database: ams_db                        │
└─────────────────────────────────────────────────┘
```

### Architecture Type

**Monolithic Full-Stack Application** with:
- Separate **frontend** (React SPA) and **backend** (Express.js API)
- Backend uses **inline SQL queries** (no ORM, no query builder)
- Repository pattern partially implemented
- Single server handles all API requests

### Estimated Complexity

**Medium to High** — The application has approximately:
- 25+ backend controllers covering various business domains
- 30+ frontend pages with routing
- 35+ API route files defining endpoints
- 250+ API endpoints (estimated)
- MySQL database with stored procedures and functions

---

# SECTION 2 — Technology Stack

### Programming Languages

| Language | Where | Purpose |
|----------|-------|---------|
| **JavaScript (ES6+)** | Frontend & Backend | Entire application logic |
| **SQL** | `backend/config/database.js` and controller files | Database queries (inline SQL) |
| **HTML5** | `frontend/public/index.html` | SPA shell |
| **CSS3** | `frontend/src/styles/*.css` | Styling |

### Frontend Technologies

| Technology | Version | Purpose | Used In |
|-----------|---------|---------|---------|
| **React** | ^18.2.0 | UI framework for building component-based SPA | `frontend/src/` |
| **React DOM** | ^18.2.0 | React rendering to DOM | `frontend/src/index.js` |
| **React Router DOM** | ^6.21.1 | Client-side routing | `frontend/src/App.js` |
| **React Scripts** | 5.0.1 | Build tooling (Create React App) | `frontend/package.json` |
| **Axios** | ^1.6.2 | HTTP client for API calls | `frontend/src/services/api.js` |
| **Chart.js** | ^4.4.1 | Charting library for dashboards | `frontend/src/pages/Dashboard.js` |
| **React-Chartjs-2** | ^5.2.0 | React wrapper for Chart.js | `frontend/src/pages/Dashboard.js` |
| **React Hot Toast** | ^2.4.1 | Toast notifications | `frontend/src/App.js` and pages |
| **Heroicons React** | ^2.1.1 | SVG icon components | `frontend/src/components/Sidebar.js`, etc. |
| **XLSX** | ^0.18.5 | Excel file reading/writing | `frontend/src/utils/`, `backend/utils/` |
| **http-proxy-middleware** | (implicit) | Dev proxy for /api | `frontend/src/setupProxy.js` |

### Backend Technologies

| Technology | Version | Purpose | Used In |
|-----------|---------|---------|---------|
| **Node.js** | (runtime) | JavaScript runtime | `backend/server.js` |
| **Express.js** | ^4.18.2 | Web framework | `backend/server.js`, all routes |
| **MySQL2** | ^3.6.5 | MySQL database driver with promises | `backend/config/database.js` |
| **JSON Web Token (jsonwebtoken)** | ^9.0.2 | JWT creation and verification | `backend/middleware/auth.js` |
| **bcryptjs** | ^2.4.3 | Password hashing | `backend/routes/auth.routes.js` |
| **dotenv** | ^16.3.1 | Environment variable loading | `backend/server.js` (loads `../.env`) |
| **cors** | ^2.8.5 | CORS headers | `backend/server.js` |
| **helmet** | ^7.1.0 | Security headers | `backend/server.js` |
| **multer** | ^1.4.5-lts.1 | File upload handling | `backend/routes/uploader.routes.js` |
| **express-validator** | ^7.0.1 | Request validation | `backend/middleware/validation.js` |
| **winston** | ^3.11.0 | Logging framework | `backend/utils/logger.js` |
| **winston-daily-rotate-file** | ^4.7.1 | Log file rotation | `backend/utils/logger.js` |
| **swagger-jsdoc** | ^6.2.8 | OpenAPI spec generation | `backend/server.js` |
| **swagger-ui-express** | ^5.0.0 | Swagger UI hosting | `backend/server.js` |
| **uuid** | ^9.0.1 | UUID generation | `backend/routes/auth.routes.js` |
| **csv-parser** | ^3.2.0 | CSV parsing (deprecated in favor of xlsx) | `backend/utils/bulkImport.parse.js` |
| **xlsx** | ^0.18.5 | Excel/CSV parsing | `backend/utils/bulkImport.parse.js` |

### Development Tools

| Tool | Purpose | Used In |
|------|---------|---------|
| **nodemon** | Auto-restart on file changes | `backend/package.json` (npm run dev) |
| **Swagger UI** | API documentation browser | `http://localhost:3002/api-documentation` |

### Architecture Style

| Aspect | Decision |
|--------|----------|
| **API Design** | RESTful (not fully REST — controller-based, not resource-based) |
| **Database Access** | Inline SQL queries (no ORM) |
| **Auth Strategy** | JWT with access + refresh tokens |
| **State Management** | React Context (AuthContext) + localStorage |
| **Build Tool** | Create React App (react-scripts) |

---

# SECTION 3 — Root Directory Analysis

| Item | Type | Purpose | Critical | Should Modify? |
|------|------|---------|----------|----------------|
| `.env` | File | Development environment variables | **HIGH** | Yes — contains credentials |
| `.env.production` | File | Production environment template | Medium | Yes — template for production |
| `.env.production.server` | File | Actual production env | **HIGH** | Yes — actual production values |
| `.gitignore` | File | Git exclusion rules | Medium | Rarely |
| `backend/` | Directory | Express.js API server | **HIGH** | Yes — main backend code |
| `frontend/` | Directory | React SPA client | **HIGH** | Yes — main frontend code |
| `logs/` | Directory | Application log files | Low | No — auto-generated |
| `supplier_management_live.sql` | File | Database dump/schema | Medium | Rarely |
| `.tmp_fix_env.sh` | File | One-time env fix script (deployment) | Low | Delete — temporary |
| `.tmp_webhook.js` | File | One-time webhook listener (deployment) | Low | Delete — temporary |

### Temporary Files (Notable)

The following files appear to be one-off deployment utilities and should probably be removed or moved to a `scripts/` folder:

- `.tmp_fix_env.sh` — Shell script for fixing production `.env` after git reset
- `.tmp_webhook.js` — Node.js webhook server for auto-deployment

These contain hardcoded production paths (`/www/wwwroot/erpoj.com`) and credentials.

---

# SECTION 4 — Folder Structure

## Root

```
AMSERP/
+-- .env                           # Development environment
+-- .env.production                # Production env template
+-- .env.production.server         # Actual production env
+-- .gitignore
+-- .tmp_fix_env.sh                # TEMPORARY - deployment fix script
+-- .tmp_webhook.js                # TEMPORARY - deployment webhook
+-- backend/                       # Express.js API server
+-- frontend/                      # React SPA client
+-- logs/                          # Application logs
+-- supplier_management_live.sql   # DB schema/data
```

---

## `backend/` — Express.js API Server

```
backend/
+-- config/
|   +-- database.js                   MySQL connection pool, query helpers
+-- constants/
|   +-- defaultDocumentTemplates.js   HTML templates for print documents
+-- controllers/                      Business logic (25 files)
|   +-- bulkImport.controller.js
|   +-- departmentManagement.controller.js
|   +-- employees.controller.js
|   +-- erpSettings.controller.js
|   +-- expenses.controller.js
|   +-- global-search.controller.js
|   +-- invoiceManagement.controller.js
|   +-- leaves.controller.js
|   +-- ledger.controller.js
|   +-- partsInventory.controller.js
|   +-- paymentMethods.controller.js
|   +-- payroll.controller.js
|   +-- profile.controller.js
|   +-- reports.controller.js
|   +-- roleManagement.controller.js
|   +-- salesManagement.controller.js
|   +-- serviceManagement.controller.js
|   +-- serviceMasterController.js
|   +-- statusManagement.controller.js
|   +-- uploader.controller.js
|   +-- userManagement.controller.js
|   +-- vehicleBranding.controller.js
|   +-- vehicleInventory.controller.js
|   +-- vehicleMaster.controller.js
|   +-- warehouseManagement.controller.js
+-- database/
|   +-- setup_auth_data.sql           Initial roles and auth setup SQL
+-- middleware/
|   +-- auth.js                       JWT auth, role/permission checks
|   +-- errorHandler.js               Global error handler + AppError class
|   +-- validation.js                 express-validator wrapper
+-- models/
|   +-- orderForm.model.js            Order form bulk insert (transactional)
+-- repositories/
|   +-- BaseRepository.js             Generic CRUD class
|   +-- CustomerRepository.js         Customer-specific queries
|   +-- LeadRepository.js             Lead-specific queries
+-- routes/                           Route definitions (35+ files)
|   +-- auth.routes.js
|   +-- admin.routes.js
|   +-- lead.routes.js
|   +-- customer.routes.js
|   +-- vehicle.routes.js
|   +-- vehicle-master.routes.js
|   +-- vehicle-branding.routes.js
|   +-- parts.routes.js
|   +-- quotation.routes.js
|   +-- booking.routes.js
|   +-- sales.routes.js
|   +-- sales-master.routes.js
|   +-- invoice.routes.js
|   +-- payment.routes.js
|   +-- payment-methods.routes.js
|   +-- service.routes.js
|   +-- service-master.routes.js
|   +-- reports.routes.js
|   +-- report.routes.js
|   +-- dashboard.routes.js
|   +-- warehouse.routes.js
|   +-- erp-settings.routes.js
|   +-- lead-master.routes.js
|   +-- profile.routes.js
|   +-- global-search.routes.js
|   +-- uploader.routes.js
|   +-- bulk-import.routes.js
|   +-- employees.routes.js
|   +-- payroll.routes.js
|   +-- leaves.routes.js
|   +-- expenses.routes.js
|   +-- ledger.routes.js
|   +-- user.routes.js
+-- scripts/
|   +-- run_seed.js                   Seed data execution script
|   +-- refresh_vehicle_procedures.js DB procedure refresh script
|   +-- create_super_admin.js         Creates initial super admin user
+-- utils/
|   +-- AppError.js                   Application error class
|   +-- bulkImport.parse.js           CSV/XLSX parsing for bulk import
|   +-- logger.js                     Winston logger config
|   +-- phone.util.js                 Phone number normalization
+-- server.js                         Entry point — Express app setup
+-- package.json                      Dependencies and scripts
+-- package-lock.json
```

### Folder Responsibilities

| Folder | Responsibility | Depended On By |
|--------|---------------|----------------|
| `config/` | Database connection and query helpers | Controllers, Middleware, Models, Repositories |
| `controllers/` | Business logic for each domain | Routes |
| `middleware/` | Auth, validation, error handling | Routes (via `server.js`) |
| `models/` | Data access objects (underutilized) | Controllers |
| `repositories/` | Data access layer with base CRUD | Controllers |
| `routes/` | API endpoint definitions | `server.js` |
| `scripts/` | CLI utilities for DB maintenance | Standalone |
| `utils/` | Shared utilities (logging, parsing) | Controllers, Middleware, Config |
| `constants/` | Static template data | Controllers |
| `database/` | SQL setup scripts | Standalone |

---

## `frontend/` — React SPA

```
frontend/
+-- build/                          Production build output
+-- node_modules/                   Dependencies
+-- public/
|   +-- favicon.png                 Browser tab icon
|   +-- index.html                  SPA shell HTML
|   +-- samples/                    Bulk import sample files (CSV/XLSX)
+-- src/
|   +-- App.js                      Main app component with routing
|   +-- index.js                    React DOM entry point
|   +-- assets/                     Static images (logo files)
|   +-- components/                 Reusable UI components
|   |   +-- sales/                  Sales-specific sub-components
|   |   +-- ActionButtons.js
|   |   +-- BulkUploadModal.js/.css
|   |   +-- ConfirmModal.js
|   |   +-- DocumentTemplatesTab.js
|   |   +-- ErrorPopup.js
|   |   +-- Header.js
|   |   +-- InputModal.js
|   |   +-- Modal.js/.css
|   |   +-- PrivateRoute.js
|   |   +-- SearchableSelect.js
|   |   +-- SearchDropdown.js
|   |   +-- Sidebar.js
|   |   +-- Splash.js
|   |   +-- TableEnhancer.js
|   |   +-- VehicleBrandingForm.js/.css
|   |   +-- VehicleBrandingTable.js/.css
|   +-- constants/
|   |   +-- bulkImportSamples.js
|   +-- context/
|   |   +-- AuthContext.js          Auth state (login, logout, role check)
|   +-- hooks/
|   |   +-- useSalesHtmlTemplate.js Custom hook for HTML templates
|   +-- pages/                      Page-level components (29 files)
|   |   +-- Customers.js
|   |   +-- Dashboard.js
|   |   +-- DepartmentManagement.js
|   |   +-- Employees.js
|   |   +-- Expenses.js
|   |   +-- LeadMasterData.js
|   |   +-- Leads.js
|   |   +-- Leaves.js
|   |   +-- Ledger.js
|   |   +-- Login.js
|   |   +-- MasterDataHub.js
|   |   +-- OrderFormUpload.js
|   |   +-- PartsInventory.js
|   |   +-- Payroll.js
|   |   +-- Profile.js
|   |   +-- Reports.js
|   |   +-- RoleManagement.js
|   |   +-- Sales.js
|   |   +-- SalesMasterData.js
|   |   +-- Service.js
|   |   +-- ServiceMasterData.js
|   |   +-- Settings.js
|   |   +-- StatusManagement.js
|   |   +-- UserManagement.js
|   |   +-- VehicleBranding.js/.css
|   |   +-- VehicleMasterData.js
|   |   +-- Vehicles.js
|   |   +-- WarehouseManagement.js
|   +-- services/
|   |   +-- api.js                  Axios-based API client (all endpoints)
|   |   +-- vehicleBrandingService.js
|   +-- styles/                     CSS files (15+ files)
|   +-- setupProxy.js               Dev proxy (/api -> localhost:3002)
|   +-- utils/
|       +-- bulkImportClient.js
|       +-- documentTemplateRender.js
|       +-- eventBus.js             Custom event bus for component comms
|       +-- printSalesModal.js
|       +-- reportsExport.js
+-- .env.production                 REACT_APP_API_URL=/api
+-- package.json
+-- package-lock.json
```

### Folder Responsibilities

| Folder | Responsibility | Depended On By |
|--------|---------------|----------------|
| `components/` | Reusable UI parts | Pages |
| `pages/` | Full page components | `App.js` routing |
| `services/` | API communication | Pages, Components |
| `context/` | Global state (auth) | `App.js`, Pages, Components |
| `hooks/` | Custom React hooks | Pages |
| `utils/` | Business utilities | Pages, Components |
| `styles/` | CSS stylesheets | Components, Pages |
| `assets/` | Static images | `Sidebar.js`, `Login.js`, `Splash.js` |
| `constants/` | Static data | Components |

---

# SECTION 5 — Application Entry Points

## Backend Entry Point — `backend/server.js`

```
1. server.js starts
2. Loads environment variables (dotenv.config from '../.env')
3. Creates Express app
4. Registers middleware stack:
   a. helmet() - security headers
   b. cors() - cross-origin (custom function, allows localhost)
   c. express.json() - body parser (10mb limit)
   d. express.urlencoded() - form parser (10mb limit)
   e. Request logger (Winston)
5. Initializes Swagger/OpenAPI docs at /api-documentation
6. Registers health check: GET /api/health
7. Registers build marker: GET /api/employees/_build
8. Mounts all route modules under /api/...
9. 404 handler for unmatched routes
10. Global error handler middleware
11. startServer():
    a. Tests database connection (testConnection)
    b. Starts listening on API_PORT (default 3002)
```

## Frontend Entry Point — `frontend/src/index.js`

```
1. index.js runs
2. Creates React root on <div id="root">
3. Wraps app in:
   a. BrowserRouter (React Router DOM, with v7 future flags)
   b. AuthProvider (context for authentication)
   c. Toaster (react-hot-toast for notifications)
4. Renders <App /> component
```

## Frontend App Component — `frontend/src/App.js`

```
App.js renders:
+-- If loading -> Loading spinner
+-- If NOT logged in:
|   +-- Toaster
|   +-- ErrorPopup (if global error)
|   +-- Routes -> /login (Login page), * redirect to /login
+-- If logged in:
    +-- Toaster
    +-- ErrorPopup (if global error)
    +-- Routes -> /login redirects to /, /* renders AppLayout
        +-- AppLayout:
            +-- Sidebar
            +-- Header (with global search)
            +-- TableEnhancer (sort/filter for data tables)
            +-- <main> with nested Routes
                +-- / -> Dashboard
                +-- /dashboard -> Dashboard
                +-- /leads -> Leads
                +-- /customers -> Customers
                +-- /vehicles -> Vehicles
                +-- /sales/* -> Sales (nested)
                +-- /service/* -> Service (nested)
                +-- /reports -> Reports
                +-- /hr/employees -> Employees
                +-- /hr/payroll -> Payroll
                +-- /hr/leaves -> Leaves
                +-- /hr/expenses -> Expenses
                +-- /hr/ledger -> Ledger
                +-- /admin/users -> UserManagement
                +-- /admin/roles -> RoleManagement
                +-- /admin/departments -> DepartmentManagement
                +-- /admin/statuses -> StatusManagement
                +-- /settings -> Settings
                +-- /profile -> Profile
                +-- /warehouses -> WarehouseManagement
                +-- /parts -> PartsInventory
                +-- /vehicle-branding -> VehicleBranding
                +-- /vehicle-master -> VehicleMasterData
                +-- /service-master -> ServiceMasterData
                +-- /lead-master -> LeadMasterData
                +-- /sales-master -> SalesMasterData
                +-- /master-data -> MasterDataHub
                +-- /uploader/order-form -> OrderFormUpload
                +-- * -> redirect to /
```

### Initialization Flow Diagram

```
+--------------------------------------------------------------------------+
| BACKEND STARTUP                                                          |
|                                                                          |
|  server.js                                                               |
|    |                                                                     |
|    +-- dotenv.config('../.env')                                          |
|    +-- Create Express App                                                |
|    +-- Register Middleware (helmet -> cors -> json -> logger)            |
|    +-- Setup Swagger (/api-documentation)                                |
|    +-- Register Routes (30+ route files)                                 |
|    +-- Register 404 Handler                                              |
|    +-- Register Error Handler                                            |
|    +-- startServer()                                                     |
|         +-- Test Database Connection                                     |
|         |    +-- Create MySQL Pool                                       |
|         +-- app.listen(PORT)                                             |
|              +-- "AMS API Server running on port 3002"                   |
|                                                                          |
+--------------------------------------------------------------------------+
| FRONTEND STARTUP                                                         |
|                                                                          |
|  index.js                                                                |
|    |                                                                     |
|    +-- ReactDOM.createRoot('#root')                                      |
|    +-- Wrap in: BrowserRouter > AuthProvider > Toaster                   |
|    +-- Render <App />                                                    |
|                                                                          |
|  App.js                                                                  |
|    |                                                                     |
|    +-- useAuth() -> checks localStorage for token                        |
|    |    +-- token exists -> calls GET /api/auth/me to validate           |
|    |    +-- token missing -> user = null                                 |
|    |                                                                     |
|    +-- If loading -> show spinner                                        |
|    +-- If !user -> show <Login />                                        |
|    +-- If user -> show <AppLayout>                                       |
|         +-- <Sidebar /> (navigation by role)                             |
|         +-- <Header /> (global search, user menu)                        |
|         +-- <TableEnhancer /> (mutates DOM for tables)                   |
|         +-- <Routes /> (page routing)                                    |
+--------------------------------------------------------------------------+
```

---

# SECTION 6 — Configuration Files

### `backend/package.json`

| Field | Value |
|-------|-------|
| name | `ams-backend` |
| main | `server.js` |
| scripts.start | `node server.js` |
| scripts.dev | `nodemon server.js` |
| scripts.test | `jest` |

Note: Jest is listed in scripts but not in devDependencies — testing is not yet configured.

### `frontend/package.json`

| Field | Value |
|-------|-------|
| name | `ams-frontend` |
| description | `Auto Management System - Admin Panel` |
| scripts.start | `react-scripts start` |
| scripts.build | `react-scripts build` |
| scripts.test | `react-scripts test` |

Standard Create React App configuration. Browserslist defines supported browser targets for production vs development.

### `.gitignore`

Ignores: `node_modules/`, `.env`, `logs/`, `uploads/`, `build/`, `coverage/`, IDE configs, `*.log`, `docs/`, `db_backup/`

### `frontend/src/setupProxy.js`

Configures Create React App's dev server to proxy `/api/*` requests to `http://localhost:3002`. This is the **bridge between frontend and backend during development**.

### `frontend/.env.production`

Contains `REACT_APP_API_URL=/api` — tells the production build where to find the API (same origin).

### `frontend/public/index.html`

Standard Create React App HTML template. Loads Google Fonts (Inter) and Material Icons. Sets theme color to `#1e3a5f` (primary dark blue).

---

# SECTION 7 — Package Analysis

## Backend Dependencies (`backend/package.json`)

| Package | Type | Purpose | Where Used |
|---------|------|---------|------------|
| **express** | Core | Web server framework | `server.js`, all routes |
| **mysql2** | Core | MySQL driver with promises and prepared statements | `config/database.js` |
| **dotenv** | Core | Load `.env` into `process.env` | `server.js:8` |
| **cors** | Security | CORS middleware | `server.js:82` |
| **helmet** | Security | HTTP security headers | `server.js:59` |
| **jsonwebtoken** | Auth | JWT sign/verify for authentication | `middleware/auth.js` |
| **bcryptjs** | Auth | Password hashing | `routes/auth.routes.js` |
| **express-validator** | Validation | Request body/param validation | `middleware/validation.js` |
| **winston** | Logging | Logger with multiple transports | `utils/logger.js` |
| **winston-daily-rotate-file** | Logging | Rotating file transport | `utils/logger.js` |
| **swagger-jsdoc** | Docs | Generates OpenAPI spec from JSDoc comments | `server.js:121` |
| **swagger-ui-express** | Docs | Serves Swagger UI | `server.js:122` |
| **multer** | Upload | Multipart form data handling | `routes/uploader.routes.js` |
| **xlsx** | Data | Excel/CSV parsing | `utils/bulkImport.parse.js` |
| **csv-parser** | Data | CSV parsing (appears unused in favor of xlsx) | `utils/bulkImport.parse.js` |
| **uuid** | Utility | UUID v4 generation | `routes/auth.routes.js`, `scripts/create_super_admin.js` |

### Backend Dev Dependencies

| Package | Purpose |
|---------|---------|
| **nodemon** | Dev server with auto-restart on file changes |

## Frontend Dependencies (`frontend/package.json`)

| Package | Type | Purpose | Where Used |
|---------|------|---------|------------|
| **react** | Core | UI library | All components |
| **react-dom** | Core | DOM rendering | `index.js` |
| **react-router-dom** | Routing | Client-side SPA routing | `App.js`, components |
| **react-scripts** | Build | Create React App build system | `package.json` scripts |
| **axios** | HTTP | HTTP client for API calls | `services/api.js` |
| **chart.js** | Charts | Charting library | `pages/Dashboard.js` |
| **react-chartjs-2** | Charts | React binding for Chart.js | `pages/Dashboard.js` |
| **react-hot-toast** | UI | Toast notifications | `App.js`, `Login.js`, pages |
| **@heroicons/react** | UI | SVG icon components | `components/Sidebar.js`, etc. |
| **xlsx** | Data | Excel file reading/writing | `utils/reportsExport.js`, `utils/bulkImportClient.js` |

---

# SECTION 8 — Frontend Architecture (High Level)

### Framework

**React 18** with Create React App (`react-scripts 5.0.1`).

### Folder Organization

```
src/
+-- index.js          -> ReactDOM entry
+-- App.js            -> Root component with routing
+-- pages/            -> One file per route (30 files)
+-- components/       -> Reusable UI parts (21+ files)
+-- services/         -> API client layer
+-- context/          -> Auth state management
+-- hooks/            -> Custom hooks
+-- utils/            -> Business utilities
+-- styles/           -> CSS stylesheets
+-- constants/        -> Static data
+-- assets/           -> Images
```

### Entry Point

`frontend/src/index.js` — mounts React app to `#root`, wraps in `BrowserRouter`, `AuthProvider`, and `Toaster`.

### Routing System

**React Router DOM v6.21.1** with:
- Future flags: `v7_startTransition`, `v7_relativeSplatPath`
- Top-level route switch in `App.js` based on auth state
- Nested routes within `AppLayout` for authenticated pages
- Role-based sidebar visibility (not route protection)

### Global Layout

Authenticated pages render inside `AppLayout`:
```
<Sidebar />          <- Navigation (role-filtered items)
<Header />           <- Global search + user menu
<TableEnhancer />    <- DOM-level table sorting/filtering
<main>               <- Route content
```

### Assets Organization

`assets/` contains three logo variants:
- `logo.png` — Full color (used on Login/Splash)
- `white_logo.png` — White variant (used on Sidebar)
- `black_logo.png` — Black variant (usage not confirmed)

### API Communication Method

- **Axios** instance with interceptors
- Base URL from `REACT_APP_API_URL` (defaults to `/api`)
- Request interceptor adds `Bearer` token from `localStorage`
- Response interceptor handles errors (401 -> redirect login, others -> toast)
- Custom `eventBus` for decoupled error handling

### State Management

- **React Context** (`AuthContext`) for authentication state
- **localStorage** for token persistence and user profile cache
- No Redux, Zustand, or other state management library

### Build System

**Create React App** (react-scripts). Standard scripts:
- `npm start` -> Development server (port 3000)
- `npm run build` -> Production build to `build/`
- `npm test` -> Test runner

---

# SECTION 9 — Backend Architecture (High Level)

### Framework

**Express.js 4.18.2** with middleware-based architecture.

### Entry Point

`backend/server.js`:
1. Loads environment variables
2. Creates Express app
3. Applies global middleware
4. Sets up Swagger docs
5. Mounts route modules
6. Error handling
7. Starts server after DB connection verification

### Middleware Loading Order

```
1. helmet()                    -> Security headers
2. cors()                      -> CORS headers (custom origin validation)
3. express.json()              -> Body parsing (10mb limit)
4. express.urlencoded()        -> URL-encoded body parsing
5. Request Logger              -> Winston info log per request
6. Route Mounting              -> 30+ route modules
7. 404 Handler                 -> Catch-all for unmatched routes
8. Global Error Handler        -> Centralized error response
```

### Route Loading

Routes are:
1. Defined in `backend/routes/*.routes.js`
2. Imported in `server.js`
3. Mounted under `/api/:resource`
4. Each route file can apply `authenticate` and `authorize` middleware per endpoint

### Request Lifecycle

```
HTTP Request
    |
    v
helmet() headers
    |
    v
cors() validation
    |
    v
express.json() parse body
    |
    v
Request Logger (Winston)
    |
    v
Route matched? ---No--> 404 Handler
    |
    v Yes
authenticate() middleware (JWT verification)
    |
    v
authorize() middleware (role check)
    |
    v
validateRequest() (express-validator)
    |
    v
Controller Method
    |
    +-- Database query (inline SQL)
    +-- Business logic
    +-- Response (JSON)
    |
    v
Error? ---Yes--> Global Error Handler -> JSON error response
    |
    v No
JSON success response
```

### Error Handling Structure

- **AppError class** — Custom error with statusCode and resolution message
- **errorHandler middleware** — Captures all errors, logs via Winston, returns JSON
- In development mode: includes full error object and stack trace
- In production mode: hides internal details for non-operational errors
- 401 errors -> "No token provided", "Invalid token", "Token expired"
- 403 errors -> "Access denied" / "Permission denied"
- 404 errors -> "Endpoint not found"

### Logging Structure

- **Winston** with daily rotate file transport
- Log levels: error, warn, info, debug (configurable via `LOG_LEVEL`)
- Console output with colorization (dev)
- File output to `logs/error-YYYY-MM-DD.log` and `logs/combined-YYYY-MM-DD.log`
- Each request logged with method, path, IP, user agent

### Authentication Mechanism (High Level)

1. **Login**: POST `/api/auth/login` -> validates email/password -> generates JWT + refresh token -> stores session in DB
2. **Session Restoration**: Frontend calls GET `/api/auth/me` with Bearer token -> validates, returns user profile
3. **Middleware**: `authenticate()` decodes JWT -> queries user from DB -> attaches `req.user`
4. **Authorization**: `authorize(roles)` checks `req.user.role_name` against allowed roles
5. **Permission Check**: `checkPermission(module, action)` queries MySQL function `fn_has_permission`
6. **Super Admin Bypass**: Auto-allowed for `super_admin` role
7. **Logout**: Deletes user sessions from DB

---

# SECTION 10 — Request Lifecycle

### Complete Request Flow

```
+---------------------------------------------------------------------------+
|                          BROWSER                                          |
|                                                                           |
|  User interacts with React SPA                                            |
|  Page component calls service function                                    |
|  Service function calls api.get/post/put/delete()                         |
|  Axios sends HTTP request                                                 |
|                                                                           |
|  Development: proxy to localhost:3002                                     |
|  Production: same origin (/api)                                           |
+-----------------------------+---------------------------------------------+
                              |
                              v
+---------------------------------------------------------------------------+
|                   EXPRESS.JS API SERVER (Port 3002)                       |
|                                                                           |
|  1. helmet() - security headers                                           |
|  2. cors() - origin validation                                            |
|  3. express.json() - body parsing                                         |
|  4. Request logger - log method + path + IP                               |
|                                                                           |
|  5. ROUTE MATCHING                                                        |
|     +-- Matches /api/auth/login -> auth.routes.js                         |
|     +-- Matches /api/vehicles -> vehicle.routes.js                        |
|     +-- No match -> 404 handler                                           |
|                                                                           |
|  6. AUTHENTICATION (if route uses authenticate middleware)                |
|     +-- Extract Bearer token from Authorization header                    |
|     +-- Verify JWT signature                                              |
|     +-- Query users table for user existence + active status              |
|     +-- Attach user object to req.user                                    |
|                                                                           |
|  7. AUTHORIZATION (if route uses authorize middleware)                    |
|     +-- Normalize user role                                               |
|     +-- Compare against allowed roles                                     |
|                                                                           |
|  8. VALIDATION (if route uses validateRequest middleware)                 |
|     +-- express-validator checks                                          |
|                                                                           |
|  9. CONTROLLER                                                            |
|     +-- Extract params from req.params, req.query, req.body               |
|     +-- Call database helpers (query, executeQuery, etc.)                 |
|     +-- Execute business logic (calculations, transformations)            |
|     +-- Send JSON response                                                |
|                                                                           |
|  10. ERROR HANDLING (if error thrown)                                     |
|      +-- AppError -> structured error with statusCode + resolution        |
|      +-- Unknown error -> 500 with stack (dev) or generic (prod)          |
|                                                                           |
+-----------------------------+---------------------------------------------+
                              |
                              v
+---------------------------------------------------------------------------+
|                       MYSQL DATABASE                                      |
|                                                                           |
|  Inline SQL queries executed                                              |
|  Stored procedures called                                                 |
|  Functions evaluated (e.g., fn_has_permission)                            |
+---------------------------------------------------------------------------+
```

---

# SECTION 11 — Environment Files Overview

| File | Environment | Purpose | Critical? |
|------|-------------|---------|-----------|
| `.env` | Development | Primary env file loaded by backend `server.js` | **HIGH** |
| `.env.production` | Production template | Template with placeholder values for production setup | Medium |
| `.env.production.server` | Production (actual) | Active production configuration with real credentials | **HIGH** |
| `frontend/.env.production` | Frontend production | Sets `REACT_APP_API_URL=/api` for production build | Medium |

**Behavior:**
- Backend always loads `../.env` (from `backend/server.js:8`)
- For production, `.env.production.server` must be copied to `.env`
- Frontend uses `REACT_APP_*` environment variables injected at build time
- The production `.env.production.server` contains real credentials (DB password, JWT secret) — it should NOT be committed (though it currently is in the repo)



# SECTION 12 — Important Files

| File | Purpose | Criticality | Can Modify? | Reason |
|------|---------|-------------|-------------|--------|
| `backend/server.js` | Express app setup, middleware, route mounting | **HIGH** | Yes | Main backend entry — careful with middleware order |
| `backend/config/database.js` | MySQL pool, query helpers | **HIGH** | Rarely | Change DB connection parameters only |
| `backend/middleware/auth.js` | JWT auth, role/permission checks | **HIGH** | Yes | Authentication logic |
| `backend/middleware/errorHandler.js` | Global error handler + AppError class | **HIGH** | Rarely | Central error format |
| `backend/middleware/validation.js` | Request validation wrapper | Medium | Yes | Validation behavior |
| `backend/utils/logger.js` | Winston logger configuration | Medium | Rarely | Logging behavior |
| `backend/utils/bulkImport.parse.js` | CSV/XLSX parser | Low | Yes | Bulk import logic |
| `frontend/src/index.js` | React entry point | **HIGH** | Rarely | App bootstrap |
| `frontend/src/App.js` | Root component with routes | **HIGH** | Yes | Page routing, layout |
| `frontend/src/services/api.js` | Axios API client, all endpoint definitions | **HIGH** | Yes | API communication |
| `frontend/src/context/AuthContext.js` | Auth state management | **HIGH** | Yes | Login/logout flow |
| `frontend/src/setupProxy.js` | Dev proxy configuration | **HIGH** | Rarely | Dev API routing |
| `.env` | All environment variables | **HIGH** | Yes | Credentials, config |
| `backend/package.json` | Backend dependencies and scripts | **HIGH** | Yes | Add/remove packages |
| `frontend/package.json` | Frontend dependencies and scripts | **HIGH** | Yes | Add/remove packages |
| `frontend/public/index.html` | HTML shell | Medium | Rarely | Meta tags, fonts |
| `backend/repositories/BaseRepository.js` | Generic CRUD base class | Medium | Yes | Data access patterns |
| `backend/routes/auth.routes.js` | Login/register/logout endpoints | **HIGH** | Yes | Auth API |
| `frontend/src/components/Sidebar.js` | Navigation sidebar (role-filtered) | **HIGH** | Yes | Navigation structure |
| `frontend/src/pages/Login.js` | Login page | Medium | Yes | Login UI |
| `backend/scripts/create_super_admin.js` | Creates initial admin user | Low | Rarely | Initial setup |

---

# SECTION 13 — Architecture Diagrams

### Overall Architecture

```
+---------------------------------------------------------------------------+
|                     Production Server                                     |
|                                                                           |
|  +---------------------------------------------------------------------+  |
|  |              Process Manager (pm2)                                  |  |
|  |                                                                     |  |
|  |  +---------------------------+    +----------------------------+    |  |
|  |  |  ams-api (Port 3002)      |    |  webhook (Port 3500)       |    |  |
|  |  |  Node.js + Express        |    |  Auto-deploy on push       |    |  |
|  |  |                           |    |  (separate process)        |    |  |
|  |  +-----------+---------------+    +----------------------------+    |  |
|  +-------------+-------------------------------------------------------+  |
|                |                                                          |
|  +-------------+-----------------------------------------------------+    |
|  |                     Nginx / Web Server                            |    |
|  |                                                                   |    |
|  |  Static files: /frontend/build/ (React SPA)                       |    |
|  |  Reverse proxy: /api/* -> localhost:3002                          |    |
|  +-------------------------------------------------------------------+    |
|                |                                                          |
|  +-------------+-----------------------------------------------------+    |
|  |                     MySQL Database (3306)                         |    |
|  +-------------------------------------------------------------------+    |
+---------------------------------------------------------------------------+
```

### Frontend Architecture

```
+---------------------------------------------------------------------------+
|                        REACT SPA                                          |
|                                                                           |
|  index.js                                                                 |
|    +-- BrowserRouter                                                      |
|         +-- AuthProvider (context)                                        |
|              +-- Toaster (notifications)                                  |
|                   +-- App                                                 |
|                        |                                                  |
|                        +-- Loading state -> spinner                       |
|                        +-- Unauthenticated:                               |
|                        |    +-- Routes -> /login -> Login page            |
|                        +-- Authenticated:                                 |
|                             +-- Routes -> AppLayout                       |
|                                  +-- Sidebar (NavLink, role-filtered)     |
|                                  +-- Header (search, user menu)           |
|                                  +-- TableEnhancer (DOM mutation)         |
|                                  +-- <main>                               |
|                                       +-- Routes                          |
|                                            +-- / -> Dashboard             |
|                                            +-- /leads -> Leads            |
|                                            +-- /sales/* -> Sales          |
|                                            +-- /service/* -> Service      |
|                                            +-- /hr/* -> HR pages          |
|                                            +-- /admin/* -> Admin          |
|                                            +-- ... (25+ routes)           |
|                                                                           |
|  +---------------------------------------------------------------------+  |
|  |                    DATA FLOW                                        |  |
|  |                                                                     |  |
|  |  Page Component                                                     |  |
|  |    v calls                                                          |  |
|  |  Service (api.js)                                                   |  |
|  |    v Axios HTTP request                                             |  |
|  |  Express API Server                                                 |  |
|  |    v response                                                       |  |
|  |  Axios interceptor                                                  |  |
|  |    +-- Success -> return data to page                               |  |
|  |    +-- 401 -> clear token, redirect /login                          |  |
|  |    +-- 403 -> silently reject                                       |  |
|  |    +-- Error -> toast + eventBus dispatch                           |  |
|  |                                                                     |  |
|  +---------------------------------------------------------------------+  |
+---------------------------------------------------------------------------+
```

### Backend Architecture

```
+---------------------------------------------------------------------------+
|                     EXPRESS.JS BACKEND                                    |
|                                                                           |
|  server.js                                                                |
|    |                                                                      |
|    +-- Global Middleware Stack                                            |
|    |   +-- helmet()                                                       |
|    |   +-- cors()                                                         |
|    |   +-- express.json()                                                 |
|    |   +-- express.urlencoded()                                           |
|    |   +-- Request Logger                                                 |
|    |                                                                      |
|    +-- Swagger Documentation                                              |
|    |   +-- /api-documentation -> Swagger UI                               |
|    |                                                                      |
|    +-- Route Modules                                                      |
|    |   |                                                                  |
|    |   +-- Each route module:                                             |
|    |       +-- authenticate() middleware                                  |
|    |       +-- authorize() middleware                                     |
|    |       +-- validateRequest() middleware                               |
|    |       +-- Controller method                                          |
|    |           +-- config/database.js (query helpers)                     |
|    |           +-- repositories/ (optional data layer)                    |
|    |           +-- utils/logger.js (logging)                              |
|    |           +-- middleware/errorHandler (AppError)                     |
|    |                                                                      |
|    +-- Error Handling                                                     |
|        +-- 404 Handler                                                    |
|        +-- Global Error Handler                                           |
|                                                                           |
|  Route Example: GET /api/vehicle-branding                                 |
|                                                                           |
|  routes/vehicle-branding.routes.js                                        |
|    +-- router.use(authenticate)  <- JWT check for all                     |
|    +-- router.get('/', authorize([...]), controller)                      |
|    +-- router.get('/:id', authorize([...]), controller)                   |
|                                                                           |
|  controllers/vehicleBranding.controller.js                                |
|    +-- Extract query params (page, limit, search, etc.)                   |
|    +-- Build SQL query dynamically                                        |
|    +-- Execute via config/database.js (query)                             |
|    +-- Paginate results                                                   |
|    +-- Return JSON response                                               |
+---------------------------------------------------------------------------+
```

### Folder Relationship Diagram

```
frontend/                        backend/
    |                               |
    |  Pages use Services           |  Routes import Controllers
    |  v                            |  v
    |  services/api.js              |  controllers/*.controller.js
    |  (Axios HTTP client)          |  (business logic)
    |       |                       |       |
    |       | HTTP /api/*           |       | calls
    |       v                       |       v
    |  setupProxy.js (dev)          |  config/database.js
    |  or Nginx (prod)              |  (MySQL queries)
    |       |                       |       |
    |       +-----------> server.js +       |
    |                   (Express)           |
    |                        |              |
    |                        | applies      |
    |                        v              |
    |                  middleware/          |
    |                   +-- auth.js         |
    |                   +-- errorHandler.js |
    |                   +-- validation.js   |
    |                        |              |
    |                        v              |
    |                   MySQL Database <----+
```

---

# SECTION 14 — Initial Observations

### Good Architecture Decisions

1. **Separation of concerns** — Frontend and backend are fully separated, allowing independent development
2. **JWT authentication** with refresh tokens and server-side session tracking
3. **Role-based and permission-based authorization** (two layers)
4. **Centralized error handling** with custom `AppError` class
5. **Structured logging** with Winston and daily rotation
6. **Dev proxy** for seamless frontend-backend communication during development
7. **Repository pattern** partially implemented (`BaseRepository`, `CustomerRepository`, `LeadRepository`)
8. **Swagger/OpenAPI documentation** auto-generated from route comments
9. **Bulk import** with CSV and XLSX support across multiple entities
10. **Event bus pattern** for decoupled frontend component communication

### Potential Risks

1. **Inline SQL in controllers** — SQL queries are scattered across 25+ controller files with no ORM or query builder. This makes maintenance difficult, introduces SQL injection risk (though mysql2 parameterized queries mitigate this), and makes schema changes error-prone.
2. **No database migrations** — Schema changes require manual SQL scripts. No migration tool (Knex, Sequelize, TypeORM) is used.
3. **Create React App (CRA)** — CRA is deprecated/maintenance-only. The project cannot easily upgrade to newer React patterns or Vite.
4. **Mixed architecture patterns** — Some controllers use `BaseRepository`, some use models, most use inline SQL directly. No consistent data access layer.
5. **Production credentials in repository** — `.env.production.server` contains real database credentials and JWT secrets. This is a security risk.
6. **Limited test infrastructure** — Jest is referenced in scripts but not installed. No test files found.
7. **Duplicate route files** — Both `reports.routes.js` and `report.routes.js` exist, suggesting potential confusion or leftover files.
8. **Temporary deployment scripts committed** — `.tmp_fix_env.sh` and `.tmp_webhook.js` contain production paths and should not be in the repository.
9. **No TypeScript** — Entire codebase is plain JavaScript, reducing type safety.
10. **`logs/` directory committed** — Currently contains log files in the repository (though `.gitignore` lists `logs/` — they may have been committed before being added to gitignore).

### Legacy Code Indicators

- `backend/utils/AppError.js` and `backend/middleware/errorHandler.js` both define `AppError` classes — one is redundant
- `csv-parser` dependency is installed but `xlsx` handles both CSV and XLSX — csv-parser may be unused
- `backend/models/` folder only has one model — the model layer is underutilized
- Some CSS files appear to be page-specific (`vehicleBranding.css`) rather than component-specific
- `supplier_management_live.sql` in root suggests this was migrated from or shares code with a supplier management system

### Temporary Files

- `.tmp_fix_env.sh` — One-time deployment fix, contains production credentials
- `.tmp_webhook.js` — One-time deployment webhook with hardcoded production paths

### Unused or Suspicious Items

- `report.routes.js` alongside `reports.routes.js` — potential duplicate
- `backend/database/setup_auth_data.sql` — references roles table but notes it should be created by schema (no schema file found)
- `backend/utils/AppError.js` — appears to be superseded by the one in `middleware/errorHandler.js`

---

# SECTION 15 — Learning Path

### Recommended Reading Order for New Developers

```
Step 1:  README (if exists) or .env header comments
         -> Understand the project name, company, scope
         -> Estimated time: 5 minutes

Step 2:  backend/package.json
         -> Learn what the backend does and which technologies it uses
         -> Estimated time: 5 minutes

Step 3:  frontend/package.json
         -> Learn what the frontend uses (React 18, React Router, Axios)
         -> Estimated time: 3 minutes

Step 4:  backend/server.js
         -> Understand the complete request flow, middleware stack, route mounting
         -> This is the most important file for architecture understanding
         -> Estimated time: 15 minutes

Step 5:  frontend/src/index.js -> frontend/src/App.js
         -> Understand how the React app boots and how routing works
         -> Understand auth-based rendering (login vs app layout)
         -> Estimated time: 15 minutes

Step 6:  backend/routes/ (pick 2-3 route files, e.g., auth.routes.js, vehicle-branding.routes.js)
         -> Understand the route -> middleware -> controller pattern
         -> Estimated time: 10 minutes

Step 7:  backend/controllers/ (pick 2-3 controller files)
         -> Understand business logic pattern (inline SQL, error handling)
         -> Estimated time: 15 minutes

Step 8:  frontend/src/services/api.js
         -> Understand all API endpoints and the Axios interceptor pattern
         -> Estimated time: 20 minutes

Step 9:  frontend/src/context/AuthContext.js
         -> Understand authentication flow (login, session restore, logout)
         -> Estimated time: 10 minutes

Step 10: backend/config/database.js
         -> Understand database connection, pool, query helpers
         -> Estimated time: 10 minutes

Step 11: backend/middleware/auth.js + errorHandler.js + validation.js
         -> Understand cross-cutting concerns (security, error handling, validation)
         -> Estimated time: 15 minutes

Step 12: frontend/src/components/Sidebar.js
         -> Understand navigation structure, role-based menu items
         -> Estimated time: 10 minutes

Step 13: backend/repositories/BaseRepository.js
         -> Understand the repository pattern (if choosing to use it)
         -> Estimated time: 10 minutes

Step 14: .env files (all environments)
         -> Understand configuration management
         -> Estimated time: 5 minutes

Step 15: supplier_management_live.sql
         -> Understand database schema relationships
         -> Estimated time: 20 minutes (if SQL is available)
```

**Total estimated reading time: ~2.5-3 hours**

**Why this order?** This progression takes the developer from high-level understanding (what is this project) to progressively deeper technical details (how does each layer work). It follows the natural flow of a request: browser -> frontend -> backend -> database.

---

# Phase 1 Summary

### What Was Understood

- **AMS ERP** is a React + Express.js full-stack CRM/ERP application for automobile dealerships
- It manages leads, customers, vehicles, sales, service, parts inventory, HR (employees, payroll, leaves, expenses), and ERP settings
- The frontend is a Create React App SPA with React Router v6, Axios, and Context-based auth
- The backend is an Express.js API with JWT authentication, role-based and permission-based authorization, Winston logging, and inline SQL queries against MySQL
- The project has approximately 25 backend controllers, 30+ route files, and 29 frontend page components
- Communication flows: React -> Axios -> Express -> MySQL

### What Will Be Analyzed in Phase 2

- **Business Logic** — Detailed analysis of each controller/domain area
- **Database Schema** — Table relationships, stored procedures, functions
- **API Contract** — Complete endpoint inventory and response formats
- **Authentication and Authorization** — Detailed role/permission matrix
- **State Management** — How data flows through the frontend
- **Code Quality** — Patterns, conventions, potential issues
- **Data Flow Diagrams** — Per-domain request/response flows
