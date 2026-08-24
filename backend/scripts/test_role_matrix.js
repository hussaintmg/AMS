/**
 * One account per page, granted exactly that page, then every endpoint the page
 * owns is called as that account.
 *
 * `audit_write_permissions.js` proves nothing gets through without a grant.
 * That is only half the question, and the half operators do not complain about.
 * What they report is the other half: "Create is ticked and the user is still
 * denied." That happens when a route is guarded on a page key no job row will
 * ever carry — a screen filed under a different name, an alias the guard does
 * not list, a page with no Page document to grant in the first place. None of it
 * is visible from the source; all of it shows up the moment a real account with
 * a real grant calls the real route.
 *
 * So: for every page the routes actually guard on, this creates a role holding
 * that page with every action it declares, signs in, and calls each of the
 * page's own endpoints. A 403 there is the bug. It then calls an endpoint from
 * an unrelated page and requires a 403, so a pass cannot come from the guard
 * having stopped working altogether.
 *
 * The route table is `audit_page_operations.js`'s, so the two never drift.
 *
 *   node scripts/test_role_matrix.js
 *   node scripts/test_role_matrix.js --page parts     # one page
 *   node scripts/test_role_matrix.js --writes         # include write routes
 *   node scripts/test_role_matrix.js --cleanup
 *
 * Reads are swept by default. `--writes` also calls the write routes, with an
 * empty body and an id nothing exists under, so almost all of them stop at
 * validation — which is past the guard, which is the whole question. Collection
 * counts are reported either way, so a write that did land cannot go unnoticed.
 *
 * The backend must already be running (default http://localhost:3002).
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const { build } = require('./audit_page_operations');
const { PAGE_CAPABILITIES } = require('../constants/pageCapabilities');

const BASE = process.env.TEST_API_BASE || `http://localhost:${process.env.API_PORT || 3002}`;
const ROLE_NAME = 'matrix_test_role';
const USER_EMAIL = 'matrix.tester@amserp.local';
const USER_PASSWORD = 'Matrix#2026';
const NOWHERE = '000000000000000000000000';

/**
 * An endpoint on a page nobody in this suite is granted while another page is
 * under test, so a whole run of passes cannot come from the gate having stopped
 * firing. Role Management is a poor thing to hold by accident and no picker
 * reaches it.
 */
const CONTROL = { method: 'GET', path: '/api/admin/roles', page: 'role_management' };

/**
 * Routes that deliberately ask for a second page, and which one.
 *
 * A conversion is not one act: converting a parts booking posts the invoice
 * that *is* the counter sale, so it asks for Parts Invoices → Create as well
 * (parts-sales.routes.js COUNTER_SALE). A job card lives on the Services page,
 * so raising one from an appointment asks for both. Neither is a mapping
 * mistake, and the run grants both so the endpoint is still exercised rather
 * than skipped.
 */
const ALSO_NEEDS = new Map([
  ['POST /api/parts-sales/bookings/:id/convert', { pages: ['part_invoices'], why: 'the conversion posts the counter sale invoice' }],
  ['POST /api/services/job-cards', { pages: ['services'], why: 'a job card lives on the Services page' }],
]);

/**
 * A guard that reads the body needs one. A gate pass takes its direction from
 * `direction` on create, so an empty body is judged as an entry pass however
 * the page under test was granted.
 */
const PROBE_BODY_FOR_PAGE = { gatepass_out: { direction: 'out' } };

/**
 * Some `:id` routes cannot be judged against an id nothing exists under: a gate
 * pass takes its direction from the record, and a record that is not there
 * reads as an entry pass, so an exit role is refused for the right reason and
 * the wrong test. Those pages get a real record of their own, made and removed
 * by this suite.
 */
const NEEDS_REAL_RECORD = new Set(['gatepass_out']);

let pass = 0;
let fail = 0;
const failures = [];
const notes = [];
const skipped = [];

const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; return true; }
  fail += 1;
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  return false;
};

/**
 * `:kind` has to match the page under test or the router dispatches the request
 * to another page's branch and refuses it correctly — a refusal that says
 * nothing about the grant being tested. Custom Bookings' own endpoints are only
 * its endpoints when `:kind` is `bookings`.
 */
