/**
 * "+ Create X" from inside another page's form — end to end.
 *
 * The shortcuts beside the pickers (Source, Type, Status, City on the customer
 * and lead forms; Category, Supplier and Source Type on the parts form) raise
 * records that belong to other pages. Guarded on those pages alone, the only way
 * to let a sales clerk name a new source while filling in a customer was to hand
 * them the whole Lead Master Data screen — so nobody did, the button was drawn
 * regardless, and every use of it ended in "Access denied".
 *
 * Role Jobs → <page> → Forms now decides, and this proves both halves of that:
 * a role holding only the *hosting* page may raise the record, a role whose
 * shortcut has been withheld may not, and neither of them gains anything else on
 * the master-data router.
 *
 * Fixtures live under one throw-away role, as in test_role_permissions.js.
 *
 *   node scripts/test_quick_create_permissions.js
 *   node scripts/test_quick_create_permissions.js --cleanup
 *
 * The backend must already be running (default http://localhost:3002).
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const BASE = process.env.TEST_API_BASE || `http://localhost:${process.env.API_PORT || 3002}`;
const ROLE_NAME = 'quick_create_test_role';
const USER_EMAIL = 'quickcreate.tester@amserp.local';
const USER_PASSWORD = 'QuickCreate#2026';
// Everything this suite creates carries the stamp, so a run leaves nothing but
// its own rows behind and `--cleanup` can find every one of them.
const STAMP = 'QCTEST';

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

// A fresh name every call: these lists reject duplicates, and a 409 would read
// as a permission failure.
let counter = 0;
const uniqueName = (prefix) => `${STAMP} ${prefix} ${Date.now().toString(36)}${(counter += 1)}`;

async function call(token, method, url, body) {
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body: json };
}

const created = (res) => res.status === 200 || res.status === 201;

async function login(email, password) {
  const res = await call(null, 'POST', '/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token || res.body.token;
}

async function connect() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
}

/**
 * Rewrite the throw-away role to exactly `spec` and sign in again.
 * `spec.jobs[].quickCreate` is passed through untouched, because withholding a
 * shortcut is the thing under test.
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
    dataScope: job.dataScope || { mode: 'all', roles: [], users: [] },
    fields: { mode: 'all', allowed: [] },
    ...(job.quickCreate ? { quickCreate: job.quickCreate } : {}),
  }));

  let role = await Role.findOne({ name: ROLE_NAME });
  if (!role) role = new Role({ name: ROLE_NAME, displayName: 'Quick Create Test Role' });
  role.permissions = permissions;
  role.jobs = jobs;
  role.isActive = true;
  await role.save();

  let user = await User.findOne({ email: USER_EMAIL });
  if (!user) {
    user = new User({
      firstName: 'Quick', lastName: 'Tester', email: USER_EMAIL,
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

async function cleanup() {
  const models = require('../models');
  const { Role, User } = models;
  await User.deleteMany({ email: USER_EMAIL });
  const role = await Role.findOne({ name: ROLE_NAME });
  if (role) await Role.deleteOne({ _id: role._id });

  const like = { name: new RegExp(`^${STAMP} `) };
  for (const name of ['LeadSource', 'LeadType', 'LeadCity', 'LeadPriority', 'PartCategory', 'Supplier', 'PartSourceType']) {
    if (models[name]) await models[name].deleteMany(like);
  }
  if (models.StatusCollection) {
    await models.StatusCollection.updateMany({}, { $pull: { items: { label: new RegExp(`^${STAMP} `) } } });
  }
  console.log('Fixtures removed.');
}

// ── the shortcuts, and the endpoint each one really posts to ───────────────

const LEAD_MASTER_SHORTCUTS = [
  { key: 'source', label: '+ Create Source', url: '/lead-master/sources' },
  { key: 'type', label: '+ Create Type', url: '/lead-master/types' },
  { key: 'city', label: '+ Create City', url: '/lead-master/cities' },
];

const raiseLeadMaster = (token, shortcut) =>
  call(token, 'POST', shortcut.url, { name: uniqueName(shortcut.key), sortOrder: 0 });

async function statusCollectionId(token) {
  const res = await call(token, 'GET', '/admin/status-collections');
  const rows = res.body?.data?.collections || res.body?.data || [];
  return Array.isArray(rows) ? rows[0]?._id : null;
}

const raiseStatus = (token, collectionId) => {
  const label = uniqueName('status');
  return call(token, 'POST', `/admin/status-collections/${collectionId}/items`, {
    label, value: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), color: '#3b82f6',
  });
};

const PARTS_SHORTCUTS = [
  { key: 'category', label: '+ Create Category', url: '/vehicle-master/categories' },
  { key: 'supplier', label: '+ Create Supplier', url: '/vehicle-master/suppliers' },
  { key: 'source_type', label: '+ Create Source Type', url: '/parts/source-types' },
];

// The same payload the quick-create dialog sends. A supplier needs a code and a
// type as well as a name, and a 400 for a missing field looks to the operator
// exactly like a refused permission — so the body under test is the real one.
const partsPayload = (shortcut) => {
  const name = uniqueName(shortcut.key);
  if (shortcut.key !== 'supplier') return { name };
  return { name, supplierCode: name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 20), type: 'oem' };
};

const raiseParts = (token, shortcut) => call(token, 'POST', shortcut.url, partsPayload(shortcut));

const NOWHERE = '000000000000000000000000';

// ── scenarios ──────────────────────────────────────────────────────────────

/**
 * The complaint itself: a second account that may create customers, and nothing
 * else, filling in the New Customer form.
 */
