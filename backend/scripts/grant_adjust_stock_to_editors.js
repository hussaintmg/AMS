/**
 * One-time migration for the "Increase / decrease stock" grant.
 *
 * POST /parts/:id/adjust used to ride on the parts *edit* permission; it now
 * has its own action (`adjustStock`). Any role whose parts job row already
 * grants edit keeps the ability it had by getting the new action ticked —
 * an administrator can untick it afterwards, which is the point of the split.
 *
 * Idempotent: rerunning finds nothing left to change.
 *
 * Run from backend/:  node scripts/grant_adjust_stock_to_editors.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const { Role } = require('../models');
const { keysForPage } = require('../utils/pageRegistry');

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });

  // Live installations file the parts page under drifted keys ("Parts
  // Inventory", old paths) — resolve every alias, not just the canonical name.
  const partsKeys = new Set(['parts', ...keysForPage('parts')]);

  const roles = await Role.find({ 'jobs.0': { $exists: true } });
  let changed = 0;
  for (const role of roles) {
    let touched = false;
    for (const job of role.jobs) {
      if (!partsKeys.has(job.pageKey)) continue;
      if (job.actions?.edit === true && job.actions?.adjustStock !== true) {
        job.actions.adjustStock = true;
        touched = true;
      }
    }
    if (touched) {
      await role.save();
      changed += 1;
      console.log(`  ${role.name}: parts edit → adjustStock granted`);
    }
  }
  console.log(`${changed} role(s) updated.`);
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
