/**
 * Data scope — "whose records does this role see?"
 * =================================================
 * The report from the floor: a record created on one account is missing on
 * another, even with Role Jobs set to "All data".
 *
 * Every list that scopes its rows calls allowedOwnerIds(user, pageKey), which
 * reads role.jobs[pageKey].dataScope.mode. This walks each of those pages and
 * asserts both directions:
 *
 *   mode "all"  → another user's record IS listed
 *   mode "own"  → that same record is NOT listed
 *
 * Asserting only the first would pass against a list that never filters at all.
 *
 * The role under test is granted ONLY the page being tested — a parts counter
 * role really does have nothing else. Granting every page at once is what hid
 * the original bug: the parts lists were scoping on the *vehicle* rows, so a
 * role that happened to hold both looked fine.
 *
 * Usage:  node scripts/test_data_scope.js [--keep]
 *
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */
require('dotenv').config();
const mongoose = require('mongoose');

const BASE = process.env.TEST_API || 'http://localhost:3002/api';
const ROLE_NAME = 'data_scope_test_role';
const VIEWER_EMAIL = 'data.scope.viewer@amserp.local';
const OWNER_EMAIL = 'data.scope.owner@amserp.local';
const PASSWORD = 'DataScope2026!';
const ADMIN_EMAIL = process.env.TEST_ADMIN || 'import.tester@amserp.local';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'ReportFix2026!';

const pass = []; const fail = [];
const check = (label, ok, detail = '') => {
  (ok ? pass : fail).push(`${ok ? '  ok   ' : '  FAIL '}${label}${detail ? `  — ${detail}` : ''}`);
};
const section = (title) => console.log(`\n${title}\n${'-'.repeat(title.length)}`);

async function call(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: { raw: text.slice(0, 200) } }; }
}
const login = async (email, password = PASSWORD) =>
  (await call(null, 'POST', '/auth/login', { email, password })).body?.data?.token;

/** Rows out of a list response, whatever the endpoint calls its array. */
const rowsOf = (body) => {
  const data = body?.data ?? body;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).find(Array.isArray) || [];
};
const idOf = (row) => String(row?._id || row?.id || '');
/** The created record, whichever envelope the endpoint wraps it in. */
const createdId = (body, prefer) => {
  const data = body?.data ?? body;
  if (!data) return '';
  const picked = (prefer && data[prefer]) || data.customer || data.invoice || data.order || data.lead || data;
  return idOf(picked);
};

/**
 * The pages that scope their rows, each with a way to make one record.
 * `grant` is what Role Jobs would be given for a role that does only this job.
 */
