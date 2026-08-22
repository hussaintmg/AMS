/**
 * One page, one role, from another account.
 * =========================================
 * A role that does one job holds one page. This grants exactly that — every
 * action ticked, data scope "All data", nothing else — and then asks, as that
 * user, whether the page actually works:
 *
 *   1. the master data its forms are filled from (constants/pageCatalog.js
 *      declares it: Customers, Parts, Payment Methods, Accounts, …)
 *   2. the list itself
 *   3. the buttons on it — create, send email, download PDF, convert,
 *      record payment, approve
 *
 * A page whose Create form cannot load its customer list is granted but not
 * usable, and that is indistinguishable from a broken permission engine.
 *
 * Usage:  node scripts/test_page_isolation.js [--keep] [--only <pageKey>]
 *
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { PAGE_CATALOG } = require('../constants/pageCatalog');
const { PAGE_CAPABILITIES } = require('../constants/pageCapabilities');

const BASE = process.env.TEST_API || 'http://localhost:3002/api';
const ROLE_NAME = 'page_isolation_role';
const USER_EMAIL = 'page.isolation@amserp.local';
const PASSWORD = 'PageIsolation2026!';
const ADMIN_EMAIL = process.env.TEST_ADMIN || 'import.tester@amserp.local';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'ReportFix2026!';

const pass = []; const fail = [];
const check = (label, ok, detail = '') => {
  (ok ? pass : fail).push(`${ok ? '  ok   ' : '  FAIL '}${label}${detail ? `  — ${detail}` : ''}`);
};

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
const rowsOf = (body) => {
  const data = body?.data ?? body;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).find(Array.isArray) || [];
};
const idOf = (row) => String(row?._id || row?.id || '');

/** Where each master-data model is actually served from. */
const SOURCE = {
  Customer: '/customers/all', User: '/users/active', Employee: '/employees?limit=5',
  Department: '/admin/departments', Role: '/users/roles/list', Account: '/accounts',
  PaymentMethod: '/payment-methods', ExpenseCategory: '/expenses/categories',
  LeadCity: '/lead-master/cities', LeadSource: '/lead-master/sources',
  LeadType: '/lead-master/types', LeadPriority: '/lead-master/priorities',
  StatusItem: '/admin/status-collections', StatusCollection: '/admin/status-collections',
  VehicleMake: '/vehicle-master/makes', VehicleModel: '/vehicle-master/models',
  VehicleVariant: '/vehicle-master/variants', VehicleColor: '/vehicle-master/colors',
  PartCategory: '/vehicle-master/categories', Supplier: '/vehicle-master/suppliers',
  PartSourceType: '/parts/source-types/list', Warehouse: '/warehouses',
  ServiceType: '/service-master/types', ServicePackage: '/service-master/packages',
  LaborRate: '/service-master/labor-rates', WarrantyType: '/service-master/warranties',
  Part: '/parts?limit=5', Vehicle: '/vehicles?limit=5', GatePass: '/gatepasses/open-entries',
  Company: '/erp-settings/companies', Invoice: '/invoices?limit=5',
  PartInvoice: '/parts-sales/invoices?limit=5', CustomInvoice: '/custom/invoices?limit=5',
};

/** The models a page's forms are filled from, straight out of the catalog. */
function modelsFor(pageKey) {
  const entry = PAGE_CATALOG[pageKey];
  const models = new Set();
  for (const which of ['create', 'edit', 'filters']) {
    (entry?.forms?.[which]?.dropdowns || []).forEach((d) => {
      String(d.model || '').split('|').forEach((m) => { if (m && m !== 'static' && SOURCE[m]) models.add(m); });
    });
  }
  return [...models];
}

/**
 * The pages worth walking, with the list to open and a way to make one record
 * so the buttons have something to act on. `actions` names the endpoints behind
 * the buttons the page draws.
 */
