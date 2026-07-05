# Phase 3: Backend API Analysis

> **AMSERP — Auto Management System (CRM + ERP)**
> Backend stack: Express 4.18 + mysql2/promise 3.6 + JSON Web Token 9.0
> Generated: 2026-06-30

---

## 1. Backend Overview

| Attribute | Value |
|-----------|-------|
| **Runtime** | Node.js (Express 4.18) |
| **Database Driver** | `mysql2/promise` (raw SQL — no ORM) |
| **Architecture** | Routes → Controllers (inline SQL + stored procedures) → MySQL |
| **Service Layer** | ❌ **Does not exist** — all business logic lives in controllers |
| **Models Layer** | ❌ Only 1 model file (`orderForm.model.js`) — 3 repository classes |
| **Authentication** | JWT (24h access token + 7d refresh token) |
| **Authorization** | 3-tier: role-based (`authorize`), permission-based (`checkPermission`), inline role checks |
| **API Documentation** | Swagger via `swagger-jsdoc` + `swagger-ui-express` at `/api-documentation` |
| **Logging** | Winston 3.11 + DailyRotateFile |
| **File Upload** | Multer 1.4 (memory storage, 10 MB limit) |
| **Validation** | `express-validator` via generic `validateRequest` factory |
| **Production Dependencies** | 16 packages |
| **Dev Dependencies** | 1 package (nodemon) |

**Dependencies (`package.json`):**

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | Web framework |
| mysql2 | ^3.6.5 | MySQL driver (promise-based) |
| jsonwebtoken | ^9.0.2 | JWT generation/verification |
| bcryptjs | ^2.4.3 | Password hashing |
| uuid | ^9.0.0 | UUID generation |
| multer | ^1.4.5-lts.1 | File upload handling |
| helmet | ^7.1.0 | Security headers |
| cors | ^2.8.5 | CORS middleware |
| dotenv | ^16.3.1 | Environment variables |
| winston | ^3.11.0 | Logging |
| winston-daily-rotate-file | ^4.7.1 | Log rotation |
| express-validator | ^7.0.1 | Request validation |
| swagger-jsdoc | ^6.2.8 | Swagger spec generation |
| swagger-ui-express | ^5.0.0 | Swagger UI serving |
| xlsx | ^0.18.5 | Excel file parsing (bulk import) |
| csv-parse | ^5.5.3 | CSV parsing (bulk import) |
| nodemon (dev) | ^3.0.2 | Auto-restart in development |

---

## 2. Entry Point Analysis — `server.js`

The server startup follows this sequence:

```
1. dotenv.config()              ← Load .env (from ../.env relative to backend/)
2. express()                    ← Create app instance
3. app.use(helmet())            ← Security headers
4. app.use(cors(corsOptions))   ← CORS (localhost + whitelist)
5. app.use(express.json())      ← JSON body parser (10 MB limit)
6. app.use(express.urlencoded())← URL-encoded body parser
7. Request Logger middleware    ← Logs every request (method, path, IP, UA)
8. Swagger setup                ← Load JSDoc annotations from routes/*.js
   app.use('/api-documentation', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
9. Health check                 ← GET /api/health
10. Build marker                ← GET /api/employees/_build
11. Route registration          ← 28 route groups (see §3)
12. 404 handler                 ← Catch-all
13. Global error handler        ← errorHandler middleware
14. Database connection test    ← testConnection()
15. Server listen               ← PORT 3002
```

**Key observations:**
- File upload middleware (Multer) is NOT configured globally — it's configured per-route in `uploader.routes.js` and `bulk-import.routes.js`.
- Rate limiting is NOT implemented.
- Request body size limit is 10 MB for both JSON and URL-encoded.

---

## 3. Route Inventory

28 route files are registered in `server.js`. The old `report.routes.js` is **NOT registered** (dead code — `reports.routes.js` replaced it).

| # | Base URL | Route File | Module |
|---|----------|------------|--------|
| 1 | `/api/auth` | `auth.routes.js` | Authentication |
| 2 | `/api/users` | `user.routes.js` | User listing (legacy + admin) |
| 3 | `/api/admin` | `admin.routes.js` | User/Role/Department/Status Management |
| 4 | `/api/leads` | `lead.routes.js` | Lead CRUD + Analytics |
| 5 | `/api/lead-master` | `lead-master.routes.js` | Lead sources, statuses, priorities, cities |
| 6 | `/api/sales-master` | `sales-master.routes.js` | Quotation/Booking/Order/Invoice statuses, priorities |
| 7 | `/api/customers` | `customer.routes.js` | Customer CRUD |
| 8 | `/api/vehicles` | `vehicle.routes.js` | Vehicle inventory CRUD |
| 9 | `/api/parts` | `parts.routes.js` | Parts inventory CRUD |
| 10 | `/api/quotations` | `quotation.routes.js` | Quotation CRUD |
| 11 | `/api/bookings` | `booking.routes.js` | Booking CRUD + allocation + conversion |
| 12 | `/api/sales` | `sales.routes.js` | Sales order CRUD + direct order + delivery |
| 13 | `/api/invoices` | `invoice.routes.js` | Invoice CRUD + items + payments + send |
| 14 | `/api/payments` | `payment.routes.js` | Payment recording |
| 15 | `/api/services` | `service.routes.js` | Service appointments + job cards |
| 16 | `/api/reports` | `reports.routes.js` | Reports CRUD + predefined reports |
| 17 | `/api/dashboard` | `dashboard.routes.js` | Dashboard stats, trends, KPIs, alerts |
| 18 | `/api/warehouses` | `warehouse.routes.js` | Warehouse CRUD + inventory |
| 19 | `/api/erp-settings` | `erp-settings.routes.js` | Companies, branches, settings, currencies, taxes, document templates |
| 20 | `/api/vehicle-master` | `vehicle-master.routes.js` | Makes, models, variants, colors, categories, suppliers |
| 21 | `/api/payment-methods` | `payment-methods.routes.js` | Payment methods CRUD |
| 22 | `/api/service-master` | `service-master.routes.js` | Service types, labor rates, packages, warranties |
| 23 | `/api/profile` | `profile.routes.js` | Current user profile |
| 24 | `/api/search` | `global-search.routes.js` | Global search across modules |
| 25 | `/api/uploader` | `uploader.routes.js` | Order form file upload |
| 26 | `/api/vehicle-branding` | `vehicle-branding.routes.js` | Vehicle brand management |
| 27 | `/api/bulk-import` | `bulk-import.routes.js` | Bulk CSV/XLSX import |
| 28 | `/api/employees` | `employees.routes.js` | Employee management |
| 29 | `/api/payroll` | `payroll.routes.js` | Payroll periods + lines |
| 30 | `/api/leaves` | `leaves.routes.js` | Leave types, balances, requests |
| 31 | `/api/expenses` | `expenses.routes.js` | Expense accounts, categories, items |
| 32 | `/api/ledger` | `ledger.routes.js` | General ledger view |

**Unregistered (dead) route files:**
| File | Reason |
|------|--------|
| `report.routes.js` | Replaced by `reports.routes.js` — 7 view-based endpoints, never imported |

---

## 4. Complete Endpoint Catalog

### 4.1 Authentication (`/api/auth`)

| Method | Path | Auth | Controller Logic | DB Tables |
|--------|------|------|-----------------|-----------|
| POST | `/login` | None | Inline SQL: validate email+password, generate JWT + refresh token, store session, update last_login | `users`, `roles`, `user_sessions` |
| POST | `/register` | None | Inline SQL: validate unique email, hash password, insert user (default role_id=9) | `users` |
| GET | `/me` | ✅ | Return `req.user` fields (set by auth middleware) | (from JWT) |
| POST | `/logout` | ✅ | Inline SQL: delete all sessions for user | `user_sessions` |

### 4.2 User Management (`/api/users`)

| Method | Path | Auth+Authz | Controller Logic | DB Tables |
|--------|------|------------|-----------------|-----------|
| GET | `/active` | ✅ auth | Inline SQL: active users (name+email) | `users` |
| GET | `/` | ✅ auth + `super_admin` | Inline SQL: all users with roles | `users`, `roles` |
| GET | `/roles/list` | ✅ auth | Inline SQL: active roles | `roles` |
| GET | `/:id` | ✅ auth | Inline SQL: user by ID with role | `users`, `roles` |

### 4.3 Admin Management (`/api/admin`)

**User Management sub-routes:**

| Method | Path | Authz | Controller Method |
|--------|------|-------|-------------------|
| GET | `/users/stats` | `super_admin`, `sales_manager` | `userController.getUserStats` |
| GET | `/users` | `super_admin`, `sales_manager` | `userController.getAllUsers` |
| GET | `/users/:id` | `super_admin`, `sales_manager` | `userController.getUserById` |
| POST | `/users` | `super_admin` | `userController.createUser` |
| PUT | `/users/:id` | `super_admin` | `userController.updateUser` |
| DELETE | `/users/:id` | `super_admin` | `userController.deleteUser` (soft) |
| PATCH | `/users/:id/status` | `super_admin` | `userController.toggleUserStatus` |
| PATCH | `/users/:id/role` | `super_admin` | `userController.assignRole` |
| PATCH | `/users/:id/department` | `super_admin` | `userController.assignDepartment` |
| DELETE | `/users/:id/department/:deptId` | `super_admin` | `userController.removeDepartment` |
| POST | `/users/:id/reset-password` | `super_admin` | `userController.resetPassword` |

**Role Management sub-routes:**

| Method | Path | Authz | Controller Method |
|--------|------|-------|-------------------|
| GET | `/roles` | `super_admin` | `roleController.getAllRoles` |
| GET | `/roles/:id` | `super_admin` | `roleController.getRoleById` |
| POST | `/roles` | `super_admin` | `roleController.createRole` |
| PUT | `/roles/:id` | `super_admin` | `roleController.updateRole` |
| DELETE | `/roles/:id` | `super_admin` | `roleController.deleteRole` |
| PUT | `/roles/:id/permissions` | `super_admin` | `roleController.assignPermissions` |

**Permission sub-routes:**

| Method | Path | Authz | Controller Method |
|--------|------|-------|-------------------|
| GET | `/permissions` | `super_admin` | `roleController.getAllPermissions` |
| GET | `/permissions/matrix` | `super_admin` | `roleController.getPermissionMatrix` |
| GET | `/permissions/modules` | `super_admin` | `roleController.getPermissionModules` |

**Department Management sub-routes:**

| Method | Path | Authz | Controller Method |
|--------|------|-------|-------------------|
| GET | `/departments/stats` | `super_admin`, `sales_manager` | `departmentController.getDepartmentStats` |
| GET | `/departments` | ✅ auth | `departmentController.getAllDepartments` |
| GET | `/departments/:id` | ✅ auth | `departmentController.getDepartmentById` |
| POST | `/departments` | `super_admin` | `departmentController.createDepartment` |
| PUT | `/departments/:id` | `super_admin` | `departmentController.updateDepartment` |
| DELETE | `/departments/:id` | `super_admin` | `departmentController.deleteDepartment` |
| PATCH | `/departments/:id/manager` | `super_admin` | `departmentController.assignManager` |

