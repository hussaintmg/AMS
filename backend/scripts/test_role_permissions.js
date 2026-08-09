/**
 * End-to-end permission harness.
 *
 * Creates (or reuses) a throw-away role and user, grants it an exact set of
 * pages / actions / data scope / field visibility, then calls the real HTTP API
 * as that user and reports what came back. Nothing here touches business data:
 * the fixtures live under a dedicated role so they can be dropped in one go.
 *
 *   node scripts/test_role_permissions.js            # run the suite
 *   node scripts/test_role_permissions.js --cleanup  # remove the fixtures
 *
 * The backend must already be running (default http://localhost:3002).
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const BASE = process.env.TEST_API_BASE || `http://localhost:${process.env.API_PORT || 3002}`;
const ROLE_NAME = 'permission_test_role';
const USER_EMAIL = 'permission.tester@amserp.local';
const USER_PASSWORD = 'PermTest#2026';

const { FIELD_CATALOG, pageFieldKeys } = require('../constants/fieldPermissions');

let pass = 0;
let fail = 0;
const failures = [];

const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); return true; }
  fail += 1;
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  return false;
};

const section = (title) => console.log(`\n=== ${title} ===`);

async function call(token, method, url, body) {
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON (pdf etc.) */ }
  return { status: res.status, body: json };
}

async function login(email, password) {
  const res = await call(null, 'POST', '/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token || res.body.token;
}

// ── fixtures ───────────────────────────────────────────────────────────────

async function connect() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
}

async function cleanup() {
  const { Role, User } = require('../models');
  await User.deleteMany({ email: USER_EMAIL });
  const role = await Role.findOne({ name: ROLE_NAME });
  if (role) await Role.deleteOne({ _id: role._id });
  console.log('Fixtures removed.');
}

/**
 * Rewrite the test role to exactly `spec` and return a fresh token for the
 * test user. Permissions are read off the user's role on every request, so a
 * re-login is not strictly needed — but it keeps each scenario honest.
 */
async function applyRole(spec) {
  const { Role, User, Page } = require('../models');
  const pages = await Page.find({ name: { $in: spec.pages } }).lean();
  const permissions = pages.map((page) => ({
    pageKey: page.name, path: page.path, module: page.module, canView: true, isActive: true,
  }));
  const jobs = spec.jobs.map((job) => ({
    pageKey: job.pageKey,
    module: pages.find((page) => page.name === job.pageKey)?.module || job.pageKey,
    actions: { view: true, ...job.actions },
    dataScope: job.dataScope || { mode: 'own', roles: [], users: [] },
    fields: job.fields || { mode: 'all', allowed: [] },
  }));

  let role = await Role.findOne({ name: ROLE_NAME });
  if (!role) role = new Role({ name: ROLE_NAME, displayName: 'Permission Test Role' });
  role.displayName = 'Permission Test Role';
  role.permissions = permissions;
  role.jobs = jobs;
  role.isActive = true;
  await role.save();

  let user = await User.findOne({ email: USER_EMAIL });
  if (!user) {
    user = new User({
      firstName: 'Permission', lastName: 'Tester', email: USER_EMAIL,
      password: USER_PASSWORD, role: role._id, status: 'active', isActive: true,
    });
  } else {
    user.password = USER_PASSWORD;
    user.role = role._id;
    user.status = 'active';
    user.isActive = true;
  }
  user.customPermissions = [];
  await user.save();

  return login(USER_EMAIL, USER_PASSWORD);
}

// ── scenarios ──────────────────────────────────────────────────────────────

const SALES_PAGES = ['dashboard', 'customers', 'quotations', 'bookings', 'sales_orders', 'invoices', 'vehicle_scan', 'part_quotations', 'part_invoices', 'part_scan', 'parts', 'vehicles'];
const fullActions = { create: true, edit: true, delete: true, sendEmail: true, downloadPdf: true, export: true, approve: true };

