/**
 * Does every page gate agree with what the role was actually granted?
 *
 * Builds a role holding exactly the pages you name, signs a user in as it, and
 * asks one representative read endpoint per page. A page the role holds must
 * answer; a page it does not hold must refuse. Anything else is printed as a
 * LEAK (data served to a role that was never given the page) or a BLOCK (a grant
 * the API does not honour).
 *
 * This is the check that found F1–F5 in PERMISSION-AUDIT.md. It is written
 * to run against any installation, so the same sweep can be pointed at a live
 * server with a token rather than a fresh role:
 *
 *   node scripts/audit_role_page_gates.js                      # build a role, sweep every page
 *   node scripts/audit_role_page_gates.js --pages parts,customers
 *   node scripts/audit_role_page_gates.js --token <jwt>        # sweep whoever that token is
 *
 * Reads only. Nothing here creates a business document.
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const BASE = process.env.TEST_API_BASE || `http://localhost:${process.env.PORT || 3002}/api`;
const ROLE_NAME = 'page_gate_audit_role';
const USER_EMAIL = 'page.gate.audit@amserp.local';
const USER_PASSWORD = 'GateAudit#2026';

/**
 * One read per page. Chosen to be the endpoint the screen itself opens with, so
 * a pass here means the page genuinely works rather than that some side route
 * happened to answer.
 */
const PROBES = {
  dashboard: '/dashboard/stats',
  leads: '/leads?limit=1',
  customers: '/customers?limit=1',
  vehicles: '/vehicles?limit=1',
  parts: '/parts?limit=1',
  warehouses: '/warehouses',
  sales_orders: '/sales?limit=1',
  quotations: '/quotations?limit=1',
  invoices: '/invoices?limit=1',
  bookings: '/bookings?limit=1',
  part_quotations: '/parts-sales/quotations?limit=1',
  part_invoices: '/parts-sales/invoices?limit=1',
  dispatch: '/sales/dispatched?limit=1',
  services: '/services/job-cards?limit=1',
  service_appointments: '/services/appointments?limit=1',
  service_master: '/service-master/types',
  vehicle_master: '/vehicle-master/makes',
  lead_master: '/lead-master/stats',
  reports: '/reports',
  employees: '/employees?limit=1',
  leaves: '/leaves?limit=1',
  expenses: '/expenses?limit=1',
  ledger: '/ledger?limit=1',
  payroll: '/payroll/periods',
  settings: '/erp-settings/settings',
  user_management: '/admin/users?limit=1',
  role_management: '/admin/roles',
  department_management: '/admin/departments',
  status_management: '/admin/statuses?limit=1',
  logs: '/logs?limit=1',
  email_templates: '/email/templates',
  pdf_management: '/pdf-management/templates',
};

/**
 * Pages whose probe is legitimately reachable without holding the page, so a
 * 200 there is not a leak. Kept short and justified — every entry is a decision
 * recorded in PERMISSION-AUDIT.md.
 */
const OPEN_BY_DESIGN = new Set([
  // Service types and labour rates are pickers on the job-card form.
  'service_master',
  // Own logs only, scoped by log permissions rather than by page.
  'logs',
]);

const arg = (name, fallback = '') => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const call = async (token, url) => {
  const res = await fetch(`${BASE}${url}`, {
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return res.status;
};

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body?.data?.token) throw new Error(`login failed: ${res.status} ${body?.message || ''}`);
  return body.data.token;
}

/** A role holding exactly `pages`, and a user wearing it. */
async function buildRole(pages) {
  const { Role, User, Page } = require('../models');
  const docs = await Page.find({ name: { $in: pages } }).lean();
  let role = await Role.findOne({ name: ROLE_NAME });
  if (!role) role = new Role({ name: ROLE_NAME, displayName: 'Page Gate Audit' });
  role.permissions = docs.map((page) => ({
    pageKey: page.name, path: page.path, module: page.module, canView: true, isActive: true,
  }));
  role.jobs = docs.map((page) => ({
    pageKey: page.name, module: page.module,
    actions: { view: true },
    dataScope: { mode: 'all', roles: [], users: [] }, fields: { mode: 'all', allowed: [] },
  }));
  role.isActive = true;
  await role.save();

  let user = await User.findOne({ email: USER_EMAIL });
  if (!user) user = new User({ firstName: 'Gate', lastName: 'Audit', email: USER_EMAIL });
  user.password = USER_PASSWORD;
  user.role = role._id;
  user.customPermissions = [];
  user.status = 'active';
  user.isActive = true;
  await user.save();
  return docs.map((page) => page.name);
}

const cleanup = async () => {
  const { Role, User } = require('../models');
  await User.deleteOne({ email: USER_EMAIL });
  await Role.deleteOne({ name: ROLE_NAME });
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
  const suppliedToken = arg('token');
  let token = suppliedToken;
  let granted;

  try {
    if (!token) {
      const requested = arg('pages', 'parts,customers,part_quotations,part_invoices,part_scan,reports').split(',').map((s) => s.trim());
      granted = new Set(await buildRole(requested));
      token = await login(USER_EMAIL, USER_PASSWORD);
      console.log(`Role holds: ${[...granted].join(', ')}\n`);
    } else {
      const me = await (await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
      granted = new Set((me?.data?.role?.permissions || []).filter((p) => p.canView).map((p) => p.pageKey));
      console.log(`Token is ${me?.data?.email} (${me?.data?.role?.name}), holding ${granted.size} page(s)\n`);
    }

    const problems = [];
    let ok = 0;
    for (const [page, url] of Object.entries(PROBES)) {
      const status = await call(token, url);
      const answered = status >= 200 && status < 300;
      const held = granted.has(page);
      if (answered === held || (answered && !held && OPEN_BY_DESIGN.has(page))) {
        ok += 1;
        continue;
      }
      problems.push({ page, url, status, held, verdict: answered ? 'LEAK' : 'BLOCKED' });
    }

    console.log(`${ok} of ${Object.keys(PROBES).length} page gates behaved as granted.`);
    if (problems.length) {
      console.log('\nProblems:');
      problems.forEach((p) => console.log(
        `  ${p.verdict.padEnd(8)} ${p.page.padEnd(22)} HTTP ${p.status}  ${p.held ? 'granted but refused' : 'served without the page'}  (${p.url})`,
      ));
      process.exitCode = 1;
    } else {
      console.log('No leaks and no wrongly-blocked pages.');
    }
  } finally {
    if (!suppliedToken) await cleanup();
    await mongoose.disconnect();
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