**Status Management sub-routes:**

| Method | Path | Authz | Controller Method |
|--------|------|-------|-------------------|
| GET | `/statuses/tables` | `super_admin` | `statusController.getAvailableTables` |
| GET | `/statuses/analytics` | `super_admin` | `statusController.getStatusAnalytics` |
| GET | `/statuses` | ✅ auth | `statusController.getAllStatuses` |
| GET | `/statuses/table/:tableName` | ✅ auth | `statusController.getStatusesByTable` |
| GET | `/statuses/detail/:id` | ✅ auth | `statusController.getStatusById` |
| POST | `/statuses` | `super_admin` | `statusController.createStatus` |
| PUT | `/statuses/:id` | `super_admin` | `statusController.updateStatus` |
| DELETE | `/statuses/:id` | `super_admin` | `statusController.deleteStatus` |
| PUT | `/statuses/:tableName/reorder` | `super_admin` | `statusController.reorderStatuses` |

### 4.4 Lead Management (`/api/leads`)

| Method | Path | Auth | Controller / Repo |
|--------|------|------|-------------------|
| GET | `/` | ✅ auth | `LeadRepository.findAllWithFilters` |
| GET | `/sources/list` | ✅ auth | `LeadRepository.getLeadSources` |
| GET | `/filter-options` | ✅ auth | `LeadRepository.getFilterOptions` |
| GET | `/analytics` | ✅ auth | `LeadRepository.getAnalytics` |
| GET | `/stats` | ✅ auth | `LeadRepository.getPipelineStats` + `getSourceDistribution` |
| GET | `/export` | ✅ auth | `LeadRepository.exportLeads` → CSV |
| GET | `/:id` | ✅ auth | `LeadRepository.findById` |
| POST | `/` | ✅ auth | `LeadRepository.create` |
| PUT | `/:id` | ✅ auth | `LeadRepository.update` |
| DELETE | `/:id` | ✅ auth | `LeadRepository.delete` |
| POST | `/:id/convert` | ✅ auth | `LeadRepository.convertToCustomer` |

### 4.5 Lead Master Data (`/api/lead-master`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/stats` | ✅ auth |
| GET | `/sources` | ✅ auth |
| POST | `/sources` | ✅ auth |
| PUT | `/sources/:id` | ✅ auth |
| DELETE | `/sources/:id` | ✅ auth |
| GET | `/statuses` | ✅ auth |
| POST | `/statuses` | ✅ auth |
| PUT | `/statuses/:id` | ✅ auth |
| DELETE | `/statuses/:id` | ✅ auth |
| GET | `/priorities` | ✅ auth |
| POST | `/priorities` | ✅ auth |
| PUT | `/priorities/:id` | ✅ auth |
| DELETE | `/priorities/:id` | ✅ auth |
| GET | `/cities` | ✅ auth |
| POST | `/cities` | ✅ auth |
| PUT | `/cities/:id` | ✅ auth |
| DELETE | `/cities/:id` | ✅ auth |

All use inline SQL in the route file (no controller). No authorization beyond `authenticate`.

### 4.6 Sales Master Data (`/api/sales-master`)

| Method | Path | Auth | Entity / Table |
|--------|------|------|---------------|
| GET | `/stats` | ✅ auth | All status tables |
| GET | `/quotation-statuses` | ✅ auth | `sales_quotation_statuses` |
| POST | `/quotation-statuses` | ✅ auth | Same |
| PUT | `/quotation-statuses/:id` | ✅ auth | Same |
| DELETE | `/quotation-statuses/:id` | ✅ auth | Same |
| GET | `/booking-statuses` | ✅ auth | `sales_booking_statuses` |
| POST | `/booking-statuses` | ✅ auth | Same |
| PUT | `/booking-statuses/:id` | ✅ auth | Same |
| DELETE | `/booking-statuses/:id` | ✅ auth | Same |
| GET | `/order-statuses` | ✅ auth | `sales_order_statuses` |
| POST | `/order-statuses` | ✅ auth | Same |
| PUT | `/order-statuses/:id` | ✅ auth | Same |
| DELETE | `/order-statuses/:id` | ✅ auth | Same |
| GET | `/invoice-statuses` | ✅ auth | `sales_invoice_statuses` |
| POST | `/invoice-statuses` | ✅ auth | Same |
| PUT | `/invoice-statuses/:id` | ✅ auth | Same |
| DELETE | `/invoice-statuses/:id` | ✅ auth | Same |
| GET | `/priorities` | ✅ auth | `sales_booking_priorities` |
| POST | `/priorities` | ✅ auth | Same |
| PUT | `/priorities/:id` | ✅ auth | Same |
| DELETE | `/priorities/:id` | ✅ auth | Same |

All use inline SQL in the route file via a `createHelperRoutes` factory function. No authorization beyond `authenticate`.

### 4.7 Customer Management (`/api/customers`)

| Method | Path | Auth | Controller Logic |
|--------|------|------|-----------------|
| GET | `/stats` | ✅ auth | Inline SQL: aggregate stats |
| GET | `/cities` | ✅ auth | Inline SQL: distinct cities |
| GET | `/all` | ✅ auth | Inline SQL: auto-create from leads + list all |
| GET | `/` | ✅ auth | Inline SQL: paginated + filterable list |
| GET | `/:id` | ✅ auth | Inline SQL: single customer with aggregates |
| POST | `/` | ✅ auth | Inline SQL: create with validation |
| PUT | `/:id` | ✅ auth | Inline SQL: update with COALESCE |
| DELETE | `/:id` | ✅ auth | Inline SQL: soft or hard delete |
| PATCH | `/:id/status` | ✅ auth | Inline SQL: toggle is_active |

### 4.8 Vehicle Inventory (`/api/vehicles`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/stats` | ✅ auth | `vehicleController.getVehicleStats` |
| GET | `/warehouses/list` | ✅ auth | `vehicleController.getWarehouses` |
| GET | `/makes/list` | ✅ auth | `vehicleController.getMakesList` |
| GET | `/models/list` | ✅ auth | `vehicleController.getModelsList` |
| GET | `/variants/list` | ✅ auth | `vehicleController.getVariantsList` |
| GET | `/colors/list` | ✅ auth | `vehicleController.getColorsList` |
| GET | `/` | ✅ auth | `vehicleController.getAllVehicles` |
| GET | `/:id` | ✅ auth | `vehicleController.getVehicleById` |
| POST | `/` | ✅ auth | `vehicleController.createVehicle` |
| PUT | `/:id` | ✅ auth | `vehicleController.updateVehicle` |
| DELETE | `/:id` | ✅ auth | `vehicleController.deleteVehicle` |
| PATCH | `/:id/status` | ✅ auth | `vehicleController.updateVehicleStatus` |

### 4.9 Parts Inventory (`/api/parts`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/stats` | ✅ auth | `partsController.getPartStats` |
| GET | `/low-stock` | ✅ auth | `partsController.getLowStockParts` |
| GET | `/categories/list` | ✅ auth | `partsController.getCategories` |
| GET | `/suppliers/list` | ✅ auth | `partsController.getSuppliers` |
| GET | `/` | ✅ auth | `partsController.getAllParts` |
| GET | `/:id` | ✅ auth | `partsController.getPartById` |
| POST | `/` | ✅ auth | `partsController.createPart` |
| PUT | `/:id` | ✅ auth | `partsController.updatePart` |
| DELETE | `/:id` | ✅ auth | `partsController.deletePart` |
| POST | `/:id/adjust` | ✅ auth | `partsController.adjustStock` |

### 4.10 Quotations (`/api/quotations`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/stats` | ✅ auth | `salesController.getQuotationStats` |
| GET | `/` | ✅ auth | `salesController.getAllQuotations` |
| GET | `/:id` | ✅ auth | `salesController.getQuotationById` |
| POST | `/` | `super_admin`, `sales_manager`, `sales_executive` | `salesController.createQuotation` |
| PUT | `/:id` | `super_admin`, `sales_manager` | `salesController.updateQuotation` |
| DELETE | `/:id` | `super_admin`, `sales_manager` | `salesController.deleteQuotation` |
| PATCH | `/:id/status` | `super_admin`, `sales_manager` | `salesController.updateQuotationStatus` |
| POST | `/:id/convert` | `super_admin`, `sales_manager` | `salesController.convertQuotationToBooking` |

### 4.11 Bookings (`/api/bookings`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/stats` | ✅ auth | `salesController.getBookingStats` |
| GET | `/` | ✅ auth | `salesController.getAllBookings` |
| GET | `/:id` | ✅ auth | `salesController.getBookingById` |
| POST | `/` | `super_admin`, `sales_manager`, `sales_executive` | `salesController.createBooking` |
| PUT | `/:id` | `super_admin`, `sales_manager` | `salesController.updateBooking` |
| DELETE | `/:id` | `super_admin`, `sales_manager` | `salesController.deleteBooking` |
| POST | `/:id/allocate` | `super_admin`, `sales_manager` | `salesController.allocateVehicle` |
| POST | `/:id/convert` | `super_admin`, `sales_manager` | `salesController.convertBookingToOrder` |

### 4.12 Sales Orders (`/api/sales`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/stats` | ✅ auth | `salesController.getSalesStats` |
| GET | `/order-stats` | ✅ auth | `salesController.getOrderStats` |
| GET | `/with-invoices` | ✅ auth | `salesController.getSalesOrdersWithInvoices` |
| GET | `/` | ✅ auth | `salesController.getAllSalesOrders` |
| GET | `/:id` | ✅ auth | `salesController.getSalesOrderById` |
| GET | `/:id/history` | ✅ auth | `salesController.getSalesOrderHistory` |
| POST | `/` | `super_admin`, `sales_manager` | `salesController.createSalesOrder` |
| POST | `/direct` | `super_admin`, `admin`, `sales_manager` | `salesController.createDirectSalesOrder` |
| PUT | `/:id` | `super_admin`, `sales_manager` | `salesController.updateSalesOrder` |
| PUT | `/:id/status` | `super_admin`, `admin`, `sales_manager` | `salesController.updateSalesOrderStatus` |
| DELETE | `/:id` | `super_admin` | `salesController.deleteSalesOrder` |
| POST | `/:id/deliver` | `super_admin`, `sales_manager` | `salesController.deliverSalesOrder` |
| POST | `/:id/invoice` | `super_admin`, `admin`, `sales_manager`, `accountant` | `salesController.generateInvoiceFromOrder` |

