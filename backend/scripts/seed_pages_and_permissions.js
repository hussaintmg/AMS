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

  // Matched on the *path* first, then the name.
  //
  // A page added by hand through Frontend Management takes its key from the
  // label it was typed with, so an install can hold the Parts Scan screen as
  // "Parts Barcode Scan" on the right path. Upserting by name there does not
  // find it, and inserting instead collides on the unique path index — the seed
  // used to fail outright on exactly the installation that most needed it. Path
  // first both finds the row and renames it back to the key the code uses.
  const renames = [];
  for (const page of pages) {
    const existing = await Page.findOne({ $or: [{ path: page.path }, { name: page.name }] });
    if (existing && existing.name !== page.name) renames.push([existing.name, page.name]);
    const query = existing ? { _id: existing._id } : { name: page.name };
    await Page.findOneAndUpdate(
      query,
      { $set: { ...page, updatedBy: admin._id }, $setOnInsert: { createdBy: admin._id } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
  }

  // A renamed page leaves every role pointing at the old key, and a job row
  // filed under a key no guard reads grants nothing. Carry them across.
  const renameMap = new Map(renames);
  const applyRenames = (list = []) => {
    let changed = false;
    list.forEach((row) => {
      const next = renameMap.get(row.pageKey);
      if (next && next !== row.pageKey) { row.pageKey = next; changed = true; }
    });
    return changed;
  };
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
    // Renames first: a row still under the old key would not match `pathByKey`.
    const renamed = applyRenames(other.permissions) | applyRenames(other.jobs);
    if (syncPermissionPaths(other.permissions) || renamed) {
      other.markModified('permissions');
      other.markModified('jobs');
      await other.save();
      rolesRepathed += 1;
    }
  }
  let usersRepathed = 0;
  for (const user of await User.find({ 'customPermissions.0': { $exists: true } })) {
    const renamed = applyRenames(user.customPermissions);
    if (syncPermissionPaths(user.customPermissions) || renamed) {
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
  if (renames.length) {
    console.log(`\nRenamed ${renames.length} page(s) to the keys this build uses, and carried every role's`);
    console.log('permissions and job rows across with them:');
    renames.forEach(([from, to]) => console.log(`  "${from}"  ->  ${to}`));
  }
  await mongoose.disconnect();
}

run().catch(async (error) => { console.error(error.message); await mongoose.disconnect().catch(() => {}); process.exitCode = 1; });
