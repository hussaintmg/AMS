# AMSERP — Master Developer Handbook (Phase 8)

> **Project:** AMSERP — Automobile Management & Sales ERP  
> **Client:** OMODA | JAECOO GULBERG, Lahore, Pakistan  
> **Stack:** Node.js 18 / Express 4.18 / React 18.2 (CRA 5) / MySQL 8 / plain JavaScript  
> **Audience:** New and existing developers working on this codebase  
> **Purpose:** Single source of truth synthesizing all 7 phase analyses

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Folder Structure Guide](#3-folder-structure-guide)
4. [Request Lifecycle](#4-request-lifecycle)
5. [Database Guide](#5-database-guide)
6. [Backend Development Guide](#6-backend-development-guide)
7. [Frontend Development Guide](#7-frontend-development-guide)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Security Checklist](#9-security-checklist)
10. [Business Modules](#10-business-modules)
11. [API Reference (Quick)](#11-api-reference-quick)
12. [Deployment Guide](#12-deployment-guide)
13. [Developer Playbook — Common Tasks](#13-developer-playbook--common-tasks)
14. [Debugging & Troubleshooting](#14-debugging--troubleshooting)
15. [Code Standards & Conventions](#15-code-standards--conventions)
16. [Testing Strategy](#16-testing-strategy)
17. [Known Issues & Technical Debt](#17-known-issues--technical-debt)
18. [Refactoring Roadmap](#18-refactoring-roadmap)
19. [Glossary](#19-glossary)
20. [AI Developer Guide](#20-ai-developer-guide)

---

## 1. Project Overview

AMSERP is a full-stack ERP for an automobile dealership. It manages customers, leads, vehicle inventory, sales, service appointments, purchase orders, invoices, payments, employees, commissions, and reports.

### Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Backend runtime | Node.js | 18.x |
| Web framework | Express | 4.18 |
| Database | MySQL | 8.0 |
| ORM | Raw SQL via `mysql2` | 3.6 |
| Auth | JWT (jsonwebtoken) + bcrypt | 9.0 / 5.1 |
| Frontend framework | React (create-react-app) | 18.2 |
| Routing | react-router-dom | 6.x |
| HTTP client | axios | 1.x |
| UI library | None (custom CSS) | — |
| State management | React Context (AuthContext) | — |

### Key Numbers

- ~200+ source files across backend and frontend
- 25 backend controller files
- 33 route files
- 29 frontend pages
- 21 frontend components
- 40+ MySQL tables
- ~400 lines dead code identified
- ~700–1000 lines duplicate code identified
- 3 critical bugs, 6 high-severity issues

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        React SPA (CRA 5)                      │
│  Pages (20) → API Helpers → axios → JWT in Authorization     │
│  Components (21) ← State (AuthContext, local)                │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP / HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Express 4.18 API Server                    │
│  Middleware: cors, json, morgan, auth → routes → controllers │
│  Auth middleware: verifyToken(), authorize()                 │
└──────────────────────────┬───────────────────────────────────┘
                           │ mysql2 (raw queries)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                        MySQL 8 Database                       │
│  40+ tables, 10+ views, 15+ stored procedures/triggers      │
│  Database: amserp                                            │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow (Typical Request)

1. Browser → React Router → Page component mounts
2. Page calls API helper function → constructs axios request with JWT
3. axios sends HTTP request to Express backend
4. Express middleware: `cors` → `json()` → `verifyToken()` → `authorize(roles)` → route handler
5. Route handler calls controller method
6. Controller runs raw SQL via `mysql2` pool → processes result
7. Controller sends JSON response
8. Frontend receives response → updates state → re-renders

---

## 3. Folder Structure Guide

```
AMSERP/
├── backend/
│   ├── config/              # DB config, app config
│   │   ├── db.config.js         # mysql2 pool creation
│   │   └── app.config.js        # JWT secret, expiry, app settings
│   ├── controllers/          # Business logic (25 files)
│   │   ├── auth.controller.js       # Login, user CRUD
│   │   ├── customer.controller.js   # Customer CRUD + search
│   │   ├── lead.controller.js       # Lead CRUD + conversion
│   │   ├── sales.controller.js      # Sales orders, items
│   │   ├── vehicles.controller.js   # Vehicle inventory
│   │   ├── service.controller.js    # Service records
│   │   ├── reports.controller.js    # Reports (dynamic SQL!)
│   │   ├── dashboard.controller.js  # Dashboard KPIs
│   │   ├── ledger.controller.js     # Financial ledger
│   │   ├── invoice.controller.js    # Invoices
│   │   ├── purchase-order.controller.js
│   │   ├── employee.controller.js
│   │   ├── commission.controller.js
│   │   ├── notification.controller.js
│   │   ├── brand.controller.js
│   │   ├── model.controller.js
│   │   ├── variant.controller.js
│   │   ├── bank.controller.js
│   │   ├── ledgertype.controller.js
│   │   ├── inventory.controller.js
│   │   ├── stock.controller.js
│   │   ├── company.controller.js
│   │   ├── user.controller.js
│   │   ├── bulkImport.controller.js
│   │   └── fileUpload.controller.js
│   ├── middleware/           # Express middleware
│   │   ├── auth.middleware.js     # verifyToken(), authorize()
│   │   └── upload.middleware.js   # Multer file upload
│   ├── routes/               # Route definitions (33 files)
│   │   ├── auth.routes.js
│   │   ├── admin.routes.js
│   │   ├── customer.routes.js
│   │   ├── lead.routes.js
│   │   ├── sales.routes.js
│   │   ├── vehicles.routes.js
│   │   ├── service.routes.js      # ⚠️ MISSING auth middleware!
│   │   ├── invoice.routes.js
│   │   ├── dashboard.routes.js
│   │   ├── reports.routes.js
│   │   ├── report.routes.js       # DEAD — duplicate of reports.routes.js
│   │   ├── ledger.routes.js
│   │   ├── purchase-order.routes.js
│   │   ├── employee.routes.js
│   │   ├── commission.routes.js
│   │   ├── notification.routes.js
│   │   ├── brand.routes.js
│   │   ├── model.routes.js
│   │   ├── variant.routes.js
│   │   ├── bank.routes.js
│   │   ├── ledgertype.routes.js
│   │   ├── inventory.routes.js
│   │   ├── stock.routes.js
│   │   ├── company.routes.js
│   │   ├── user.routes.js
│   │   ├── bulk-import.routes.js
│   │   ├── file-upload.routes.js
│   │   ├── search.routes.js
│   │   ├── lookup.routes.js
│   │   ├── dropdown.routes.js
│   │   ├── expense.routes.js
│   │   └── part.routes.js
│   ├── repositories/         # Data access layer (3 files, underused)
│   │   ├── BaseRepository.js
│   │   ├── CustomerRepository.js
│   │   └── LeadRepository.js
│   ├── uploads/              # File upload directory
│   ├── .env                  # DB creds, JWT secret
│   └── server.js             # Entry point (creates app, mounts routes)
│
├── frontend/
│   ├── public/               # Static assets
│   └── src/
│       ├── api/              # API helper functions
│       │   ├── api.js            # Axios instance + interceptors (572 lines)
│       │   ├── bulkImportClient.js
│       │   └── ... (ofCustomerAPI, ofProductAPI, ofOrderAPI — DEAD)
│       ├── components/       # Reusable UI components (21 files)
│       │   ├── Header.js
│       │   ├── Sidebar.js
│       │   ├── Modal.js          # DEAD (unused)
│       │   ├── ConfirmModal.js
│       │   ├── InputModal.js     # DEAD (unused)
│       │   ├── ErrorPopup.js
│       │   ├── PrivateRoute.js   # DEAD (unused)
│       │   └── ...
│       ├── context/          # React Context
│       │   └── AuthContext.js
│       ├── pages/            # Page components (29 files)
│       │   ├── Login.js
│       │   ├── Dashboard.js
│       │   ├── Customers.js
│       │   ├── Leads.js
│       │   ├── Sales.js          # 2637 lines — largest file, needs refactor
│       │   ├── Vehicles.js
│       │   ├── Service.js
│       │   └── ...
│       ├── styles/           # CSS files
│       │   ├── App.css
│       │   ├── order-form-pages.css  # DEAD (unused)
│       │   └── ...
│       ├── App.js            # Root component + React Router setup
│       ├── App.css           # Global styles
│       └── index.js          # Entry point
│
├── PDF/                      # Phase analysis PDFs (not relevant to dev)
├── supplier_management_live.sql  # Additional SQL for supplier module
├── Phase_1_Project_Architecture.md
├── Phase_2_Database_Analysis.md
├── Phase_3_Backend_API_Analysis.md
├── Phase_4_Frontend_Architecture_Analysis.md
├── Phase_5_Authentication_Security_Analysis.md
├── Phase_6_Deployment_Infrastructure_Analysis.md
├── Phase_7_Code_Audit_and_Technical_Debt.md
├── MASTER_DEVELOPER_HANDBOOK.md  ← You are here
└── opencode.json             # opencode configuration
```

---

## 4. Request Lifecycle

### 4.1 Backend Request Flow

```
HTTP Request
  │
  ▼
server.js (app.use middlewares)
  ├── cors()
  ├── express.json()
  ├── morgan('dev')
  │
  ▼
Route file (e.g., customer.routes.js)
  ├── verifyToken()         ← Authenticates JWT
  ├── authorize('admin')    ← Optional: checks role
  │
  ▼
Controller method (e.g., customer.controller.js)
  ├── Validates input
  ├── Runs SQL via db.query()
  ├── Processes result
  │
  ▼
JSON Response
```

### 4.2 Frontend Request Flow

```
User Action
  │
  ▼
Page component (e.g., Customers.js)
  │
  ▼
API helper (e.g., api.js → getCustomers())
  │
  ▼
axios instance (api.js)
  ├── Reads JWT from localStorage
  ├── Sets Authorization header
  ├── Handles 401 → redirects to login
  │
  ▼
Response → setState → re-render
```

### 4.3 Route Registration (server.js)

All routes are mounted in `server.js` under `/api/`:

```javascript
// server.js pattern:
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/customers", customerRoutes);
// ... one line per route file
```

To add a new module: create controller, create routes (with auth middleware), add one line to `server.js`.

---

## 5. Database Guide

### 5.1 Connection

Single `mysql2/promise` pool created in `backend/config/db.config.js`:

```javascript
const mysql = require("mysql2/promise");
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "amserp",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
module.exports = pool;
```

Import as `const db = require("../config/db.config")` in controllers.

### 5.2 Query Patterns

**Parameterized queries (MUST use this pattern — prevents SQL injection):**

```javascript
const [rows] = await db.query("SELECT * FROM customers WHERE id = ?", [id]);
```

**Named placeholders (supported by mysql2):**

```javascript
const [rows] = await db.query(
  "SELECT * FROM customers WHERE name LIKE :search",
  { search: `%${term}%` }
);
```

**⚠️ NEVER** use string interpolation in SQL (found in `reports.controller.js` — see Known Issues).

### 5.3 Key Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `users` | System login accounts | id, username, password, role, employee_id |
| `employees` | Staff records | id, name, phone, designation, salary |
| `customers` | Customer records | id, name, phone, cnic, address, type |
| `leads` | Sales leads | id, customer_id, status, source, assigned_to |
| `vehicles` | Vehicle inventory | id, brand_id, model_id, variant_id, vin, price, status |
| `sales` | Sales transactions | id, customer_id, vehicle_id, total, status, date |
| `sale_items` | Line items per sale | id, sale_id, product_type, qty, price |
| `service_records` | Service appointments | id, vehicle_id, customer_id, service_date, status |
| `invoices` | Financial invoices | id, sale_id, total, paid, due_date, status |
| `ledger` | Financial entries | id, type, reference_id, amount, date, description |
| `purchase_orders` | Stock procurement | id, supplier_id, total, status, date |
| `commissions` | Sales commissions | id, employee_id, sale_id, amount, status |
| `notifications` | System notifications | id, user_id, message, type, is_read |

### 5.4 Conventions

- All tables use `id` as INT AUTO_INCREMENT PRIMARY KEY
- Foreign keys use singular table name + `_id` (e.g., `customer_id`)
- Timestamps: `created_at`, `updated_at` as DATETIME
- Soft delete: `is_deleted` TINYINT(1) DEFAULT 0 (NOT universally applied)
- Status fields: `status` VARCHAR(50) with ENUM-like values checked in app logic

### 5.5 ID Generation (⚠️ CRITICAL BUG)

Several controllers generate IDs using `SELECT MAX(id) + 1 FROM table`. This is a **race condition** under concurrent requests — two requests can get the same "next" ID.

```javascript
// ⚠️ BAD — race condition prone
const [[result]] = await db.query("SELECT MAX(id) + 1 AS next_id FROM table");
```

**Fix:** Use `AUTO_INCREMENT` (already on the `id` column) or `UUID()`.

### 5.6 Views & Stored Procedures

- Views exist for common aggregates (e.g., `sales_summary`, `inventory_status`)
- Stored procedures for: `sp_calculate_commission`, `sp_update_inventory`, etc.
- See `supplier_management_live.sql` for supplier module schema additions

---

## 6. Backend Development Guide

### 6.1 Creating a New Module

**Step 1:** Create controller file `backend/controllers/<name>.controller.js`

```javascript
const db = require("../config/db.config");

// GET all
exports.getAll = async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT * FROM <table> WHERE is_deleted = 0");
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// GET by ID
exports.getById = async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT * FROM <table> WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST create
exports.create = async (req, res, next) => {
  try {
    const { name, ...fields } = req.body;
    const [result] = await db.query("INSERT INTO <table> SET ?", [req.body]);
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
};

// PUT update
exports.update = async (req, res, next) => {
  try {
    await db.query("UPDATE <table> SET ? WHERE id = ?", [req.body, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// DELETE (soft)
exports.delete = async (req, res, next) => {
  try {
    await db.query("UPDATE <table> SET is_deleted = 1 WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
```

**Step 2:** Create route file `backend/routes/<name>.routes.js`

```javascript
const router = require("express").Router();
const { verifyToken, authorize } = require("../middleware/auth.middleware");
const controller = require("../controllers/<name>.controller");

router.use(verifyToken); // All routes in this file require auth

router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.post("/", authorize("admin", "manager"), controller.create);
router.put("/:id", authorize("admin", "manager"), controller.update);
router.delete("/:id", authorize("admin"), controller.delete);

module.exports = router;
```

**Step 3:** Register in `server.js`

```javascript
app.use("/api/<plural>", require("./routes/<name>.routes"));
```

**Step 4:** Create frontend page + API helper (see Frontend Guide §7).

### 6.2 Controller Conventions

- Each controller exports plain functions: `exports.functionName = async (req, res, next) => { ... }`
- Try/catch with `next(error)` for error propagation
- Express error handler in `server.js` catches unhandled errors
- Use `const [rows] = await db.query(...)` — destructure the first element
- Response shape: `{ success: true/false, data: ..., message: "..." }`
- Always parameterize SQL with `?` placeholders

### 6.3 Error Handling

Central error handler in `server.js`:

```javascript
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});
```

Controllers pass errors to this via `next(err)`.

### 6.4 Repository Pattern (Underused)

Three repository files exist at `backend/repositories/`:
- `BaseRepository.js` — generic CRUD methods
- `CustomerRepository.js` — customer-specific queries
- `LeadRepository.js` — lead-specific queries

Most controllers bypass the repositories and query the database directly. New code should use/extend the repository pattern to consolidate data access.

---

## 7. Frontend Development Guide

### 7.1 Project Structure

```
frontend/src/
├── api/           # API helper files (one per domain or shared api.js)
├── components/    # Reusable UI components
├── context/       # React Context providers
├── pages/         # Screen-level components (routed)
├── styles/        # CSS files
├── App.js         # Root component + routing
└── index.js       # Entry point (ReactDOM.render)
```

### 7.2 API Layer

Central API configuration in `frontend/src/api/api.js`:

```javascript
import axios from "axios";

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000/api",
});

// Request interceptor — attach JWT
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle 401
API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Domain-specific helpers
export const getCustomers = () => API.get("/customers");
export const getCustomer = (id) => API.get(`/customers/${id}`);
// ... etc
export default API;
```

**Naming convention for API helpers:** `get<Plural>()`, `get<Singular>(id)`, `create<Singular>(data)`, `update<Singular>(id, data)`, `delete<Singular>(id)`.

### 7.3 Page Component Pattern

```javascript
import React, { useState, useEffect } from "react";
import { getCustomers, deleteCustomer } from "../api/api";
import ConfirmModal from "../components/ConfirmModal";

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await getCustomers();
      setCustomers(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCustomer(deleteId);
      setDeleteId(null);
      loadCustomers();
    } catch (err) {
      setError(err.response?.data?.message || "Delete failed");
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <ErrorPopup message={error} onClose={() => setError(null)} />;

  return (
    <div className="page">
      <h1>Customers</h1>
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Actions</th></tr></thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.phone}</td>
              <td>
                <button onClick={() => setDeleteId(c.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {deleteId && (
        <ConfirmModal
          message="Delete this customer?"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
};

export default Customers;
```

### 7.4 AuthContext

Global auth state in `frontend/src/context/AuthContext.js`:

```javascript
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify token on mount
    if (token) verifyTokenFromServer();
    else setLoading(false);
  }, []);

  const login = async (username, password) => {
    const res = await axios.post("/api/auth/login", { username, password });
    localStorage.setItem("token", res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

### 7.5 Routing (App.js)

```javascript
<BrowserRouter>
  <AuthProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="leads" element={<Leads />} />
        <Route path="sales" element={<Sales />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="service" element={<Service />} />
        {/* ... more routes */}
      </Route>
    </Routes>
  </AuthProvider>
</BrowserRouter>
```

### 7.6 State Management Guidelines

- **Auth state:** Use AuthContext (already set up)
- **Page-local data:** Use `useState` + `useEffect` in the page component
- **Cross-page state:** Create a new Context or lift state to a shared parent
- **No Redux** — don't introduce Redux for this codebase size; Context is sufficient
- **Form state:** Use local `useState` per field or a simple form state object

---

## 8. Authentication & Authorization

### 8.1 Auth Flow

```
1. User submits username + password → POST /api/auth/login
2. Server validates against `users` table (bcrypt.compare)
3. Server returns JWT containing: { id, username, role, employee_id }
4. Frontend stores JWT in localStorage
5. All subsequent API calls include JWT in Authorization header
6. verifyToken middleware decodes JWT, attaches `req.user`
7. authorize middleware checks req.user.role against allowed roles
```

### 8.2 JWT Configuration (`app.config.js`)

```javascript
module.exports = {
  jwtSecret: process.env.JWT_SECRET || "fallback_dev_secret",
  jwtExpiry: "24h",
};
```

**⚠️ Production:** Change `JWT_SECRET` to a strong, unique value in `.env`.

### 8.3 Auth Middleware (`auth.middleware.js`)

```javascript
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/app.config");

// Verify JWT — attach req.user
exports.verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "No token" });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Check user role
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};
```

### 8.4 Route Protection Pattern

```javascript
// All routes need auth:
router.use(verifyToken);

// Specific routes need role:
router.post("/", authorize("admin", "manager"), controller.create);
router.delete("/", authorize("admin"), controller.delete);
```

### 8.5 Roles

| Role | Level | Description |
|---|---|---|
| `admin` | 3 | Full system access |
| `manager` | 2 | Management-level access |
| `user` | 1 | Basic staff access |

Roles are stored in `users.role` as strings. Role hierarchy is NOT enforced programmatically — each route specifies exactly which roles are allowed.

### 8.6 ⚠️ Critical Auth Gaps

1. **`backend/routes/service.routes.js`** — Missing `router.use(verifyToken)` — all service endpoints are publicly accessible. **Fix:** Add `router.use(verifyToken)` as the first middleware.

2. **`reports.controller.js` — `executeReport`** — Accepts raw SQL from the request body (`req.body.query`). Any authenticated user can execute arbitrary SQL. **Fix:** Remove this endpoint entirely; use predefined parameterized report queries only.

---

## 9. Security Checklist

### 9.1 Immediate Fixes

- [ ] Add `verifyToken` middleware to `service.routes.js`
- [ ] Remove or lock down `executeReport` in `reports.controller.js`
- [ ] Change `JWT_SECRET` from fallback value in production
- [ ] Add input validation/sanitization to all controllers

### 9.2 Code Review Items

- [ ] **SQL injection** — All queries use parameterized `?` placeholders (except reports.controller)
- [ ] **JWT secret** — Not in code, uses env variable (good), but has fallback (bad)
- [ ] **Password storage** — bcrypt (good)
- [ ] **CORS** — Configured, but may be too permissive (check `server.js`)
- [ ] **File upload** — Multer middleware validates file types (check `upload.middleware.js`)
- [ ] **No Helmet** — `helmet` middleware is not used (add for production)
- [ ] **No rate limiting** — No `express-rate-limit` (add for login endpoint)
- [ ] **No input validation library** — No Joi, express-validator, etc. (add for production)

### 9.3 Secure Coding Rules

1. **NEVER** use string interpolation in SQL queries
2. **ALWAYS** validate request body fields before using them (type checks, required fields)
3. **NEVER** log passwords, tokens, or secrets
4. **ALWAYS** use parameterized queries (`?` placeholders)
5. **NEVER** expose `req.body` directly in SQL `INSERT ... SET ?` without sanitizing
6. **ALWAYS** wrap async handlers in try/catch

---

## 10. Business Modules

### 10.1 Authentication Module
- Files: `auth.controller.js`, `auth.routes.js`, `user.controller.js`, `user.routes.js`
- Tables: `users`
- Endpoints: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`

### 10.2 Customer Management
- Files: `customer.controller.js`, `customer.routes.js`
- Tables: `customers`, `customer_types`
- Features: CRUD, search by name/phone/CNIC

### 10.3 Lead Management
- Files: `lead.controller.js`, `lead.routes.js`
- Tables: `leads`, `lead_sources`, `lead_statuses`
- Features: CRUD, status tracking, conversion to customer

### 10.4 Vehicle Inventory
- Files: `vehicles.controller.js`, `vehicles.routes.js`, `brand.controller.js`, `model.controller.js`, `variant.controller.js`
- Tables: `vehicles`, `brands`, `models`, `variants`
- Features: CRUD, stock tracking, VIN search, status management

### 10.5 Sales
- Files: `sales.controller.js`, `sales.routes.js`
- Tables: `sales`, `sale_items`
- Features: Create sale with line items, calculate totals, status tracking
- **Note:** Frontend `Sales.js` is 2637 lines — refactoring target

### 10.6 Service Management
- Files: `service.controller.js`, `service.routes.js`
- Tables: `service_records`, `service_types`
- Features: Schedule appointments, track service status
- **⚠️ Auth missing** — route file has no `verifyToken` middleware

### 10.7 Invoicing
- Files: `invoice.controller.js`, `invoice.routes.js`
- Tables: `invoices`
- Features: Generate invoices from sales, track payment status

### 10.8 Ledger / Accounting
- Files: `ledger.controller.js`, `ledger.routes.js`, `ledgertype.controller.js`, `bank.controller.js`
- Tables: `ledger`, `ledger_types`, `banks`
- Features: Double-entry tracking, bank accounts, transaction history

### 10.9 Purchase Orders
- Files: `purchase-order.controller.js`, `purchase-order.routes.js`
- Tables: `purchase_orders`, `purchase_order_items`
- Features: Create POs, receive stock, track order status

### 10.10 Employee Management
- Files: `employee.controller.js`, `employee.routes.js`
- Tables: `employees`
- Features: Employee CRUD, designation tracking

### 10.11 Commissions
- Files: `commission.controller.js`, `commission.routes.js`
- Tables: `commissions`
- Features: Calculate and track sales commissions

### 10.12 Notifications
- Files: `notification.controller.js`, `notification.routes.js`
- Tables: `notifications`
- Features: Create and display system notifications

### 10.13 Reports
- Files: `reports.controller.js`, `reports.routes.js`
- Tables: Various (depends on report)
- Features: Predefined reports + **dangerous** `executeReport` endpoint
- **⚠️ Security risk** — dynamic SQL execution endpoint

### 10.14 Dashboard
- Files: `dashboard.controller.js`, `dashboard.routes.js`
- Tables: Various (aggregated queries)
- Features: KPIs, charts, summary data

### 10.15 Bulk Import
- Files: `bulkImport.controller.js`, `bulk-import.routes.js`, `bulkImportClient.js`
- Features: CSV/Excel import for customers, vehicles, etc.

### 10.16 Stock / Inventory
- Files: `stock.controller.js`, `inventory.controller.js`
- Tables: `stock`, `inventory`
- Features: Stock tracking, inventory adjustments

### 10.17 File Upload
- Files: `fileUpload.controller.js`, `file-upload.routes.js`, `upload.middleware.js`
- Features: File upload with Multer, file type validation

---

## 11. API Reference (Quick)

### 11.1 Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | No | Login, returns JWT |
| POST | `/api/auth/register` | Admin | Create user |
| GET | `/api/auth/me` | Yes | Current user info |

### 11.2 Core CRUD Modules

All follow RESTful pattern with `verifyToken`:

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/customers` | Yes | List customers |
| GET | `/api/customers/:id` | Yes | Get customer |
| POST | `/api/customers` | Yes+ | Create customer |
| PUT | `/api/customers/:id` | Yes+ | Update customer |
| DELETE | `/api/customers/:id` | Admin | Delete customer |

Replace `customers` with: `leads`, `vehicles`, `sales`, `employees`, `invoices`, `ledger`, `purchase-orders`, `commissions`, `notifications`, `brands`, `models`, `variants`, `banks`, `ledgertypes`, `inventory`, `stock`, `companies`, `users`, `expenses`, `parts`.

### 11.3 Special Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Dashboard KPIs |
| GET | `/api/search?q=term&type=customer` | Global search |
| GET | `/api/lookup/:type` | Lookup data |
| GET | `/api/dropdown/:type` | Dropdown options |
| POST | `/api/bulk-import` | CSV/Excel import |
| POST | `/api/file-upload` | File upload |
| POST | `/api/reports/execute` | ⚠️ Execute SQL (dangerous) |

---

## 12. Deployment Guide

### 12.1 Environment Variables

Create `.env` in `backend/`:

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=amserp
JWT_SECRET=your_strong_random_secret_here
NODE_ENV=production
```

For frontend, create `.env` in `frontend/`:

```env
REACT_APP_API_URL=http://your-server:5000/api
```

### 12.2 Build & Run

**Backend:**
```bash
cd backend
npm install
node server.js          # Development
# OR use PM2 for production:
npm install -g pm2
pm2 start server.js --name amserp-api
```

**Frontend:**
```bash
cd frontend
npm install
npm run build           # Produces frontend/build/
# Serve with nginx or any static server
```

### 12.3 Production Architecture

```
Nginx (reverse proxy)
├── /api/* → localhost:5000 (Node.js backend)
└── /*     → frontend/build/ (React static files)

MySQL 8 running on localhost:3306
Node.js backend running with PM2
```

### 12.4 Nginx Configuration (Example)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/amserp/frontend/build;

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 12.5 MySQL Setup

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE amserp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Import schema
mysql -u root -p amserp < schema.sql

# Import supplier module (if needed)
mysql -u root -p amserp < supplier_management_live.sql
```

---

## 13. Developer Playbook — Common Tasks

### 13.1 Add a New Database Table

1. Write `ALTER TABLE` or `CREATE TABLE` SQL
2. Create controller `backend/controllers/<name>.controller.js`
3. Create routes `backend/routes/<name>.routes.js`
4. Register routes in `server.js`
5. Create frontend page `frontend/src/pages/<Name>.js`
6. Add API helpers in `frontend/src/api/api.js`
7. Add route in `frontend/src/App.js`

### 13.2 Add a New API Endpoint to Existing Module

1. Add function to existing controller
2. Add route to existing route file
3. Add API helper to frontend `api.js`

### 13.3 Rename a Column

1. `ALTER TABLE table_name CHANGE old_name new_name ...`
2. Update all SQL queries referencing the old name (grep the codebase)
3. Update any frontend code referencing the old property name

### 13.4 Debug a 500 Error

1. Check the backend terminal/log output (the error stack trace)
2. Look at the SQL query that failed (often logged by morgan or console.error)
3. Run the SQL manually in MySQL Workbench to verify
4. Check for: missing table/column, type mismatch, NULL violation

### 13.5 Debug a 401 Error

1. Check if JWT token exists in localStorage (`localStorage.getItem("token")`)
2. Check if token is expired (decode at jwt.io)
3. Check if Authorization header is sent in the request
4. Check if `verifyToken` middleware is applied on the route
5. Check if the route file has `router.use(verifyToken)`

### 13.6 Debug a 403 Error

1. Check `req.user.role` — what role does the user have?
2. Check the `authorize()` call — what roles are allowed?
3. Check the `users` table for the user's role value

### 13.7 Debug Frontend Build Issues

```bash
cd frontend
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 13.8 Hot Reload

- Backend: Use `nodemon` (`npm install -g nodemon; nodemon server.js`)
- Frontend: CRA hot reloads by default with `npm start`

---

## 14. Debugging & Troubleshooting

### 14.1 Common Backend Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `ECONNREFUSED` | MySQL not running | Start MySQL service |
| `ER_ACCESS_DENIED` | Wrong DB credentials | Check `.env` values |
| `ER_NO_SUCH_TABLE` | Table doesn't exist | Check spelling, run migration |
| `ER_BAD_FIELD_ERROR` | Column doesn't exist | Check SQL query vs table schema |
| `Cannot set headers after they are sent` | Double response | Check for multiple `res.json()` calls |
| `jwt expired` | Token expired | Re-login or increase `jwtExpiry` |
| `Unexpected token < in JSON` | HTML response (404 page) | Check URL, check if server is running |

### 14.2 Common Frontend Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `Cannot read property 'map' of undefined` | API returned unexpected shape | Check `res.data.data` structure |
| `401 (Unauthorized)` | No token / expired token | Re-login |
| `CORS error` | Backend origin mismatch | Check `cors()` config in `server.js` |
| `Module not found` | Missing import / wrong path | Check file path case |

### 14.3 Debugging SQL

Enable query logging in `db.config.js`:

```javascript
const pool = mysql.createPool({
  // ... existing config
  enableKeepAlive: true,
});
// Add logging wrapper
const originalQuery = pool.query.bind(pool);
pool.query = async (sql, params) => {
  console.log("[SQL]", sql, params);
  return originalQuery(sql, params);
};
```

---

## 15. Code Standards & Conventions

### 15.1 General

- Use **plain JavaScript** (no TypeScript — project convention)
- Use **async/await** (no raw Promises or callbacks)
- Use **camelCase** for variables, functions, filenames (JS files)
- Use **PascalCase** for React components
- Use **UPPER_SNAKE_CASE** for constants/environment variables
- File names: lowercase with hyphens for backend, PascalCase for frontend components
- Indentation: 2 spaces
- Semicolons: required

### 15.2 Backend

```
File naming: kebab-case (customer.controller.js, customer.routes.js)
Exports: module.exports = { function1, function2 } at bottom, OR exports.fn = ...
Functions: async (req, res, next) => { ... }
Response format: { success: true/false, data: ..., message: "..." }
Error handling: next(err) → central error handler
SQL: Always parameterized (?) queries, never string interpolation
```

### 15.3 Frontend

```
File naming: PascalCase for components (Customers.js), camelCase for utilities (api.js)
Components: Function components with hooks (no class components)
State: useState for local, useContext for global, no Redux
API calls: Through api.js helpers, not direct axios
CSS: Component-specific classes in App.css (no CSS modules)
Export: export default ComponentName
```

### 15.4 Git

- No established branching strategy yet — recommend Git Flow
- Commit messages: Conventional Commits format (`feat:`, `fix:`, `refactor:`, `chore:`)
- **Never commit secrets** (check `.env`, `node_modules`, `build/` in `.gitignore`)

---

## 16. Testing Strategy

### 16.1 Current State

**There are NO tests in this codebase.** Not unit, integration, or E2E.

### 16.2 Recommended Approach

Given the codebase size and lack of existing tests, start with:

1. **Critical path manual testing** — After each change, manually test the affected flow
2. **Add API-level tests** — Use `supertest` + `mocha`/`jest` for backend endpoints
3. **Add smoke tests** — Verify server starts, DB connects, login works

### 16.3 Quick Start for Adding Tests

```bash
cd backend
npm install --save-dev jest supertest
```

Create `backend/__tests__/auth.test.js`:

```javascript
const request = require("supertest");
const app = require("../server"); // May need to export app from server.js

describe("POST /api/auth/login", () => {
  it("should return 400 for missing credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({});
    expect(res.status).toBe(400);
  });
});
```

**Note:** `server.js` currently both creates the app and starts the listener. You may need to refactor it to export the app without starting the server for testing.

---

## 17. Known Issues & Technical Debt

### 17.1 Critical Bugs (Fix Immediately)

| ID | Severity | File | Issue | Impact |
|---|---|---|---|---|
| C1 | 🔴 Critical | `routes/service.routes.js` | Missing `verifyToken` middleware — all service endpoints are public | Anyone can access/modify service records |
| C2 | 🔴 Critical | `reports.controller.js:executeReport` | Accepts raw SQL from request body `req.body.query` | Authenticated users can run arbitrary SQL, read/modify any data |
| C3 | 🔴 Critical | Multiple controllers | Uses `SELECT MAX(id)+1` for ID generation instead of AUTO_INCREMENT | Race condition under concurrency → duplicate IDs |

### 17.2 High-Severity Issues

| ID | Severity | File | Issue |
|---|---|---|---|
| H1 | 🟠 High | `reports.controller.js:executeReport` | No validation of SQL — major injection risk |
| H2 | 🟠 High | `Sales.js` (frontend) | 2637 lines — unmaintainable, logic and UI tightly coupled |
| H3 | 🟠 High | `server.js` | No Helmet, no rate limiting, no request validation |
| H4 | 🟠 High | All controllers | No input validation library; fields are not type-checked |
| H5 | 🟠 High | `api.js` (frontend) | 572 lines — should be split into domain modules |
| H6 | 🟠 High | All CSS | Single massive `App.css` — no modular CSS approach |

### 17.3 Medium-Severity Issues

| ID | Severity | Issue |
|---|---|---|
| M1 | 🟡 Medium | ~400 lines dead code (Modal.js, InputModal.js, PrivateRoute.js, 3 API files, report.routes.js, order-form-pages.css) |
| M2 | 🟡 Medium | ~700–1000 lines duplicate code across controllers (CRUD boilerplate) |
| M3 | 🟡 Medium | Inconsistent error responses (some return `{ error: ... }`, others `{ success: false, message: ... }`) |
| M4 | 🟡 Medium | Inconsistent auth (some routes use `authorize()`, most use only `verifyToken`) |
| M5 | 🟡 Medium | Soft delete not consistently implemented (`is_deleted` missing from several tables) |
| M6 | 🟡 Medium | No pagination on any list endpoint (all data returned at once) |
| M7 | 🟡 Medium | Frontend lacks loading states on many pages (empty table shown while fetching) |
| M8 | 🟡 Medium | JWT not refreshed — 24h expiry means forced re-login |
| M9 | 🟡 Medium | Repository pattern exists but underused (3 files, most controllers bypass them) |
| M10 | 🟡 Medium | `users` table passwords stored with bcrypt but no password strength enforcement |

### 17.4 Low-Severity Issues

| ID | Severity | Issue |
|---|---|---|
| L1 | 🟢 Low | No TypeScript (makes refactoring harder at scale) |
| L2 | 🟢 Low | No `.env.example` file (unclear what env vars are needed) |
| L3 | 🟢 Low | `console.log` statements left in production code |
| L4 | 🟢 Low | Inconsistent SQL formatting (some uppercase keywords, some lowercase) |
| L5 | 🟢 Low | No Dockerfile or docker-compose for local dev |

---

## 18. Refactoring Roadmap

### Phase A — Security (Week 1)

| Task | Effort | Depends On |
|---|---|---|
| A1: Add verifyToken to service.routes.js | 15 min | None |
| A2: Remove or lock down executeReport | 1 hr | None |
| A3: Add Helmet middleware | 30 min | None |
| A4: Add rate limiting to login | 30 min | None |
| A5: Fix MAX(id)+1 → AUTO_INCREMENT | 2 hr | DB access |
| A6: Add `.env.example` | 15 min | None |

### Phase B — Quality (Week 2–3)

| Task | Effort | Depends On |
|---|---|---|
| B1: Remove dead code (6 files) | 1 hr | None |
| B2: Extract BaseRepository CRUD into all controllers | 4 hr | None |
| B3: Standardize error response format | 2 hr | None |
| B4: Standardize auth (consistent authorize usage) | 2 hr | None |
| B5: Add consistent soft delete across all tables | 3 hr | DB access |
| B6: Add input validation (express-validator or Joi) | 4 hr | None |

### Phase C — Frontend (Week 4–5)

| Task | Effort | Depends On |
|---|---|---|
| C1: Refactor Sales.js → smaller components | 8 hr | None |
| C2: Split api.js into domain modules | 2 hr | None |
| C3: Add loading states to all pages | 3 hr | None |
| C4: Add pagination to list endpoints | 4 hr | Backend work |
| C5: Remove unused CSS | 1 hr | None |

### Phase D — Architecture (Week 6–8)

| Task | Effort | Depends On |
|---|---|---|
| D1: Convert to TypeScript | 40+ hr | All of Phase B/C |
| D2: Add comprehensive testing | 20+ hr | All of Phase B |
| D3: Add Docker setup | 4 hr | None |
| D4: Add CI/CD pipeline | 4 hr | D3 |
| D5: Implement JWT refresh tokens | 4 hr | None |

---

## 19. Glossary

| Term | Definition |
|---|---|
| **CRA** | Create React App — React project scaffolding tool (v5) |
| **JWT** | JSON Web Token — stateless auth token format |
| **VIN** | Vehicle Identification Number — unique identifier for vehicles |
| **CNIC** | Computerized National Identity Card — Pakistan national ID |
| **PO** | Purchase Order — procurement document |
| **Ledger** | Financial record book for tracking debits/credits |
| **ERP** | Enterprise Resource Planning — integrated business management system |
| **SPA** | Single Page Application — React app with client-side routing |
| **RBAC** | Role-Based Access Control — authorization by user role |
| **Multer** | Express middleware for file upload handling |
| **mysql2** | MySQL driver for Node.js with promise support |
| **bcrypt** | Password hashing library |
| **Helmet** | Express security middleware (headers) |
| **PM2** | Node.js process manager for production |

---

## 20. AI Developer Guide

### 20.1 Working with This Codebase

This section is specifically for AI coding assistants working on this project.

**Before making changes:**
1. Read this handbook (you already did)
2. Check the Phase 7 audit for known issues in the area you're modifying
3. Read the specific file(s) you'll change
4. Read 2–3 neighboring files to understand conventions
5. Check if a similar pattern exists elsewhere in the codebase

**When asked to fix something:**
1. First check if it's in the Known Issues table (§17)
2. If it's a security issue (auth, SQL injection), prioritize it
3. If it's dead code, remove it (but check nothing imports it first)
4. If it's duplicate code, extract to a shared function

**Response format conventions:**
- Backend responses: `{ success: true/false, data: ..., message: "..." }`
- Error responses: `{ success: false, message: "Error description" }`
- List endpoints: `{ success: true, data: [...], total: N }` (future — pagination)
- Status codes: 200 (success), 201 (created), 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)

**Don't add features that:**
- Require a new npm package without checking it's not already available
- Change the database schema without also updating all queries
- Add Redux or another state management library (Context is sufficient)
- Introduce TypeScript (not yet — it's in the roadmap for later)

**When in doubt:**
- Check if there's a repository method you should use instead of raw SQL
- Check the auth middleware is applied to new routes
- Check for existing API helpers before creating new ones
- Check the existing CSS patterns before adding styles

### 20.2 Prompting Tips for AI

When asking an AI to work on AMSERP code, include in your prompt:

1. The specific file(s) to modify (with paths)
2. What the code should do (business requirement)
3. Which similar files to reference for conventions
4. Any constraints (no TypeScript, no new packages, etc.)

Example:

> "Add a supplier module to AMSERP. Create backend controller at `backend/controllers/supplier.controller.js`, routes at `backend/routes/supplier.routes.js`, and register it in `server.js`. Follow the same pattern as the customer module. Use `verifyToken` middleware on all routes and `authorize('admin')` on create/update/delete. Frontend page at `frontend/src/pages/Suppliers.js` — follow the Customers.js pattern. No TypeScript, no new npm packages."

---

*End of Master Developer Handbook — Phase 8*
*Synthesized from Phase 1–7 analysis documents and full codebase audit*
*Last updated: July 2026*
