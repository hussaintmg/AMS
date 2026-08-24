/**
 * Five accounts that look like the people who actually use this system, so a
 * change can be tried the way it will be met.
 *
 * The permission suites build a role, ask one question and throw it away. That
 * proves the engine works; it does not let anyone sign in and see what a
 * storekeeper sees. These roles stay, they are shaped like real jobs, and each
 * one is deliberately short of something — the storekeeper cannot delete, the
 * accountant cannot raise an invoice, the auditor cannot write at all — because
 * a role that can do everything tells you nothing when a screen misbehaves.
 *
 *   node scripts/seed_test_accounts.js          # create or refresh them
 *   node scripts/seed_test_accounts.js --list   # print the credentials again
 *   node scripts/seed_test_accounts.js --cleanup
 *
 * These are demo accounts on a development database. Do not seed them on a
 * live install: the passwords are in this file.
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const { PAGE_CAPABILITIES } = require('../constants/pageCapabilities');

const PASSWORD = 'TestRole#2026';
const EMAIL_DOMAIN = '@amserp.test';

/**
 * `pages` is what the role may open; `can` is what it may do there. A page in
 * `pages` with no entry in `can` is view-only, which is the same rule the server
 * applies to a role nobody has configured.
 *
 * `quickCreate` limits the "+ Create X" shortcuts inside that page's forms, and
 * is the grant that decides whether the endpoint behind the shortcut answers.
 */
const PROFILES = [
  {
    role: 'test_sales_executive',
    label: 'Sales Executive',
    user: { firstName: 'Sana', lastName: 'Executive' },
    note: 'Raises quotations and bookings, keeps her own customers. Cannot delete, cannot invoice.',
    pages: ['dashboard', 'customers', 'leads', 'quotations', 'bookings', 'vehicles', 'vehicle_scan'],
    can: {
      customers: ['create', 'edit'],
      leads: ['create', 'edit', 'convert'],
      quotations: ['create', 'edit', 'sendEmail', 'downloadPdf'],
      bookings: ['create', 'edit'],
      vehicle_scan: ['create'],
    },
    scope: { quotations: 'own', bookings: 'own', leads: 'own' },
  },
  {
    role: 'test_storekeeper',
    label: 'Storekeeper',
    user: { firstName: 'Bilal', lastName: 'Store' },
    note: 'Adds parts and moves stock in. Cannot take stock out, cannot delete, and may name a category without being handed Vehicle Master Data.',
    pages: ['dashboard', 'parts', 'warehouses', 'gatepass_in'],
    can: {
      parts: ['create', 'edit', 'stockIncrease', 'barcode'],
      gatepass_in: ['create', 'edit', 'downloadPdf'],
    },
    // The point of the shortcut grant: categories and suppliers from inside the
    // part form, without the Vehicle Master Data page.
    quickCreate: { parts: ['category', 'supplier', 'source_type'] },
  },
  {
    role: 'test_accountant',
    label: 'Accountant',
    user: { firstName: 'Hina', lastName: 'Accounts' },
    note: 'Takes payments and posts to the ledger. Reads invoices; does not raise them.',
    pages: ['dashboard', 'invoices', 'part_invoices', 'accounts', 'ledger', 'expenses', 'payment_methods', 'reports'],
    can: {
      invoices: ['recordPayment', 'downloadPdf', 'sendEmail'],
      part_invoices: ['recordPayment', 'downloadPdf'],
      accounts: ['create', 'edit', 'transfer'],
      ledger: ['create', 'export'],
      expenses: ['create', 'edit', 'postLedger'],
    },
  },
  {
    role: 'test_service_advisor',
    label: 'Service Advisor',
    user: { firstName: 'Kamran', lastName: 'Service' },
    note: 'Books appointments and opens job cards. Raises a customer from the booking form, but not a new service type.',
    pages: ['dashboard', 'customers', 'service_appointments', 'services', 'gatepass_in', 'gatepass_verify'],
    can: {
      customers: ['create', 'edit'],
      service_appointments: ['create', 'edit', 'createJobCard'],
      services: ['create', 'edit'],
      gatepass_verify: ['verify'],
    },
    quickCreate: { service_appointments: ['customer'], services: ['customer'] },
  },
  {
    role: 'test_auditor',
    label: 'Auditor (read only)',
    user: { firstName: 'Nadia', lastName: 'Audit' },
    note: 'Sees a great deal and may change none of it — the shape a role takes when Role Jobs has never been opened for it.',
    pages: ['dashboard', 'customers', 'leads', 'quotations', 'bookings', 'sales_orders', 'invoices', 'parts', 'vehicles', 'reports', 'ledger'],
    can: {},
  },
];

