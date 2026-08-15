/**
 * What each page can actually do.
 *
 * Role Jobs used to offer the same seven checkboxes on every page, so an
 * administrator could tick "Approve" on Warehouse Management or "Send email"
 * on Parts Inventory and nothing would happen — the endpoints for those actions
 * do not exist. This table is the answer to "which of them are real", and the
 * Server Management screen renders from it.
 *
 * It is generated from, and kept honest by, `scripts/audit_page_operations.js`,
 * which walks every mounted route, resolves its page/action guard and reports
 * what it found. Run:
 *
 *   node scripts/audit_page_operations.js --capabilities
 *
 * after adding or re-guarding an endpoint and paste the differences in. The
 * audit is also a test: `scripts/test_role_permissions.js` fails if this table
 * claims an action the routes do not implement.
 */

/**
 * Every action Role Jobs knows how to store, in display order.
 *
 * `export` is deliberately absent: nothing in the API or the UI has ever read
 * it, so offering the checkbox only promised a restriction that was never
 * applied. The field stays on the Role model so old documents still load.
 */
const ALL_ACTIONS = ['create', 'edit', 'delete', 'approve', 'sendEmail', 'downloadPdf', 'stockIncrease', 'stockDecrease', 'stockSet'];

const ACTION_LABELS = {
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  sendEmail: 'Send email',
  downloadPdf: 'Download PDF',
  // One grant per way of moving a holding — the client staffs goods-in and
  // goods-out differently, so a role may be allowed to add stock, to remove
  // it, or to overwrite the count after a physical check, independently.
  // Each one is exactly the option it puts in the Adjust Stock dialog.
  stockIncrease: 'Increase stock',
  stockDecrease: 'Decrease stock',
  stockSet: 'Set exact stock value',
};

/**
 * `actions` — the write actions the page's endpoints really guard on.
 * `dataScope` — whether "whose records" is a meaningful question here. Master
 *   data and settings are shared by the whole company, so scoping them by
 *   creator would only be confusing.
 */