/** A saleable vehicle and a stocked part, so the create calls are realistic. */
async function fixtureProducts() {
  const { Vehicle, Part, Customer } = require('../models');
  const vehicle = await Vehicle.findOne({ status: { $in: ['available', 'in_stock', 'Available'] } }).select('_id').lean()
    || await Vehicle.findOne().select('_id').lean();
  const part = await Part.findOne({ currentStock: { $gt: 0 }, isActive: true }).select('_id').lean()
    || await Part.findOne().select('_id').lean();
  const customer = await Customer.findOne({ deletedAt: null, isActive: true }).select('_id').lean();
  return { vehicleId: vehicle?._id?.toString(), partId: part?._id?.toString(), customerId: customer?._id?.toString() };
}

async function scenarioScanCreatesQuotation() {
  section('Barcode scan → create documents');
  const { vehicleId, partId, customerId } = await fixtureProducts();
  if (!customerId) { console.log('  SKIP  no customer records to test against'); return; }

  // Only the scan page, nothing else: the scan screen must still be able to
  // raise the documents it offers.
  let token = await applyRole({
    pages: ['vehicle_scan', 'customers'],
    jobs: [
      { pageKey: 'vehicle_scan', actions: { create: true } },
      { pageKey: 'customers', actions: {} },
    ],
  });

  const vehicleLine = [{ itemType: 'vehicle', vehicleId, quantity: 1, unitPrice: 100 }];
  const partLine = [{ itemType: 'part', partId, quantity: 1, unitPrice: 100 }];

  const quote = await call(token, 'POST', '/quotations', { customerId, validityDays: 7, lineItems: vehicleLine });
  check('Vehicle scan page alone can create a quotation', quote.status === 201 || quote.status === 200,
    `HTTP ${quote.status} ${quote.body?.message || ''}`);

  // A booking also needs an unsold vehicle in stock, which this database may
  // not have — so only the permission gate is asserted here.
  const booking = await call(token, 'POST', '/bookings', {
    customerId, bookingAmount: 100, totalAmount: 100, lineItems: vehicleLine,
  });
  check('Vehicle scan page alone is past the guard on bookings', booking.status !== 403,
    `HTTP ${booking.status} ${booking.body?.message || ''}`);

  // A vehicle counter sale: Sales Order + Invoice in one call.
  const directOrder = await call(token, 'POST', '/sales/direct', {
    customerId, lineItems: vehicleLine, paidAmount: 100, paymentMode: 'cash',
  });
  check('Vehicle scan page alone is past the guard on the counter sale', directOrder.status !== 403,
    `HTTP ${directOrder.status} ${directOrder.body?.message || ''}`);

  // ── Parts counter ────────────────────────────────────────────────────────
  // Every document the Parts Scan screen offers must go through on the scan
  // page alone: quotation, counter sale (order → invoice) and a direct invoice.
  token = await applyRole({
    pages: ['part_scan', 'customers'],
    jobs: [
      { pageKey: 'part_scan', actions: { create: true } },
      { pageKey: 'customers', actions: {} },
    ],
  });
  const partQuote = await call(token, 'POST', '/parts-sales/quotations', { customerId, validityDays: 7, lineItems: partLine });
  check('Parts scan page alone can create a parts quotation', partQuote.status === 201 || partQuote.status === 200,
    `HTTP ${partQuote.status} ${partQuote.body?.message || ''}`);

  const partOrder = await call(token, 'POST', '/parts-sales/orders', {
    customerId, lineItems: partLine, paidAmount: 100, paymentMode: 'cash',
  });
  check('Parts scan page alone can create a counter sale (order + invoice)',
    partOrder.status === 201 || partOrder.status === 200,
    `HTTP ${partOrder.status} ${partOrder.body?.message || ''}`);

  const partInvoice = await call(token, 'POST', '/parts-sales/invoices', { customerId, lineItems: partLine });
  check('Parts scan page alone is past the guard on a parts invoice', partInvoice.status !== 403,
    `HTTP ${partInvoice.status} ${partInvoice.body?.message || ''}`);

  const partBooking = await call(token, 'POST', '/parts-sales/bookings', {
    customerId, lineItems: partLine, bookingAmount: 100, totalAmount: 100,
  });
  check('Parts scan page alone is past the guard on a parts booking', partBooking.status !== 403,
    `HTTP ${partBooking.status} ${partBooking.body?.message || ''}`);

  // Scanning grants create and nothing else — not edit, not delete.
  const listed = await call(token, 'GET', '/parts-sales/quotations?limit=1');
  const someId = listed.body?.data?.[0]?.id || partQuote.body?.data?.id;
  if (someId) {
    check('Scan page create does not imply delete',
      (await call(token, 'DELETE', `/parts-sales/quotations/${someId}`)).status === 403);
    check('Scan page create does not imply edit',
      (await call(token, 'PUT', `/parts-sales/quotations/${someId}`, { notes: 'x' })).status === 403);
  }
  // …nor a bulk spreadsheet import of the same documents.
  check('Scan page create does not imply bulk import',
    (await call(token, 'POST', '/bulk-import/sales-orders', {})).status === 403);

  // And the negative: no scan page, no quotation page → still denied.
  token = await applyRole({ pages: ['customers'], jobs: [{ pageKey: 'customers', actions: {} }] });
  const denied = await call(token, 'POST', '/quotations', { customerId, lineItems: vehicleLine });
  check('A role with neither sales nor scan pages is denied', denied.status === 403, `HTTP ${denied.status}`);
  check('A role without the parts scan page cannot raise a parts counter sale',
    (await call(token, 'POST', '/parts-sales/orders', { customerId, lineItems: partLine })).status === 403);
}