const emailFor = (profile) => `${profile.role.replace(/^test_/, '').replace(/_/g, '.')}${EMAIL_DOMAIN}`;

async function connect() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
}

/** Only actions the page really has; a typo here would grant nothing silently. */
function actionsFor(pageKey, wanted = []) {
  const known = new Set(PAGE_CAPABILITIES[pageKey]?.actions || []);
  const actions = { view: true };
  const unknown = [];
  wanted.forEach((action) => {
    if (known.has(action)) actions[action] = true;
    else unknown.push(action);
  });
  return { actions, unknown };
}

async function seed() {
  const { Role, User, Page } = require('../models');
  const warnings = [];
  const created = [];

  for (const profile of PROFILES) {
    const pages = await Page.find({ name: { $in: profile.pages } }).lean();
    const missing = profile.pages.filter((name) => !pages.some((page) => page.name === name));
    if (missing.length) warnings.push(`${profile.role}: no Page document for ${missing.join(', ')}`);

    const jobs = pages.map((page) => {
      const { actions, unknown } = actionsFor(page.name, profile.can[page.name] || []);
      if (unknown.length) warnings.push(`${profile.role}: ${page.name} has no action "${unknown.join('", "')}"`);
      const quick = profile.quickCreate?.[page.name];
      return {
        pageKey: page.name,
        module: page.module || page.name,
        actions,
        dataScope: { mode: profile.scope?.[page.name] || 'all', roles: [], users: [] },
        fields: { mode: 'all', allowed: [] },
        ...(quick ? { quickCreate: { mode: 'selected', create: quick, edit: quick } } : {}),
      };
    });

    let role = await Role.findOne({ name: profile.role });
    if (!role) role = new Role({ name: profile.role });
    role.displayName = profile.label;
    role.permissions = pages.map((page) => ({
      pageKey: page.name, path: page.path, module: page.module, canView: true, isActive: true,
    }));
    role.jobs = jobs;
    role.isActive = true;
    await role.save();

    const email = emailFor(profile);
    let user = await User.findOne({ email });
    if (!user) user = new User({ email, ...profile.user });
    user.firstName = profile.user.firstName;
    user.lastName = profile.user.lastName;
    user.password = PASSWORD;
    user.role = role._id;
    user.status = 'active';
    user.isActive = true;
    user.customPermissions = [];
    await user.save();

    created.push({ ...profile, email, pages: pages.length });
  }

  return { created, warnings };
}

async function cleanup() {
  const { Role, User } = require('../models');
  for (const profile of PROFILES) {
    await User.deleteMany({ email: emailFor(profile) });
    const role = await Role.findOne({ name: profile.role });
    if (role) await Role.deleteOne({ _id: role._id });
  }
  console.log('Demo accounts removed.');
}

function print(rows) {
  console.log(`\nPassword for all of them: ${PASSWORD}\n`);
  rows.forEach((row) => {
    console.log(`  ${row.label}`);
    console.log(`    ${row.email}`);
    console.log(`    ${row.pages} page(s): ${row.pagesList || ''}`);
    console.log(`    ${row.note}\n`);
  });
}

async function run() {
  await connect();
  if (process.argv.includes('--cleanup')) { await cleanup(); await mongoose.disconnect(); return; }

  if (process.argv.includes('--list')) {
    print(PROFILES.map((profile) => ({ ...profile, email: emailFor(profile), pages: profile.pages.length, pagesList: profile.pages.join(', ') })));
    await mongoose.disconnect();
    return;
  }

  const { created, warnings } = await seed();
  console.log(`Seeded ${created.length} demo account(s).`);
  print(created.map((row) => ({ ...row, pagesList: row.pages ? PROFILES.find((p) => p.role === row.role).pages.join(', ') : '' })));
  if (warnings.length) {
    console.log('Warnings:');
    warnings.forEach((line) => console.log(`  - ${line}`));
  }
  await mongoose.disconnect();
}

run().catch((error) => { console.error(error); process.exit(1); });
