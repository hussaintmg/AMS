/**
 * The pages this application has, and where each one lives.
 *
 * This used to exist only inside `scripts/seed_pages_and_permissions.js`, which
 * meant nothing at request time could answer "what path is `part_scan`?". That
 * mattered more than it sounds: a permission check compares a page *name* — the
 * literal a route guard was written with, the `name` on the Page document, and
 * the `pageKey` a saved job carries. All three have to be the same string, and
 * on an installation seeded at a different time they are not. The screen is then
 * granted and the operator is still refused, with nothing on either side saying
 * why.
 *
 * A path does not drift that way: `/parts-sales/barcode-scan` is the Parts Scan
 * screen whatever the key in front of it is called. So the table lives here,
 * both the seed and `utils/pageRegistry` read it, and permission checks can fall
 * back to it when a name misses.
 *
 * Order, labels, groups and icons follow the client's sidebar arrangement
 * (2026-08-18): the array order *is* the sidebar order — the seed writes the
 * index as `sortOrder`, and the sidebar groups pages by `group` in the order
 * the groups first appear. Insert a page where it belongs in the list; do not
 * append it at the end.
 *
 * Columns: name, label, path, module, icon, group, isCore.
 * `legacy` lists paths this page has had before. They are deleted by the seed,
 * but a role granted under the old path may still be carrying it, so the
 * resolver treats them as the same page.
 */