async function scenarioCustomersOnly() {
  section('Customers, without Lead Master Data or Option Management');
  const token = await applyRole({
    pages: ['customers'],
    jobs: [{ pageKey: 'customers', actions: { create: true, edit: true } }],
  });

  for (const shortcut of LEAD_MASTER_SHORTCUTS) {
    const res = await raiseLeadMaster(token, shortcut);
    check(`${shortcut.label} on the customer form`, created(res), `${res.status} ${res.body?.message || ''}`);
  }

  const collection = await statusCollectionId(token);
  if (!collection) {
    check('+ Create Status on the customer form', false, 'no status collection exists to add to');
  } else {
    const res = await raiseStatus(token, collection);
    check('+ Create Status on the customer form', created(res), `${res.status} ${res.body?.message || ''}`);
  }

  // The shortcut is permission to add to the list, never to run the screen.
  const edit = await call(token, 'PUT', `/lead-master/sources/${NOWHERE}`, { name: 'x' });
  check('…but not to edit Lead Master Data', edit.status === 403, `got ${edit.status}`);
  const remove = await call(token, 'DELETE', `/lead-master/cities/${NOWHERE}`);
  check('…nor to delete from it', remove.status === 403, `got ${remove.status}`);
}

/** Withholding one shortcut in Role Jobs has to close the endpoint too. */
async function scenarioShortcutWithheld() {
  section('A shortcut withheld in Role Jobs → Customers → Forms');
  const token = await applyRole({
    pages: ['customers'],
    jobs: [{
      pageKey: 'customers',
      actions: { create: true, edit: true },
      // Everything except Source, on both forms.
      quickCreate: { mode: 'selected', create: ['type', 'status', 'city'], edit: ['type', 'status', 'city'] },
    }],
  });

  const source = await raiseLeadMaster(token, LEAD_MASTER_SHORTCUTS[0]);
  check('+ Create Source is refused once unticked', source.status === 403, `got ${source.status}`);

  const type = await raiseLeadMaster(token, LEAD_MASTER_SHORTCUTS[1]);
  check('…while the shortcuts left ticked still work', created(type), `${type.status} ${type.body?.message || ''}`);
}

/** Read-only on the hosting page is not a licence to add to a master list. */
async function scenarioHostWithoutCreate() {
  section('The hosting page granted, but read-only');
  const token = await applyRole({
    pages: ['customers'],
    jobs: [{ pageKey: 'customers', actions: {} }],
  });
  for (const shortcut of LEAD_MASTER_SHORTCUTS) {
    const res = await raiseLeadMaster(token, shortcut);
    check(`${shortcut.label} refused without Create on Customers`, res.status === 403, `got ${res.status}`);
  }
}

/** Not holding the form's page at all changes nothing about the old answer. */
async function scenarioNoHostPage() {
  section('Neither the master-data page nor a page that offers the shortcut');
  const token = await applyRole({
    pages: ['dashboard'],
    jobs: [{ pageKey: 'dashboard', actions: {} }],
  });
  for (const shortcut of LEAD_MASTER_SHORTCUTS) {
    const res = await raiseLeadMaster(token, shortcut);
    check(`${shortcut.label} refused`, res.status === 403, `got ${res.status}`);
  }
  for (const shortcut of PARTS_SHORTCUTS) {
    const res = await raiseParts(token, shortcut);
    check(`${shortcut.label} refused`, res.status === 403, `got ${res.status}`);
  }
}

