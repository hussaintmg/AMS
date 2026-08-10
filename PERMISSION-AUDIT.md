# Permission audit

Every fault found while testing page permissions end to end, in one place.
Started 2026-08-10 against erpoj.com (read-only probing) and a local copy of its
data shape.

**How to re-run the checks:**

```bash
cd backend
node scripts/test_role_permissions.js       # the assertions below, as a suite
node scripts/audit_page_operations.js       # every route, its guard and its models
node scripts/diagnose_page_permissions.js --page part_scan   # one page, one role
```

Status key: **OPEN** · **FIXED** · **ACCEPTED** (deliberate, with the reason).

---

## The permission model, in one paragraph

Three things must line up before a role may act on a screen. `role.permissions`
says it may *open* the page. `role.jobs` says what it may *do* there. The route
guard names the page it is protecting. Page access alone is read-only by design
— `canDo` returns true for `view` when there is no job row — so every
create/edit/delete needs a job row with that action ticked.

---

## F1 · A module grant opened every page in that module — FIXED

**Severity: high. Introduced by me on 2026-08-10 and caught the same day.**

`authorizeAction` built its page target as
`{ pageKey: key, path: pathFor(key), module: moduleFor(key) }`. A stored
permission row is also matched on its `module`, and a module covers several
pages: Customers and Leads are both `crm`, Quotations/Bookings/Orders/Invoices
are all `sales`. So a role granted Customers passed the page check for Leads.

Confirmed live: the `parts manager` role holds Customers and no Leads page, and
`GET /api/leads` returned 200 with data.

Fixed in `backend/middleware/auth.js` — `module` goes back to being the page key,
so that legacy comparison only fires for a row whose module literally names the
page. The path stays, which is the part that was actually needed.

---

## F2 · Every vehicle sales document was readable by any signed-in user — FIXED

**Severity: high.**

On the four vehicle sales routers every *write* was guarded and every *read* was
not — `authenticate` only:

| Endpoint | Reads |
| --- | --- |
| `GET /api/quotations`, `/:id`, `/stats` | Quotation |
| `GET /api/bookings`, `/:id`, `/stats` | Booking, SalesOrder |
| `GET /api/sales`, `/:id`, `/:id/history`, `/with-invoices`, `/stats`, `/order-stats` | SalesOrder, Quotation, Booking, Invoice, Customer |
| `GET /api/sales/dispatched`, `/dispatch-stats` | SalesOrder |
| `GET /api/invoices`, `/:id`, `/stats`, `/:id/history`, `/:id/qr-data` | Invoice, Payment, Customer |
| `GET /api/payments`, `/methods/list` | Payment |

Any signed-in account — a parts counter clerk, an HR user — could read every
vehicle quotation, booking, order and invoice with one fetch: customer names and
phones, line items, totals, what is still owed. The sidebar hid the pages; the
API did not.

Field masking did not cover it either. `withheldKeys` returns "nothing withheld"
when the role has no job for the page, so a role with no Invoices job got the
unmasked record rather than a trimmed one.

Not yet exploited on erpoj.com: those four collections are empty there today
(the install is parts-only so far). It would have started leaking the day they
raised their first vehicle document.

Fixed: `view` guards added to all of the above. Dispatch reads accept
`['dispatch', 'sales_orders']`, so either page opens the report.

---

## F3 · Dashboard totals were open to any signed-in user — FIXED

**Severity: medium.**

`GET /api/dashboard/*` (nine endpoints) had no page guard. They return monthly
revenue, outstanding receivables, sales counts, top performers and recent sales.
Most counts respect the role's data scope, but `outstandingReceivables`,
`totalCustomers`, `vehiclesInStock` and `lowStockParts` are company-wide.

Fixed: guarded on `dashboard` view. A role without the Dashboard page is
redirected away from it in the browser already, so nothing legitimate calls these
without the page.

**Still open inside this one:** the four counts above ignore data scope. A role
scoped to "own records only" still sees company-wide receivables on its
dashboard. Tracked as F8.

---

## F4 · Administrative ERP settings were readable by anyone — FIXED

**Severity: low.**

`GET /api/erp-settings/settings`, `/settings/categories`, `/stats` and
`/managers` (which returns a user list) had no guard. Now guarded on `settings`
view.

`/currencies`, `/taxes`, `/companies`, `/branches` and `/document-templates`
stay open deliberately — see F7.

---

