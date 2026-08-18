/**
 * Migration for the 2026-08-18 permission rebuild.
 *
 * Sixteen actions that used to ride on `edit` (or on nothing) are now granted
 * separately: recording a payment, converting a booking, approving leave,
 * posting to the ledger, generating a barcode, and so on — see ALL_ACTIONS in
 * constants/pageCapabilities.js. A role that could do those things yesterday
 * must still be able to do them today, so every job row that grants `edit`
 * (or, for import, `create`) on a page gets the new actions that page has.
 *
 * The screen-level blocks (columns, drawer, quick-create shortcuts, dropdown
 * scopes) default to "everything", which is what the schema does on its own,
 * so nothing is written for them. Their absence *is* the old behaviour.
 *
 * Idempotent: rerunning finds nothing left to change. Prints a per-role diff.
 *
 * Run from backend/:  node scripts/migrate_role_catalog.js [--dry-run]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const { Role } = require('../models');
const { capabilitiesFor } = require('../constants/pageCapabilities');

const DRY = process.argv.includes('--dry-run');

/** Which existing grant implies each new action. */
const IMPLIED_BY = {
  import: ['create'],
  export: ['edit', 'create'],
  toggleStatus: ['edit'],
  convert: ['edit'],
  assign: ['edit'],
  barcode: ['edit', 'create'],
  recordPayment: ['edit'],
  changePaymentTerm: ['edit'],
  markDelivered: ['edit'],
  createJobCard: ['create', 'edit'],
  postLedger: ['edit'],
  transfer: ['edit'],
  verify: ['edit'],
  generateGrn: ['edit', 'create'],
  lock: ['edit'],
  payout: ['edit'],
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  const roles = await Role.find({ 'jobs.0': { $exists: true } });
  let rolesChanged = 0;
  let grants = 0;

  for (const role of roles) {
    const diff = [];
    for (const job of role.jobs) {
      const actions = job.actions || {};
      const capability = capabilitiesFor(job.pageKey);
      Object.entries(IMPLIED_BY).forEach(([action, sources]) => {
        if (!capability.actions.includes(action)) return;
        if (actions[action] === true) return;
        if (!sources.some((source) => actions[source] === true)) return;
        actions[action] = true;
        diff.push(`${job.pageKey}: +${action}`);
      });
      job.actions = actions;
    }
    if (!diff.length) continue;
    rolesChanged += 1;
    grants += diff.length;
    console.log(`- ${role.name}: ${diff.join(', ')}`);
    if (!DRY) {
      role.markModified('jobs');
      await role.save();
    }
  }

  console.log(`${DRY ? '[dry run] ' : ''}${rolesChanged} role(s) changed, ${grants} grant(s) ${DRY ? 'would be ' : ''}added.`);
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
