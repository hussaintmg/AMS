# PROJECT MEMORY — AMSERP Full Application

## Current Architecture
- **Backend**: Node.js/Express with MySQL (stored procedures + direct queries) and MongoDB (email module)
- **Frontend**: React with context-based state management (some pages) and direct API + local state (others)
- **Two patterns coexist**: Context-based (Customers, Leads, StatusManagement, ServerManagement) and direct API (Warehouse, Vehicles, PartsInventory)

---

## Completed Work

### Service Master Controller
- `backend/controllers/serviceMasterController.js` — Was a stub, now has full CRUD with MySQL queries, validation, pagination, deletion checks. 22 methods. All route aliases preserved.

### Lead Status Config → StatusManagement
- `frontend/src/pages/StatusManagement.js` — Added "Lead Status Configuration" card below stats grid: dropdown of all status collections, save button, uses `serverManagementAPI.saveSetting('lead_status_collection_id', ...)`
- `frontend/src/pages/ServerManagement.js` — Removed "Lead Status Configuration" tab, state vars, handlers, data loading, and conditional rendering
- Lead Assignment tab remains in ServerManagement

### Lead Assistant / Lead Type Mapping
- Already in LeadMasterData.js under Types tab (portalModules checkboxes for Parts/Vehicles/Services)
- No Lead Assistant tab existed in ServerManagement — only Lead Assignment (stays) and Lead Status Configuration (moved)

### ERP Settings Cleanup
- `frontend/src/pages/Settings.js` — Removed "System Settings" tab (entire SystemSettingsTab function), removed "Print Templates" tab (DocumentTemplatesTab import + conditional render)
- Kept: Companies, Branches, Currencies, Tax Config, Payment Methods
- Updated SETTINGS_HASH_TABS, tabs array, and page description

### Payment Methods
- Already exists as a tab in Settings.js (`PaymentMethodsTab` function)
- Uses `paymentMethodsAPI` from `../services/api`
- Backend: `backend/controllers/paymentMethods.controller.js` with full CRUD

### Email Management (Phases 1-15)
- Theme removal, Variables module, Components redesign, Variable picker, Clean routing, Fixed modals, Builder refactored, Contexts split, Drawer standards, CSS standardized, Responsive layout, Form behavior, Optimistic updates, Quick create, SearchableSelect
- See detailed breakdown in email section below

---

## Pending Work

### Low Priority
- Lease page — does not exist (Leaves page already handles leave management)
- Salary/Branch pages — not separate pages (handled within Settings and Employees)
- No shell access — cannot run npm build/typecheck to verify compilation

---

## DataTable Component (New)
- `frontend/src/components/DataTable.js` — Reusable standard table component
- Props: `columns`, `data`, `loading`, `onRowClick`, `pagination`, `onPageChange`, `rowClassName`, `children`, `tableOnly`, `emptyMessage`
- Responsive: desktop table with `data-table` class, mobile cards with `user-card` class
- No built-in search/filter (designed for server-side API filtering)
- Pagination: Previous/Next with page counter
- Row click support, custom row classes, column render functions, badge support

### Pages Using DataTable
- **WarehouseManagement.js** — 9 columns, row click → edit modal, inventory modal button in actions
- **Vehicles.js** — 9 columns, row click → edit modal, status/condition badges, bulk upload
- **PartsInventory.js** — 9 columns, row click → edit modal, stock adjustment button, stock status badges
- **Leaves.js** — 7 columns, status badges (approved/rejected/pending), approve/reject action buttons
- **Expenses.js** — 7 columns, two tabs (expenses/categories), post/status actions
- **Ledger.js** — 7 columns, currency formatting for debit/credit, export buttons preserved
- **Employees.js** — 7 columns, row click → edit modal, inactive row styling

## Service Master Controller
- `backend/controllers/serviceMasterController.js` — Full CRUD (was stub). 22 methods with MySQL queries, validation, pagination, deletion checks.

## Lead Status Config Moved
- `frontend/src/pages/StatusManagement.js` — Added lead status collection selector card
- `frontend/src/pages/ServerManagement.js` — Removed Lead Status Configuration tab (Lead Assignment stays)

## ERP Settings Cleanup
- `frontend/src/pages/Settings.js` — Removed System Settings and Print Templates tabs. Kept: Companies, Branches, Currencies, Tax Config, Payment Methods

## Payroll Removed
- Route `/hr/payroll` removed from `App.js`
- Sidebar entry removed from `pages.js`

## Sales Sidebar Cleanup
- Removed individual sidebar entries for Quotations, Bookings, Invoices, Payments
- Only main "Sales" link remains (points to `/sales/orders`)

## Form Modals
- `LeadFormModal.js` — City (SearchableSelect + quick-create), Source/Type/Priority/Status all have in-form create
- `CustomerFormModal.js` — City/Source/Type/Status all have in-form create via LeadQuickCreateModal/LeadStatusItemModal

## Reports Page
- Already complete: category navigation (Sales, Inventory, Financials, Service), fetch/display from API, export CSV/XLSX/PDF

---

## Service Management Pages (Phases 2-7 Completed)