const PAGES = [
  // ── Main / Master Data / CRM / Inventory / Service (interleaved, as the client keeps them) ──
  { name: 'dashboard', label: 'Dashboard', path: '/dashboard', module: 'dashboard', icon: 'LayoutDashboard', group: 'Main', isCore: true },
  { name: 'master_data', label: 'Master Data', path: '/masterdata', module: 'master-data', icon: 'Database', group: 'Master Data', legacy: ['/master-data'] },
  { name: 'leads', label: 'Leads', path: '/leads', module: 'crm', icon: 'Users', group: 'CRM' },
  { name: 'customers', label: 'Customers', path: '/customers', module: 'crm', icon: 'Contact', group: 'CRM' },
  { name: 'vehicles', label: 'Vehicles', path: '/vehicles', module: 'inventory', icon: 'Car', group: 'Inventory' },
  { name: 'services', label: 'Services', path: '/service', module: 'service', icon: 'Wrench', group: 'Service' },
  { name: 'vehicle_master', label: 'Vehicle Master Data', path: '/vehicle-master', module: 'vehicle-master', icon: 'CarFront', group: 'Master Data' },
  { name: 'parts', label: 'Parts Inventory', path: '/parts', module: 'parts', icon: 'Cog', group: 'Inventory' },
  { name: 'service_appointments', label: 'Service Appointments', path: '/service/appointments', module: 'service', icon: 'CalendarDays', group: 'Service' },
  { name: 'warehouses', label: 'Warehouse Management', path: '/warehouses', module: 'warehouses', icon: 'Warehouse', group: 'Master Data' },

  // ── Vehicle sales. The page keys are unchanged so existing role permissions
  // keep working; only the paths moved. They sit on their own /vehicle-sales
  // prefix rather than under /vehicles, because access is matched by path
  // prefix and nesting them would hand the sales screens to anyone who can see
  // stock. Dispatch and the scanner sit in this group on the client's sidebar.
  { name: 'sales_orders', label: 'Vehicle Sales Orders', path: '/vehicle-sales/orders', module: 'sales', icon: 'ShoppingCart', group: 'Vehicle Sales', legacy: ['/sales/orders', '/orders', '/vehicles/orders'] },
  { name: 'quotations', label: 'Vehicle Quotations', path: '/vehicle-sales/quotations', module: 'sales', icon: 'FileText', group: 'Vehicle Sales', legacy: ['/sales/quotations', '/quotations', '/vehicles/quotations'] },
  { name: 'invoices', label: 'Vehicle Invoices', path: '/vehicle-sales/invoices', module: 'sales', icon: 'ReceiptText', group: 'Vehicle Sales', legacy: ['/sales/invoices', '/invoices', '/vehicles/invoices'] },
  { name: 'bookings', label: 'Vehicle Bookings', path: '/vehicle-sales/booking', module: 'sales', icon: 'CalendarCheck', group: 'Vehicle Sales', legacy: ['/sales/bookings', '/booking', '/vehicles/booking'] },
  { name: 'dispatch', label: 'Vehicles Dispatch', path: '/dispatch', module: 'dispatch', icon: 'LogOut', group: 'Vehicle Sales' },
  { name: 'vehicle_scan', label: 'Vehicles Scan', path: '/vehicle-sales/barcode-scan', module: 'sales', icon: 'ScanBarcode', group: 'Vehicle Sales', legacy: ['/barcode-scan', '/vehicles/barcode-scan'] },

  // ── Parts sales — separate collections, separate screens, same permission model.
  { name: 'part_quotations', label: 'Parts Quotation', path: '/parts-sales/quotations', module: 'sales', icon: 'FileText', group: 'Parts Sales', legacy: ['/parts/quotations'] },
  // Restored 2026-08-18 at the client's request (it is on the live sidebar):
  // a parts booking reserves parts against a deposit and converts to an order +
  // invoice, exactly as the vehicle booking does.
  { name: 'part_bookings', label: 'Parts Bookings', path: '/parts-sales/bookings', module: 'sales', icon: 'LucideCalendarCheck', group: 'Parts Sales', legacy: ['/parts-sales/booking', '/parts/booking'] },
  { name: 'part_invoices', label: 'Parts Invoices', path: '/parts-sales/invoices', module: 'sales', icon: 'ReceiptText', group: 'Parts Sales', legacy: ['/parts/invoices'] },
  { name: 'part_scan', label: 'Parts Scan', path: '/parts-sales/barcode-scan', module: 'sales', icon: 'ScanBarcode', group: 'Parts Sales', legacy: ['/parts/barcode-scan'] },

  // ── Custom documents — free-text quotations, bookings and invoices for
  // anything that is neither a vehicle nor a part. Hidden from the sidebar and
  // closed at the API until switched on in Server Management → Custom
  // (utils/moduleFlags.js).
  { name: 'custom_quotations', label: 'Custom Quotations', path: '/custom/quotations', module: 'custom', icon: 'FileText', group: 'Custom Sales' },
  { name: 'custom_bookings', label: 'Custom Bookings', path: '/custom/bookings', module: 'custom', icon: 'CalendarCheck', group: 'Custom Sales' },
  { name: 'custom_invoices', label: 'Custom Invoices', path: '/custom/invoices', module: 'custom', icon: 'ReceiptText', group: 'Custom Sales' },

  // ── Gate passes: what came in through the gate (a logistics truck with parts,
  // a customer's vehicle), what went out, and the guard's verify screen.
  { name: 'gatepass_in', label: 'Gate Pass In', path: '/gatepass/in', module: 'gatepass', icon: 'LogIn', group: 'Gate Pass' },
  { name: 'gatepass_out', label: 'Gate Pass Out', path: '/gatepass/out', module: 'gatepass', icon: 'LogOut', group: 'Gate Pass' },
  { name: 'gatepass_verify', label: 'Gate Verify', path: '/gatepass/verify', module: 'gatepass', icon: 'ShieldCheck', group: 'Gate Pass' },

  // ── HR & Finance ──
  { name: 'employees', label: 'Employees', path: '/hr/employees', module: 'hr', icon: 'UserRound', group: 'HR & Finance' },
  { name: 'leaves', label: 'Leaves', path: '/hr/leaves', module: 'leaves', icon: 'CalendarDays', group: 'HR & Finance' },
  { name: 'expenses', label: 'Expenses', path: '/hr/expenses', module: 'expenses', icon: 'WalletCards', group: 'HR & Finance' },
  { name: 'ledger', label: 'Ledger', path: '/hr/ledger', module: 'ledger', icon: 'BookOpen', group: 'HR & Finance' },
  { name: 'payroll', label: 'Payroll', path: '/hr/payroll', module: 'payroll', icon: 'HandCoins', group: 'HR & Finance' },
  // Money accounts (petty cash, IBFT, card machine, online, internal company),
  // transfers between them, receivables, payables and the balance sheet.
  { name: 'accounts', label: 'Accounts & Petty Cash', path: '/finance/accounts', module: 'accounts', icon: 'Landmark', group: 'HR & Finance' },

  // ── Master data (continued) ──
  { name: 'lead_master', label: 'Lead Master Data', path: '/lead-master', module: 'lead-master', icon: 'ListTree', group: 'Master Data' },
  { name: 'service_master', label: 'Service Master Data', path: '/service-master', module: 'service-master', icon: 'Settings', group: 'Master Data' },
  { name: 'sales_master', label: 'Sales Master Data', path: '/sales-master', module: 'sales-master', icon: 'PanelTop', group: 'Master Data' },

  // ── Management ──
  { name: 'user_management', label: 'User Management', path: '/admin/users', module: 'users', icon: 'UsersRound', group: 'Management' },
  { name: 'role_management', label: 'Role Management', path: '/admin/roles', module: 'roles', icon: 'LucideUserCheck2', group: 'Management' },
  { name: 'department_management', label: 'Department Management', path: '/admin/departments', module: 'departments', icon: 'Building2', group: 'Management' },
  { name: 'status_management', label: 'Option Management', path: '/admin/statuses', module: 'statuses', icon: 'ListChecks', group: 'Management' },

  // ── Reports / uploader / settings / account / search / communication / server ──
  { name: 'reports', label: 'Reports', path: '/reports', module: 'reports', icon: 'BarChart3', group: 'Reports' },
  { name: 'data_import', label: 'Data Upload', path: '/data-import', module: 'uploader', icon: 'UploadCloud', group: 'Uploader' },
  { name: 'payment_methods', label: 'Payment Methods', path: '/payment-methods', module: 'payment-methods', icon: 'CreditCard', group: 'ERP Settings' },
  // Companies, branches, currencies, taxes and document templates. Not on the
  // client's live sidebar list, so it sits with Payment Methods rather than
  // being dropped — the screen behind it is real.
  { name: 'settings', label: 'ERP Settings', path: '/settings', module: 'settings', icon: 'SlidersHorizontal', group: 'ERP Settings' },
  { name: 'profile', label: 'Profile', path: '/profile', module: 'profile', icon: 'UserCircle', group: 'Account' },
  { name: 'notification_settings', label: 'Notification Settings', path: '/notification-settings', module: 'notifications', icon: 'Bell', group: 'Account' },
  { name: 'search', label: 'Search', path: '/search', module: 'search', icon: 'Search', group: 'Search' },
  { name: 'email_templates', label: 'Email Templates', path: '/email', module: 'email', icon: 'Mail', group: 'Communication' },
  { name: 'pdf_management', label: 'PDF Management', path: '/pdf-management', module: 'pdf', icon: 'FileDown', group: 'Communication' },
  { name: 'server_management', label: 'Server Management', path: '/server-management', module: 'server-management', icon: 'ServerCog', group: 'Server', isCore: true },
  { name: 'logs', label: 'Logs', path: '/logs', module: 'logs', icon: 'Activity', group: 'Server' },
];