const PAGES = (fx) => [
  { key: 'part_quotations', list: '/parts-sales/quotations',
    create: ['POST', '/parts-sales/quotations', { customerId: fx.customerId, validityDays: 7, lineItems: fx.partLine }],
    actions: [
      ['approve', 'POST', (id) => `/parts-sales/quotations/${id}/approve`, {}],
      ['sendEmail', 'POST', (id) => `/parts-sales/quotations/${id}/send-email`, { to: fx.mailbox }],
      ['downloadPdf', 'GET', (id) => `/pdf-management/download/quotation/${id}`, null],
      ['convert', 'POST', (id) => `/parts-sales/quotations/${id}/convert`, { paidAmount: 100, paymentMode: 'cash', accountId: fx.accountId }],
    ] },
  { key: 'part_bookings', list: '/parts-sales/bookings',
    create: ['POST', '/parts-sales/bookings', { customerId: fx.customerId, lineItems: fx.partLine, bookingAmount: 100, totalAmount: 100, paymentMethodId: fx.methodId, accountId: fx.accountId }],
    actions: [
      ['sendEmail', 'POST', (id) => `/parts-sales/bookings/${id}/send-email`, { to: fx.mailbox }],
      ['downloadPdf', 'GET', (id) => `/pdf-management/download/booking/${id}`, null],
    ] },
  { key: 'part_invoices', list: '/parts-sales/invoices',
    create: ['POST', '/parts-sales/invoices', { customerId: fx.customerId, lineItems: fx.partLine, paidAmount: 100, paymentMethodId: fx.methodId, accountId: fx.accountId }],
    actions: [
      ['sendEmail', 'POST', (id) => `/parts-sales/invoices/${id}/send-email`, { to: fx.mailbox }],
      ['downloadPdf', 'GET', (id) => `/pdf-management/download/invoice/${id}`, null],
    ] },
  { key: 'custom_quotations', list: '/custom/quotations',
    create: ['POST', '/custom/quotations', { customerId: fx.customerId, title: 'Isolation test', lineItems: fx.customLine }],
    actions: [
      ['approve', 'POST', (id) => `/custom/quotations/${id}/approve`, {}],
      ['sendEmail', 'POST', (id) => `/custom/quotations/${id}/email`, { to: fx.mailbox }],
      ['downloadPdf', 'GET', (id) => `/pdf-management/download/quotation/${id}`, null],
    ] },
  { key: 'custom_bookings', list: '/custom/bookings',
    create: ['POST', '/custom/bookings', { customerId: fx.customerId, title: 'Isolation test', lineItems: fx.customLine, bookingAmount: 50, paymentMethodId: fx.methodId, accountId: fx.accountId }],
    actions: [
      ['sendEmail', 'POST', (id) => `/custom/bookings/${id}/email`, { to: fx.mailbox }],
      ['downloadPdf', 'GET', (id) => `/pdf-management/download/booking/${id}`, null],
    ] },
  { key: 'custom_invoices', list: '/custom/invoices',
    create: ['POST', '/custom/invoices', { customerId: fx.customerId, title: 'Isolation test', lineItems: fx.customLine, paidAmount: 100, paymentMethodId: fx.methodId, accountId: fx.accountId }],
    actions: [
      ['sendEmail', 'POST', (id) => `/custom/invoices/${id}/email`, { to: fx.mailbox }],
      ['downloadPdf', 'GET', (id) => `/pdf-management/download/invoice/${id}`, null],
      ['recordPayment', 'POST', (id) => `/custom/invoices/${id}/payments`, { amount: 1, paymentMethodId: fx.methodId, accountId: fx.accountId }],
    ] },
  { key: 'quotations', list: '/quotations',
    create: ['POST', '/quotations', { customerId: fx.customerId, validityDays: 7, lineItems: fx.vehicleLine }],
    actions: [
      ['approve', 'POST', (id) => `/quotations/${id}/approve`, {}],
      ['sendEmail', 'POST', (id) => `/quotations/${id}/send-email`, { to: fx.mailbox }],
      ['downloadPdf', 'GET', (id) => `/pdf-management/download/quotation/${id}`, null],
    ] },
  { key: 'customers', list: '/customers',
    create: ['POST', '/customers', { firstName: 'Isolation', lastName: `Cust${fx.stamp}`, customerType: 'individual', phone: `0322${fx.stamp}`, email: `isolation.cust.${fx.stamp}@example.com` }],
    actions: [] },
  { key: 'leads', list: '/leads',
    create: ['POST', '/leads', { customerName: `Isolation Lead ${fx.stamp}`, phone: `0333${fx.stamp}`, email: `isolation.lead.${fx.stamp}@example.com` }],
    actions: [] },
  { key: 'gatepass_in', list: '/gatepasses?direction=in',
    create: ['POST', '/gatepasses', { direction: 'in', entryType: 'logistic', transporter: 'Isolation', truckNumber: `ISO-${fx.stamp}`, driverName: 'Driver' }],
    actions: [] },
];