/** The parts form: categories and suppliers belong to Vehicle Master Data. */
async function scenarioPartsForm() {
  section('Parts Inventory, without Vehicle Master Data');
  const token = await applyRole({
    pages: ['parts'],
    jobs: [{ pageKey: 'parts', actions: { create: true, edit: true } }],
  });

  for (const shortcut of PARTS_SHORTCUTS) {
    const res = await raiseParts(token, shortcut);
    check(`${shortcut.label} on the part form`, created(res), `${res.status} ${res.body?.message || ''}`);
  }

  // Nothing else on the Vehicle Master router comes with it.
  const make = await call(token, 'POST', '/vehicle-master/makes', { make_name: uniqueName('make') });
  check('…but not a vehicle make', make.status === 403, `got ${make.status}`);
  const colour = await call(token, 'POST', '/vehicle-master/colors', { color_name: uniqueName('colour') });
  check('…nor a colour', colour.status === 403, `got ${colour.status}`);
  const editCategory = await call(token, 'PUT', `/vehicle-master/categories/${NOWHERE}`, { name: 'x' });
  check('…nor editing a category', editCategory.status === 403, `got ${editCategory.status}`);
  const dropCategory = await call(token, 'DELETE', `/vehicle-master/categories/${NOWHERE}`);
  check('…nor deleting one', dropCategory.status === 403, `got ${dropCategory.status}`);
}

/** The lead form offers the same four, from its own page. */
async function scenarioLeadsForm() {
  section('Leads, without Lead Master Data');
  const token = await applyRole({
    pages: ['leads'],
    jobs: [{ pageKey: 'leads', actions: { create: true, edit: true } }],
  });
  for (const shortcut of LEAD_MASTER_SHORTCUTS) {
    const res = await raiseLeadMaster(token, shortcut);
    check(`${shortcut.label} on the lead form`, created(res), `${res.status} ${res.body?.message || ''}`);
  }
  const priority = await call(token, 'POST', '/lead-master/priorities', { name: uniqueName('priority'), level: 1 });
  check('+ Create Priority on the lead form', created(priority), `${priority.status} ${priority.body?.message || ''}`);
}

/** Owning the master-data page still works exactly as it always did. */
async function scenarioMasterDataPageUnchanged() {
  section('Lead Master Data itself, unchanged');
  const token = await applyRole({
    pages: ['lead_master'],
    jobs: [{ pageKey: 'lead_master', actions: { create: true, edit: true, delete: true } }],
  });
  for (const shortcut of LEAD_MASTER_SHORTCUTS) {
    const res = await raiseLeadMaster(token, shortcut);
    check(`${shortcut.label} from the master-data screen`, created(res), `${res.status} ${res.body?.message || ''}`);
  }
}

/**
 * The catalog is what the guard reads, so a shortcut drawn on a screen with no
 * catalog entry can never be granted — it would be a 403 with no tick to fix it.
 */
async function scenarioCatalogCoversTheButtons() {
  section('Every shortcut the screens draw is in the catalog');
  const { PAGE_CATALOG, quickCreateHosts } = require('../constants/pageCatalog');
  const expected = [
    ['customers', 'source'], ['customers', 'type'], ['customers', 'status'], ['customers', 'city'],
    ['customers', 'vehicle'],
    ['leads', 'source'], ['leads', 'type'], ['leads', 'status'], ['leads', 'city'], ['leads', 'priority'],
    ['parts', 'category'], ['parts', 'supplier'], ['parts', 'source_type'],
    ['vehicles', 'make'], ['vehicles', 'model'], ['vehicles', 'variant'], ['vehicles', 'color'], ['vehicles', 'condition'],
  ];
  for (const [page, key] of expected) {
    const keys = (PAGE_CATALOG[page]?.forms?.create?.quickCreate || []).map((item) => item.key);
    check(`Role Jobs → ${page} → Forms offers "${key}"`, keys.includes(key), `has ${keys.join(', ')}`);
  }
  // And every owner named in the catalog resolves back to the pages offering it.
  const owners = new Set();
  for (const entry of Object.values(PAGE_CATALOG)) {
    for (const form of ['create', 'edit']) {
      for (const item of entry?.forms?.[form]?.quickCreate || []) owners.add(item.owner);
    }
  }
  for (const owner of owners) {
    check(`"${owner}" resolves to the pages that offer it`, quickCreateHosts(owner).length > 0);
  }
}

async function run() {
  await connect();
  if (process.argv.includes('--cleanup')) { await cleanup(); await mongoose.disconnect(); return; }

  console.log(`Testing against ${BASE}`);
  await scenarioCatalogCoversTheButtons();
  await scenarioCustomersOnly();
  await scenarioShortcutWithheld();
  await scenarioHostWithoutCreate();
  await scenarioNoHostPage();
  await scenarioPartsForm();
  await scenarioLeadsForm();
  await scenarioMasterDataPageUnchanged();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((line) => console.log(`  - ${line}`)); }
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

run().catch((error) => { console.error(error); process.exit(1); });