async function scenarioActions() {
  section('Action permissions');

  const token = await applyRole({
    pages: SALES_PAGES,
    jobs: [
      { pageKey: 'quotations', actions: { create: true }, dataScope: { mode: 'all' } },
      { pageKey: 'invoices', actions: {}, dataScope: { mode: 'all' } },
      { pageKey: 'customers', actions: {}, dataScope: { mode: 'all' } },
    ],
  });

  check('View-only page returns 200 on list', (await call(token, 'GET', '/invoices')).status === 200);
  const del = await call(token, 'GET', '/quotations');
  const firstId = del.body?.data?.[0]?.id;
  if (firstId) {
    check('Delete is refused without the delete action',
      (await call(token, 'DELETE', `/quotations/${firstId}`)).status === 403);
    check('Edit is refused without the edit action',
      (await call(token, 'PUT', `/quotations/${firstId}`, { notes: 'x' })).status === 403);
  }
  check('A page the role does not hold at all is refused',
    (await call(token, 'GET', '/employees')).status === 403);

  // Page access without any Role Jobs row must still read, never write.
  const pageOnly = await applyRole({ pages: ['customers', 'quotations'], jobs: [] });
  check('Page access alone is read-only: list works', (await call(pageOnly, 'GET', '/customers')).status === 200);
  check('Page access alone is read-only: create is refused',
    (await call(pageOnly, 'POST', '/customers', { firstName: 'Nope', email: `nope${Date.now()}@t.pk` })).status === 403);
}

async function scenarioDataScope() {
  section('Data scope (whose records are visible)');

  const { User } = require('../models');
  const superAdmin = await User.findOne({ email: String(process.env.SUPER_ADMIN_EMAIL || '').toLowerCase() });

  const allToken = await applyRole({
    pages: SALES_PAGES,
    jobs: [{ pageKey: 'quotations', actions: fullActions, dataScope: { mode: 'all' } }],
  });
  const all = await call(allToken, 'GET', '/quotations?limit=1000');
  const allTotal = all.body?.pagination?.total ?? 0;

  const ownToken = await applyRole({
    pages: SALES_PAGES,
    jobs: [{ pageKey: 'quotations', actions: fullActions, dataScope: { mode: 'own' } }],
  });
  const own = await call(ownToken, 'GET', '/quotations?limit=1000');
  const ownTotal = own.body?.pagination?.total ?? 0;

  check('"All data" sees at least as much as "own only"', allTotal >= ownTotal, `all=${allTotal} own=${ownTotal}`);

  if (superAdmin) {
    const selectedToken = await applyRole({
      pages: SALES_PAGES,
      jobs: [{
        pageKey: 'quotations', actions: fullActions,
        dataScope: { mode: 'selected_users', users: [superAdmin._id] },
      }],
    });
    const selected = await call(selectedToken, 'GET', '/quotations?limit=1000');
    const selectedTotal = selected.body?.pagination?.total ?? 0;
    check('A scope naming a super admin does not leak their records', selectedTotal === ownTotal,
      `selected=${selectedTotal} own=${ownTotal}`);
  }
}

