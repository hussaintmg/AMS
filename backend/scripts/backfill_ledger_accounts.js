/**
 * Point existing ledger rows at the money accounts they belong to.
 *
 * Before 2026-08-18 the ledger only knew an account by name — every expense
 * and salary advance was credited to "Cash". The balance sheet reads rows by
 * `accountRef`, so rows written before the ref existed would be invisible to
 * it. This maps names to accounts (Cash → Petty Cash, plus any row whose name
 * exactly matches an account) and refreshes each account's running balance.
 *
 * Dry run (default) prints what would change; --apply writes it. Idempotent.
 *
 *   node scripts/backfill_ledger_accounts.js
 *   node scripts/backfill_ledger_accounts.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Account = require('../models/Account.model');
const { LedgerEntry } = require('../models');
const { syncBalance } = require('../services/accounts.service');

const APPLY = process.argv.includes('--apply');
/** Legacy names → the account type they meant. */
const ALIASES = { cash: 'petty_cash', 'petty cash': 'petty_cash', bank: 'ibft', 'bank transfer': 'ibft', ibft: 'ibft', card: 'card_machine', 'card machine': 'card_machine', online: 'online_payment', 'online payment': 'online_payment' };

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  const accounts = await Account.find({}).lean();
  if (!accounts.length) { console.log('No accounts yet — run scripts/seed_accounts.js first.'); await mongoose.disconnect(); return; }
  const byName = new Map(accounts.map((account) => [account.name.toLowerCase(), account]));
  const byType = new Map();
  accounts.forEach((account) => { if (!byType.has(account.type) || account.isDefault) byType.set(account.type, account); });

  const names = await LedgerEntry.distinct('account', { accountRef: null, isDeleted: false });
  let touched = 0;
  const changed = new Set();
  for (const name of names) {
    const key = String(name || '').trim().toLowerCase();
    const target = byName.get(key) || (ALIASES[key] ? byType.get(ALIASES[key]) : null);
    if (!target) { console.log(`- "${name}": no money account (left as is)`); continue; }
    const count = await LedgerEntry.countDocuments({ account: name, accountRef: null, isDeleted: false });
    console.log(`- "${name}" → ${target.name}: ${count} row(s)${APPLY ? '' : ' would be updated'}`);
    if (APPLY && count) {
      await LedgerEntry.updateMany({ account: name, accountRef: null, isDeleted: false }, { $set: { accountRef: target._id } });
      touched += count; changed.add(String(target._id));
    }
  }
  if (APPLY) for (const id of changed) console.log(`  balance ${id}: ${await syncBalance(id)}`);
  console.log(APPLY ? `${touched} row(s) updated.` : 'Dry run. Re-run with --apply to write.');
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
