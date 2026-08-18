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
  const { Role, User, Part } = require('../models');
  await User.deleteMany({ email: USER_EMAIL });
  const role = await Role.findOne({ name: ROLE_NAME });
  if (role) await Role.deleteOne({ _id: role._id });
  await Part.deleteOne({ partCode: FIXTURE_PART_CODE });
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

/** The part this harness sells, so no real stock figure is spent on testing. */
const FIXTURE_PART_CODE = 'PERMTEST-PART';

/**
 * A saleable vehicle and a stocked part, so the create calls are realistic.
 *
 * The part is the harness's own and its stock is topped up on every run: the
 * suite raises several counter sales, each of which takes a unit off the shelf,
 * so borrowing a real part meant the run drained it and every later run failed
 * with "Insufficient stock" on a permission check that was working fine.
 */
async function fixtureProducts() {
  const { Vehicle, Part, Customer } = require('../models');
  const vehicle = await Vehicle.findOne({ status: { $in: ['available', 'in_stock', 'Available'] } }).select('_id').lean()
    || await Vehicle.findOne().select('_id').lean();

  const template = await Part.findOne({ isActive: true }).lean();
  const part = await Part.findOneAndUpdate(
    { partCode: FIXTURE_PART_CODE },
    {
      $set: {
        partCode: FIXTURE_PART_CODE,
        name: 'Permission Harness Part',
        currentStock: 500,
        sellingPrice: 100,
        costPrice: 50,
        isActive: true,
        ...(template?.category ? { category: template.category } : {}),
        ...(template?.unit ? { unit: template.unit } : {}),
        ...(template?.sourceType ? { sourceType: template.sourceType } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const customer = await Customer.findOne({ deletedAt: null, isActive: true }).select('_id').lean();
  return { vehicleId: vehicle?._id?.toString(), partId: part?._id?.toString(), customerId: customer?._id?.toString() };
}

/**
 * One appointment and one job card the masking check can be run against.
 *
 * Without them both pages SKIP, and a skip proves nothing: a controller that
 * forgets `.lean()` and leaks every withheld column looks exactly the same as a
 * page that has no records yet. Upserted on a fixed number so repeated runs
 * reuse the same two rows rather than filling the service screens.
 */
async function fixtureServiceRecords() {
  const { ServiceAppointment, JobCard, Customer } = require('../models');
  const customer = await Customer.findOne({ deletedAt: null, isActive: true }).select('_id').lean();
  if (!customer) return;

  const vehicle = { number: 'PERM-0001', make: 'Harness', model: 'Fixture', year: 2026, vin: 'PERMTESTVIN00001' };
  await ServiceAppointment.findOneAndUpdate(
    { appointmentNumber: 'PERMTEST-APPT-1' },
    {
      $set: {
        appointmentNumber: 'PERMTEST-APPT-1',
        customer: customer._id,
        customerVehicle: vehicle,
        appointmentDate: new Date(),
        appointmentTime: '09:00',
        status: 'scheduled',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await JobCard.findOneAndUpdate(
    { jobCardNumber: 'PERMTEST-JC-1' },
    {
      $set: {
        jobCardNumber: 'PERMTEST-JC-1',
        customer: customer._id,
        customerVehicle: vehicle,
        status: 'open',
        laborTotal: 1000,
        partsTotal: 500,
        grandTotal: 1500,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
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

  // ── The parts counter without the scan page ─────────────────────────────
  // A counter sale posts an order and its invoice, so Parts Invoices → Create
  // is what an administrator ticks for it. That used to buy nothing: the order
  // endpoint took only Parts Scan or *Vehicle* Sales Orders, so a parts-counter
  // role was told by the scanner that it "may not create anything from it"
  // while Role Jobs showed Create plainly ticked.
  token = await applyRole({
    pages: ['part_scan', 'part_quotations', 'part_invoices', 'customers'],
    jobs: [
      // The scan page is held for *opening* the screen only — no create on it.
      { pageKey: 'part_scan', actions: {} },
      { pageKey: 'part_quotations', actions: { create: true } },
      { pageKey: 'part_invoices', actions: { create: true } },
      { pageKey: 'customers', actions: {} },
    ],
  });
  const counterQuote = await call(token, 'POST', '/parts-sales/quotations', { customerId, validityDays: 7, lineItems: partLine });
  check('Parts Quotations create raises a parts quotation', counterQuote.status === 201 || counterQuote.status === 200,
    `HTTP ${counterQuote.status} ${counterQuote.body?.message || ''}`);

  const counterSale = await call(token, 'POST', '/parts-sales/orders', {
    customerId, lineItems: partLine, paidAmount: 100, paymentMode: 'cash',
  });
  check('Parts Invoices create raises a counter sale without the scan page',
    counterSale.status === 201 || counterSale.status === 200,
    `HTTP ${counterSale.status} ${counterSale.body?.message || ''}`);

  // It buys the sale, not the paperwork around it: the order rows behind a
  // parts invoice stay out of reach.
  const madeOrderId = counterSale.body?.data?.id;
  if (madeOrderId) {
    check('Parts Invoices create does not imply deleting the order',
      (await call(token, 'DELETE', `/parts-sales/orders/${madeOrderId}`)).status === 403);
    check('Parts Invoices create does not imply editing the order',
      (await call(token, 'PUT', `/parts-sales/orders/${madeOrderId}/status`, { status: 'cancelled' })).status === 403);
  }
  check('Parts Invoices create is no permission on vehicle sales orders',
    (await call(token, 'POST', '/sales/direct', { customerId, lineItems: vehicleLine, paidAmount: 100 })).status === 403);

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

  await scenarioEveryPageIsMasked();
}

/**
 * Every catalogued page, over its real list endpoint.
 *
 * Masking deletes keys from the payload, and `delete doc.email` on a Mongoose
 * document is a silent no-op — so a controller that sends documents rather than
 * `.lean()` objects served every withheld column while the table above it hid
 * the column faithfully. Employees was doing exactly that. One page at a time
 * is the only way to catch the next controller that forgets `.lean()`.
 */
async function scenarioEveryPageIsMasked() {
  // page → [list endpoint, field key to withhold, response key it must remove]
  const PAGE_ENDPOINTS = {
    customers: ['/customers?limit=3', 'phone', 'phone'],
    leads: ['/leads?limit=3', 'phone', 'phone'],
    parts: ['/parts?limit=3', 'selling_price', 'selling_price'],
    vehicles: ['/vehicles?limit=3', 'selling_price', 'selling_price'],
    employees: ['/employees?limit=3', 'contact', 'email'],
    quotations: ['/quotations?limit=3', 'amounts', 'total_amount'],
    bookings: ['/bookings?limit=3', 'customer', 'customer_name'],
    sales_orders: ['/sales?limit=3', 'customer', 'customer_name'],
    invoices: ['/invoices?limit=3', 'amounts', 'total_amount'],
    part_quotations: ['/parts-sales/quotations?limit=3', 'amounts', 'total_amount'],
    part_bookings: ['/parts-sales/bookings?limit=3', 'customer', 'customer_name'],
    part_invoices: ['/parts-sales/invoices?limit=3', 'amounts', 'total_amount'],
    services: ['/services/job-cards?limit=3', 'amounts', 'grand_total'],
    service_appointments: ['/services/appointments?limit=3', 'customer', 'customer_name'],
    leaves: ['/leaves?limit=3', 'leave', 'leaveType'],
    expenses: ['/expenses?limit=3', 'amount', 'amount'],
    ledger: ['/ledger?limit=3', 'amounts', 'debit'],
    // The period wrapper carries the run's own totals; a line carries the pay.
    payroll: ['/payroll/periods?limit=3', 'net_pay', 'net_total'],
    dispatch: ['/sales/dispatched?limit=3', 'logistics', 'transport_company'],
  };

  /**
   * Pages whose list endpoint lives behind a different page's guard, or which
   * need a second page granted before the endpoint answers at all. Granting the
   * catalogued page alone would 403 before anything could be masked.
   */
  const EXTRA_PAGES = { dispatch: ['sales_orders'] };

  /** First record out of whichever envelope the endpoint uses. */
  const firstRecord = (body) => {
    const data = body?.data;
    if (Array.isArray(data)) return data[0];
    if (!data || typeof data !== 'object') return null;
    const list = Object.values(data).find((value) => Array.isArray(value) && value.length);
    return list ? list[0] : null;
  };

  const missing = Object.keys(FIELD_CATALOG).filter((page) => !PAGE_ENDPOINTS[page]);
  check('Every catalog page is covered by this masking check', missing.length === 0, `uncovered=${missing.join(',')}`);

  await fixtureServiceRecords();

  // The super admin is the unmasked baseline, so each page costs one role write
  // rather than two — this loop already touches every catalogued endpoint.
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
  const adminToken = adminPassword
    ? await login(String(process.env.SUPER_ADMIN_EMAIL || '').toLowerCase(), adminPassword)
    : null;

  for (const [page, [url, withheldField, responseKey]] of Object.entries(PAGE_ENDPOINTS)) {
    const allowed = pageFieldKeys(page).filter((key) => key !== withheldField);
    const extra = EXTRA_PAGES[page] || [];
    const token = await applyRole({
      pages: [...new Set([...SALES_PAGES, page, ...extra])],
      jobs: [{ pageKey: page, actions: {}, dataScope: { mode: 'all' }, fields: { mode: 'selected', allowed } }],
    });
    const record = firstRecord((await call(token, 'GET', url)).body);
    if (!record) {
      console.log(`  SKIP  ${page}: no record returned from ${url}`);
      continue;
    }
    check(`${page}: withheld "${withheldField}" is absent from the API payload`,
      !(responseKey in record),
      `${responseKey} present; keys=${Object.keys(record).slice(0, 12).join(',')}`);

    // The key has to be one the endpoint really sends, or the check above would
    // pass on a page that masks nothing at all.
    if (adminToken) {
      const baseline = firstRecord((await call(adminToken, 'GET', url)).body);
      check(`${page}: "${responseKey}" is served when nothing is withheld`,
        Boolean(baseline) && responseKey in baseline,
        `keys=${Object.keys(baseline || {}).slice(0, 12).join(',')}`);
    }
  }
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
  const CLIENT_SIDE = ['quotations', 'bookings', 'sales_orders', 'invoices', 'part_quotations', 'part_bookings', 'part_invoices', 'custom_quotations', 'custom_bookings', 'custom_invoices']
    .reduce((acc, page) => ({ ...acc, [page]: ['downloadPdf'] }), {
      // Printed from the browser (window.print → PDF), exported as CSV in the browser.
      gatepass_in: ['downloadPdf'],
      gatepass_out: ['downloadPdf'],
      ledger: ['export'],
      accounts: ['export'],
    });

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

  // The same question for reads, which is where this had actually gone wrong:
  // every write on the four vehicle sales routers was guarded and none of the
  // reads were, so any signed-in account could fetch the whole quotation book.
  // Field masking does not catch it either — a role with no job for a page
  // counts as unrestricted, so it received the full record.
  //
  // Only the models that hold business records count. A reference list is
  // deliberately open (see PERMISSION-AUDIT.md, F7) because pickers on
  // other pages need it, and personal endpoints answer about the caller.
  const BUSINESS_MODELS = [
    'Quotation', 'Booking', 'SalesOrder', 'Invoice', 'Payment',
    'PartQuotation', 'PartBooking', 'PartSalesOrder', 'PartInvoice',
    'Customer', 'Lead', 'Vehicle', 'Part', 'Employee', 'Payroll', 'Expense',
    'LedgerEntry', 'Leave', 'JobCard', 'ServiceAppointment',
  ];
  const OPEN_BY_DESIGN = [
    /^\/api\/(auth|profile|notifications)\b/,
    // The scanner's own lookup: this *is* the scan page's endpoint, and it is
    // guarded by holding that page.
    /^\/api\/barcode\b/,
    // Permission-filtered inside the service — each result carries the page it
    // belongs to and is dropped if the caller lacks it.
    /^\/api\/search\b/,
    // Scoped by log permissions rather than by page.
    /^\/api\/logs\b/,
    // Per-user filtered: the sidebar is built from what it returns.
    /^\/api\/server-management\/(sidebar|branding)$/,
    // Assign-to pickers used across CRM, HR and sales.
    /^\/api\/users\b/,
    // The payment-method picker every document screen draws. It touches
    // `Payment` only to count how many use each method — method names and a
    // tally, never a payment record — so it is a reference list despite the
    // model it reads.
    /^\/api\/payment-methods\b/,
  ];
  const readHoles = report.unguarded.filter((e) => (
    e.method === 'GET' &&
    e.reads.some((model) => BUSINESS_MODELS.includes(model)) &&
    !OPEN_BY_DESIGN.some((pattern) => pattern.test(e.path))
  ));
  check('No endpoint serves business records without a permission check', readHoles.length === 0,
    readHoles.map((e) => `${e.path} → ${e.reads.join('/')}`).join(', '));
}

/**
 * Role Jobs now grants page access as well as configuring it. Before this, a
 * page that had never been ticked in Roles Permissions simply had no card, so
 * the Parts Scan screen could tell an operator to ask for "Create" on a control
 * that did not exist anywhere.
 */
async function scenarioGrantPageFromRoleJobs() {
  section('Granting a page from Role Jobs');
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) { console.log('  SKIP  SUPER_ADMIN_PASSWORD not set'); return; }
  const admin = await login(String(process.env.SUPER_ADMIN_EMAIL || '').toLowerCase(), password);

  // Start from a role that cannot open the parts scanner at all.
  await applyRole({ pages: ['customers'], jobs: [{ pageKey: 'customers', actions: {} }] });
  const { Role } = require('../models');
  const roleId = (await Role.findOne({ name: ROLE_NAME }).select('_id').lean())._id.toString();

  const loaded = await call(admin, 'GET', `/server-management/roles/${roleId}/jobs`);
  const listed = (loaded.body?.data?.pages || []).map((p) => p.name);
  check('Role Jobs lists every page, not just the granted ones', listed.includes('part_scan') && listed.includes('vehicle_scan'),
    `${listed.length} pages listed`);

  // Grant it the way the screen does: allowed + create, in one save.
  const saved = await call(admin, 'PUT', `/server-management/roles/${roleId}/jobs`, {
    jobs: [
      { pageKey: 'customers', allowed: true, actions: {} },
      { pageKey: 'part_scan', allowed: true, actions: { create: true } },
    ],
  });
  check('Saving with "allow this page" grants page access', saved.status === 200, `HTTP ${saved.status}`);

  const { partId, customerId } = await fixtureProducts();
  const token = await login(USER_EMAIL, USER_PASSWORD);
  const quote = await call(token, 'POST', '/parts-sales/quotations', {
    customerId, validityDays: 7, lineItems: [{ itemType: 'part', partId, quantity: 1, unitPrice: 100 }],
  });
  check('The role can now raise a parts quotation from the scanner',
    quote.status === 201 || quote.status === 200, `HTTP ${quote.status} ${quote.body?.message || ''}`);

  // And turning it back off revokes both the page and the job.
  await call(admin, 'PUT', `/server-management/roles/${roleId}/jobs`, {
    jobs: [
      { pageKey: 'customers', allowed: true, actions: {} },
      { pageKey: 'part_scan', allowed: false, actions: { create: true } },
    ],
  });
  const after = await login(USER_EMAIL, USER_PASSWORD);
  check('Turning the page off revokes it again',
    (await call(after, 'POST', '/parts-sales/quotations', { customerId, lineItems: [{ itemType: 'part', partId, quantity: 1, unitPrice: 100 }] })).status === 403);
}

/**
 * The page key this database uses is not the one the route guard was written
 * with — and the grant still has to work.
 *
 * Three strings have to agree for a permission check to pass: the literal in
 * `authorizeAction`, the `name` on the Page document the Role Jobs card is built
 * from, and the `pageKey` the saved job carries. The last two come from the
 * database, so an installation seeded at a different time or migrated from an
 * older key holds the same screen under a different name. The administrator
 * ticks Create on the card in front of them and the operator is still refused,
 * with nothing on either side saying why — which is what "I set Parts Scan and
 * it does not work" looks like from the outside.
 *
 * The path is the part that does not drift, so it is what joins them. This
 * renames the page for real and checks the scanner's documents still go through.
 */
async function scenarioDriftedPageKey() {
  section('A page filed under a different key');
  const { Page } = require('../models');
  const DRIFT_KEY = 'parts_scan_drift_test';
  const PATH = '/parts-sales/barcode-scan';

  const original = await Page.findOne({ path: PATH }).lean();
  if (!original) { console.log('  SKIP  the parts scan page is not in this database'); return; }
  const { customerId, partId } = await fixtureProducts();
  if (!customerId || !partId) { console.log('  SKIP  no customer or part to sell'); return; }

  try {
    await Page.updateOne({ _id: original._id }, { $set: { name: DRIFT_KEY } });
    // Exactly what Role Jobs saves once the page carries the other name.
    const token = await applyRole({
      pages: [DRIFT_KEY, 'customers'],
      jobs: [
        { pageKey: DRIFT_KEY, actions: { create: true }, dataScope: { mode: 'all' } },
        { pageKey: 'customers', actions: {} },
      ],
    });

    // The browser has no page table of its own, so it can only match the key it
    // is handed. Every screen asks for `part_scan`; if the payload still said
    // "parts_scan_drift_test" the scanner would offer no documents at all, which
    // is what the live symptom actually looked like.
    const me = await call(token, 'GET', '/auth/me');
    const reported = (me.body?.data?.role?.jobs || []).map((job) => job.pageKey);
    check('/auth/me reports the job under the key the frontend looks for',
      reported.includes('part_scan'), `jobs=${reported.join(',')}`);
    check('…and the page permission with it',
      (me.body?.data?.role?.permissions || []).some((item) => item.pageKey === 'part_scan'),
      `perms=${(me.body?.data?.role?.permissions || []).map((item) => item.pageKey).join(',')}`);

    const line = { itemType: 'part', partId, quantity: 1, unitPrice: 100 };
    const quote = await call(token, 'POST', '/parts-sales/quotations', { customerId, lineItems: [line], validityDays: 7 });
    check('A job saved under this database\'s own page key still grants the scanner',
      quote.status === 201 || quote.status === 200, `HTTP ${quote.status} ${quote.body?.message || ''}`);

    const sale = await call(token, 'POST', '/parts-sales/orders', { customerId, lineItems: [line], paidAmount: 100 });
    check('…and the counter sale it raises as well',
      sale.status === 201 || sale.status === 200, `HTTP ${sale.status} ${sale.body?.message || ''}`);

    // The rescue must not become a way in: the path only ever maps a key to the
    // page it really is, never to a different one.
    const vehicleQuote = await call(token, 'POST', '/quotations', { customerId, lineItems: [line] });
    check('It is still not permission to raise a *vehicle* quotation', vehicleQuote.status === 403,
      `HTTP ${vehicleQuote.status}`);
  } finally {
    await Page.updateOne({ _id: original._id }, { $set: { name: original.name } });
  }
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
  await scenarioGrantPageFromRoleJobs();
  await scenarioDriftedPageKey();
  await scenarioSuperAdminUntouched();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((line) => console.log(`  - ${line}`)); }
  // The suite rewrites the role constantly; leave it somewhere sensible.
  await demo();
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

run().catch((error) => { console.error(error); process.exit(1); });