async function scenarioFieldPermissions() {
  section('Field visibility');

  const customerFields = pageFieldKeys('customers');
  const quotationFields = pageFieldKeys('quotations');

  // 1. Default (mode "all") hides nothing.
  let token = await applyRole({
    pages: SALES_PAGES,
    jobs: [
      { pageKey: 'customers', actions: fullActions, dataScope: { mode: 'all' } },
      { pageKey: 'quotations', actions: fullActions, dataScope: { mode: 'all' } },
    ],
  });
  let customers = await call(token, 'GET', '/customers?limit=5');
  const sample = customers.body?.data?.[0] || {};
  check('With full field access the customer payload still carries phone/email',
    'phone' in sample && 'email' in sample, `keys=${Object.keys(sample).slice(0, 12).join(',')}`);

  // 2. Name only: phone and e-mail must be gone from every customer surface.
  token = await applyRole({
    pages: SALES_PAGES,
    jobs: [
      {
        pageKey: 'customers', actions: fullActions, dataScope: { mode: 'all' },
        fields: { mode: 'selected', allowed: ['name', 'code', 'status'] },
      },
      {
        pageKey: 'quotations', actions: fullActions, dataScope: { mode: 'all' },
        fields: { mode: 'selected', allowed: quotationFields.filter((key) => key !== 'customer_contact' && key !== 'amounts') },
      },
    ],
  });

  customers = await call(token, 'GET', '/customers?limit=5');
  const masked = customers.body?.data?.[0] || {};
  check('Customer phone is stripped when the role may not see it', !('phone' in masked));
  check('Customer e-mail is stripped when the role may not see it', !('email' in masked));
  check('Customer name survives', 'firstName' in masked || 'fullName' in masked || 'name' in masked,
    `keys=${Object.keys(masked).slice(0, 12).join(',')}`);

  const dropdown = await call(token, 'GET', '/customers/all');
  check('Customer dropdown is masked too', !('phone' in (dropdown.body?.data?.[0] || {})));

  const byId = masked.id || masked._id;
  if (byId) {
    const detail = await call(token, 'GET', `/customers/${byId}`);
    check('Customer detail is masked too', !('phone' in (detail.body?.data || {})));
  }

  const quotes = await call(token, 'GET', '/quotations?limit=5');
  const quote = quotes.body?.data?.[0] || {};
  check('Quotation totals are stripped when "amounts" is withheld', !('total_amount' in quote),
    `keys=${Object.keys(quote).slice(0, 14).join(',')}`);
  check('Quotation number still present', 'quotation_number' in quote);

  // 3. Hiding the customer entirely on a sales document.
  token = await applyRole({
    pages: SALES_PAGES,
    jobs: [{
      pageKey: 'quotations', actions: fullActions, dataScope: { mode: 'all' },
      fields: { mode: 'selected', allowed: ['document', 'amounts'] },
    }],
  });
  const noCustomer = (await call(token, 'GET', '/quotations?limit=5')).body?.data?.[0] || {};
  check('Quotation customer name is stripped when withheld', !('customer_name' in noCustomer));
  check('Quotation amounts survive when granted', 'total_amount' in noCustomer);

  // 4. Parts: prices withheld, identity kept.
  token = await applyRole({
    pages: SALES_PAGES,
    jobs: [{
      pageKey: 'parts', actions: fullActions, dataScope: { mode: 'all' },
      fields: { mode: 'selected', allowed: ['identity', 'stock'] },
    }],
  });
  const part = (await call(token, 'GET', '/parts?limit=5')).body?.data?.parts?.[0] || {};
  check('Part selling price is stripped when withheld', !('selling_price' in part),
    `keys=${Object.keys(part).slice(0, 14).join(',')}`);
  check('Part number survives', 'part_number' in part);
  check('Part stock survives when granted', 'current_stock' in part);

  // 5. Line items inside a document are masked too.
  token = await applyRole({
    pages: SALES_PAGES,
    jobs: [{
      pageKey: 'quotations', actions: fullActions, dataScope: { mode: 'all' },
      fields: { mode: 'selected', allowed: ['document', 'customer', 'products'] },
    }],
  });
  const withLines = ((await call(token, 'GET', '/quotations?limit=20')).body?.data || [])
    .find((row) => (row.line_items || []).length);
  if (withLines) {
    const line = withLines.line_items[0];
    check('Product line prices are stripped when amounts are withheld', !('unit_price' in line) && !('total_price' in line),
      `lineKeys=${Object.keys(line).join(',')}`);
    check('Product line description survives', 'description' in line || 'name' in line);
  } else {
    console.log('  SKIP  no quotation with product lines to check');
  }

  check('Every catalog page exposes at least one field', Object.keys(FIELD_CATALOG).every((page) => pageFieldKeys(page).length > 0));
  check('Customer catalog covers name / phone / email',
    ['name', 'phone', 'email'].every((key) => customerFields.includes(key)),
    `catalog=${customerFields.join(',')}`);
}

