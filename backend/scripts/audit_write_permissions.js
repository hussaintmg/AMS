/**
 * Every route that can change the database, called by someone who was granted
 * nothing — and by nobody at all.
 *
 * `audit_page_operations.js` reads the source and asks whether a guard is
 * *written* on each route. That cannot see a guard that is written but does not
 * fire: a `router.use` registered after the route it was meant to cover, a
 * body-dependent dispatch that falls through, a page key no job row will ever
 * match. This one asks the running server instead, and the only answer it
 * accepts is 401 or 403.
 *
 * Anything else means the request got past the gate. A 400 counts as a failure
 * on purpose — reaching validation means the guard already let it through, and
 * the next caller will send a body that validates.
 *
 * Two sweeps:
 *   1. signed out            → every write route must answer 401
 *   2. signed in, no grants  → every write route must answer 401 or 403
 *
 * Collection counts are taken before and after; anything that moved is reported
 * whatever the status codes said, because a write that happened is the finding
 * regardless of what the endpoint chose to reply.
 *
 *   node scripts/audit_write_permissions.js
 *   node scripts/audit_write_permissions.js --verbose   # list every route
 *   node scripts/audit_write_permissions.js --cleanup   # drop the fixtures
 *
 * The backend must already be running (default http://localhost:3002).
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const BASE = process.env.TEST_API_BASE || `http://localhost:${process.env.API_PORT || 3002}`;
const ROLE_NAME = 'no_permission_test_role';
const USER_EMAIL = 'nopermission.tester@amserp.local';
const USER_PASSWORD = 'NoPerm#2026';

// Nothing exists under this id, so a route that is missing its guard 404s
// instead of destroying a record.
const NOWHERE = '000000000000000000000000';

/**
 * Where the routers are mounted. Kept here rather than parsed out of server.js
 * so a router that stops being mounted shows up as a mismatch rather than
 * quietly dropping out of the sweep.
 */
const MOUNTS = {
  '/api/auth': 'auth', '/api/users': 'user', '/api/admin': 'admin', '/api/leads': 'lead',
  '/api/lead-master': 'lead-master', '/api/sales-master': 'sales-master', '/api/customers': 'customer',
  '/api/vehicles': 'vehicle', '/api/parts-sales': 'parts-sales', '/api/parts': 'parts',
  '/api/quotations': 'quotation', '/api/bookings': 'booking', '/api/sales': 'sales',
  '/api/invoices': 'invoice', '/api/payments': 'payment', '/api/services': 'service',
  '/api/reports': 'reports', '/api/dashboard': 'dashboard', '/api/warehouses': 'warehouse',
  '/api/erp-settings': 'erp-settings', '/api/vehicle-master': 'vehicle-master',
  '/api/payment-methods': 'payment-methods', '/api/service-master': 'service-master',
  '/api/profile': 'profile', '/api/search': 'global-search', '/api/uploader': 'uploader',
  '/api/bulk-import': 'bulk-import', '/api/employees': 'employees', '/api/payroll': 'payroll',
  '/api/salary-advances': 'salaryAdvance', '/api/leaves': 'leaves', '/api/expenses': 'expenses',
  '/api/ledger': 'ledger', '/api/server-management': 'server-management', '/api/logs': 'logs',
  '/api/email': 'email', '/api/pdf-management': 'pdf-management', '/api/notifications': 'notifications',
  '/api/barcode': 'barcode', '/api/custom': 'custom', '/api/accounts': 'accounts',
  '/api/gatepasses': 'gatepass',
};

/**
 * Routes that are open by design, and why. Every entry is a decision: a request
 * that needs no page because it only ever touches the caller's own row, or one
 * that has to work before anybody is signed in at all.
 *
 * Matched as `METHOD path`, with `:param` still in the path.
 */