### 4.13 Invoices (`/api/invoices`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/stats` | ✅ auth | `invoiceController.getInvoiceStats` |
| GET | `/payment-methods` | ✅ auth | `invoiceController.getPaymentMethods` |
| GET | `/` | ✅ auth | `invoiceController.getAllInvoices` |
| GET | `/:id` | ✅ auth | `invoiceController.getInvoiceById` |
| GET | `/:id/qr-data` | ✅ auth | `invoiceController.getQRCodeData` |
| GET | `/:id/history` | ✅ auth | `invoiceController.getInvoiceHistory` |
| POST | `/` | `super_admin`, `sales_manager`, `accountant` | `invoiceController.createInvoice` |
| POST | `/from-sales-order` | `super_admin`, `sales_manager` | `invoiceController.createFromSalesOrder` |
| PUT | `/:id` | `super_admin`, `sales_manager`, `accountant` | `invoiceController.updateInvoice` |
| PUT | `/:id/status` | `super_admin`, `sales_manager`, `accountant` | `invoiceController.updateInvoiceStatus` |
| DELETE | `/:id` | `super_admin`, `sales_manager` | `invoiceController.deleteInvoice` |
| POST | `/:id/items` | `super_admin`, `sales_manager`, `accountant` | `invoiceController.addInvoiceItem` |
| PUT | `/:id/items/:itemId` | `super_admin`, `sales_manager`, `accountant` | `invoiceController.updateInvoiceItem` |
| DELETE | `/:id/items/:itemId` | `super_admin`, `sales_manager`, `accountant` | `invoiceController.removeInvoiceItem` |
| POST | `/:id/payments` | `super_admin`, `sales_manager`, `accountant` | `invoiceController.recordPayment` |
| POST | `/:id/send` | `super_admin`, `admin`, `sales_manager`, `accountant` | `invoiceController.sendInvoice` |

### 4.14 Payments (`/api/payments`)

| Method | Path | Auth | Controller Logic |
|--------|------|------|-----------------|
| GET | `/` | ✅ auth | Inline SQL: list with customer + method |
| POST | `/` | ✅ auth | Inline SQL: create payment, update invoice balance + customer outstanding |
| GET | `/methods/list` | ✅ auth | Inline SQL: active payment methods |

### 4.15 Service — Appointments (`/api/services/appointments`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/` | ✅ auth | `serviceController.getAllAppointments` |
| GET | `/stats` | ✅ auth | `serviceController.getAppointmentStats` |
| GET | `/:id` | ✅ auth | `serviceController.getAppointmentById` |
| POST | `/` | ✅ auth | `serviceController.createAppointment` |
| PUT | `/:id` | ✅ auth | `serviceController.updateAppointment` |
| PATCH | `/:id/status` | ✅ auth | `serviceController.updateAppointmentStatus` |
| DELETE | `/:id` | ✅ auth | `serviceController.deleteAppointment` |

### 4.16 Service — Job Cards (`/api/services/job-cards`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/` | ✅ auth | `serviceController.getAllJobCards` |
| GET | `/stats` | ✅ auth | `serviceController.getJobCardStats` |
| GET | `/:id` | ✅ auth | `serviceController.getJobCardById` |
| POST | `/` | ✅ auth | `serviceController.createJobCard` |
| PUT | `/:id` | ✅ auth | `serviceController.updateJobCard` |
| PATCH | `/:id/status` | ✅ auth | `serviceController.updateJobCardStatus` |
| POST | `/:id/complete` | ✅ auth | `serviceController.completeJobCard` |
| DELETE | `/:id` | ✅ auth | `serviceController.deleteJobCard` |
| POST | `/:id/services` | ✅ auth | `serviceController.addJobCardService` |
| PUT | `/:id/services/:serviceId` | ✅ auth | `serviceController.updateJobCardService` |
| DELETE | `/:id/services/:serviceId` | ✅ auth | `serviceController.deleteJobCardService` |
| POST | `/:id/parts` | ✅ auth | `serviceController.addJobCardPart` |
| PUT | `/:id/parts/:partId` | ✅ auth | `serviceController.updateJobCardPart` |
| DELETE | `/:id/parts/:partId` | ✅ auth | `serviceController.deleteJobCardPart` |

### 4.17 Service — Lookups (`/api/services`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/types/list` | ✅ auth | `serviceController.getServiceTypes` |
| GET | `/technicians/list` | ✅ auth | `serviceController.getTechnicians` |
| GET | `/advisors/list` | ✅ auth | `serviceController.getAdvisors` |

### 4.18 Reports (`/api/reports`)

**Predefined report endpoints:**

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/sales-performance` | `super_admin`, `admin`, `manager`, `sales_person` | `reportsController.getSalesPerformance` |
| GET | `/sales-by-model` | `super_admin`, `admin`, `manager`, `sales_person` | `reportsController.getSalesByModel` |
| GET | `/inventory-health` | `super_admin`, `admin`, `manager` | `reportsController.getInventoryHealth` |
| GET | `/inventory-stock-movement` | `super_admin`, `admin`, `manager` | `reportsController.getInventoryStockMovement` |
| GET | `/inventory-stock-snapshot` | `super_admin`, `admin`, `manager` | `reportsController.getInventoryStockSnapshot` |
| GET | `/pending-deliveries` | `super_admin`, `admin`, `manager`, `sales_person` | `reportsController.getPendingDeliveries` |
| GET | `/customer-receivables` | `super_admin`, `admin`, `manager` | `reportsController.getCustomerReceivables` |
| GET | `/receivables-aging` | `super_admin`, `admin`, `manager` | `reportsController.getReceivablesAging` |
| GET | `/lead-statistics` | `super_admin`, `admin`, `manager`, `sales_person` | `reportsController.getLeadStatistics` |
| GET | `/service-analytics` | `super_admin`, `admin`, `manager` | `reportsController.getServiceAnalytics` |
| GET | `/service-kpi-detail` | `super_admin`, `admin`, `manager` | `reportsController.getServiceKpiDetail` |
| GET | `/low-stock-parts` | `super_admin`, `admin`, `manager` | `reportsController.getLowStockParts` |

**Dynamic report CRUD:**

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/` | `super_admin`, `admin`, `manager`, `sales_person` | `reportsController.getReports` |
| GET | `/:id` | `super_admin`, `admin`, `manager` | `reportsController.getReportById` |
| POST | `/` | `super_admin`, `admin`, `manager` | `reportsController.createReport` |
| POST | `/:id/execute` | `super_admin`, `admin`, `manager` | `reportsController.executeReport` |
| PUT | `/:id` | `super_admin`, `admin`, `manager` | `reportsController.updateReport` |
| DELETE | `/:id` | `super_admin`, `admin` | `reportsController.deleteReport` |

### 4.19 Dashboard (`/api/dashboard`)

| Method | Path | Auth | Logic |
|--------|------|------|-------|
| GET | `/stats` | ✅ auth | Inline SQL: aggregated stats (role-based filtering) |
| GET | `/overview` | ✅ auth | Same as /stats (legacy compat) |
| GET | `/monthly-summary` | ✅ auth | Same data, filtered to monthly (legacy compat) |
| GET | `/sales-trend` | ✅ auth | Inline SQL: monthly sales aggregation (Chart.js format) |
| GET | `/inventory-distribution` | ✅ auth | Inline SQL: vehicle status/make + parts category distribution |
| GET | `/top-performers` | ✅ auth | Inline SQL: top salespeople + technicians |
| GET | `/activities` | ✅ auth | Inline SQL: UNION of recent leads, sales, invoices, job cards |
| GET | `/kpis` | ✅ auth (admin inline check) | Inline SQL: MoM comparisons, conversion rate |
| GET | `/alerts` | ✅ auth (admin inline check) | Inline SQL: low stock, overdue invoices, pending deliveries |
| GET | `/recent-leads` | ✅ auth | Inline SQL: last 10 leads (legacy) |
| GET | `/recent-sales` | ✅ auth | Inline SQL: last 10 sales (legacy) |
| GET | `/sales-chart` | ✅ auth | Inline SQL: 12-month sales trend (legacy) |
| GET | `/inventory-by-status` | ✅ auth | Inline SQL: vehicle status counts (legacy) |

### 4.20 Warehouses (`/api/warehouses`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/stats` | ✅ auth | `warehouseController.getWarehouseStats` |
| GET | `/cities/list` | ✅ auth | `warehouseController.getCities` |
| GET | `/managers/list` | ✅ auth | `warehouseController.getManagers` |
| GET | `/` | ✅ auth | `warehouseController.getAllWarehouses` |
| GET | `/:id` | ✅ auth | `warehouseController.getWarehouseById` |
| POST | `/` | ✅ auth | `warehouseController.createWarehouse` |
| PUT | `/:id` | ✅ auth | `warehouseController.updateWarehouse` |
| DELETE | `/:id` | ✅ auth | `warehouseController.deleteWarehouse` |
| GET | `/:id/inventory` | ✅ auth | `warehouseController.getWarehouseInventory` |

### 4.21 ERP Settings (`/api/erp-settings`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/stats` | ✅ auth | `erpSettings.getERPStats` |
| GET | `/managers` | ✅ auth | `erpSettings.getManagers` |
| GET | `/companies` | ✅ auth | `erpSettings.getAllCompanies` |
| GET | `/companies/:id` | ✅ auth | `erpSettings.getCompanyById` |
| POST | `/companies` | `super_admin` | `erpSettings.createCompany` |
| PUT | `/companies/:id` | `super_admin` | `erpSettings.updateCompany` |
| DELETE | `/companies/:id` | `super_admin` | `erpSettings.deleteCompany` |
| GET | `/branches` | ✅ auth | `erpSettings.getAllBranches` |
| GET | `/branches/:id` | ✅ auth | `erpSettings.getBranchById` |
| POST | `/branches` | `super_admin` | `erpSettings.createBranch` |
| PUT | `/branches/:id` | `super_admin` | `erpSettings.updateBranch` |
| DELETE | `/branches/:id` | `super_admin` | `erpSettings.deleteBranch` |
| GET | `/settings` | ✅ auth | `erpSettings.getAllSettings` |
| GET | `/settings/categories` | ✅ auth | `erpSettings.getSettingCategories` |
| PUT | `/settings` | `super_admin` | `erpSettings.updateSettings` |
| GET | `/currencies` | ✅ auth | `erpSettings.getAllCurrencies` |
| POST | `/currencies` | `super_admin` | `erpSettings.createCurrency` |
| PUT | `/currencies/:id` | `super_admin` | `erpSettings.updateCurrency` |
| DELETE | `/currencies/:id` | `super_admin` | `erpSettings.deleteCurrency` |
| GET | `/taxes` | ✅ auth | `erpSettings.getAllTaxes` |
| POST | `/taxes` | `super_admin` | `erpSettings.createTax` |
| PUT | `/taxes/:id` | `super_admin` | `erpSettings.updateTax` |
| DELETE | `/taxes/:id` | `super_admin` | `erpSettings.deleteTax` |
| GET | `/document-templates` | `super_admin` | `erpSettings.getAllDocumentTemplates` |
| GET | `/document-templates/default/:documentType` | ✅ auth | `erpSettings.getDefaultDocumentTemplate` |
| GET | `/document-templates/:id` | `super_admin` | `erpSettings.getDocumentTemplateById` |
| POST | `/document-templates` | `super_admin` | `erpSettings.createDocumentTemplate` |
| PUT | `/document-templates/:id` | `super_admin` | `erpSettings.updateDocumentTemplate` |
| DELETE | `/document-templates/:id` | `super_admin` | `erpSettings.deleteDocumentTemplate` |
| POST | `/document-templates/seed-defaults` | `super_admin` | `erpSettings.seedDocumentTemplates` |