## F5 · Any document could be rendered as HTML or PDF by id — FIXED

**Severity: high.**

`GET /api/pdf-management/resolved-html/:documentType/:id`, `/print-html/...` and
`/download/...` took `authenticate` only. `documentType` is one of
quotation/booking/order/invoice and the loader tries the vehicle model *and* its
parts twin, so a parts-only role could render a vehicle invoice in full simply by
knowing its id — the rendered document carries everything the API would have
withheld.

Fixed: those three routes now resolve the document type to its page and check
`view` on it (`downloadPdf` for the download), accepting either side of the
business the way the loader does.

---

## F6 · Role Jobs offered no way to reach a page the role did not hold — FIXED

**Severity: medium (usability, but it is what "I ticked Create and it does not
work" turned out to be).** Fixed on 2026-08-10 in an earlier commit: searching
reveals unheld pages, a role with pages but no actions is called out, and the
scanner's denial message names where to go.

---

## F7 · Reference reads left open on purpose — ACCEPTED

These have no page guard and should not get one. Every one of them is chrome or
a picker that screens belonging to *other* pages need, and guarding them by
their own page would break those screens:

| Endpoint | Needed by |
| --- | --- |
| `GET /api/erp-settings/currencies`, `/taxes` | `useErpDocumentSettings` — every document screen, including the scanner |
| `GET /api/erp-settings/companies`, `/branches`, `/document-templates/default/:type` | document headers on Sales and the print templates |
| `GET /api/payment-methods`, `/api/invoices/payment-methods` | the payment picker on every document |
| `GET /api/service-master/*` | service type/labour pickers |
| `GET /api/barcode/scan`, `/search`, `/:kind/:id/svg` | the scanner itself — this *is* the scan page's endpoint |
| `GET /api/users/active`, `/roles/list`, `/:id` | assign-to pickers across CRM, HR and sales |
| `GET /api/logs*` | scoped separately by `buildAllowedLogsQuery` (own logs only) |
| `GET /api/server-management/sidebar`, `/branding` | per-user filtered; the sidebar is built from it |
| `GET /api/auth/me`, `/api/profile`, `/api/notifications` | the caller's own record |

Verified on live that global search (`GET /api/search`) is already
permission-filtered — it stamps a `permissionKey` per result and only returned
Parts to a parts-only role.

`GET /api/users/active` returns the staff directory to any signed-in user. It is
a genuine but minor disclosure (names, not credentials) and guarding it would
break several pickers. Left as-is, noted here rather than silently accepted.

---

## F9 · A vehicle sales role can read the parts counter's books — OPEN, needs your call

**Severity: medium. This one is a business decision, not a bug, so I have not
changed it.**

Found by sweeping a vehicle-sales-only role (Quotations, Bookings, Orders,
Invoices, Vehicles, Dispatch and no parts page at all):

```
LEAK  part_quotations  HTTP 200  served without the page
LEAK  part_invoices    HTTP 200  served without the page
```

`parts-sales.routes.js` maps each parts endpoint to several pages:

```js
quotations: ['part_quotations', 'quotations', SCAN]
invoices:   ['part_invoices',   'invoices',   SCAN]
```

so holding the *vehicle* Quotations page opens the parts quotation book too. The
file says this is deliberate — "a role that may create a quotation may create a
parts quotation, so no new permission has to be granted before the parts screens
work" — and it exists so an installation that predates the parts pages keeps
working.

It is still worth deciding on: a vehicle salesman can read every parts counter
sale, its customers and its margins, without ever being given a parts page.

**Options**

1. Leave it. Nothing breaks; roles keep whatever reach they have today.
2. Drop the vehicle pages from the parts map, so parts screens need parts pages.
   Cleaner, and any role that relied on the fallback must be given
   `part_quotations` / `part_invoices` explicitly — on erpoj.com the `parts
   manager` role already holds both, so nothing there would change.
3. Keep the fallback for `create` only, so an existing role can still raise a
   parts document but cannot browse the book.

The reverse direction is already closed and tested: holding a parts page is
never permission to touch a vehicle document.

---

## F10 · Most screens show every action button to every role — OPEN

**Severity: high. This is the one behind "we cannot use it the way a super admin
does".**

The server refuses correctly. The *screens* do not ask. Only Sales and Customers
gate their buttons on the role's job; everywhere else Create / Edit / Delete are
drawn for anyone who can open the page, and the operator finds out only when the
save comes back 403. From the counter that is indistinguishable from the system
being broken.

Two of these you named, and both are worse than the rest because there is no
obvious permission to ask for either:

- **Quotations → Convert** (`Sales.js:939`, and the mobile card at `:979`) is
  drawn whenever the quotation is approved, with no condition in front of it. The
  server wants `quotations.edit` for a vehicle quotation, `invoices.create` for
  the parts one.
- **Leads → Convert to Customer** (`Leads.js:269` and `:326`) has no condition
  either — and `Leads.js` has no permission check anywhere in it at all, Create,
  Edit and Delete included. The server wants `leads.edit`.

Neither reads as "convert" in Role Jobs, because converting is bundled into Edit:
granting someone the right to turn a quotation into a booking also lets them
rewrite the quotation. See F11.

### The full inventory

Every page, the actions Role Jobs can grant on it, and whether its screen asks
before drawing the buttons:

| Page | Actions it can be granted | Screen | Buttons gated? |
| --- | --- | --- | --- |
| quotations | Create, Edit, Delete, Approve, Send email, Download PDF | Sales.js | yes (24) |
| bookings | Create, Edit, Delete, Send email, Download PDF | Sales.js | yes (24) |
| sales_orders | Create, Edit, Delete, Send email, Download PDF | Sales.js | yes (24) |
| invoices | Create, Edit, Delete, Send email, Download PDF | Sales.js | yes (24) |
| vehicle_scan | Create | BarcodeScan.js | yes (2) |
| part_quotations | Create, Edit, Delete, Approve, Send email, Download PDF | Sales.js | yes (24) |
| part_invoices | Create, Edit, Delete, Send email, Download PDF | Sales.js | yes (24) |
| part_scan | Create | BarcodeScan.js | yes (2) |
| leads | Create, Edit, Delete | Leads.js | **NO** |
| customers | Create, Edit, Delete | Customers.js | yes (4) |
| vehicles | Create, Edit, Delete | Vehicles.js | **NO** |
| parts | Create, Edit, Delete | PartsInventory.js | **NO** |
| services | Create, Edit, Delete | Service.js | **NO** |
| service_appointments | Create, Edit, Delete | Service.js | **NO** |
| employees | Create, Edit, Delete | Employees.js | **NO** |
| leaves | Create, Edit, Delete | Leaves.js | **NO** |
| expenses | Create, Edit, Delete | Expenses.js | **NO** |
| ledger | Create | Ledger.js | **NO** |
| payroll | Create, Edit, Delete | Payroll.js | **NO** |
| vehicle_master | Create, Edit, Delete | VehicleMasterData.js | **NO** |
| lead_master | Create, Edit, Delete | LeadMasterData.js | **NO** |
| sales_master | Create, Edit, Delete | SalesMasterData.js | **NO** |
| service_master | Create, Edit, Delete | ServiceMasterData.js | **NO** |
| warehouses | Create, Edit, Delete | WarehouseManagement.js | **NO** |
| payment_methods | Create, Edit, Delete | PaymentMethods.js | **NO** |
| status_management | Create, Edit, Delete | StatusManagement.js | **NO** |
| user_management | Create, Edit, Delete | UserManagement.js | **NO** |
| role_management | Create, Edit, Delete | RoleManagement.js | **NO** |
| department_management | Create, Edit, Delete | DepartmentManagement.js | **NO** |
| settings | Create, Edit, Delete | Settings.js | **NO** |
| server_management | Edit | - | (no screen) |
| email_templates | Create, Edit, Delete, Send email | EmailTemplates.js | **NO** |
| pdf_management | Create, Edit, Delete | PdfManagement.js | **NO** |
| reports | Create, Edit, Delete | Reports.js | **NO** |
| logs | Delete | Logs.js | **NO** |
| search | Edit | - | (no screen) |

`server_management` and `search` have no ordinary screen — both are configured
from Server Management itself, which is super-admin only.

**What each "NO" row needs:** read the role's job once at the top of the page
(`policyAllows(user, '<page>', '<action>', legacy)`, the way `Sales.js` does),
then gate the New button, the row Edit/Delete actions and any bulk bar on it. The
server-side guard already exists in every case, so this is the screen learning to
tell the truth, not a new permission.

Re-run the scan any time with:

```bash
cd backend && node scripts/audit_action_buttons.js
```

---

## F11 · Convert has no permission of its own — OPEN

Turning a quotation into a booking, a booking into an order, or a lead into a
customer are all guarded as `edit` on the source page. So "may convert" cannot be
granted without "may rewrite", which is not what a counter role should need.

A distinct `convert` action on `quotations`, `bookings` and `leads` would
separate them: a `PAGE_CAPABILITIES` entry, the route guards moved onto it, the
buttons gated on it — and every role already carrying `edit` on those pages
migrated to also carry `convert`, so nothing anyone can do today stops working.

---

## F12 · A page in the sidebar that the router then refuses — FIXED

**Severity: medium.** On erpoj.com the `parts manager` role has no Leads page,
and Leads was in its sidebar anyway. Clicking it bounced back, so the page
"would not open".

Two different rules were being applied to the same question. The sidebar is built
server-side from `canAccessTarget`, which F1 had made match on the module — and
Customers and Leads are both `crm`, so Leads passed. The browser's own
`canAccessPath` matches on the path, which correctly said no. Fixed with F1: the
two agree again.

---

## F13 · Being refused a page looked like a broken link — FIXED

**Severity: low, but it is what makes every other permission problem
unreadable.** Opening a page the role does not hold redirected to whatever page
happened to be first in its list, with no message. Nothing said a permission was
missing, so it read as the link being broken — which is how F12 was reported.

`/no-access` existed but was only ever reached by a user with no pages at all.
Now a refused page lands there and the screen names the page that was refused and
what the role can open instead.

---

---

## F16 · The phone view was not gated at all — FIXED

**Severity: high. Found on erpoj.com signed in as the parts-manager account.**

Customers gates its desktop toolbar and its table rows, and the live role holds
Customers with *view only* — so the Add button was correctly absent. The mobile
card list underneath it was not gated at all: every customer card still carried
Edit, Deactivate and Delete.

The phone view is the one a counter actually uses, so this was the permission
being bypassed entirely for the people most likely to hit it. Both call sites now
read the same three variables.

Confirmed both ways at 375px: with view only the cards carry no action buttons at
all; the desktop rows were already correct.

---

## F17 · Parts Inventory offered Delete to a role that has none — FIXED

**Severity: medium. Found live, on the account you gave me.**

The parts-manager role holds Parts with create and edit and *no* delete. The
screen was drawing, on every row and every source-type chip:

| Control | Server wants | Role has |
| --- | --- | --- |
| Row Delete | `parts.delete` | no |
| Chip Delete "3rd Party" | `parts.delete` | no |
| Bulk "Delete Selected" | `parts.delete` | no |
| Add Part / Upload / + Source Type | `parts.create` | yes |
| Row Edit / Chip Rename | `parts.edit` | yes |

Verified against the live API with ids that do not exist, so nothing was removed:
`DELETE /api/parts/:id` and `DELETE /api/parts/source-types/:id` both returned
403, while `PUT /api/parts/source-types/:id` returned 404 — the guard let the
rename through and only the record was missing.

Now gated. Re-checked on a local mirror of that exact role: Add Part, Upload,
+ Source Type and Rename remain; every Delete is gone.

## F8 · Dashboard company-wide counts ignore data scope — OPEN

**Severity: low.** See F3. `outstandingReceivables`, `totalCustomers`,
`vehiclesInStock` and `lowStockParts` are not passed through `scoped(user, …)`,
so a role restricted to its own records still sees company totals on the
dashboard. Deliberate for stock counts, arguably wrong for receivables.

---

## What was tested and found correct

- Parts scan → quotation and counter sale, with Create granted through Parts
  Scan, Parts Quotations or Parts Invoices (all three routes verified).
- Page keys that differ from the code's own (live stores labels — see the
  role-jobs notes) resolve by path, and do **not** become a way into a different
  page: a parts grant still cannot raise a vehicle quotation.