const PAGE_CAPABILITIES = {
  // ── Vehicle sales ────────────────────────────────────────────────────────
  // `downloadPdf` on bookings, orders and invoices has no endpoint of its own —
  // those documents are rendered from templates in the browser — but the button
  // is gated on it, so the checkbox does something and belongs here.
  quotations: { actions: ['create', 'edit', 'delete', 'approve', 'sendEmail', 'downloadPdf'], dataScope: true },
  bookings: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf'], dataScope: true },
  sales_orders: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf'], dataScope: true },
  invoices: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf'], dataScope: true },
  // The scanner only ever raises new documents.
  vehicle_scan: { actions: ['create'], dataScope: false },

  // ── Parts sales ──────────────────────────────────────────────────────────
  part_quotations: { actions: ['create', 'edit', 'delete', 'approve', 'sendEmail', 'downloadPdf'], dataScope: true },
  part_invoices: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf'], dataScope: true },
  part_scan: { actions: ['create'], dataScope: false },

  // ── CRM & inventory ──────────────────────────────────────────────────────
  leads: { actions: ['create', 'edit', 'delete'], dataScope: true },
  customers: { actions: ['create', 'edit', 'delete'], dataScope: true },
  vehicles: { actions: ['create', 'edit', 'delete'], dataScope: true },
  parts: { actions: ['create', 'edit', 'delete', 'stockIncrease', 'stockDecrease', 'stockSet'], dataScope: true },
  // A read-only view over sales orders that already carry dispatch evidence.
  dispatch: { actions: [], dataScope: true },

  // ── Service ──────────────────────────────────────────────────────────────
  services: { actions: ['create', 'edit', 'delete'], dataScope: true },
  service_appointments: { actions: ['create', 'edit', 'delete'], dataScope: true },

  // ── HR & finance ─────────────────────────────────────────────────────────
  employees: { actions: ['create', 'edit', 'delete'], dataScope: true },
  leaves: { actions: ['create', 'edit', 'delete'], dataScope: true },
  expenses: { actions: ['create', 'edit', 'delete'], dataScope: true },
  // Ledger entries are an append-only journal: posted, never amended.
  ledger: { actions: ['create'], dataScope: true },
  payroll: { actions: ['create', 'edit', 'delete'], dataScope: true },

  // ── Master data: shared by everyone, so no per-creator scope ─────────────
  // "Master Data" itself is a hub of links to the screens below; it has no
  // records of its own, so there is nothing to permit beyond opening it.
  master_data: { actions: [], dataScope: false },
  vehicle_master: { actions: ['create', 'edit', 'delete'], dataScope: false },
  lead_master: { actions: ['create', 'edit', 'delete'], dataScope: false },
  sales_master: { actions: ['create', 'edit', 'delete'], dataScope: false },
  service_master: { actions: ['create', 'edit', 'delete'], dataScope: false },
  warehouses: { actions: ['create', 'edit', 'delete'], dataScope: false },
  payment_methods: { actions: ['create', 'edit', 'delete'], dataScope: false },
  status_management: { actions: ['create', 'edit', 'delete'], dataScope: false },

  // ── Administration ───────────────────────────────────────────────────────
  user_management: { actions: ['create', 'edit', 'delete'], dataScope: false },
  role_management: { actions: ['create', 'edit', 'delete'], dataScope: false },
  department_management: { actions: ['create', 'edit', 'delete'], dataScope: false },
  // Companies, branches, currencies, taxes and document templates.
  settings: { actions: ['create', 'edit', 'delete'], dataScope: false },
  // Every Server Management endpoint is guarded on `edit`, which in practice
  // means super admin — the Role Jobs screen never lists that role, so this
  // entry only matters if the page is granted to another role deliberately.
  server_management: { actions: ['edit'], dataScope: false },
  // Each importer is judged on the resource it writes (Customers create,
  // Vehicles create…), not on this page.
  data_import: { actions: [], dataScope: false },

  // ── Communication & reporting ────────────────────────────────────────────
  email_templates: { actions: ['create', 'edit', 'delete', 'sendEmail'], dataScope: false },
  pdf_management: { actions: ['create', 'edit', 'delete'], dataScope: false },
  // Saved report definitions; the figures themselves are read-only.
  reports: { actions: ['create', 'edit', 'delete'], dataScope: true },
  // Which logs a role sees is set in Log Permissions, not here.
  logs: { actions: ['delete'], dataScope: false },

  // ── Read-only or personal ────────────────────────────────────────────────
  dashboard: { actions: [], dataScope: false },
  // Editing the search index configuration and forcing a rebuild.
  search: { actions: ['edit'], dataScope: false },
  profile: { actions: [], dataScope: false },
  notification_settings: { actions: [], dataScope: false },
};

/**
 * What one page may be permitted to do.
 *
 * The key is looked up directly first, then through the page's *path* — an
 * installation whose Page document carries a different name would otherwise
 * fall through to "offer everything" and let an administrator tick Approve on a
 * scanner, which is the opposite of what this table is for. See
 * `utils/pageRegistry`.
 *
 * A page that genuinely is not in the table is new or bespoke; offering every
 * action is the safe fallback there, because hiding a checkbox would silently
 * strip a permission the administrator meant to grant.
 */
const capabilitiesFor = (pageKey) => {
  const direct = PAGE_CAPABILITIES[pageKey];
  if (direct) return direct;
  // Required lazily: the registry reads constants/pages, and this file is
  // itself pulled in by the permission plumbing at load time.
  const { keysForPage } = require('../utils/pageRegistry');
  for (const key of keysForPage(pageKey)) {
    if (PAGE_CAPABILITIES[key]) return PAGE_CAPABILITIES[key];
  }
  return { actions: ALL_ACTIONS, dataScope: true };
};

module.exports = { PAGE_CAPABILITIES, ALL_ACTIONS, ACTION_LABELS, capabilitiesFor };