### 4.22 Vehicle Master Data (`/api/vehicle-master`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/stats` | ✅ auth | `vehicleMasterController.getStats` |
| GET | `/makes` | ✅ auth | `vehicleMasterController.getMakes` |
| POST | `/makes` | ✅ auth | `vehicleMasterController.createMake` |
| PUT | `/makes/:id` | ✅ auth | `vehicleMasterController.updateMake` |
| DELETE | `/makes/:id` | ✅ auth | `vehicleMasterController.deleteMake` |
| GET | `/models` | ✅ auth | `vehicleMasterController.getModels` |
| POST | `/models` | ✅ auth | `vehicleMasterController.createModel` |
| PUT | `/models/:id` | ✅ auth | `vehicleMasterController.updateModel` |
| DELETE | `/models/:id` | ✅ auth | `vehicleMasterController.deleteModel` |
| GET | `/variants` | ✅ auth | `vehicleMasterController.getVariants` |
| POST | `/variants` | ✅ auth | `vehicleMasterController.createVariant` |
| PUT | `/variants/:id` | ✅ auth | `vehicleMasterController.updateVariant` |
| DELETE | `/variants/:id` | ✅ auth | `vehicleMasterController.deleteVariant` |
| GET | `/colors` | ✅ auth | `vehicleMasterController.getColors` |
| POST | `/colors` | ✅ auth | `vehicleMasterController.createColor` |
| PUT | `/colors/:id` | ✅ auth | `vehicleMasterController.updateColor` |
| DELETE | `/colors/:id` | ✅ auth | `vehicleMasterController.deleteColor` |
| GET | `/categories` | ✅ auth | `vehicleMasterController.getCategories` |
| POST | `/categories` | ✅ auth | `vehicleMasterController.createCategory` |
| PUT | `/categories/:id` | ✅ auth | `vehicleMasterController.updateCategory` |
| DELETE | `/categories/:id` | ✅ auth | `vehicleMasterController.deleteCategory` |
| GET | `/suppliers` | ✅ auth | `vehicleMasterController.getSuppliers` |
| POST | `/suppliers` | ✅ auth | `vehicleMasterController.createSupplier` |
| PUT | `/suppliers/:id` | ✅ auth | `vehicleMasterController.updateSupplier` |
| DELETE | `/suppliers/:id` | ✅ auth | `vehicleMasterController.deleteSupplier` |

### 4.23 Payment Methods (`/api/payment-methods`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/` | ✅ auth | `paymentMethodsController.getAll` |
| GET | `/types` | ✅ auth | `paymentMethodsController.getTypes` |
| GET | `/:id` | ✅ auth | `paymentMethodsController.getById` |
| POST | `/` | `super_admin`, `accountant` | `paymentMethodsController.create` |
| PUT | `/:id` | `super_admin`, `accountant` | `paymentMethodsController.update` |
| PATCH | `/:id/toggle` | `super_admin`, `accountant` | `paymentMethodsController.toggleStatus` |
| DELETE | `/:id` | `super_admin`, `accountant` | `paymentMethodsController.remove` |

### 4.24 Service Master Data (`/api/service-master`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/stats` | ✅ auth | `serviceMasterController.getStats` |
| GET | `/types` | ✅ auth | `serviceMasterController.getServiceTypes` |
| POST | `/types` | ✅ auth | `serviceMasterController.createServiceType` |
| PUT | `/types/:id` | ✅ auth | `serviceMasterController.updateServiceType` |
| DELETE | `/types/:id` | ✅ auth | `serviceMasterController.deleteServiceType` |
| GET | `/labor-rates` | ✅ auth | `serviceMasterController.getLaborRates` |
| POST | `/labor-rates` | ✅ auth | `serviceMasterController.createLaborRate` |
| PUT | `/labor-rates/:id` | ✅ auth | `serviceMasterController.updateLaborRate` |
| DELETE | `/labor-rates/:id` | ✅ auth | `serviceMasterController.deleteLaborRate` |
| GET | `/packages` | ✅ auth | `serviceMasterController.getServicePackages` |
| GET | `/packages/:id` | ✅ auth | `serviceMasterController.getPackageById` |
| POST | `/packages` | ✅ auth | `serviceMasterController.createPackage` |
| PUT | `/packages/:id` | ✅ auth | `serviceMasterController.updatePackage` |
| DELETE | `/packages/:id` | ✅ auth | `serviceMasterController.deletePackage` |
| POST | `/packages/:id/items` | ✅ auth | `serviceMasterController.addPackageItem` |
| DELETE | `/packages/:id/items/:itemId` | ✅ auth | `serviceMasterController.removePackageItem` |
| GET | `/warranties` | ✅ auth | `serviceMasterController.getWarranties` |
| POST | `/warranties` | ✅ auth | `serviceMasterController.createWarranty` |
| PUT | `/warranties/:id` | ✅ auth | `serviceMasterController.updateWarranty` |
| DELETE | `/warranties/:id` | ✅ auth | `serviceMasterController.deleteWarranty` |
| GET | `/categories` | ✅ auth | `serviceMasterController.getCategories` |

### 4.25 Profile (`/api/profile`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/` | ✅ auth | `profileController.getProfile` |
| PUT | `/` | ✅ auth | `profileController.updateProfile` |

### 4.26 Global Search (`/api/search`)

| Method | Path | Auth | Controller Method |
|--------|------|------|-------------------|
| GET | `/` | ✅ auth | `globalSearchController.search` (requires `?query=` min 3 chars) |

### 4.27 Uploader (`/api/uploader`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| POST | `/order-form` | `super_admin`, `admin`, `manager` (+ Multer) | `uploaderController.uploadOrderForm` |

### 4.28 Vehicle Branding (`/api/vehicle-branding`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/` | `super_admin`, `admin`, `inventory_manager` | `vehicleBrandingController.getAllBrands` |
| GET | `/active` | `super_admin`, `admin`, `inventory_manager`, `sales_manager`, `sales_executive` | `vehicleBrandingController.getActiveBrands` |
| GET | `/stats` | `super_admin`, `admin`, `inventory_manager` | `vehicleBrandingController.getBrandStats` |
| GET | `/:id` | `super_admin`, `admin`, `inventory_manager` | `vehicleBrandingController.getBrandById` |
| POST | `/` | `super_admin`, `admin`, `inventory_manager` (+ validation) | `vehicleBrandingController.createBrand` |
| POST | `/bulk-update-status` | `super_admin`, `admin`, `inventory_manager` | `vehicleBrandingController.bulkUpdateStatus` |
| PUT | `/:id` | `super_admin`, `admin`, `inventory_manager` (+ validation) | `vehicleBrandingController.updateBrand` |
| DELETE | `/:id` | `super_admin`, `admin`, `inventory_manager` | `vehicleBrandingController.deleteBrand` |

### 4.29 Bulk Import (`/api/bulk-import`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/template/:type` | ✅ auth | `bulkImportController.downloadTemplate` |
| POST | `/leads` | `super_admin`, `admin`, `manager`, `sales_manager`, `sales_executive`, `service_manager`, `service_advisor` + Multer | `bulkImportController.importLeads` |
| POST | `/vehicle-brands` | `super_admin`, `admin`, `inventory_manager` + Multer | `bulkImportController.importVehicleBrands` |
| POST | `/vehicles` | `super_admin`, `admin`, `inventory_manager`, `manager`, `sales_manager` + Multer | `bulkImportController.importVehicles` |
| POST | `/sales-orders` | `super_admin`, `admin`, `sales_manager` + Multer | `bulkImportController.importSalesOrders` |

### 4.30 Employees (`/api/employees`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/` | `super_admin`, `admin`, `hr_admin` | `employees.listEmployees` |
| GET | `/:id` | `super_admin`, `admin`, `hr_admin` | `employees.getEmployee` |
| POST | `/` | `super_admin`, `admin`, `hr_admin` | `employees.upsertEmployee` |
| PUT | `/:id` | `super_admin`, `admin`, `hr_admin` | `employees.upsertEmployee` (with params) |
| DELETE | `/:id` | `super_admin`, `admin`, `hr_admin` | `employees.deactivateEmployee` |

### 4.31 Payroll (`/api/payroll`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/periods` | `super_admin`, `admin`, `payroll_clerk`, `accountant` | `payroll.listPeriods` |
| POST | `/periods` | `super_admin`, `admin`, `payroll_clerk`, `accountant` | `payroll.createPeriod` |
| GET | `/periods/:id/lines` | `super_admin`, `admin`, `payroll_clerk`, `accountant` | `payroll.getPeriodLines` |
| POST | `/periods/:id/generate` | `super_admin`, `admin`, `payroll_clerk`, `accountant` | `payroll.generateLines` |
| POST | `/periods/:id/lock` | `super_admin`, `admin`, `payroll_clerk`, `accountant` | `payroll.lockPeriod` |
| POST | `/periods/:id/post` | `super_admin`, `admin`, `payroll_clerk`, `accountant` | `payroll.postPeriod` |
| PATCH | `/lines/:lineId` | `super_admin`, `admin`, `payroll_clerk`, `accountant` | `payroll.updateLine` |

### 4.32 Leaves (`/api/leaves`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/types` | `super_admin`, `admin`, `hr_admin`, `manager` | `leaves.listTypes` |
| GET | `/balances` | `super_admin`, `admin`, `hr_admin`, `manager` | `leaves.listBalances` |
| GET | `/requests` | `super_admin`, `admin`, `hr_admin`, `manager` | `leaves.listRequests` |
| POST | `/requests` | `super_admin`, `admin`, `hr_admin` | `leaves.submitRequest` |
| PATCH | `/requests/:id/status` | `super_admin`, `admin`, `hr_admin` | `leaves.setRequestStatus` |

### 4.33 Expenses (`/api/expenses`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/accounts` | `super_admin`, `admin`, `accountant`, `hr_admin` | `expenses.listAccounts` |
| GET | `/categories` | `super_admin`, `admin`, `accountant`, `hr_admin` | `expenses.listCategories` |
| POST | `/categories` | `super_admin`, `admin`, `accountant` | `expenses.createCategory` |
| PATCH | `/categories/:id` | `super_admin`, `admin`, `accountant` | `expenses.updateCategory` |
| GET | `/items` | `super_admin`, `admin`, `accountant`, `hr_admin` | `expenses.listExpenses` |
| POST | `/items` | `super_admin`, `admin`, `accountant`, `hr_admin` | `expenses.createExpense` |
| PATCH | `/items/:id` | `super_admin`, `admin`, `accountant`, `hr_admin` | `expenses.updateExpense` |
| POST | `/items/:id/post` | `super_admin`, `admin`, `accountant` | `expenses.postExpense` |

### 4.34 Ledger (`/api/ledger`)

| Method | Path | Auth+Authz | Controller Method |
|--------|------|------------|-------------------|
| GET | `/` | `super_admin`, `admin`, `accountant`, `payroll_clerk`, `hr_admin` | `ledger.listLedger` |

---

## 5. Middleware Analysis

### 5.1 Middleware Pipeline

The request processing pipeline in `server.js`:

```
Request
  │
  ├─ helmet()                          ← Security headers
  ├─ cors(corsOptions)                 ← CORS (localhost + whitelist)
  ├─ express.json({ limit: '10mb' })   ← JSON body parsing
  ├─ express.urlencoded({ extended })  ← URL-encoded parsing
  ├─ Request Logger (inline)           ← Winston log every request
  ├─ Swagger UI (at /api-documentation)
  │
  ├─ Route Matching ───────────────┐
  │   │                            │
  │   ├─ authenticate (jwt)        │  (per-route)
  │   ├─ authorize(roles)          │  (per-route)
  │   ├─ validateRequest(schema)   │  (per-route, in vehicle-branding only)
  │   ├─ multer (file upload)      │  (per-route, in uploader/bulk-import)
  │   └─ Controller function       │
  │                                │
  ├─ 404 Handler                   │
  └─ Global Error Handler          │
```

### 5.2 `authenticate` Middleware (`middleware/auth.js`)

**Purpose:** JWT verification + user hydration

**Flow:**
1. Extract `Bearer` token from `Authorization` header
2. Verify JWT with `jwt.verify(token, JWT_SECRET)`
3. Query `SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`
4. Attach user object to `req.user`
5. Call `next()`

**Error handling:**
- Missing token → 401 `Access denied. No token provided.`
- Invalid/expired token → 401 `Invalid token.`
- User not found → 401 `User not found.`

**Token generation (in `auth.routes.js` inline):**
- `generateToken(userId, email)` → JWT with `{ id, email }`, expires 24h
- `generateRefreshToken(userId)` → JWT with `{ id }`, expires 7d

### 5.3 `authorize(roles...)` Middleware (`middleware/auth.js`)

**Purpose:** Role-based access control

**Flow:**
1. Require `authenticate` to have run first (checks `req.user`)
2. Normalize requested role name: `trim().toLowerCase().replace(/[\s-]+/g, '_')`
3. Check if normalized role matches any of the allowed roles
4. If matched → `next()`, else → 403 `Access denied. Insufficient permissions.`

**Role normalization examples:**
- `"Sales Manager"` → `"sales_manager"`
- `"Super Admin"` → `"super_admin"`

### 5.4 `checkPermission(module, action)` Middleware (`middleware/auth.js`)

**Purpose:** Permission-based access control (finer-grained than role check)

**Flow:**
1. Calls MySQL function `fn_has_permission(userId, module, action)`
2. If function returns falsy → 403 `Access denied. Insufficient permissions.`
3. If function returns truthy → `next()`

**Usage pattern:** Used as a second authorization layer after `authorize`. Only employed in a few controllers.

### 5.5 `validateRequest(schema)` Middleware (`middleware/validation.js`)

**Purpose:** Request body validation using `express-validator`

**Usage:**
```javascript
validateRequest({
    name: {
        in: 'body',
        notEmpty: true,
        errorMessage: 'Brand name is required',
        trim: true
    }
})
```

**Behavior:**
- Uses `express-validator`'s `checkSchema()` 
- If validation fails → 400 with `{ success: false, message: "error1, error2" }`
- **Currently only used in `vehicle-branding.routes.js`** (POST and PUT /)

### 5.6 Error Handler Middleware (`middleware/errorHandler.js`)

```javascript
(err, req, res, next) => { ... }
```

**Behavior:**
1. Logs error via Winston (full stack trace)
2. If `err.isOperational` → send user-friendly message
3. In development → include error message and stack trace
4. In production for non-operational → send generic "Something went wrong"
5. Response format: `{ success: false, message, ...(development && { error, stack }) }`

**AppError class** (defined in same file):
```javascript
class AppError extends Error {
    constructor(message, statusCode, resolution = null) {
        super(message);
        this.statusCode = statusCode;
        this.resolution = resolution;  // User-friendly resolution hint
        this.isOperational = true;
    }
}
```

---

## 6. Authentication Flow

```
Client                          Server
  │                                │
  │  POST /api/auth/login          │
  │  { email, password }           │
  │ ─────────────────────────────> │
  │                                │
  │                                │ 1. Validate email + password required
  │                                │ 2. Query: SELECT u.*, r.name FROM users
  │                                │          JOIN roles WHERE email = ?
  │                                │ 3. bcrypt.compare(password, user.password)
  │                                │ 4. generateToken(user.id, user.email) → 24h JWT
  │                                │ 5. generateRefreshToken(user.id) → 7d JWT
  │                                │ 6. UPDATE users SET last_login = NOW()
  │                                │ 7. INSERT INTO user_sessions (...)
  │                                │
  │  { success, data: { user,     │
  │    token, refreshToken }}      │
  │ <───────────────────────────── │
  │                                │
  │  GET /api/dashboard/stats      │
  │  Authorization: Bearer <token> │
  │ ─────────────────────────────> │
  │                                │
  │                                │ 1. authenticate middleware
  │                                │    - Verify JWT
  │                                │    - Query user from DB
  │                                │    - Set req.user
  │                                │ 2. Controller runs
  │                                │
  │  { success, data: {...} }      │
  │ <───────────────────────────── │
```

**Session management:**
- Sessions stored in `user_sessions` table
- Expired sessions cleaned on each login
- Logout deletes all sessions for user

---

## 7. Authorization Analysis

The backend employs a **3-tier authorization** model:

### Tier 1: Role-Based (`authorize`)

The most common pattern. Routes specify allowed role names:

```javascript
router.get('/', authenticate, authorize('super_admin', 'admin', 'hr_admin'), handler);
```

**Roles detected across the codebase:**
| Role | Used In |
|------|---------|
| `super_admin` | Nearly all admin routes |
| `admin` | Employees, bulk-import, branding |
| `manager` | Dashboard, reports, bulk-import |
| `sales_manager` | Bookings, quotations, sales, invoices |
| `sales_executive` | Quotations, bookings, bulk-import |
| `sales_person` | Reports (read-only) |
| `accountant` | Invoices, payments, expenses, payroll |
| `hr_admin` | Employees, leaves, payroll, expenses |
| `payroll_clerk` | Payroll, ledger |
| `inventory_manager` | Parts, vehicles, branding, bulk-import |
| `service_manager` | Bulk-import (leads) |
| `service_advisor` | Bulk-import (leads) |

### Tier 2: Permission-Based (`checkPermission`)

Used as a second authorization gate, calls MySQL function:

```javascript
const hasPerm = await query(`SELECT fn_has_permission(?, ?, ?) as has_permission`,
    [req.user.id, module, action]);
```

**Modules/Actions detected:** (varies by controller, typically `create`, `read`, `update`, `delete`)

### Tier 3: Inline Role Check

Used in `dashboard.routes.js` for admin-gated endpoints (`/kpis`, `/alerts`):

```javascript
const isAdmin = ['super_admin', 'admin', 'manager'].includes(roleName);
if (!isAdmin) return res.status(403).json({ success: false, message: 'Access denied' });
```

### Authorization Coverage Analysis

| Module | Auth Required | Role-Based | Permission-Based | Inline Check |
|--------|:---:|:----------:|:----------------:|:------------:|
| Auth (login/register) | ❌ | ❌ | ❌ | ❌ |
| Auth (me/logout) | ✅ | ❌ | ❌ | ❌ |
| Users | ✅ | Partial | ❌ | ❌ |
| Admin — Users | ✅ | ✅ | ❌ | ❌ |
| Admin — Roles | ✅ | ✅ | ❌ | ❌ |
| Admin — Departments | ✅ | Partial | ❌ | ❌ |
| Admin — Statuses | ✅ | Partial | ❌ | ❌ |
| Leads | ✅ | ❌ | ❌ | ❌ |
| Customers | ✅ | ❌ | ❌ | ❌ |
| Vehicles | ✅ | ❌ | ❌ | ❌ |
| Parts | ✅ | ❌ | ❌ | ❌ |
| Quotations | ✅ | ✅ | ❌ | ❌ |
| Bookings | ✅ | ✅ | ❌ | ❌ |
| Sales Orders | ✅ | ✅ | ❌ | ❌ |
| Invoices | ✅ | ✅ | ❌ | ❌ |
| Payments | ✅ | ❌ | ❌ | ❌ |
| Services | ✅ | ❌ | ❌ | ❌ |
| Reports | ✅ | ✅ | ❌ | ❌ |
| Dashboard | ✅ | ❌ | ❌ | ✅ |
| Warehouses | ✅ | ❌ | ❌ | ❌ |
| ERP Settings | ✅ | Partial | ❌ | ❌ |
| Vehicle Master | ✅ | ❌ | ❌ | ❌ |
| Service Master | ✅ | ❌ | ❌ | ❌ |
| Payment Methods | ✅ | ✅ | ❌ | ❌ |
| Profile | ✅ | ❌ | ❌ | ❌ |
| Global Search | ✅ | ❌ | ❌ | ❌ |
| Uploader | ✅ | ✅ | ❌ | ❌ |
| Vehicle Branding | ✅ | ✅ | ❌ | ❌ |
| Bulk Import | ✅ | ✅ | ❌ | ❌ |
| Employees | ✅ | ✅ | ❌ | ❌ |
| Payroll | ✅ | ✅ | ❌ | ❌ |
| Leaves | ✅ | ✅ | ❌ | ❌ |
| Expenses | ✅ | ✅ | ❌ | ❌ |
| Ledger | ✅ | ✅ | ❌ | ❌ |
| Lead/Sales Master | ✅ | ❌ | ❌ | ❌ |

**🔴 Security concern:** Many write operations (POST/PUT/DELETE on vehicles, parts, customers, services, warehouses, vehicle-master, service-master) have **no role-based authorization** — any authenticated user can perform CRUD.

---

## 8. Controller Analysis

### 8.1 Controller Inventory (25 files)