/** Grant the role exactly one page, every action it offers, all data. */
async function applyRole(pageKey) {
  const { Role, User, Page } = require('../models');
  const page = await Page.findOne({ name: pageKey }).lean();
  if (!page) return { token: null, missing: true };

  const actions = { view: true };
  (PAGE_CAPABILITIES[pageKey]?.actions || []).forEach((a) => { actions[a] = true; });

  let role = await Role.findOne({ name: ROLE_NAME });
  if (!role) role = new Role({ name: ROLE_NAME });
  role.displayName = 'Page Isolation Role';
  role.permissions = [{ pageKey: page.name, path: page.path, module: page.module, canView: true, isActive: true }];
  role.jobs = [{
    pageKey: page.name, module: page.module || page.name, actions,
    dataScope: { mode: 'all', roles: [], users: [] },
    fields: { mode: 'all', allowed: [] }, columns: { mode: 'all', allowed: [] },
  }];
  role.isActive = true;
  await role.save();

  let user = await User.findOne({ email: USER_EMAIL });
  if (!user) user = new User({ firstName: 'Page', lastName: 'Isolation', email: USER_EMAIL, status: 'active', isActive: true });
  user.password = PASSWORD;
  user.role = role._id;
  user.status = 'active';
  user.isActive = true;
  user.customPermissions = [];
  await user.save();
  return { token: await login(USER_EMAIL), missing: false };
}

async function fixtures() {
  const stamp = String(Date.now()).slice(-7);
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const customerId = idOf(rowsOf((await call(admin, 'GET', '/customers/all?limit=1')).body)[0]);
  const partId = idOf(rowsOf((await call(admin, 'GET', '/parts?limit=1')).body)[0]);
  const variantId = idOf(rowsOf((await call(admin, 'GET', '/vehicle-master/variants?limit=1')).body)[0]);
  const accountId = idOf(rowsOf((await call(admin, 'GET', '/accounts')).body).find((a) => a.type === 'petty_cash'));
  const methodId = idOf(rowsOf((await call(admin, 'GET', '/payment-methods?is_active=true')).body)[0]);
  await call(admin, 'POST', `/parts/${partId}/adjust`, { adjustmentType: 'increase', quantity: 300, reason: 'page isolation fixture' });
  return {
    stamp, admin, customerId, accountId, methodId,
    mailbox: `isolation.${stamp}@example.com`,      // reserved domain; nothing is delivered
    partLine: [{ itemType: 'part', partId, quantity: 1, unitPrice: 100 }],
    vehicleLine: [{ itemType: 'vehicle', vehicleVariantId: variantId, quantity: 1, unitPrice: 100 }],
    customLine: [{ description: 'Isolation item', quantity: 1, unitPrice: 100 }],
  };
}