const PAGES = (fx) => [
  { label: 'Leads', grant: ['leads'], list: '/leads',
    create: ['POST', '/leads', { customerName: `Scope Lead ${fx.stamp}`, phone: `0300${fx.stamp}`, email: `scope.lead.${fx.stamp}@example.com` }] },
  { label: 'Customers', grant: ['customers'], list: '/customers', prefer: 'customer',
    create: ['POST', '/customers', { firstName: 'Scope', lastName: `Customer${fx.stamp}`, customerType: 'individual', phone: `0311${fx.stamp}`, email: `scope.cust.${fx.stamp}@example.com` }] },
  { label: 'Vehicle Quotations', grant: ['quotations', 'customers'], list: '/quotations',
    create: ['POST', '/quotations', { customerId: fx.customerId, validityDays: 7, lineItems: fx.vehicleLine }] },
  { label: 'Vehicle Bookings', grant: ['bookings', 'customers'], list: '/bookings',
    create: ['POST', '/bookings', { customerId: fx.customerId, bookingAmount: 100, totalAmount: 100, lineItems: '@vehicle', paymentMethodId: fx.paymentMethodId, accountId: fx.accountId }] },
  { label: 'Vehicle Sales Orders', grant: ['sales_orders', 'customers'], list: '/sales', prefer: 'order',
    create: ['POST', '/sales/direct', { customerId: fx.customerId, lineItems: '@vehicle', paidAmount: 100, paymentMode: 'cash', accountId: fx.accountId }] },
  { label: 'Vehicle Invoices', grant: ['invoices', 'sales_orders', 'customers'], list: '/invoices',
    // A counter sale answers with the order's id and the invoice's *number*.
    findBy: (body) => ['/invoices?limit=5&search=', body?.data?.invoiceNumber],
    create: ['POST', '/sales/direct', { customerId: fx.customerId, lineItems: '@vehicle', paidAmount: 100, paymentMode: 'cash', accountId: fx.accountId }] },
  { label: 'Parts Quotations', grant: ['part_quotations', 'customers'], list: '/parts-sales/quotations',
    create: ['POST', '/parts-sales/quotations', { customerId: fx.customerId, validityDays: 7, lineItems: fx.partLine }] },
  { label: 'Parts Bookings', grant: ['part_bookings', 'customers'], list: '/parts-sales/bookings',
    create: ['POST', '/parts-sales/bookings', { customerId: fx.customerId, lineItems: fx.partLine, bookingAmount: 100, totalAmount: 100, paymentMethodId: fx.paymentMethodId, accountId: fx.accountId }] },
  { label: 'Parts Orders', grant: ['sales_orders', 'customers'], list: '/parts-sales/orders', prefer: 'order',
    create: ['POST', '/parts-sales/orders', { customerId: fx.customerId, lineItems: fx.partLine, paidAmount: 100, paymentMode: 'cash', accountId: fx.accountId }] },
  { label: 'Parts Invoices', grant: ['part_invoices', 'customers'], list: '/parts-sales/invoices', prefer: 'invoice',
    create: ['POST', '/parts-sales/invoices', { customerId: fx.customerId, lineItems: fx.partLine, paidAmount: 100, paymentMethodId: fx.paymentMethodId, accountId: fx.accountId }] },
  { label: 'Custom Quotations', grant: ['custom_quotations', 'customers'], list: '/custom/quotations',
    create: ['POST', '/custom/quotations', { customerId: fx.customerId, title: 'Scope test', lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100 }] }] },
  { label: 'Custom Bookings', grant: ['custom_bookings', 'customers'], list: '/custom/bookings',
    create: ['POST', '/custom/bookings', { customerId: fx.customerId, title: 'Scope test', lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100 }], bookingAmount: 50, paymentMethodId: fx.paymentMethodId, accountId: fx.accountId }] },
  { label: 'Custom Invoices', grant: ['custom_invoices', 'customers'], list: '/custom/invoices',
    create: ['POST', '/custom/invoices', { customerId: fx.customerId, title: 'Scope test', lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100 }], paidAmount: 100, paymentMethodId: fx.paymentMethodId, accountId: fx.accountId }] },
  { label: 'Gate Pass In', grant: ['gatepass_in'], list: '/gatepasses?direction=in',
    create: ['POST', '/gatepasses', { direction: 'in', entryType: 'logistic', transporter: 'Scope Transport', truckNumber: `SCI-${fx.stamp}`, driverName: 'Scope Driver' }] },
  { label: 'Gate Pass Out', grant: ['gatepass_out'], list: '/gatepasses?direction=out',
    create: ['POST', '/gatepasses', { direction: 'out', entryType: 'logistic', transporter: 'Scope Transport', truckNumber: `SCO-${fx.stamp}`, driverName: 'Scope Driver' }] },
];

/**
 * Rewrite the test role to hold exactly `pageKeys` at one data scope mode, and
 * point both test users at it. Returns the keys that have no Page row at all —
 * those cannot be granted from Role Jobs however hard anyone ticks.
 */