| # | File | Exports | Key Functions |
|---|------|---------|---------------|
| 1 | `userManagement.controller.js` | 1 object | `getUserStats`, `getAllUsers`, `getUserById`, `createUser`, `updateUser`, `deleteUser`, `toggleUserStatus`, `assignRole`, `assignDepartment`, `removeDepartment`, `resetPassword` |
| 2 | `roleManagement.controller.js` | 1 object | `getAllRoles`, `getRoleById`, `createRole`, `updateRole`, `deleteRole`, `assignPermissions`, `getAllPermissions`, `getPermissionMatrix`, `getPermissionModules` |
| 3 | `departmentManagement.controller.js` | 1 object | `getDepartmentStats`, `getAllDepartments`, `getDepartmentById`, `createDepartment`, `updateDepartment`, `deleteDepartment`, `assignManager` |
| 4 | `statusManagement.controller.js` | 1 object | `getAvailableTables`, `getStatusAnalytics`, `getAllStatuses`, `getStatusesByTable`, `getStatusById`, `createStatus`, `updateStatus`, `deleteStatus`, `reorderStatuses` |
| 5 | `salesManagement.controller.js` | 1 object | Sales: `getSalesStats`, `getOrderStats`, `getAllSalesOrders`, `getSalesOrderById`, `getSalesOrderHistory`, `createSalesOrder`, `createDirectSalesOrder`, `updateSalesOrder`, `updateSalesOrderStatus`, `deleteSalesOrder`, `deliverSalesOrder`, `generateInvoiceFromOrder`, `getSalesOrdersWithInvoices`. Quotations: `getQuotationStats`, `getAllQuotations`, `getQuotationById`, `createQuotation`, `updateQuotation`, `deleteQuotation`, `updateQuotationStatus`, `convertQuotationToBooking`. Bookings: `getBookingStats`, `getAllBookings`, `getBookingById`, `createBooking`, `updateBooking`, `deleteBooking`, `allocateVehicle`, `convertBookingToOrder` |
| 6 | `invoiceManagement.controller.js` | 1 object | `getInvoiceStats`, `getAllInvoices`, `getInvoiceById`, `getQRCodeData`, `getInvoiceHistory`, `getPaymentMethods`, `createInvoice`, `createFromSalesOrder`, `updateInvoice`, `updateInvoiceStatus`, `deleteInvoice`, `addInvoiceItem`, `updateInvoiceItem`, `removeInvoiceItem`, `recordPayment`, `sendInvoice` |
| 7 | `paymentMethods.controller.js` | 1 object | `getAll`, `getTypes`, `getById`, `create`, `update`, `toggleStatus`, `remove` |
| 8 | `employees.controller.js` | 1 object | `listEmployees`, `getEmployee`, `upsertEmployee` (INSERT/UPDATE inline), `deactivateEmployee` |
| 9 | `payroll.controller.js` | 1 object | `listPeriods`, `createPeriod`, `getPeriodLines`, `generateLines`, `lockPeriod`, `postPeriod`, `updateLine` |
| 10 | `leaves.controller.js` | 1 object | `listTypes`, `listBalances`, `listRequests`, `submitRequest`, `setRequestStatus` |
| 11 | `expenses.controller.js` | 1 object | `listAccounts`, `listCategories`, `createCategory`, `updateCategory`, `listExpenses`, `createExpense`, `updateExpense`, `postExpense` |
| 12 | `ledger.controller.js` | 1 object | `listLedger` |
| 13 | `profile.controller.js` | 1 object | `getProfile`, `updateProfile` |
| 14 | `vehicleInventory.controller.js` | 1 object | `getVehicleStats`, `getAllVehicles`, `getVehicleById`, `createVehicle`, `updateVehicle`, `deleteVehicle`, `updateVehicleStatus`, `getWarehouses`, `getMakesList`, `getModelsList`, `getVariantsList`, `getColorsList` |
| 15 | `vehicleMaster.controller.js` | 1 object | `getStats`, `getMakes`, `createMake`, `updateMake`, `deleteMake`, `getModels`, `createModel`, `updateModel`, `deleteModel`, `getVariants`, `createVariant`, `updateVariant`, `deleteVariant`, `getColors`, `createColor`, `updateColor`, `deleteColor`, `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `getSuppliers`, `createSupplier`, `updateSupplier`, `deleteSupplier` |
| 16 | `vehicleBranding.controller.js` | 1 object | `getAllBrands`, `getActiveBrands`, `getBrandStats`, `getBrandById`, `createBrand`, `updateBrand`, `deleteBrand`, `bulkUpdateStatus` |
| 17 | `partsInventory.controller.js` | 1 object | `getPartStats`, `getAllParts`, `getPartById`, `createPart`, `updatePart`, `deletePart`, `adjustStock`, `getLowStockParts`, `getCategories`, `getSuppliers` |
| 18 | `warehouseManagement.controller.js` | 1 object | `getWarehouseStats`, `getAllWarehouses`, `getWarehouseById`, `createWarehouse`, `updateWarehouse`, `deleteWarehouse`, `getWarehouseInventory`, `getCities`, `getManagers` |
| 19 | `erpSettings.controller.js` | 1 object | `getERPStats`, `getManagers`, Company CRUD, Branch CRUD, Setting CRUD, Currency CRUD, Tax CRUD, Document Template CRUD, `seedDocumentTemplates` |
| 20 | `reports.controller.js` | 1 object | `getReports`, `getReportById`, `createReport`, `updateReport`, `deleteReport`, `executeReport`, +11 predefined report methods |
| 21 | `serviceManagement.controller.js` | 1 object | Appointment CRUD, Job Card CRUD, Job Card Service CRUD, Job Card Part CRUD + lookups |
| 22 | `serviceMasterController.js` | 1 object | `getStats`, Service Type CRUD, Labor Rate CRUD, Package CRUD + Items, Warranty CRUD, `getCategories` |
| 23 | `uploader.controller.js` | 1 object | `uploadOrderForm` |
| 24 | `bulkImport.controller.js` | 1 object | `downloadTemplate`, `importLeads`, `importVehicleBrands`, `importVehicles`, `importSalesOrders` |
| 25 | `global-search.controller.js` | 1 object | `search` |

### 8.2 Common Controller Pattern

All controllers follow this pattern:

```javascript
exports.handlerName = async (req, res, next) => {
    try {
        // 1. Extract params/body/query from req
        // 2. Optional: manual input validation
        // 3. Build dynamic SQL string
        // 4. Execute via query() / callProcedure()
        // 5. Transform results if needed
        // 6. res.json({ success: true, data: ... })
    } catch (error) {
        next(error);  // Forward to global error handler
    }
};
```

### 8.3 Controller→Repository→Database Mapping

```
                    ┌─────────────────────────────────────┐
                    │         Controller (25 files)        │
                    │  Inline SQL + SP calls + business    │
                    │  logic + response formatting         │
                    └──────┬──────────────┬───────────────┘
                           │              │
                    ┌──────▼────┐  ┌──────▼───────┐
                    │ Repository │  │   Inline     │
                    │ (3 files)  │  │   SQL (most  │
                    │            │  │  controllers) │
                    └──────┬────┘  └──────┬────────┘
                           │              │
                    ┌──────▼──────────────▼───┐
                    │   config/database.js     │
                    │   mysql2/promise pool    │
                    └──────┬──────────────────┘
                           │
                    ┌──────▼──────┐
                    │    MySQL    │
                    │ (Views, SPs,│
                    │  raw SQL)   │
                    └─────────────┘
```

---

## 9. Repository Layer Analysis

3 repository classes exist in `repositories/`:

### 9.1 `BaseRepository` (`repositories/BaseRepository.js`)

**Pattern:** Generic CRUD factory. Constructor receives `tableName` and optional config.

**Methods:**

| Method | SQL Pattern | Purpose |
|--------|-------------|---------|
| `findAll(filters, pagination)` | Dynamic SELECT with WHERE, LIMIT, OFFSET | List with filtering/pagination |
| `findById(id)` | `SELECT * FROM table WHERE id = ?` | Single record lookup |
| `create(data)` | `INSERT INTO table SET ?` | Create with object |
| `update(id, data)` | `UPDATE table SET ? WHERE id = ?` | Partial update |
| `delete(id)` | `DELETE FROM table WHERE id = ?` | Hard delete |
| `count(filters)` | `SELECT COUNT(*) FROM table WHERE ...` | Total count |
| `findWhere(conditions)` | Dynamic WHERE builder | Conditional lookup |
| `bulkCreate(items)` | Batch INSERT | Multi-row insert |

**Used by:** `LeadRepository extends BaseRepository`, `CustomerRepository extends BaseRepository`

### 9.2 `LeadRepository` (`repositories/LeadRepository.js`)

**Extends:** `BaseRepository('leads')`

**Additional methods:**
- `findAllWithFilters(filters)` — Paginated + filtered list with joins
- `getLeadSources()` — Active sources for dropdown
- `getFilterOptions()` — Aggregated dropdown data
- `getAnalytics()` — Lead analytics/aggregations
- `getPipelineStats()` — Pipeline stage counts
- `getSourceDistribution()` — Source distribution stats
- `exportLeads(filters)` — Unpaginated export data
- `findById(id)` — Overrides base with join to source name
- `create(data)` — Overrides base with SP call or fallback INSERT
- `update(id, data)` — Overrides base with SP call or fallback UPDATE
- `delete(id)` — Overrides base
- `convertToCustomer(leadId, userId)` — SP `sp_convert_lead_to_customer` or fallback transaction

### 9.3 `CustomerRepository` (`repositories/CustomerRepository.js`)

**Extends:** `BaseRepository('customers')`

**Additional methods:**
- `getPurchaseHistory(customerId)` — Aggregated purchase data
- `getOutstandingBalance(customerId)` — Balance calculation
- `searchCustomers(query)` — Multi-field search

---

## 10. Models Analysis

Only **1 model file** exists:

### `models/orderForm.model.js`

**Purpose:** Bulk insert order forms from uploaded XLSX/CSV files.

**Key functionality:**
- `bulkInsert(rows, createdBy)` — Transaction-based bulk insert
  - Uses `beginTransaction()`, `commitTransaction()`, `rollbackTransaction()`
  - Inserts into `order_forms` and `order_form_items` tables
  - Returns `{ inserted, errors }` summary

**Pattern:** Singleton module (not a class), exported as object with `bulkInsert` method.

---

## 11. Service Layer Analysis

**❌ No service layer exists.**

Business logic is implemented directly in controllers using:
- Inline SQL string building
- Direct MySQL function calls
- Stored procedure calls via `callProcedure()`

This creates tight coupling between HTTP handling and database access. Controllers are responsible for:
- Request parsing and validation
- Business logic and calculations
- SQL query construction
- Response formatting
- Error handling

---

## 12. Validation Analysis

### 12.1 Express-Validator (`middleware/validation.js`)

```javascript
const { checkSchema, validationResult } = require('express-validator');

const validateRequest = (schema) => [
    checkSchema(schema),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array().map(e => e.msg).join(', ')
            });
        }
        next();
    }
];
```

**Usage:** Only in `vehicle-branding.routes.js` for POST and PUT endpoints (validates `name` field).

### 12.2 Manual Validation in Controllers

Most controllers use inline manual validation:

```javascript
if (!firstName || !lastName || !phone) {
    throw new AppError('Required fields missing', 400);
}
```

### 12.3 Validation Coverage

| Module | Validation Method | Coverage |
|--------|-----------------|----------|
| Auth (login/register) | Manual | Email + password required |
| Customers | Manual | First name, last name, phone required; duplicate check |
| Leads | Manual (route) | first_name, last_name, phone required |
| Leads (update) | Manual (repo) | Partial field update |
| Vehicle Branding | Express-validator | Name required (POST + PUT) |
| Bulk Import | Multer + Manual | File type check, size limit |
| Payments | Manual | paymentMethodId + amount required |
| All others | **None** | No input validation |

**🔴 Missing validation is a significant risk** — most POST/PUT endpoints lack structured validation, making them vulnerable to SQL errors, type mismatches, and injection if parameterized queries are not used correctly.

---

## 13. Error Handling Analysis

### 13.1 Error Architecture

```
AppError (class)
  ├─ message: string        ← User-friendly error description
  ├─ statusCode: number     ← HTTP status (400, 401, 403, 404, 500)
  ├─ resolution: string     ← User-friendly fix hint (only in middleware/errorHandler.js version)
  └─ isOperational: boolean ← Distinguishes expected from unexpected errors

Global error handler (middleware/errorHandler.js):
  ├─ Logs via Winston (full stack)
  ├─ If operational → send message + resolution
  ├─ If development → include error + stack
  └─ If production + non-operational → generic "Something went wrong"