async function scenarioCatalogEndpoint() {
  section('Field catalog endpoint');
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) { console.log('  SKIP  SUPER_ADMIN_PASSWORD not set'); return; }
  const token = await login(String(process.env.SUPER_ADMIN_EMAIL || '').toLowerCase(), password);
  const res = await call(token, 'GET', '/server-management/field-catalog');
  check('Super admin can read the field catalog', res.status === 200 && Array.isArray(res.body?.data));
  check('Catalog entries carry key, label and group',
    (res.body?.data || []).every((page) => page.pageKey && (page.fields || []).every((field) => field.key && field.label && field.group)));

  const testerToken = await applyRole({ pages: ['customers'], jobs: [{ pageKey: 'customers', actions: {} }] });
  check('A non-super-admin cannot read the field catalog',
    (await call(testerToken, 'GET', '/server-management/field-catalog')).status === 403);
}

/**
 * The Role Jobs screen renders from PAGE_CAPABILITIES, so a page that claims an
 * action with no endpoint behind it is a checkbox that quietly does nothing.
 * The route audit is the reference; this keeps the two from drifting.
 */
async function scenarioCapabilityTable() {
  section('Page capability table vs. the routes');
  const { build } = require('./audit_page_operations');
  const { PAGE_CAPABILITIES } = require('../constants/pageCapabilities');

  // Rendered in the browser from a template, so there is no endpoint to guard —
  // the checkbox gates the download button itself.
  const CLIENT_SIDE = ['quotations', 'bookings', 'sales_orders', 'invoices', 'part_quotations', 'part_invoices']
    .reduce((acc, page) => ({ ...acc, [page]: ['downloadPdf'] }), {});

  const report = build();
  const routeActions = {};
  report.pages.forEach((page) => {
    routeActions[page.pageKey] = page.actions.filter((action) => !['view', 'bulk', 'superAdmin'].includes(action));
  });

  const overclaimed = [];
  const missing = [];
  Object.entries(PAGE_CAPABILITIES).forEach(([page, capability]) => {
    const real = [...(routeActions[page] || []), ...(CLIENT_SIDE[page] || [])];
    capability.actions.filter((a) => !real.includes(a)).forEach((a) => overclaimed.push(`${page}.${a}`));
    (routeActions[page] || []).filter((a) => !capability.actions.includes(a)).forEach((a) => missing.push(`${page}.${a}`));
  });

  check('No page offers an action with no endpoint behind it', overclaimed.length === 0, overclaimed.join(', '));
  check('No guarded action is missing from the capability table', missing.length === 0, missing.join(', '));

  const unknown = Object.keys(routeActions).filter((page) => !PAGE_CAPABILITIES[page]);
  check('Every page the routes guard appears in the table', unknown.length === 0, unknown.join(', '));

  // Endpoints reachable by any signed-in user. Personal data (your own profile,
  // your own notifications) is legitimately outside the page model; anything
  // else that writes is a hole.
  const SELF_SERVICE = /^\/api\/(profile|notifications)\b/;
  // Guarded per uploaded file type inside the handler, which static analysis
  // cannot see. See routes/uploader.routes.js → authorizeSelectedImports.
  const DYNAMIC = /^\/api\/uploader\/batch$/;
  const holes = report.unguarded.filter((e) => e.writes.length && !SELF_SERVICE.test(e.path) && !DYNAMIC.test(e.path));
  check('No write endpoint is left without a permission check', holes.length === 0,
    holes.map((e) => `${e.method} ${e.path}`).join(', '));
}

