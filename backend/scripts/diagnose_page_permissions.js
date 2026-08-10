/**
 * Why is this role denied on this page?
 *
 * Three separate things have to line up before a role may act on a screen: a
 * Page document, a `role.permissions` row granting the page, and a `role.jobs`
 * row with the action ticked. When one of them is filed under a different key or
 * an older path the screen looks granted and the API still refuses, and no
 * message anywhere says which of the three is missing. This prints all of them
 * side by side and names the one that fails.
 *
 * Run it on the server that is actually refusing — it reads the database that
 * install is pointed at, not a copy:
 *
 *   node scripts/diagnose_page_permissions.js --page part_scan
 *   node scripts/diagnose_page_permissions.js --page part_scan --role admin
 *   node scripts/diagnose_page_permissions.js --path /parts-sales/barcode-scan
 *
 * With no --role it reports every role that is not super_admin.
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const { PAGES, normalizePath } = require('../constants/pages');
const pageRegistry = require('../utils/pageRegistry');
const { capabilitiesFor } = require('../constants/pageCapabilities');

const arg = (name, fallback = '') => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

/** Which pages the parts/vehicle scanners accept for each document. */
const SCAN_GRANTS = {
  part_scan: ['part_scan', 'part_quotations', 'part_invoices', 'quotations', 'sales_orders'],
  vehicle_scan: ['vehicle_scan', 'quotations', 'bookings', 'sales_orders'],
};

const tick = (ok) => (ok ? 'OK  ' : 'FAIL');

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
  const { Page, Role, User } = require('../models');
  await pageRegistry.prime();

  const requestedPath = arg('path');
  const pageKey = arg('page') || (requestedPath ? pageRegistry.keyForPath(requestedPath) : 'part_scan');
  const roleFilter = arg('role');

  const table = PAGES.find((item) => item.name === pageKey);
  const expectedPath = table ? normalizePath(table.path) : '';
  const pageDoc = await Page.findOne({ name: pageKey }).lean();
  const byPath = expectedPath ? await Page.find({ path: new RegExp(`^${expectedPath}$`, 'i') }).lean() : [];

  console.log(`\n=== Page "${pageKey}" ===`);
  console.log(`  expected path (built-in table) : ${expectedPath || '(unknown page key)'}`);
  console.log(`  Page document by name          : ${pageDoc ? `${pageDoc.name} @ ${pageDoc.path} (active=${pageDoc.isActive !== false})` : 'MISSING'}`);
  console.log(`  Page document(s) by path       : ${byPath.length ? byPath.map((item) => `${item.name} @ ${item.path}`).join(', ') : 'none'}`);
  if (!pageDoc && byPath.length) {
    console.log(`  >> This database calls the page "${byPath[0].name}", not "${pageKey}".`);
    console.log('     Route guards look for the built-in key, so the path fallback is what');
    console.log('     joins them. Run seed_pages_and_permissions.js to rename it properly.');
  }
  if (!pageDoc && !byPath.length) {
    console.log('  >> The page does not exist in this database at all — Role Jobs cannot');
    console.log('     offer a card for it. Run: node scripts/seed_pages_and_permissions.js');
  }

  const capability = capabilitiesFor(pageKey);
  console.log(`  actions this page implements   : ${capability.actions.join(', ') || '(read-only)'}`);

  const roles = await Role.find(roleFilter ? { name: roleFilter } : { name: { $ne: 'super_admin' } })
    .select('name displayName permissions jobs').lean();
  if (!roles.length) {
    console.log(`\nNo role matched ${roleFilter ? `"${roleFilter}"` : 'the filter'}.`);
    return;
  }

  for (const role of roles) {
    const users = await User.countDocuments({ role: role._id, isActive: true });
    console.log(`\n--- Role "${role.name}" (${role.displayName || '-'}) · ${users} active user(s)`);

    // The same resolution the guard performs, spelled out.
    const keys = pageRegistry.keysForPage(pageKey, role.permissions);
    const permission = (role.permissions || []).find((item) => (
      keys.has(item.pageKey) || (expectedPath && normalizePath(item.path) === expectedPath)
    ));
    const job = (role.jobs || []).find((item) => keys.has(item.pageKey) || item.module === pageKey);

    console.log(`  keys that resolve to this page : ${[...keys].join(', ')}`);
    console.log(`  ${tick(Boolean(permission))} page granted   : ${permission ? `pageKey=${permission.pageKey} path=${permission.path} canView=${permission.canView}` : 'no permissions row — the role cannot open the screen'}`);
    console.log(`  ${tick(Boolean(job))} job row        : ${job ? `pageKey=${job.pageKey} actions=${Object.entries(job.actions || {}).filter(([, on]) => on === true).map(([key]) => key).join('+') || 'none'}` : 'no job row — page access alone is read-only, so every create is refused'}`);

    if (permission && !job) {
      console.log('  >> Server Management → Role Jobs → this role → tick the actions and Save.');
    }
    if (job && capability.actions.includes('create') && job.actions?.create !== true) {
      console.log('  >> The job row exists but Create is not ticked on it.');
    }

    // The scanner is the usual reason someone runs this, and it accepts several
    // pages — so say which of them would have worked.
    const grants = SCAN_GRANTS[pageKey];
    if (grants) {
      const granting = grants.filter((key) => {
        const alt = (role.jobs || []).find((item) => pageRegistry.keysForPage(key, role.permissions).has(item.pageKey));
        return alt?.actions?.create === true;
      });
      console.log(`  scanner create comes from      : ${granting.join(', ') || 'nothing — this is why the scan screen offers no documents'}`);
    }
  }
  console.log('');
}

run()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