```

### 13.2 Duplicate AppError Classes

**Two separate AppError classes exist:**

| File | Resolution Field | Used By |
|------|:---------------:|---------|
| `utils/AppError.js` | ❌ | (defined but NOT imported anywhere) |
| `middleware/errorHandler.js` | ✅ | Imported by controllers and middleware |

The error handler imports from its own file, not from `utils/AppError.js`. This is dead code.

### 13.3 Error Handling Pattern

Every controller wraps logic in try/catch and calls `next(error)`. The global error handler formats the response.

### 13.4 Response Error Format

```json
{
    "success": false,
    "message": "Customer not found",
    "resolution": "Please check the customer ID and try again",
    "error": "Error: Customer not found...",  // development only
    "stack": "..."  // development only
}
```

---

## 14. Logging Analysis

### 14.1 Logger Configuration (`utils/logger.js`)

**Library:** Winston 3.11 + winston-daily-rotate-file

**Transports:**

| Transport | Level | File | Retention |
|-----------|-------|------|-----------|
| Console | debug+ | stdout | N/A |
| File (error) | error | `logs/error-%DATE%.log` | 30 days |
| File (combined) | info+ | `logs/combined-%DATE%.log` | 30 days |
| File (exceptions) | uncaught exceptions | `logs/exceptions.log` | N/A |

### 14.2 Request Logging (in `server.js`)

Every request is logged with method, path, IP, and user agent:

```javascript
logger.info(`${req.method} ${req.path}`, { ip: req.ip, userAgent: req.get('User-Agent') });
```

### 14.3 Log Usage Across Codebase

- Controllers log significant events (login, registration, errors)
- Database layer logs query errors and procedure errors
- Vehicle-branding routes log each request with body
- Error handler logs all errors with stack traces

---

## 15. File Upload Analysis

### 15.1 Upload Configuration

Both upload routes (`uploader.routes.js`, `bulk-import.routes.js`) use Multer with:

| Setting | Value |
|---------|-------|
| Storage | Memory (Buffer) |
| File size limit | 10 MB |
| Allowed types | XLSX (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), CSV |
| Validation | MIME type + extension check |

### 15.2 Upload Endpoints

| Endpoint | Route File | Controller | File Field | Auth |
|----------|-----------|------------|------------|------|
| `POST /api/uploader/order-form` | `uploader.routes.js` | `uploaderController.uploadOrderForm` | `file` | `super_admin`, `admin`, `manager` |
| `POST /api/bulk-import/leads` | `bulk-import.routes.js` | `bulkImportController.importLeads` | `file` | 7 roles |
| `POST /api/bulk-import/vehicle-brands` | `bulk-import.routes.js` | `bulkImportController.importVehicleBrands` | `file` | 3 roles |
| `POST /api/bulk-import/vehicles` | `bulk-import.routes.js` | `bulkImportController.importVehicles` | `file` | 5 roles |
| `POST /api/bulk-import/sales-orders` | `bulk-import.routes.js` | `bulkImportController.importSalesOrders` | `file` | 3 roles |

### 15.3 Upload Processing Flow

```
Client uploads file (multipart/form-data)
  │
  ├─ Multer middleware
  │   ├─ File stored in memory (Buffer)
  │   └─ File validated (type + size)
  │
  ├─ Controller function
  │   ├─ Parse buffer with xlsx or csv-parse
  │   ├─ Normalize column headers
  │   ├─ Validate required columns exist
  │   ├─ Process rows (insert into DB)
  │   └─ Return { success, inserted, errors }
  │
  └─ Response: { success: true, data: { inserted: N, errors: [...] } }
```

---

## 16. API Response Standards

### 16.1 Success Response Pattern

The predominant pattern is:

```json
{
    "success": true,
    "data": { ... },
    "message": "Optional success message",     // (not always present)
    "pagination": {                            // (paginated endpoints)
        "page": 1,
        "limit": 25,
        "total": 100,
        "totalPages": 4
    }
}
```

### 16.2 Error Response Pattern

```json
{
    "success": false,
    "message": "Human-readable error message",
    "resolution": "Suggestion to fix the error",  // (when available)
    "error": "...",                                  // (development only)
    "stack": "..."                                   // (development only)
}
```

### 16.3 Pagination Pattern

Used in: customers (GET /), leads (GET / via repo), reports (GET /), invoices (GET /), vehicles (parts routes).

All use manual `page`, `limit`, `offset` calculation in the controller:

```javascript
const offset = (parseInt(page) - 1) * parseInt(limit);
// ... SQL with LIMIT ? OFFSET ?
```

### 16.4 Response Inconsistencies

| Endpoint | Pattern Issue |
|----------|--------------|
| Lead export (GET /api/leads/export) | Returns raw CSV (not JSON) |
| Dashboard legacy endpoints | Inconsistent data shapes vs modern equivalents |
| Some 404 responses | Manual `res.status(404).json(...)` instead of throwing AppError |
| Reports controller | Some methods return `{ success, message, data }` without standard wrapper |
| Payment methods | `/types` returns flat list, others return wrapped in `{ success, data }` |
| Lead routes (via repo) | Returns `{ success, ...result }` where result is spread from repo (potential for key conflicts) |

---

## 17. Module-by-Module Flow Diagrams

### 17.1 Authentication Flow

```
POST /api/auth/login
  │
  ├─ [No middleware]        ← Public endpoint
  │
  ├─ Controller (inline)
  │   ├─ Validate email + password
  │   ├─ SELECT u.*, r.name FROM users JOIN roles WHERE email = ?
  │   ├─ bcrypt.compare()
  │   ├─ generateToken() → JWT (24h)
  │   ├─ generateRefreshToken() → JWT (7d)
  │   ├─ UPDATE users SET last_login = NOW()
  │   ├─ DELETE expired user_sessions
  │   ├─ INSERT new user_session
  │   └─ Response: { success, data: { user, token, refreshToken } }
  │
  └─ Error → AppError → Global error handler
```

### 17.2 Lead CRUD Flow

```
GET /api/leads
  │
  ├─ authenticate middleware  ← JWT verification
  │
  ├─ LeadRepository.findAllWithFilters(filters)
  │   ├─ Build dynamic SQL with search, status, source, priority, city, assigned_to, date range
  │   ├─ Paginate with LIMIT/OFFSET
  │   ├─ Sort by specified column
  │   └─ Return { leads, pagination }
  │
  ├─ Response: { success, leads: [...], pagination: {...} }
  │
  └─ Error → AppError → Global error handler
```

### 17.3 Sales Order Flow

```
POST /api/sales/direct
  │
  ├─ authenticate + authorize('super_admin', 'admin', 'sales_manager')
  │
  ├─ salesManagement.controller → createDirectSalesOrder()
  │   ├─ Validate required fields
  │   ├─ BEGIN TRANSACTION
  │   │   ├─ INSERT INTO sales_orders (...)
  │   │   ├─ UPDATE vehicles SET status = 'sold' WHERE id = ?
  │   │   ├─ UPDATE bookings SET status = 'converted' WHERE id = ?
  │   │   └─ INSERT INTO audit_log (...)
  │   ├─ COMMIT
  │   └─ Response: { success, data: { id, orderNumber } }
  │
  └─ Error → ROLLBACK → AppError → Global error handler
```

### 17.4 Invoice Generation Flow

```
POST /api/invoices/from-sales-order
  │
  ├─ authenticate + authorize('super_admin', 'sales_manager')
  │
  ├─ invoiceManagement.controller → createFromSalesOrder()
  │   ├─ SELECT sales_order + items
  │   ├─ BEGIN TRANSACTION
  │   │   ├─ Generate invoice_number (sequence-based)
  │   │   ├─ INSERT INTO invoices (...)
  │   │   ├─ INSERT INTO invoice_items (...) (for each line item)
  │   │   ├─ UPDATE sales_orders SET status = 'invoiced'
  │   │   └─ INSERT INTO audit_log (...)
  │   ├─ COMMIT
  │   └─ Response: { success, data: { id, invoiceNumber } }
  │
  └─ Error → ROLLBACK → AppError → Global error handler
```

---

## 18. API Dependency Graph

### 18.1 Middleware Dependency Graph

```
helmet()          ← First middleware (security)
cors()            ← CORS configuration
express.json()    ← Body parsing
urlencoded()      ← Form data parsing
Request Logger    ← Winston logging
Swagger UI        ← API docs (served at /api-documentation)
      │
      ▼
  authenticate    ← JWT verification + user hydration (per-route)
      │
      ▼
  authorize()     ← Role check (per-route, optional)
      │
      ▼
  validateRequest() ← express-validator (per-route, seldom used)
      │
      ▼
  multer          ← File upload (per-route, upload/bulk-import only)
      │
      ▼
  Controller fn   ← Business logic + SQL
      │
      ▼
  AppError → Global error handler (catch-all)
```

### 18.2 Route→Controller→Database Mapping

```
Routes                         Controllers                         Database
──────                         ──────────                         ────────
auth.routes ──────────────┐    (inline in route)                  users, roles, user_sessions
user.routes ──────────────┤    (inline in route)                  users, roles
admin.routes ─────────────┤─── userManagement.controller ──────── users, roles, user_departments
                          ├─── roleManagement.controller ──────── roles, role_permissions, permissions
                          ├─── departmentManagement.controller ── departments
                          └─── statusManagement.controller ────── status_definitions, status_assignments