const OPEN_BY_DESIGN = new Map([
  // Signing in, and getting back in. These have to work before anybody is
  // signed in, so "no page" is the whole point of them.
  ['POST /api/auth/login', 'sign-in'],
  ['POST /api/auth/logout', 'sign-out — signed-in only, no page involved'],
  ['POST /api/auth/refresh-token', 'token refresh'],
  ['POST /api/auth/forgot-password', 'password recovery, by definition signed out'],
  ['POST /api/auth/verify-reset-code', 'password recovery'],
  ['POST /api/auth/reset-password', 'password recovery'],
  ['POST /api/auth/resend-reset-code', 'password recovery'],
  ['POST /api/auth/check-forgot-token', 'password recovery — is this reset link still live'],
  ['POST /api/auth/check-reset-token', 'password recovery'],
  ['POST /api/auth/check-reset-code', 'password recovery'],
  // The caller's own row, never anybody else's.
  ['PUT /api/profile', "one's own profile"],
  ['POST /api/profile/avatar', "one's own avatar"],
  ['DELETE /api/profile/avatar', "one's own avatar"],
  ['PUT /api/profile/password', "one's own password"],
  ['POST /api/search/click', "one's own search history"],
  ['DELETE /api/search/history', "one's own search history"],
  ['PATCH /api/notifications/:id/read', "one's own notifications"],
  ['PATCH /api/notifications/read-all', "one's own notifications"],
  ['DELETE /api/notifications/:id', "one's own notifications"],
  ['PUT /api/notifications/settings/preferences', "one's own notification preferences"],
  // Each filled slot is judged on its own upload right (uploader.routes.js
  // `authorizeSelectedImports`), so a request carrying no file has nothing to
  // authorise and is refused by the controller as a bad request instead.
  ['POST /api/uploader/batch', 'per-slot grant; an empty batch authorises nothing'],
]);

/**
 * A guard that reads the body has to be given a body it can read, or the probe
 * stops at validation and proves nothing. The bulk endpoints decide which
 * action they are from `operation`, so an empty object is refused as a bad
 * request *before* the permission is consulted — which is not the question
 * being asked here.
 */
const PROBE_BODY = new Map([
  ['POST /api/quotations/bulk', { operation: 'delete', ids: [NOWHERE] }],
  ['POST /api/bookings/bulk', { operation: 'delete', ids: [NOWHERE] }],
  ['POST /api/sales/bulk', { operation: 'delete', ids: [NOWHERE] }],
  ['POST /api/invoices/bulk', { operation: 'delete', ids: [NOWHERE] }],
]);

/**
 * `:kind` means different things on different routers, and a value the router
 * does not recognise falls through every branch to a 404 — which reads as a
 * leak and is only a badly aimed probe. Custom documents come in three kinds;
 * each one is swept separately.
 */
const KIND_VALUES = {
  '/api/custom': ['quotations', 'bookings', 'invoices'],
  '/api/barcode': ['part', 'vehicle'],
};

const results = { checked: 0, skipped: 0, failures: [] };

const paramValue = (name) => {
  if (/id$/i.test(name)) return NOWHERE;
  return {
    type: 'sources', kind: 'part', documentType: 'invoice', collection: 'leads',
    module: 'customers', page: 'customers', slug: 'x', key: 'x', action: 'view',
  }[name] || 'x';
};

/** `/status-collections/:id/items` → `/status-collections/0000…/items` */
const concrete = (routePath) => routePath
  .split('/')
  .map((part) => (part.startsWith(':') ? paramValue(part.slice(1).replace(/[?()].*$/, '')) : part))
  .join('/');

function routeTable() {
  const rows = [];
  for (const [mount, file] of Object.entries(MOUNTS)) {
    const router = require(`../routes/${file}.routes.js`);
    for (const layer of router.stack || []) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (method === 'get' || method === 'head') continue;
        const routePath = mount + (layer.route.path === '/' ? '' : layer.route.path);
        const kinds = routePath.includes('/:kind') ? (KIND_VALUES[mount] || ['x']) : [null];
        for (const kind of kinds) {
          const withKind = kind ? routePath.replace('/:kind', `/${kind}`) : routePath;
          rows.push({ method: method.toUpperCase(), routePath, url: concrete(withKind), file, kind });
        }
      }
    }
  }
  // The same path can be registered several times (one route per branch, with
  // `next('route')` dispatch). Calling it once is enough.
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.method} ${row.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function call(token, method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'DELETE' ? undefined : JSON.stringify(body || {}),
  });
  let reply = null;
  try { reply = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, message: reply?.message || '' };
}

async function connect() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
}