### Service Appointments & Job Cards (`Service.js`)
- Rewritten from 1100→974 lines with two clean tabs (Appointments, Job Cards)
- **Appointments**: Service types from MongoDB `serviceMasterAPI.getTypes()`, useModalKeyboard (ESC/Enter), overlay click close, saving states, date autoFocus, ConfirmModal for cancel, mobile cards, DataTable
- **Job Cards**: Service types + labor rates + warranties from `serviceMasterAPI`, auto-fill description/rate/hours on type select, labor rate override, warranty type dropdown, Add Service/Add Part sub-modals with auto-fill, live totals (labor + parts − discount + tax), status inline selects, ConfirmModal for cancel/complete
- **Fixed modals**: overlay click close, useModalKeyboard, autoFocus, saving states
- **Desktop**: DataTable with action buttons. **Mobile**: user-card layout

### Employees (`Employees.js`)
- Rewritten with branch selection, company/branch auto-select when single, department stays
- `useModalKeyboard`, `ConfirmModal` for deactivation, saving states, mobile cards
- Backend controller updated to handle `branch_id` in INSERT/UPDATE
- QA fixes: `company_id` added to emptyForm + openEdit, DataTable wrapped in `desktop-only` to prevent duplicate mobile cards

### Leaves (`Leaves.js`)
- Rewritten with status filter, employee filter, DataTable + mobile cards
- `useModalKeyboard` on new request modal, saving states, color-coded status badges
- Desktop: DataTable with approve/reject. Mobile: user-card layout

### Expenses (`Expenses.js`)
- Rewritten with clean tabs (expenses/categories), category CRUD (edit + deactivate via ConfirmModal)
- `useModalKeyboard` on both modals, saving states, mobile cards, DataTable
- Expense edit blocked if posted. Desktop: DataTable. Mobile: user-card layout

### Ledger (`Ledger.js`)
- EmailDrawer detail drawer on row click, pending-migration banner for stub response
- Summary cards (debit/credit/total), export CSV/XLSX/PDF
- QA fix: separated draft/committed filters to stop auto-submit on keystroke

### Reports (`Reports.js`)
- Complete rewrite from sidebar layout to 8-tab clean design (Leads, Customers, Sales, Inventory, Service, Expenses, Payments, Employee)
- Date range filters (from/to), summary report cards grid, export placeholder buttons
- No chart imports (no chart.js/react-chartjs-2), no runtime errors
- Responsive: CSS grid auto-fill cards, media query breakpoints at 768px/480px

## Swagger Documentation
- Added comprehensive JSDoc Swagger annotations to:
  - `backend/routes/employees.routes.js` — Employee schema, CRUD endpoints
  - `backend/routes/leaves.routes.js` — LeaveRequest schema, type/balance/request endpoints
  - `backend/routes/expenses.routes.js` — ExpenseCategory + Expense schemas
  - `backend/routes/ledger.routes.js` — LedgerEntry schema, filter params
  - `backend/routes/service-master.routes.js` — ServiceType/LaborRate/Package/Warranty schemas

## Backend Fixes
- `employees.controller.js` — Added `branch_id` to INSERT column list and UPDATE SET clause
- `serviceManagement.controller.js` — Added `discount`/`taxAmount` to createJobCard INSERT, added logger import + error logging to all 24 catch blocks
- `service-master.routes.js` — Added `authorize(...writeRoles)` to all 12 POST/PUT/DELETE routes (was missing role-based auth)
- `expenses.controller.js` — Fixed `code.toUpperCase()` crash when `code` is a number (added `String()` wrapper)

## QA Phase Fixes
- `Service.js`: Added `useModalKeyboard` to Add Service and Add Part sub-modals (ESC close, Enter submit)
- `Employees.js`: Added `company_id` to `emptyForm` and `openEdit` function, wrapped DataTable in `desktop-only`
- `Ledger.js`: Separated `draftFilters` (input-bound) from `committedFilters` (API-bound) to eliminate redundant API calls on keystroke
- `Reports.js`: Complete rewrite with 8 tabs, no chart imports, date filters, card grid, export placeholders

---

## Known Architecture Details

### API Response Patterns
- `r.data?.data?.items` — paginated lists
- `r.data?.data` — single items
- `r.data?.data?.collections` — status collections
- `r.data?.data?.value` — settings values

### Field Naming
- Active fields use `isActive` (camelCase) in MongoDB, `is_active` (snake_case) in MySQL
- All timestamps: `createdAt`, `updatedAt` (MongoDB); `created_at`, `updated_at` (MySQL)
- Soft delete: `isDeleted` / `is_deleted`

### Module Patterns
- **Context-based modules**: Customers, Leads, StatusManagement, ServerManagement — use context providers, drawer components, form modals
- **Direct-API modules**: Warehouse, Vehicles, PartsInventory — inline API calls, local state

### Routing
- `frontend/src/App.js` — main route definitions
- `frontend/src/constants/pages.js` — sidebar navigation config
- `frontend/src/services/api.js` — all API service objects

---

## Email Module (Completed)

### Themes — REMOVED
All files replaced with REMOVED markers. 6 routes + Swagger docs removed from email.routes.js. All theme resolution removed from emailRenderer.service.js.

### Variables Module
Full CRUD: model, controller, API, frontend list page, form modal, bulk import modal, mutable context.

### Components Redesign
Parameters array added to model. 3-panel editor (HTML/CSS, live preview, parameters). Preview endpoint resolves `{{param.key}}` placeholders.

### Other
- VariablePicker reusable component
- Clean routing with 7 tabs
- 7 standardized form modals with validation/loading/keyboard
- Builder refactored (templateId prop, autosave, Save/Publish/Close)
- 8 context files composed in EmailContext.js
- Reusable EmailDrawer component
- CSS standardized to use design tokens
- Responsive rules, optimistic updates, quick create, SearchableSelect