lead.routes ──────────────┼─── LeadRepository ─────────────────── leads (SP sp_convert_lead_to_customer)
customer.routes ──────────┤─── (inline in route) ──────────────── customers, sales_orders
vehicle.routes ───────────┼─── vehicleInventory.controller ───── vehicles, vehicle_makes, models, variants, colors
parts.routes ─────────────┼─── partsInventory.controller ──────── parts, part_categories, suppliers
quotation.routes ─────────┤
booking.routes ───────────┤
sales.routes ─────────────┼─── salesManagement.controller ─────── quotations, bookings, sales_orders, vehicles
invoice.routes ───────────┼─── invoiceManagement.controller ──── invoices, invoice_items, invoice_payments
payment.routes ───────────┤    (inline in route)                 payments, invoices, customers
service.routes ───────────┼─── serviceManagement.controller ──── appointments, job_cards, job_card_services, job_card_parts
reports.routes ───────────┼─── reports.controller ─────────────── reports, dynamic SQL + views
dashboard.routes ─────────┤    (inline in route)                 leads, customers, vehicles, sales_orders, invoices, etc.
warehouse.routes ─────────┼─── warehouseManagement.controller ─── warehouses, vehicles, parts
erp-settings.routes ──────┼─── erpSettings.controller ─────────── companies, branches, settings, currencies, taxes, document_templates
vehicle-master.routes ────┼─── vehicleMaster.controller ───────── vehicle_makes, models, variants, colors, categories, suppliers
payment-methods.routes ───┼─── paymentMethods.controller ──────── payment_methods
service-master.routes ────┼─── serviceMasterController ────────── service_types, labor_rates, packages, warranties
profile.routes ───────────┼─── profile.controller ─────────────── users (profile data)
global-search.routes ─────┼─── global-search.controller ───────── leads, customers, vehicles, parts, sales_orders
uploader.routes ──────────┼─── uploader.controller ────────────── order_forms, order_form_items (via model)
vehicle-branding.routes ──┼─── vehicleBranding.controller ─────── vehicle_brands
bulk-import.routes ───────┼─── bulkImport.controller ──────────── leads, vehicle_brands, vehicles, sales_orders
employees.routes ─────────┼─── employees.controller ───────────── employees (inline SQL)
payroll.routes ───────────┼─── payroll.controller ─────────────── payroll_periods, payroll_lines
leaves.routes ────────────┼─── leaves.controller ──────────────── leave_types, leave_balances, leave_requests
expenses.routes ──────────┼─── expenses.controller ────────────── expense_accounts, categories, expenses
ledger.routes ────────────┼─── ledger.controller ──────────────── (general ledger queries)
```

---

## 19. Backend Health Assessment

### 19.1 Strengths

| Area | Assessment |
|------|-----------|
| **Authentication** | Solid JWT implementation with refresh tokens and session management |
| **Error Handling** | Consistent AppError pattern with global handler |
| **Logging** | Comprehensive Winston setup with rotation |
| **API Documentation** | Swagger auto-generated from JSDoc annotations |
| **Response Format** | Mostly consistent `{ success, data }` pattern |
| **Repository Pattern** | LeadRepository + CustomerRepository show good separation |
| **Transaction Support** | `beginTransaction/commit/rollback` utilities available |
| **File Upload** | Proper Multer configuration with type/size validation |
| **Security Headers** | Helmet.js enabled |
| **Dashboard** | Rich analytics with role-based data filtering |

### 19.2 Weaknesses / Concerns

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | **No service layer** | 🔴 High | All business logic in controllers = untestable, unmaintainable, duplicated code |
| 2 | **Missing authorization on CRUD** | 🔴 High | Vehicles, parts, customers, services, warehousing, lead-master, sales-master, vehicle-master, service-master have NO role-based auth for write operations |
| 3 | **No input validation on most endpoints** | 🔴 High | Only vehicle-branding uses `validateRequest`; others rely on manual checks or none |
| 4 | **SQL injection in dashboard** | 🔴 High | Dashboard uses `${userId}` string interpolation in SQL (lines 55, 59, 61, 65, 67, 177, 383, 399, 430) |
| 5 | **Duplicate AppError class** | 🟡 Medium | `utils/AppError.js` is dead code; `middleware/errorHandler.js` has the active version |
| 6 | **Dead route file** | 🟡 Medium | `report.routes.js` (old views-based) is NOT imported — should be removed |
| 7 | **No rate limiting** | 🟡 Medium | No protection against brute force on `/api/auth/login` |
| 8 | **No request size validation** | 🟡 Medium | Generic 10 MB limit applied globally, not endpoint-specific |
| 9 | **Response inconsistencies** | 🟡 Medium | Some endpoints omit `data` wrapper, pagination format varies |
| 10 | **Environment files with credentials** | 🟡 Medium | `.env.production.server` contains committed DB credentials |
| 11 | **Inline role checks bypass authorize** | 🟡 Medium | Dashboard `/kpis` and `/alerts` use inline role checks instead of the `authorize` middleware |
| 12 | **Hardcoded role_id=9 in register** | 🟡 Medium | `roleId || 9` — magic number with no validation that role 9 exists |
| 13 | **No integration tests** | 🟡 Medium | Zero test files found (package.json has no test command configured) |
| 14 | **CORS is restrictive** | 🟢 Low | Only allows localhost in dev; mobile apps need whitelisting |
| 15 | **No API versioning** | 🟢 Low | All routes under `/api/` with no version prefix |

### 19.3 Security Audit Notes

- **Dashboard SQL Injection**: Lines 55, 59, 61, 65, 67, 177, 383, 399, 430 in `dashboard.routes.js` use `${userId}` directly in SQL strings. While `userId` comes from JWT (not user input), a compromised token could allow injection.
- **No CSRF protection**: No CSRF tokens — relies on JWT in header, which is acceptable for API-only.
- **No Helmet configuration**: Default Helmet settings — no CSP configured, no HSTS.
- **Production env committed**: DB credentials visible in `.env.production.server`.

### 19.4 Refactoring Recommendations

1. **Extract a service layer** — Move business logic out of controllers into dedicated service modules
2. **Add authorization to unprotected routes** — Every mutating endpoint should have `authorize()` middleware
3. **Apply validation middleware** — Add `validateRequest` to all POST/PUT/PATCH endpoints
4. **Fix SQL injection in dashboard** — Replace `${userId}` with parameterized `?` placeholders
5. **Remove dead code** — Delete `utils/AppError.js` and `report.routes.js`
6. **Add rate limiting** — Implement `express-rate-limit` for auth endpoints
7. **Standardize pagination** — Create a shared pagination utility
8. **Add API versioning** — Prefix routes with `/api/v1/`

---

## 20. Learning Guide

Recommended reading order for developers new to the codebase:

### Week 1: Foundation
1. `server.js` — Entry point, middleware pipeline, route registration
2. `middleware/auth.js` — JWT authentication + authorization
3. `middleware/errorHandler.js` — Error handling pattern
4. `config/database.js` — Database connection + query helpers
5. `utils/logger.js` — Logging infrastructure

### Week 2: Core Modules
6. `routes/auth.routes.js` + `routes/customer.routes.js` — Inline SQL pattern
7. `routes/lead.routes.js` + `repositories/LeadRepository.js` — Repository pattern
8. `controllers/salesManagement.controller.js` — Largest controller (sales/bookings/quotations)
9. `controllers/invoiceManagement.controller.js` — Invoice lifecycle + payments

### Week 3: Specialized Modules
10. `routes/service.routes.js` + `controllers/serviceManagement.controller.js` — Service workflow
11. `routes/dashboard.routes.js` — Analytics + SQL aggregation
12. `routes/reports.routes.js` + `controllers/reports.controller.js` — Reporting engine
13. `routes/bulk-import.routes.js` + `routes/uploader.routes.js` — File processing

### Week 4: HR + Settings
14. `routes/employees.routes.js` through `routes/ledger.routes.js` — HR module
15. `routes/erp-settings.routes.js` — Multi-company configuration
16. `routes/vehicle-master.routes.js` — Master data management

---

## 21. API Testing Guide

### 21.1 Environment Setup

```bash
# 1. Start backend
cd backend
npm install
npm run dev    # Nodemon on port 3002

# 2. Verify health
curl http://localhost:3002/api/health

# 3. Open Swagger docs
# Browser: http://localhost:3002/api-documentation
```

### 21.2 Authentication

```bash
# Login
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Save token and use for subsequent requests
TOKEN="<token_from_response>"

# Test authenticated endpoint
curl http://localhost:3002/api/dashboard/stats \
  -H "Authorization: Bearer $TOKEN"
```

### 21.3 Postman Collection

Suggested collection structure:
- **Auth**: Login, Register, Me, Logout
- **Customers**: CRUD + Stats + Toggle
- **Leads**: CRUD + Filters + Export + Convert
- **Sales**: Quotations → Bookings → Orders (full pipeline)
- **Service**: Appointments → Job Cards → Services → Parts
- **Inventory**: Vehicles, Parts, Warehouses
- **Reports**: All predefined + custom report CRUD
- **Admin**: Users, Roles, Departments, Statuses
- **Settings**: Companies, Branches, Currencies, Taxes

### 21.4 Endpoint Testing Checklist

| Test | Status |
|------|--------|
| Login with valid credentials → 200 + token | ✅ |
| Login with invalid credentials → 401 | ✅ |
| Access protected route without token → 401 | ✅ |
| Access with expired token → 401 | ✅ |
| Access with insufficient role → 403 | ✅ |
| Create resource → 201 + ID | ✅ |
| Read resource → 200 + data | ✅ |
| Update resource → 200 | ✅ |
| Delete resource → 200 | ✅ |
| Invalid input → 400 | ⚠️ Depends on validation |
| Non-existent resource → 404 | ⚠️ Inconsistent |
| Pagination → correct page/limit/total | ✅ |
| File upload → 200 + summary | ✅ |

### 21.5 Automated Testing

**Current state:** No test framework configured. `package.json` has:
```json
"scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": ""
}
```

**Recommended setup:**
- Jest + Supertest for integration tests
- Test database with seed data
- CI pipeline running tests on push

---

## 22. Final Summary

### Architecture Verdict

```
                    ┌─────────────────────────────────────┐
                    │         Express 4.18 Server          │
                    │          (server.js)                 │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │         Route Layer (33 files)       │
                    │  auth | user | admin | lead | cust  │
                    │  vehicle | parts | quotation | book │
                    │  sales | invoice | payment | service│
                    │  report | dashboard | warehouse |   │
                    │  erp-settings | vehicle-master |    │
                    │  payment-methods | service-master | │
                    │  profile | search | uploader | brand│
                    │  bulk-import | employee | payroll   │
                    │  leave | expense | ledger | master  │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │      Controller Layer (25 files)     │
                    │  Business Logic + Inline SQL + SPs   │
                    │  (No service layer)                  │
                    └──────┬───────────────┬──────────────┘
                           │               │
                    ┌──────▼──────┐  ┌─────▼───────────┐
                    │ Repositories │  │   Inline SQL    │
                    │   (3 files)  │  │  (most modules) │
                    └──────┬──────┘  └─────┬───────────┘
                           │               │
                    ┌──────▼───────────────▼───────────┐
                    │       config/database.js          │
                    │    MySQL Pool (mysql2/promise)    │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │            MySQL Database         │
                    │   Views | Stored Procedures | SQL │
                    └──────────────────────────────────┘
```

### Metrics Summary

| Metric | Count |
|--------|-------|
| Route files | 33 (32 registered + 1 dead) |
| Registered route groups | 32 |
| API endpoints | ~280+ |
| Controllers | 25 |
| Repository classes | 3 |
| Model files | 1 |
| Middleware files | 3 |
| Utility files | 4 |
| Stored procedures called | ~8+ (in LeadRepository + controllers) |
| Database views referenced | 7 (in dead report.routes.js) |
| Production dependencies | 16 |
| Test files | 0 |

### Key Takeaways

1. **No abstraction layers** — The absence of a service layer and near-absence of a model layer makes the code hard to test and maintain. Business logic is duplicated across controllers (e.g., pagination calculation appears in every controller).

2. **Security gaps** — About 60% of write endpoints lack role-based authorization. Dashboard has SQL injection via string interpolation. No rate limiting on auth.

3. **Mixed architectural patterns** — Some modules use repositories (Leads, Customers), most use inline SQL. Error response format is mostly consistent but has edge cases.

4. **Dead code exists** — One duplicate AppError class, one unregistered route file.

5. **Rich feature set** — Despite architecture issues, the API covers extensive ERP functionality: CRM (leads/customers), Sales (quotations/bookings/orders/invoices), Service (appointments/job cards), Inventory (vehicles/parts/warehouses), HR (employees/payroll/leaves/expenses), and Settings (companies/branches/currencies/taxes).

6. **Phase 4 readiness** — The database layer (Phase 2) and API layer (Phase 3) are now documented. Phase 4 (Frontend Analysis) should examine how the React frontend consumes these APIs and identify which inconsistencies affect the UI.