/** A signed-in account that was granted nothing at all: no pages, no jobs. */
async function fixtureUser() {
  const { Role, User } = require('../models');
  let role = await Role.findOne({ name: ROLE_NAME });
  if (!role) role = new Role({ name: ROLE_NAME, displayName: 'No Permission Test Role' });
  role.permissions = [];
  role.jobs = [];
  role.isActive = true;
  await role.save();

  let user = await User.findOne({ email: USER_EMAIL });
  if (!user) {
    user = new User({
      firstName: 'No', lastName: 'Permission', email: USER_EMAIL,
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
  if (!res.ok) throw new Error(`Fixture login failed: ${res.status} ${JSON.stringify(json)}`);
  return json.data?.token || json.token;
}

async function cleanup() {
  const { Role, User } = require('../models');
  await User.deleteMany({ email: USER_EMAIL });
  const role = await Role.findOne({ name: ROLE_NAME });
  if (role) await Role.deleteOne({ _id: role._id });
  console.log('Fixtures removed.');
}

/** Row counts for every collection, so a write that happened cannot hide. */
async function snapshot() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  const counts = {};
  for (const { name } of collections) {
    counts[name] = await mongoose.connection.db.collection(name).countDocuments();
  }
  return counts;
}

/**
 * `logs` and `searchdocuments` grow on every request the server handles — that
 * is the API log and the search index doing their job, not the caller writing
 * anything. Every other collection moving is the finding.
 */
const SIDE_EFFECT_COLLECTIONS = new Set(['logs', 'searchdocuments', 'sessions']);

const diff = (before, after) => Object.keys({ ...before, ...after })
  .filter((name) => !SIDE_EFFECT_COLLECTIONS.has(name))
  .filter((name) => (before[name] || 0) !== (after[name] || 0))
  .map((name) => `${name}: ${before[name] || 0} → ${after[name] || 0}`);

async function sweep(label, token, accept) {
  console.log(`\n=== ${label} ===`);
  const rows = routeTable();
  let ok = 0;
  for (const row of rows) {
    const key = `${row.method} ${row.routePath}`;
    if (OPEN_BY_DESIGN.has(key)) { results.skipped += 1; continue; }
    const res = await call(token, row.method, row.url, PROBE_BODY.get(key));
    results.checked += 1;
    if (accept.includes(res.status)) { ok += 1; continue; }
    // Kinds are swept exhaustively, and not every action exists for every kind
    // (only quotations approve, only invoices take payments). Express itself
    // answers those with its own 404, before any handler — nothing was reached,
    // so there is nothing to guard. A 404 from a controller says something else
    // and is still a failure.
    if (res.status === 404 && res.message === 'Endpoint not found') { results.skipped += 1; continue; }
    results.failures.push({ ...row, status: res.status, message: res.message, sweep: label });
    console.log(`  LEAK  ${row.method} ${row.url}  →  ${res.status} ${res.message}`.slice(0, 160));
  }
  const judged = rows.filter((r) => !OPEN_BY_DESIGN.has(`${r.method} ${r.routePath}`)).length;
  console.log(`  ${ok} of ${judged} refused as they should be`);
  return ok;
}

async function run() {
  await connect();
  if (process.argv.includes('--cleanup')) { await cleanup(); await mongoose.disconnect(); return; }

  const rows = routeTable();
  console.log(`Sweeping ${rows.length} write routes against ${BASE}`);
  console.log(`${OPEN_BY_DESIGN.size} are open by design and are skipped.`);

  // Taken after the fixture, so the role and user the sweep needs are not
  // themselves reported as writes that got through.
  const token = await fixtureUser();
  const before = await snapshot();

  await sweep('Signed out', null, [401]);
  await sweep('Signed in, granted nothing', token, [401, 403]);

  const after = await snapshot();
  const moved = diff(before, after);

  console.log(`\n${results.checked} checks, ${results.failures.length} leaked`);
  if (results.failures.length) {
    console.log('\nRoutes that answered something other than 401/403:');
    const byFile = {};
    results.failures.forEach((f) => { (byFile[f.file] ||= []).push(f); });
    for (const [file, list] of Object.entries(byFile)) {
      console.log(`\n  ${file}.routes.js`);
      list.forEach((f) => console.log(`    ${String(f.status).padEnd(4)} ${f.method.padEnd(6)} ${f.routePath}  ${f.message}`.slice(0, 170)));
    }
  }
  if (moved.length) {
    console.log('\nCollections that changed during the sweep — a write got through:');
    moved.forEach((line) => console.log(`  ${line}`));
  } else {
    console.log('\nNo collection changed size during the sweep.');
  }

  await mongoose.disconnect();
  process.exit(results.failures.length || moved.length ? 1 : 0);
}

run().catch((error) => { console.error(error); process.exit(1); });