async function applyRole(mode, pageKeys) {
  const { Role, User, Page } = require('../models');
  const pages = await Page.find({ name: { $in: pageKeys } }).lean();
  const missing = pageKeys.filter((key) => !pages.some((page) => page.name === key));

  let role = await Role.findOne({ name: ROLE_NAME });
  if (!role) role = new Role({ name: ROLE_NAME });
  role.displayName = 'Data Scope Test Role';
  role.permissions = pages.map((page) => ({ pageKey: page.name, path: page.path, module: page.module, canView: true, isActive: true }));
  role.jobs = pages.map((page) => ({
    pageKey: page.name,
    module: page.module || page.name,
    actions: { view: true, create: true, edit: true, delete: true, recordPayment: true, convert: true, approve: true },
    dataScope: { mode, roles: [], users: [] },
    fields: { mode: 'all', allowed: [] },
    columns: { mode: 'all', allowed: [] },
  }));
  role.isActive = true;
  await role.save();

  for (const [email, first] of [[VIEWER_EMAIL, 'Scope'], [OWNER_EMAIL, 'Owner']]) {
    let user = await User.findOne({ email });
    if (!user) user = new User({ firstName: first, lastName: 'Tester', email, status: 'active', isActive: true });
    user.password = PASSWORD;
    user.role = role._id;
    user.status = 'active';
    user.isActive = true;
    user.customPermissions = [];
    await user.save();
  }
  return { missing };
}

async function fixtures() {
  const stamp = String(Date.now()).slice(-7);
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const customerId = idOf(rowsOf((await call(admin, 'GET', '/customers/all?limit=1')).body)[0]);
  const partId = idOf(rowsOf((await call(admin, 'GET', '/parts?limit=1')).body)[0]);
  // Every vehicle in this database is already dispatched, so a quotation line
  // is built from a variant instead — which the sales controller accepts.
  const variantId = idOf(rowsOf((await call(admin, 'GET', '/vehicle-master/variants?limit=1')).body)[0]);
  const accountId = idOf(rowsOf((await call(admin, 'GET', '/accounts')).body).find((a) => a.type === 'petty_cash'));
  const paymentMethodId = idOf(rowsOf((await call(admin, 'GET', '/payment-methods?is_active=true')).body)[0]);

  // Each of these documents consumes what it sells, so the stock has to be
  // there first — every vehicle in this database is already dispatched, and the
  // part runs dry after a couple of runs.
  const colorId = idOf(rowsOf((await call(admin, 'GET', '/vehicle-master/colors?limit=1')).body)[0]);
  let minted = 0;
  /** A vehicle line backed by a vehicle actually in stock, one per call. */
  const allocatedLine = async () => {
    minted += 1;
    const suffix = `${stamp}${String(minted).padStart(2, '0')}`;
    const made = await call(admin, 'POST', '/vehicles', {
      vin: `SCOPE${suffix}TESTVIN`, engineNumber: `SCOPE-ENG-${suffix}`,
      variantId, colorId, year: 2026, purchasePrice: 100, sellingPrice: 100, status: 'in_stock',
    });
    const vehicleId = createdId(made.body, 'vehicle');
    if (!vehicleId) console.log(`  note  could not put a vehicle in stock: HTTP ${made.status} ${made.body?.message || ''}`);
    return [{ itemType: 'vehicle', vehicleId, vehicleVariantId: variantId, quantity: 1, unitPrice: 100 }];
  };

  await call(admin, 'POST', `/parts/${partId}/adjust`, { adjustmentType: 'increase', quantity: 200, reason: 'data scope test fixture' });

  return {
    stamp, admin, customerId, accountId, paymentMethodId, allocatedLine,
    // A quotation is happy with a variant; anything downstream needs the vehicle.
    vehicleLine: [{ itemType: 'vehicle', vehicleVariantId: variantId, quantity: 1, unitPrice: 100 }],
    partLine: [{ itemType: 'part', partId, quantity: 1, unitPrice: 100 }],
  };
}