const KIND_FOR_PAGE = {
  custom_quotations: 'quotations', custom_bookings: 'bookings', custom_invoices: 'invoices',
  parts: 'part', part_scan: 'part', vehicles: 'vehicle', vehicle_scan: 'vehicle',
};

const paramValue = (name, pageKey) => {
  if (/id$/i.test(name)) return NOWHERE;
  if (name === 'kind') return KIND_FOR_PAGE[pageKey] || 'quotations';
  return {
    type: 'sources', documentType: 'invoice', collection: 'leads',
    module: 'customers', page: 'customers', slug: 'x', key: 'x', action: 'view', name: 'x',
  }[name] || 'x';
};

const concrete = (routePath, pageKey, realId) => routePath
  .split('/')
  .map((part) => {
    if (!part.startsWith(':')) return part;
    const name = part.slice(1).replace(/[?()].*$/, '');
    if (realId && name === 'id') return realId;
    return paramValue(name, pageKey);
  })
  .join('/');

async function call(token, method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body || {}),
  });
  let reply = null;
  try { reply = await res.json(); } catch { /* not JSON (pdf, csv) */ }
  return { status: res.status, message: reply?.message || '' };
}

async function connect() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
}

/**
 * Grant exactly `pageKey`, with every action the capability table says it has.
 * Returns null when no Page document carries that name — which is itself worth
 * reporting: a route guarded on a page nobody can be granted is a route nobody
 * can ever reach.
 */