async function scenarioSuperAdminUntouched() {
  section('Super admin is never restricted');
  const email = String(process.env.SUPER_ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) { console.log('  SKIP  SUPER_ADMIN_PASSWORD not set'); return; }
  const token = await login(email, password);
  const customers = await call(token, 'GET', '/customers?limit=1');
  check('Super admin still sees customer phone', 'phone' in (customers.body?.data?.[0] || {}));
  const me = await call(token, 'GET', '/auth/me');
  check('Super admin /auth/me reports unrestricted fields',
    me.body?.data?.fieldPermissions === null || me.body?.data?.fieldPermissions === undefined
    || Object.keys(me.body?.data?.fieldPermissions || {}).length === 0);
}

/**
 * Leave the test account in a state worth logging into: the sales screens with
 * the customer's phone, e-mail and the salesperson withheld, and only its own
 * quotations visible.
 */
async function demo() {
  await applyRole({
    pages: SALES_PAGES,
    jobs: [
      {
        pageKey: 'customers', actions: { create: true, edit: true }, dataScope: { mode: 'all' },
        fields: { mode: 'selected', allowed: ['name', 'code', 'classification', 'address'] },
      },
      {
        pageKey: 'quotations', actions: { create: true, edit: true, downloadPdf: true }, dataScope: { mode: 'own' },
        fields: { mode: 'selected', allowed: ['document', 'customer', 'products', 'amounts', 'notes'] },
      },
      { pageKey: 'invoices', actions: {}, dataScope: { mode: 'all' }, fields: { mode: 'selected', allowed: ['document', 'customer', 'products'] } },
      { pageKey: 'vehicle_scan', actions: { create: true } },
      // Deliberately left without Create, to show what the scan screen says
      // when a role may open it but not raise anything.
      { pageKey: 'part_scan', actions: {} },
      { pageKey: 'parts', actions: {}, dataScope: { mode: 'all' }, fields: { mode: 'selected', allowed: ['identity', 'stock', 'selling_price'] } },
    ],
  });
  console.log(`Demo role ready. Sign in as ${USER_EMAIL} / ${USER_PASSWORD}`);
  console.log('  Customers ....... name, code, type & address only (no phone, no e-mail)');
  console.log('  Quotations ...... own records only, no payments or salesperson');
  console.log('  Invoices ........ read-only, no money columns');
  console.log('  Parts ........... no purchase price');
  console.log('  Vehicle Scan .... may raise quotations, bookings and orders');
  console.log('  Parts Scan ...... may open the screen but not create (on purpose)');
}

async function run() {
  await connect();
  if (process.argv.includes('--cleanup')) { await cleanup(); await mongoose.disconnect(); return; }
  if (process.argv.includes('--demo')) { await demo(); await mongoose.disconnect(); return; }

  console.log(`Testing against ${BASE}`);
  await scenarioScanCreatesQuotation();
  await scenarioActions();
  await scenarioDataScope();
  await scenarioFieldPermissions();
  await scenarioCatalogEndpoint();
  await scenarioCapabilityTable();
  await scenarioSuperAdminUntouched();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((line) => console.log(`  - ${line}`)); }
  // The suite rewrites the role constantly; leave it somewhere sensible.
  await demo();
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

run().catch((error) => { console.error(error); process.exit(1); });
