/**
 * "Custom Quotations / Bookings / Invoices are not in my menu" — why not, and
 * how to fix it.
 *
 * Four things must all hold before those screens appear. When one of them is
 * missing nothing on screen says so: the menu entries simply are not drawn and
 * the API answers 404, which looks identical to a broken deployment.
 *
 *   1. the Page rows exist        (constants/pages.js → seed_pages_and_permissions.js)
 *   2. the Page rows are active   (Server Management → Frontend)
 *   3. the module flag is on      (Server Management → Custom; OFF until written)
 *   4. the role may view the page (Role Management)
 *
 * This checks all four for every role and says which one failed.
 *
 *   node scripts/diagnose_custom_modules.js                 # report only
 *   node scripts/diagnose_custom_modules.js --fix           # switch the modules on
 *   node scripts/diagnose_custom_modules.js --grant admin   # ...and let that role see them
 *
 * It also lists what else each role cannot see, because the same cause — a role
 * created before a screen existed and never granted it — hides Parts Sales,
 * Gate Pass and Accounts just as quietly.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const mongoose = require('mongoose');

const FIX = process.argv.includes('--fix');
const GRANT = (() => {
  const index = process.argv.indexOf('--grant');
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : '';
})();
const tick = (ok) => (ok ? 'OK  ' : 'FAIL');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017', {
    dbName: process.env.MONGO_DB_NAME || 'amserp',
  });
  const { Page, Role, SystemSetting } = require('../models');
  const { MODULES, moduleFlags, setModuleFlag } = require('../utils/moduleFlags');

  console.log(`\nDatabase: ${mongoose.connection.name}\n`);

  const flags = await moduleFlags();
  const problems = [];

  for (const item of MODULES) {
    console.log(`── ${item.label} ─────────────────────────────`);

    for (const pageName of item.pages) {
      const page = await Page.findOne({ name: pageName }).lean();
      console.log(`  ${tick(Boolean(page))} page row "${pageName}"${page ? ` → ${page.path}` : ' is MISSING'}`);
      if (!page) {
        problems.push('Run: npm run seed:access   (creates the missing page rows)');
        continue;
      }
      console.log(`  ${tick(page.isActive !== false)} page is active${page.isActive === false ? ' — switch it on in Server Management → Frontend' : ''}`);
      if (page.isActive === false) problems.push(`Activate "${page.label || pageName}" in Server Management → Frontend`);
    }

    const on = flags[item.key] === true;
    console.log(`  ${tick(on)} module flag "${item.setting || `module.${item.key}`}" is ${on ? 'ON' : 'OFF — this alone hides the menu and 404s the API'}`);
    if (!on) {
      if (FIX) {
        await setModuleFlag(item.key, true, null);
        console.log('       → switched ON');
      } else {
        problems.push(`Switch on "${item.label}" in Server Management → Custom (or re-run with --fix)`);
      }
    }

    // Which roles may see it. super_admin bypasses the check but still needs the
    // module flag, which is the trap this script exists for.
    const roles = await Role.find({}).select('name displayName permissions').lean();
    const allowed = roles.filter((role) => (role.permissions || [])
      .some((perm) => item.pages.includes(perm.pageKey) && perm.canView !== false && perm.isActive !== false));
    console.log(`  ${tick(allowed.length > 0)} roles that may view it: ${allowed.length ? allowed.map((r) => r.name).join(', ') : 'NONE — grant it in Role Management'}`);
    if (!allowed.length) problems.push(`Grant "${item.label}" to a role in Role Management`);
    console.log('');
  }

  if (FIX) {
    const after = await moduleFlags();
    console.log(`Flags now: ${JSON.stringify(after)}\n`);
  }

  // Grant the custom pages to one named role. Deliberately opt-in and narrow:
  // widening what a role may see is the owner's decision, not a repair a
  // diagnostic should make on its own.
  if (GRANT) {
    const role = await Role.findOne({ name: GRANT });
    if (!role) {
      console.log(`No role named "${GRANT}". Roles: ${(await Role.find({}).select('name').lean()).map((r) => r.name).join(', ')}\n`);
    } else {
      const wanted = MODULES.flatMap((item) => item.pages);
      let added = 0;
      for (const pageName of wanted) {
        const page = await Page.findOne({ name: pageName }).lean();
        if (!page) continue;
        if ((role.permissions || []).some((perm) => perm.pageKey === pageName)) continue;
        role.permissions.push({
          pageKey: pageName, path: page.path, module: page.module || 'custom',
          canView: true, canCreate: true, canEdit: true, canDelete: true, isActive: true,
        });
        added += 1;
      }
      if (added) { role.markModified('permissions'); await role.save(); }
      console.log(`Granted ${added} custom page(s) to "${GRANT}". `
        + `${added ? 'Sign out and back in to see them.' : 'It already had them all.'}\n`);
    }
  }

  // The same gap, everywhere else. A role that predates a screen simply has no
  // row for it, and nothing on screen says the page exists at all.
  const activePages = await Page.find({ isActive: { $ne: false } }).sort({ sortOrder: 1 }).lean();
  const otherRoles = await Role.find({ name: { $ne: 'super_admin' } }).select('name permissions').lean();
  const gaps = otherRoles
    .map((role) => {
      const have = new Set((role.permissions || []).map((perm) => perm.pageKey));
      return { name: role.name, missing: activePages.filter((page) => !have.has(page.name)) };
    })
    .filter((row) => row.missing.length);
  if (gaps.length) {
    console.log('Pages other roles cannot see at all (grant them in Role Management):');
    gaps.forEach((row) => {
      const groups = [...new Set(row.missing.map((page) => page.group))];
      console.log(`  ${row.name}: ${row.missing.length} page(s) — ${groups.join(', ')}`);
    });
    console.log('');
  }

  if (!problems.length) {
    console.log('Everything checks out. If the menu is still empty, log out and back in —\n'
      + 'the sidebar is read at sign-in.\n');
  } else {
    console.log('To fix:');
    [...new Set(problems)].forEach((line) => console.log(`  • ${line}`));
    console.log('');
  }

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