async function grantOnly(pageKey, extraPages = []) {
  const { Role, User, Page } = require('../models');
  const page = await Page.findOne({ name: pageKey }).lean();
  if (!page) return null;

  const wanted = [pageKey, ...extraPages];
  const pages = await Page.find({ name: { $in: wanted } }).lean();

  const jobFor = (doc) => {
    const actions = { view: true };
    (PAGE_CAPABILITIES[doc.name]?.actions || []).forEach((action) => { actions[action] = true; });
    return {
      pageKey: doc.name,
      module: doc.module || doc.name,
      actions,
      dataScope: { mode: 'all', roles: [], users: [] },
      fields: { mode: 'all', allowed: [] },
    };
  };

  let role = await Role.findOne({ name: ROLE_NAME });
  if (!role) role = new Role({ name: ROLE_NAME, displayName: 'Role Matrix Test Role' });
  role.permissions = pages.map((doc) => ({ pageKey: doc.name, path: doc.path, module: doc.module, canView: true, isActive: true }));
  role.jobs = pages.map(jobFor);
  role.isActive = true;
  await role.save();

  let user = await User.findOne({ email: USER_EMAIL });
  if (!user) {
    user = new User({
      firstName: 'Matrix', lastName: 'Tester', email: USER_EMAIL,
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

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${JSON.stringify(json)}`);
  return json.data?.token || json.token;
}

/**
 * An exit gate pass belonging to the suite, so the routes that read the record's
 * direction are judged on a record that has one. Written straight to the
 * database rather than through the API: the point is to test the API, not to
 * depend on it working first.
 */
async function fixtureGatePass(token) {
  const GatePass = require('../models/GatePass.model');
  const { User } = require('../models');
  const user = await User.findOne({ email: USER_EMAIL }).select('_id').lean();
  const pass = await GatePass.create({
    gatePassNumber: `MATRIXTEST-${Date.now().toString(36)}`,
    direction: 'out',
    entryType: 'logistic',
    partyName: 'MATRIXTEST',
    createdBy: user?._id,
  });
  return pass._id.toString();
}

/**
 * Everything the suite made: its role, its account, and any record it raised
 * along the way. The write sweep calls real create endpoints with a granted
 * role, so some of them succeed — which is the point, and which is why they are
 * cleared out again.
 */
async function cleanup() {
  const GatePass = require('../models/GatePass.model');
  const { Role, User, Notification } = require('../models');
  const user = await User.findOne({ email: USER_EMAIL }).select('_id').lean();
  if (user) {
    const passes = await GatePass.deleteMany({ createdBy: user._id });
    if (passes.deletedCount) console.log(`Removed ${passes.deletedCount} gate pass(es) the sweep raised.`);
    if (Notification) await Notification.deleteMany({ user: user._id });
  }
  await GatePass.deleteMany({ partyName: 'MATRIXTEST' });
  await User.deleteMany({ email: USER_EMAIL });
  const role = await Role.findOne({ name: ROLE_NAME });
  if (role) await Role.deleteOne({ _id: role._id });
  console.log('Fixtures removed.');
}

const SIDE_EFFECT_COLLECTIONS = new Set(['logs', 'searchdocuments', 'sessions']);

async function snapshot() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  const counts = {};
  for (const { name } of collections) {
    if (SIDE_EFFECT_COLLECTIONS.has(name)) continue;
    counts[name] = await mongoose.connection.db.collection(name).countDocuments();
  }
  return counts;
}

async function run() {
  await connect();
  if (process.argv.includes('--cleanup')) { await cleanup(); await mongoose.disconnect(); return; }

  const only = process.argv.includes('--page') ? process.argv[process.argv.indexOf('--page') + 1] : null;
  const includeWrites = process.argv.includes('--writes');

  const report = build();
  const pages = report.pages
    .filter((page) => page.endpoints.length)
    .filter((page) => !only || page.pageKey === only);

  console.log(`Testing ${pages.length} page(s) against ${BASE}${includeWrites ? ' (reads and writes)' : ' (reads only — pass --writes for the rest)'}`);

  // Created up front so the fixture's own role and user are not reported as
  // writes the sweep caused.
  await grantOnly(pages[0]?.pageKey || 'dashboard');
  const before = await snapshot();

  for (const page of pages) {
    const token = await grantOnly(page.pageKey);
    if (!token) {
      notes.push(`${page.pageKey}: no Page document carries this name, so no role can ever be granted it`);
      check(`${page.pageKey} — grantable`, false, 'no Page document with this name');
      continue;
    }

    const endpoints = page.endpoints.filter((e) => includeWrites || e.method === 'GET');
    let denied = 0;
    for (const endpoint of endpoints) {
      const key = `${endpoint.method} ${endpoint.path}`;
      const also = ALSO_NEEDS.get(key);
      // A route that asks for a second page is given it, and says so.
      const useToken = also ? await grantOnly(page.pageKey, also.pages) : token;
      if (also) notes.push(`${key} also needs ${also.pages.join(', ')} — ${also.why}`);
      // A route judged on the record needs one; it is made fresh each time,
      // because the very next call may be the DELETE that removes it.
      const realId = NEEDS_REAL_RECORD.has(page.pageKey) && endpoint.path.includes('/:id')
        ? await fixtureGatePass(token)
        : null;
      const res = await call(useToken, endpoint.method, concrete(endpoint.path, page.pageKey, realId), PROBE_BODY_FOR_PAGE[page.pageKey]);
      const refused = res.status === 401 || res.status === 403;
      if (refused) denied += 1;
      check(key.replace(/^/, `${page.pageKey} `), !refused, `${res.status} ${res.message}`);
      if (also) await grantOnly(page.pageKey);
    }

    // The grant is doing the work, not a gate that stopped firing.
    if (page.pageKey !== CONTROL.page) {
      const control = await call(token, CONTROL.method, CONTROL.path);
      check(`${page.pageKey} — still refused an endpoint it was not granted`, control.status === 403 || control.status === 401, `control answered ${control.status}`);
    }

    const mark = denied ? `${denied} refused` : 'all reachable';
    console.log(`  ${denied ? 'FAIL' : 'PASS'}  ${page.pageKey.padEnd(26)} ${endpoints.length} endpoint(s), ${mark}`);
  }

  const after = await snapshot();
  const moved = Object.keys({ ...before, ...after })
    .filter((name) => (before[name] || 0) !== (after[name] || 0))
    .map((name) => `${name}: ${before[name] || 0} → ${after[name] || 0}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nEndpoints a role holding their own page could not reach:');
    failures.forEach((line) => console.log(`  - ${line}`));
  }
  if (notes.length) {
    console.log('\nNotes:');
    notes.forEach((line) => console.log(`  - ${line}`));
  }
  if (skipped.length) {
    const unique = [...new Set(skipped)];
    console.log(`\nNot called in the allow direction (${unique.length}) — each is still required`);
    console.log('to refuse an ungranted caller by audit_write_permissions.js:');
    unique.forEach((line) => console.log(`  - ${line}`));
  }
  if (moved.length) {
    console.log('\nCollections that changed size (the sweep wrote something):');
    moved.forEach((line) => console.log(`  ${line}`));
  }

  await cleanup();
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

run().catch((error) => { console.error(error); process.exit(1); });
