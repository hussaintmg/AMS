/**
 * Migration for the split stock-adjustment grants.
 *
 * POST /parts/:id/adjust used to ride on the parts *edit* permission, then
 * briefly on a combined `adjustStock` action. It now takes two separate grants
 * — `stockIncrease` and `stockDecrease` — so a goods-in role can be allowed to
 * add stock without being allowed to remove it, and vice versa.
 *
 * Any role whose parts job row grants edit (or carries the old combined
 * adjustStock) gets both new grants, keeping the ability it already had; an
 * administrator then unticks whichever direction a role should lose.
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
      const hadAbility = job.actions?.edit === true || job.actions?.adjustStock === true;
      if (!hadAbility) continue;
      if (job.actions.stockIncrease !== true) { job.actions.stockIncrease = true; touched = true; }
      if (job.actions.stockDecrease !== true) { job.actions.stockDecrease = true; touched = true; }
    }
    if (touched) {
      await role.save();
      changed += 1;
      console.log(`  ${role.name}: parts edit/adjustStock → stockIncrease + stockDecrease granted`);
    }
  }
  console.log(`${changed} role(s) updated.`);
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
