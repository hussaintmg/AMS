/**
 * Idempotent bootstrap for MongoDB page/sidebar data and super-admin access.
 * Run from backend: node scripts/seed_pages_and_permissions.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const pages = [
  ['dashboard','Dashboard','/dashboard','dashboard','LayoutDashboard','Main',true],
  ['master_data','Master Data','/masterdata','master-data','Database','Master Data'],
  ['leads','Leads','/leads','crm','Users','CRM'], ['customers','Customers','/customers','crm','Contact','CRM'],
  ['vehicles','Vehicles','/vehicles','inventory','Car','Inventory'], ['vehicle_master','Vehicle Master Data','/vehicle-master','vehicle-master','CarFront','Master Data'],
  ['parts','Parts Inventory','/parts','parts','Cog','Inventory'], ['warehouses','Warehouse Management','/warehouses','warehouses','Warehouse','Master Data'],
  // Vehicle sales. The page keys are unchanged so existing role permissions keep
  // working; only the paths moved under /vehicles.
  ['sales_orders','Vehicle Sales Orders','/vehicles/orders','sales','ShoppingCart','Vehicle Sales'],
  ['quotations','Vehicle Quotations','/vehicles/quotations','sales','FileText','Vehicle Sales'],
  ['invoices','Vehicle Invoices','/vehicles/invoices','sales','ReceiptText','Vehicle Sales'],
  ['bookings','Vehicle Bookings','/vehicles/booking','sales','CalendarCheck','Vehicle Sales'],
  ['vehicle_scan','Vehicle Scan','/vehicles/barcode-scan','sales','ScanLine','Vehicle Sales'],
  // Parts sales — separate collections, separate screens, same permission model.
  ['part_quotations','Parts Quotations','/parts/quotations','sales','FileText','Parts Sales'],
  ['part_bookings','Parts Bookings','/parts/booking','sales','CalendarCheck','Parts Sales'],
  ['part_orders','Parts Sales Orders','/parts/orders','sales','ShoppingCart','Parts Sales'],
  ['part_invoices','Parts Invoices','/parts/invoices','sales','ReceiptText','Parts Sales'],
  ['part_scan','Parts Scan','/parts/barcode-scan','sales','ScanLine','Parts Sales'],
  ['services','Services','/service','service','Wrench','Service'], ['service_appointments','Service Appointments','/service/appointments','service','CalendarDays','Service'],
  ['service_master','Service Master Data','/service-master','service-master','Settings','Master Data'], ['reports','Reports','/reports','reports','BarChart3','Reports'],
  ['employees','Employees','/hr/employees','hr','UserRound','HR & Finance'], ['leaves','Leaves','/hr/leaves','leaves','CalendarDays','HR & Finance'],
  ['expenses','Expenses','/hr/expenses','expenses','WalletCards','HR & Finance'],   ['ledger','Ledger','/hr/ledger','ledger','BookOpen','HR & Finance'],
  ['payroll','Payroll','/hr/payroll','payroll','Coins','HR & Finance'],
  ['payment_methods','Payment Methods','/payment-methods','payment-methods','CreditCard','ERP Settings'], ['settings','ERP Settings','/settings','settings','SlidersHorizontal','ERP Settings'],
  ['user_management','User Management','/admin/users','users','UsersRound','Master Data'],
  ['department_management','Department Management','/admin/departments','departments','Building2','Master Data'],   ['role_management','Role Management','/admin/roles','roles','Shield','Master Data'],
  ['status_management','Option Management','/admin/statuses','statuses','ListChecks','Master Data'],
  ['lead_master','Lead Master Data','/lead-master','lead-master','ListTree','Master Data'], ['sales_master','Sales Master Data','/sales-master','sales-master','PanelTop','Master Data'],
  ['profile','Profile','/profile','profile','UserCircle','Account'], ['notification_settings','Notification Settings','/notification-settings','notifications','Bell','Account'],
  ['search','Search','/search','search','Search','Account'],
  ['data_import','Data Import','/data-import','uploader','UploadCloud','Uploader'],
  ['dispatch','Dispatch Report','/dispatch','dispatch','Truck','Sales'],
  ['server_management','Server Management','/server-management','server-management','ServerCog','System',true], ['logs','Logs','/logs','logs','FileText','System'], ['email_templates','Email Templates','/email','email','Mail','Communication'],
  ['pdf_management','PDF Management','/pdf-management','pdf','FileDown','Communication']
].map((p, index) => ({
  name: p[0], label: p[1], path: p[2], module: p[3], icon: p[4], group: p[5],
  isCore: p[6] === true, isActive: true, sortOrder: index,
  description: `${p[1]} module`
}));

const allActions = { view: true, create: true, edit: true, delete: true, sendEmail: true, downloadPdf: true, export: true };

async function run() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.MONGO_DB_NAME || 'amserp';
  await mongoose.connect(uri, { dbName });
  const { Page, Role, User, SystemSetting, BrandingSetting } = require('../models');
  const admin = await User.findOne({ email: String(process.env.SUPER_ADMIN_EMAIL || '').toLowerCase() }).populate('role');
  if (!admin) throw new Error('Super admin user not found; run create_super_admin.js first');
  const role = await Role.findOne({ name: 'super_admin' });
  if (!role) throw new Error('super_admin role not found; run create_super_admin.js first');

  // Old paths that no longer exist. The top-level sales paths moved under
  // /vehicles when parts got their own documents; the frontend still redirects
  // them, but they must not linger in the sidebar or in role permissions.
  const legacyPaths = [
    '/master-data', '/sales', '/sales/orders', '/sales/quotations', '/sales/invoices', '/sales/bookings', '/settings',
    '/orders', '/quotations', '/invoices', '/booking', '/barcode-scan',
  ];
  await Page.deleteMany({ path: { $in: legacyPaths } });
  for (const page of pages) {
    await Page.findOneAndUpdate({ name: page.name }, { $set: { ...page, updatedBy: admin._id }, $setOnInsert: { createdBy: admin._id } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
  }
  const permissions = pages.map((p) => ({ pageKey: p.name, path: p.path, module: p.module, canView: true, isActive: true }));
  const jobs = pages.map((p) => ({ pageKey: p.name, module: p.module, actions: allActions, dataScope: { mode: 'all', roles: [], users: [] } }));
  role.permissions = permissions;
  role.jobs = jobs;
  role.logsPermissions = { mode: 'all', users: [], roles: [], updatedAt: new Date(), updatedBy: admin._id };
  role.count = await User.countDocuments({ role: role._id, isActive: true });
  role.editable = false;
  role.isActive = true;
  await role.save();

  // Re-point every other role at the new paths.
  //
  // Permissions are stored with the path baked in, and access is decided by
  // matching the request path against it. Moving /quotations to
  // /vehicles/quotations would therefore lock out every non-super-admin role
  // that already had it. Matching on pageKey — which never changed — keeps
  // those grants intact and only rewrites where the page now lives.
  const pathByKey = Object.fromEntries(pages.map((p) => [p.name, { path: p.path, module: p.module }]));
  const syncPermissionPaths = (list = []) => {
    let changed = false;
    list.forEach((permission) => {
      const target = pathByKey[permission.pageKey];
      if (!target) return;
      if (permission.path !== target.path) { permission.path = target.path; changed = true; }
      if (permission.module !== target.module) { permission.module = target.module; changed = true; }
    });
    return changed;
  };

  let rolesRepathed = 0;
  for (const other of await Role.find({ _id: { $ne: role._id } })) {
    if (syncPermissionPaths(other.permissions)) {
      other.markModified('permissions');
      await other.save();
      rolesRepathed += 1;
    }
  }
  let usersRepathed = 0;
  for (const user of await User.find({ 'customPermissions.0': { $exists: true } })) {
    if (syncPermissionPaths(user.customPermissions)) {
      user.markModified('customPermissions');
      await user.save();
      usersRepathed += 1;
    }
  }

  // Keep an explicit user-level all-logs fallback as well as role-level access.
  // The resolver always grants super_admin mode=all, but this also keeps admin UI state unambiguous.
  await User.updateOne({ _id: admin._id }, { $set: {
    role: role._id,
    isActive: true,
    logPermissionSource: 'role',
    logsPermissions: { mode: 'all', users: [], roles: [], updatedAt: new Date(), updatedBy: admin._id }
  } });
  await SystemSetting.findOneAndUpdate({ key: 'permissionMode' }, { $set: { key: 'permissionMode', value: 'role', category: 'permissions', description: 'Page permissions are read from roles.' } }, { upsert: true, setDefaultsOnInsert: true });
  await SystemSetting.findOneAndUpdate({ key: 'logPermissionMode' }, { $set: { key: 'logPermissionMode', value: 'role', category: 'permissions', description: 'Log permissions are read from roles.' } }, { upsert: true, setDefaultsOnInsert: true });
  let branding = await BrandingSetting.findOne().sort({ createdAt: 1 });
  if (!branding) branding = new BrandingSetting();
  if (!branding.sidebarBackgroundColor) branding.sidebarBackgroundColor = '#1e3a5f';
  if (!branding.sidebarBackgroundType) branding.sidebarBackgroundType = 'gradient';
  await branding.save();
  console.log(`Seeded ${pages.length} pages, ${permissions.length} super-admin permissions, and ${jobs.length} full-access jobs.`);
  console.log(`Re-pointed page paths on ${rolesRepathed} role(s) and ${usersRepathed} user(s) with custom permissions.`);
  await mongoose.disconnect();
}

run().catch(async (error) => { console.error(error.message); await mongoose.disconnect().catch(() => {}); process.exitCode = 1; });