async function cleanup() {
  const { Role, User, Customer } = require('../models');
  const Lead = require('../models/Lead.model');
  await User.deleteMany({ email: { $in: [USER_EMAIL] } });
  await User.deleteMany({ email: /^isolation\.(cust|lead)\.\d+@example\.com$/i });
  await Customer.updateMany(
    { firstName: 'Isolation', deletedAt: null },
    { $set: { deletedAt: new Date(), isActive: false } },
  );
  await Lead.deleteMany({ email: /^isolation\.lead\.\d+@example\.com$/i });
  const role = await Role.findOne({ name: ROLE_NAME });
  if (role) await Role.deleteOne({ _id: role._id });
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/amserp');
  const fx = await fixtures();
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const specs = PAGES(fx).filter((s) => !only || s.key === only);

  for (const spec of specs) {
    const label = PAGE_CATALOG[spec.key]?.label || spec.key;
    console.log(`\n${label}  (granted ${spec.key} and nothing else)`);
    const { token, missing } = await applyRole(spec.key);
    if (missing) { console.log('  SKIP  no Page row for this key'); continue; }

    // ── the data its forms are filled from ────────────────────────────────
    for (const model of modelsFor(spec.key)) {
      const res = await call(token, 'GET', SOURCE[model]);
      check(`${label}: can load ${model} for its form`, res.status === 200,
        `HTTP ${res.status} ${res.body?.message || ''}`);
    }

    // ── the list ──────────────────────────────────────────────────────────
    const list = await call(token, 'GET', `${spec.list}${spec.list.includes('?') ? '&' : '?'}limit=5`);
    check(`${label}: the list opens`, list.status === 200, `HTTP ${list.status} ${list.body?.message || ''}`);

    // ── create ────────────────────────────────────────────────────────────
    const [method, path, payload] = spec.create;
    const made = await call(token, method, path, payload);
    const id = idOf(made.body?.data?.customer || made.body?.data?.lead || made.body?.data);
    check(`${label}: can create`, (made.status === 200 || made.status === 201) && Boolean(id),
      `HTTP ${made.status} ${made.body?.message || made.body?.raw || ''}`);
    if (!id) continue;

    // ── the buttons the page draws ────────────────────────────────────────
    for (const [action, verb, url, body] of spec.actions) {
      const res = await call(token, verb, url(id), body);
      // 403 is the only failure here: the role holds every action this page
      // offers, so a refusal means the button is governed by a grant the page
      // never asks for. A 400 is the business rule talking, which is fine.
      check(`${label}: ${action} is not refused`, res.status !== 403,
        `HTTP ${res.status} ${res.body?.message || ''}`);
    }
  }


  // ── the picker grant must not become a management grant ────────────────
  console.log('\nA page that only reads a list must not be able to change it');
  const { token: partsToken } = await applyRole('part_quotations');
  const NEGATIVE = [
    ['create a customer', 'POST', '/customers', { firstName: 'Should', lastName: 'Fail', customerType: 'individual', phone: '03000000000', email: `hole.${fx.stamp}@example.com` }],
    ['create a part', 'POST', '/parts', { name: 'Should Fail', partCode: `HOLE-${fx.stamp}`, sellingPrice: 1 }],
    ['create a vehicle', 'POST', '/vehicles', { vin: `HOLE${fx.stamp}`, engineNumber: `HOLE-${fx.stamp}`, year: 2026, purchasePrice: 1 }],
    ['create a lead master row', 'POST', '/lead-master/sources', { name: `Hole ${fx.stamp}` }],
    ['create a department', 'POST', '/admin/departments', { name: `Hole ${fx.stamp}` }],
    ['open the full customers screen', 'GET', '/customers?limit=1', null],
  ];
  for (const [what, verb, path, body] of NEGATIVE) {
    const res = await call(partsToken, verb, path, body);
    check(`Parts Quotations cannot ${what}`, res.status === 403,
      `HTTP ${res.status} ${res.body?.message || ''}`);
  }

  // ── and a role holding nothing relevant still cannot read the pickers ───
  const { token: leadsToken } = await applyRole('leads');
  for (const [what, path] of [['the part list', '/parts?limit=1'], ['the vehicle list', '/vehicles?limit=1']]) {
    const res = await call(leadsToken, 'GET', path);
    check(`Leads cannot read ${what} — no form of its own needs it`, res.status === 403,
      `HTTP ${res.status} ${res.body?.message || ''}`);
  }
  console.log('');
  console.log(pass.join('\n'));
  if (fail.length) { console.log(''); console.log(fail.join('\n')); }
  console.log(`\n${pass.length} passed, ${fail.length} failed`);

  if (!process.argv.includes('--keep')) await cleanup();
  await mongoose.disconnect();
  process.exit(fail.length ? 1 : 0);
})();