/**
 * Paths no page uses any more. The frontend still redirects them; the seed
 * deletes Page rows sitting on them so they cannot linger in the sidebar.
 *
 * A path here that also appears as some page's `legacy` is deliberate: the row
 * goes, but a role still holding the old path keeps resolving to the page that
 * replaced it.
 */
const LEGACY_PATHS = [
  '/master-data', '/sales', '/sales/orders', '/sales/quotations', '/sales/invoices', '/sales/bookings',
  '/orders', '/quotations', '/invoices', '/booking', '/barcode-scan',
  // The first split put these under the inventory paths; they now have their own.
  '/vehicles/orders', '/vehicles/quotations', '/vehicles/invoices', '/vehicles/booking', '/vehicles/barcode-scan',
  '/parts/orders', '/parts/quotations', '/parts/invoices', '/parts/booking', '/parts/barcode-scan',
  // Parts bookings came back on 2026-08-18 at /parts-sales/bookings; the old
  // singular path and the sales-order stage stay gone.
  '/parts-sales/booking', '/parts-sales/orders',
];

/** Trailing slash, case and query string are never part of a page's identity. */
const normalizePath = (value) => {
  const raw = String(value || '').split('?')[0].split('#')[0].trim().toLowerCase();
  if (!raw) return '';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
};

/** The seed's shape: the same rows, with the columns it fills in. */
const seedPages = () => PAGES.map((page, index) => ({
  name: page.name,
  label: page.label,
  path: page.path,
  module: page.module,
  icon: page.icon,
  group: page.group,
  isCore: page.isCore === true,
  isActive: true,
  sortOrder: index,
  description: `${page.label} module`,
}));

module.exports = { PAGES, LEGACY_PATHS, normalizePath, seedPages };
