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
  ['sales_orders','Sales Orders','/orders','sales','ShoppingCart','Sales'],
  ['quotations','Quotations','/quotations','sales','FileText','Sales'],
  ['invoices','Invoices','/invoices','sales','ReceiptText','Sales'], ['bookings','Bookings','/booking','sales','CalendarCheck','Sales'],
  ['services','Services','/service','service','Wrench','Service'], ['service_appointments','Service Appointments','/service/appointments','service','CalendarDays','Service'],
  ['service_master','Service Master Data','/service-master','service-master','Settings','Master Data'], ['reports','Reports','/reports','reports','BarChart3','Reports'],
  ['employees','Employees','/hr/employees','hr','UserRound','HR & Finance'], ['leaves','Leaves','/hr/leaves','leaves','CalendarDays','HR & Finance'],
  ['expenses','Expenses','/hr/expenses','expenses','WalletCards','HR & Finance'], ['ledger','Ledger','/hr/ledger','ledger','BookOpen','HR & Finance'],
  ['payment_methods','Payment Methods','/payment-methods','payment-methods','CreditCard','ERP Settings'], ['settings','ERP Settings','/settings','settings','SlidersHorizontal','ERP Settings'],
  ['user_management','User Management','/admin/users','users','UsersRound','Master Data'],
  ['department_management','Department Management','/admin/departments','departments','Building2','Master Data'], ['status_management','Option Management','/admin/statuses','statuses','ListChecks','Master Data'],
  ['lead_master','Lead Master Data','/lead-master','lead-master','ListTree','Master Data'], ['sales_master','Sales Master Data','/sales-master','sales-master','PanelTop','Master Data'],
  ['profile','Profile','/profile','profile','UserCircle','Account'], ['notification_settings','Notification Settings','/notification-settings','notifications','Bell','Account'],
  ['search','Search','/search','search','Search','Account'], ['order_form_upload','Order Form Upload','/uploader/order-form','uploader','UploadCloud','Uploader'],
  ['server_management','Server Management','/server-management','server-management','ServerCog','System',true], ['email_templates','Email Templates','/email','email','Mail','Communication'],
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

  const legacyPaths = ['/master-data', '/sales', '/sales/orders', '/sales/quotations', '/sales/invoices', '/sales/bookings', '/settings'];
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
  if (!admin.role || String(admin.role._id || admin.role) !== String(role._id)) {
    await User.updateOne({ _id: admin._id }, { $set: { role: role._id, isActive: true } });
  }
  await SystemSetting.findOneAndUpdate({ key: 'permissionMode' }, { $set: { key: 'permissionMode', value: 'role', category: 'permissions', description: 'Page permissions are read from roles.' } }, { upsert: true, setDefaultsOnInsert: true });
  await SystemSetting.findOneAndUpdate({ key: 'logPermissionMode' }, { $set: { key: 'logPermissionMode', value: 'role', category: 'permissions', description: 'Log permissions are read from roles.' } }, { upsert: true, setDefaultsOnInsert: true });
  let branding = await BrandingSetting.findOne().sort({ createdAt: 1 });
  if (!branding) branding = new BrandingSetting();
  if (!branding.sidebarBackgroundColor) branding.sidebarBackgroundColor = '#1e3a5f';
  if (!branding.sidebarBackgroundType) branding.sidebarBackgroundType = 'gradient';
  await branding.save();
  console.log(`Seeded ${pages.length} pages, ${permissions.length} super-admin permissions, and ${jobs.length} full-access jobs.`);
  await mongoose.disconnect();
}

run().catch(async (error) => { console.error(error.message); await mongoose.disconnect().catch(() => {}); process.exitCode = 1; });
