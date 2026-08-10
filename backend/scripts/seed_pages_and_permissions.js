/**
 * Idempotent bootstrap for MongoDB page/sidebar data and super-admin access.
 * Run from backend: node scripts/seed_pages_and_permissions.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

// The table itself lives in constants/pages.js, so permission checks can resolve
// a page key to its path at request time — see the note there.
const { seedPages, LEGACY_PATHS } = require('../constants/pages');

const pages = seedPages();


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

  // Old paths that no longer exist. The frontend still redirects them, but they
  // must not linger in the sidebar or in role permissions. A page that still
  // uses one of these (ERP Settings kept /settings) is never deleted.
  const livePaths = new Set(pages.map((page) => page.path));
  await Page.deleteMany({ path: { $in: LEGACY_PATHS.filter((item) => !livePaths.has(item)) } });
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
  // /vehicle-sales/quotations would therefore lock out every non-super-admin role
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
