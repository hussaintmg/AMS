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
 */
const ALL_ACTIONS = [
  'create', 'edit', 'delete', 'approve', 'sendEmail', 'downloadPdf',
  'stockIncrease', 'stockDecrease', 'stockSet',
  // Granted separately since 2026-08-18. Each used to ride on `edit` (or on
  // nothing at all): a role that could edit an invoice could also record money
  // against it, convert bookings, approve leave, post to the ledger… Roles
  // holding `edit` on deploy day were given these by
  // scripts/migrate_role_catalog.js, so nobody lost an ability they had.
  'import', 'export', 'toggleStatus', 'convert', 'assign', 'barcode',
  'recordPayment', 'changePaymentTerm', 'markDelivered', 'createJobCard',
  'postLedger', 'transfer', 'verify', 'generateGrn', 'lock', 'payout',
];

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
  import: 'Bulk upload / import',
  export: 'Export (CSV / XLSX / PDF)',
  toggleStatus: 'Activate / deactivate',
  convert: 'Convert (lead → customer, booking → order / invoice)',
  assign: 'Assign to user',
  barcode: 'Generate barcode',
  recordPayment: 'Record payment',
  changePaymentTerm: 'Change payment terms (Paid / Credit)',
  markDelivered: 'Mark delivered',
  createJobCard: 'Create job card',
  postLedger: 'Post to ledger',
  transfer: 'Transfer between accounts',
  verify: 'Verify (gate pass)',
  generateGrn: 'Issue goods receiving note',
  lock: 'Lock / unlock period',
  payout: 'Pay salaries / advances',
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
  quotations: { actions: ['create', 'edit', 'delete', 'approve', 'sendEmail', 'downloadPdf', 'convert'], dataScope: true },
  bookings: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf', 'convert'], dataScope: true },
  sales_orders: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf', 'markDelivered', 'import'], dataScope: true },
  invoices: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf', 'recordPayment', 'changePaymentTerm'], dataScope: true },
  // The scanner only ever raises new documents.
  vehicle_scan: { actions: ['create'], dataScope: false },

  // ── Parts sales ──────────────────────────────────────────────────────────
  part_quotations: { actions: ['create', 'edit', 'delete', 'approve', 'sendEmail', 'downloadPdf', 'convert'], dataScope: true },
  // Restored 2026-08-18 (on the client's live sidebar): converts to an order + invoice.
  part_bookings: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf', 'convert'], dataScope: true },
  part_invoices: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf', 'recordPayment', 'changePaymentTerm'], dataScope: true },
  part_scan: { actions: ['create'], dataScope: false },

  // ── Custom documents (module-gated; see SystemSetting module.custom_*) ────
  // Free-text line items, no inventory link. A custom booking converts into a
  // custom invoice with `convert`, its own grant.
  custom_quotations: { actions: ['create', 'edit', 'delete', 'approve', 'sendEmail', 'downloadPdf', 'convert'], dataScope: true },
  custom_bookings: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf', 'convert'], dataScope: true },
  custom_invoices: { actions: ['create', 'edit', 'delete', 'sendEmail', 'downloadPdf', 'recordPayment', 'changePaymentTerm'], dataScope: true },

  // ── CRM & inventory ──────────────────────────────────────────────────────
  leads: { actions: ['create', 'edit', 'delete', 'convert', 'assign', 'import'], dataScope: true },
  customers: { actions: ['create', 'edit', 'delete', 'toggleStatus', 'import'], dataScope: true },
  vehicles: { actions: ['create', 'edit', 'delete', 'barcode', 'import'], dataScope: true },
  parts: { actions: ['create', 'edit', 'delete', 'stockIncrease', 'stockDecrease', 'stockSet', 'barcode', 'import'], dataScope: true },
  // A read-only view over sales orders that already carry dispatch evidence.
  dispatch: { actions: [], dataScope: true },

  // ── Service ──────────────────────────────────────────────────────────────
  services: { actions: ['create', 'edit', 'delete'], dataScope: true },
  service_appointments: { actions: ['create', 'edit', 'delete', 'createJobCard'], dataScope: true },

  // ── HR & finance ─────────────────────────────────────────────────────────
  employees: { actions: ['create', 'edit', 'delete', 'toggleStatus', 'import'], dataScope: true },
  leaves: { actions: ['create', 'edit', 'delete', 'approve'], dataScope: true },
  expenses: { actions: ['create', 'edit', 'delete', 'postLedger'], dataScope: true },
  // Ledger entries are an append-only journal: posted, never amended.
  ledger: { actions: ['create', 'export'], dataScope: true },
  payroll: { actions: ['create', 'edit', 'delete', 'lock', 'postLedger', 'payout'], dataScope: true },
  // Money accounts (petty cash, IBFT, card machine…), transfers between them,
  // payables, and the balance sheet over all of them.
  accounts: { actions: ['create', 'edit', 'delete', 'transfer', 'recordPayment', 'export'], dataScope: false },

  // ── Gate passes ──────────────────────────────────────────────────────────
  gatepass_in: { actions: ['create', 'edit', 'delete', 'downloadPdf'], dataScope: true },
  gatepass_out: { actions: ['create', 'edit', 'delete', 'downloadPdf', 'generateGrn', 'verify'], dataScope: true },
  // The guard's screen: look a pass up and confirm it. Nothing else.
  gatepass_verify: { actions: ['verify'], dataScope: false },

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