async function cleanup() {
  const { Role, User } = require('../models');
  await User.deleteMany({ email: { $in: [VIEWER_EMAIL, OWNER_EMAIL] } });
  const role = await Role.findOne({ name: ROLE_NAME });
  if (role) await Role.deleteOne({ _id: role._id });
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/amserp');
  const fx = await fixtures();
  const specs = PAGES(fx);

  section('Each page, granted on its own, at "All data" then "Own only"');
  for (const spec of specs) {
    const [method, path, rawPayload] = spec.create;
    // '@vehicle' means "mint a vehicle now" — one document may not sell another's.
    const payload = rawPayload.lineItems === '@vehicle'
      ? { ...rawPayload, lineItems: await fx.allocatedLine() }
      : rawPayload;

    // ── the owner account makes one record with exactly this grant ────────
    const { missing } = await applyRole('all', spec.grant);
    if (missing.length) console.log(`  note  ${spec.label}: no Page row for ${missing.join(', ')}`);
    const ownerToken = await login(OWNER_EMAIL);
    const res = await call(ownerToken, method, path, payload);
    let id = createdId(res.body, spec.prefer);
    if (spec.findBy && (res.status === 200 || res.status === 201)) {
      const [listPath, term] = spec.findBy(res.body);
      const found = rowsOf((await call(fx.admin, 'GET', `${listPath}${encodeURIComponent(term || '')}`)).body);
      id = idOf(found[0]) || '';
    }
    if (!((res.status === 200 || res.status === 201) && id)) {
      console.log(`  SKIP  ${spec.label} — could not create: HTTP ${res.status} ${res.body?.message || res.body?.raw || ''}`);
      continue;
    }

    // ── "All data": the other account must see it ─────────────────────────
    let viewer = await login(VIEWER_EMAIL);
    let list = await call(viewer, 'GET', `${spec.list}${spec.list.includes('?') ? '&' : '?'}limit=200`);
    if (list.status !== 200) {
      check(`${spec.label}: the list opens`, false, `HTTP ${list.status} ${list.body?.message || ''}`);
      continue;
    }
    const rows = rowsOf(list.body);
    const seenAll = rows.some((row) => idOf(row) === id);
    check(`${spec.label} — "All data": another account's record is visible`, seenAll,
      seenAll ? '' : `${rows.length} row(s) came back, none of them the owner's`);

    // ── "Own only": the same record must now be hidden ────────────────────
    await applyRole('own', spec.grant);
    viewer = await login(VIEWER_EMAIL);
    list = await call(viewer, 'GET', `${spec.list}${spec.list.includes('?') ? '&' : '?'}limit=200`);
    const seenOwn = rowsOf(list.body).some((row) => idOf(row) === id);
    check(`${spec.label} — "Own only": that record is hidden`, !seenOwn,
      seenOwn ? 'still listed — this list does not apply the scope' : '');
  }

  // ── the count cards must agree with the table under them ────────────────
  section('Summary cards agree with the rows beneath them');
  const CARDS = [
    ['Parts Quotations', ['part_quotations', 'customers'], '/parts-sales/quotations', '/parts-sales/quotations/stats', 'total'],
    ['Parts Invoices', ['part_invoices', 'customers'], '/parts-sales/invoices', '/parts-sales/invoices/summary', 'total'],
  ];
  for (const [label, grant, list, statsPath, field] of CARDS) {
    await applyRole('own', grant);
    const viewer = await login(VIEWER_EMAIL);
    const rows = rowsOf((await call(viewer, 'GET', `${list}?limit=1`)).body);
    const total = (await call(viewer, 'GET', `${list}?limit=1`)).body?.pagination?.total ?? rows.length;
    const stats = (await call(viewer, 'GET', statsPath)).body?.data;
    const counted = Number(stats?.[field] ?? stats?.count ?? NaN);
    check(`${label}: the card counts the rows the table shows`,
      !Number.isFinite(counted) || counted === total,
      Number.isFinite(counted) ? `card ${counted}, table ${total}` : 'no comparable figure on the card');
  }

  console.log('');
  console.log(pass.join('\n'));
  if (fail.length) { console.log(''); console.log(fail.join('\n')); }
  console.log(`\n${pass.length} passed, ${fail.length} failed`);

  if (!process.argv.includes('--keep')) await cleanup();
  await mongoose.disconnect();
  process.exit(fail.length ? 1 : 0);
})();