- 23 of 34 page gates on the live `parts manager` role behaved exactly as its
  grants said they should; the 11 that did not are F1–F5 above.
- Field masking strips withheld columns from the API payload for every page in
  `FIELD_CATALOG`, including from Mongoose documents rather than only `.lean()`
  results.

---

## F14 · Role Jobs offered the wrong actions on a renamed page — FIXED

**Severity: medium. Found with the owner account on erpoj.com.**

`getRoleJobs` sends two lookup tables to the screen — `capabilities` (which
actions a page implements) and `fieldCatalog` (which columns can be restricted)
— both keyed by the page names this build was written with. The screen looks
each card up by the name the page carries in *that* database. On erpoj.com nine
of thirty-nine pages carry a different one:

```
Vehicles Dispatch @ /dispatch          Barcode Scan @ /vehicle-sales/barcode-scan
Parts Quotation @ /parts-sales/…       Parts Invoices @ /parts-sales/invoices
Parts Barcode Scan @ /parts-sales/…    Payroll @ /hr/payroll
Role Management @ /admin/roles         Logs @ /logs
order_form_upload @ /data-import
```

A card that finds no entry falls back to offering *every* action. So the
read-only Dispatch report was offering Create, Edit, Delete, Approve, Send email
and Download PDF — and `saveRoleJobs`, which resolves the capability properly,
dropped them again on save. The administrator ticks a box, saves, and the box
comes back empty with no explanation.

The same miss cost five pages their column controls: the field catalog matched
13 of its 18 entries to a live page, so Parts Quotations, Parts Invoices,
Payroll and Dispatch showed "No per-field settings for this page" when they have
plenty.

Fixed in `getRoleJobs`: both tables are re-keyed to the names the pages actually
carry, resolved by path. Verified against a local copy of erpoj.com's exact page
shape — pages with no capability entry went from 9 to 0, Dispatch is read-only
again, Parts Scan offers Create only, and all 18 catalog entries land on a page.

---

## F15 · Three pages do not exist in the live database — OPEN

erpoj.com has 39 of the 42 pages this build knows. Missing entirely:

| Page | Path | Consequence |
| --- | --- | --- |
| `service_appointments` | `/service/appointments` | cannot be granted to any role |
| `payment_methods` | `/payment-methods` | cannot be granted to any role |
| `settings` | `/settings` | cannot be granted to any role — ERP Settings is super-admin-only by accident |

They are not broken, just absent: Role Jobs has no card to offer, so no role but
super admin can ever reach those screens. `node scripts/seed_pages_and_permissions.js`
creates them, and now also renames the nine drifted pages back (carrying every
role's permissions and job rows with them) instead of failing on the unique path
index the way it used to.

---

## F18 · The sales screens asked about the wrong side of the business — FIXED

**Severity: high. This is "we cannot work properly in sales" in one line.**

`Sales.js` serves both the vehicle and the parts documents, and every action
check named the *vehicle* page whatever side was on screen. A role holding
`part_quotations` with Create therefore got asked about `quotations`, which it
does not hold — and then fell through to a list of hard-coded role names it is
not in.

Seen live on the parts-manager account, on Parts Quotations:

| Button | Should be | Was |
| --- | --- | --- |
| + New Quotation | shown (has `part_quotations.create`) | **absent** |
| Download PDF | hidden (no `downloadPdf`) | shown |
| Estimate PDF | hidden | shown |
| Email estimate | hidden | shown |

Exactly backwards: the one thing the role was granted was missing, and three
things it was not granted were offered. The fallbacks explain it — `create`
falls back to a role-name list, `downloadPdf` falls back to `true`.

Fixed with `documentPolicy`, which resolves the page the same way the field
accessor already resolves columns: the parts page first on a parts screen, then
the vehicle page it borrows permissions from, and only then the legacy default.
Applied across all four sections — quotations, bookings, orders, invoices.

While there: emailing an estimate was gated on Download PDF. The two hit
different endpoints and the server guards them as `downloadPdf` and `sendEmail`
respectively, so they are now separate.

Verified on a local mirror of the live role: Parts Quotations now shows
**+ New Quotation** and, on each row, **View only** — no Edit, Delete, PDF or
estimate.

---

## F19 · The sidebar offered pages the router then refused — FIXED

**Severity: medium. This is the "Leads is in my menu but will not open" report,
properly fixed this time.**

F12 fixed the guard that `authorizeAction` uses. The sidebar is built through
`canAccessTarget` with the *page document* as the target, so it still carried the
page's real module — and `permissionAllowsView` matched a stored row on its
module. A module covers several pages: Customers and Leads are both `crm`, every
sales document is `sales`. So a role holding Customers and the parts documents
was shown Leads, Vehicle Sales Orders, Vehicle Quotations, Vehicle Invoices,
Vehicle Bookings and Vehicle Scan — six pages the router refuses.

A row's module may now only stand in for a page when the row has nothing better
to identify itself with: no pageKey and no path. A row that carries its own key
and path is a page grant, not a module grant.

Verified locally on the mirrored role: the sidebar now lists its six granted
pages and nothing else.
