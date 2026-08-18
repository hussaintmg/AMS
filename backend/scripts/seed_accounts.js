/**
 * Seed the five money accounts the client asked for (2026-08-18):
 *
 *   Petty Cash (limit 50,000, swept into Internal Company Account) · IBFT ·
 *   Card Machine · Online Payment · Internal Company Account
 *
 * Idempotent: an account that already exists (by name) is left exactly as it
 * is — its limit, balance and status belong to the client once seeded. Also
 * links the petty cash account's `sweepTo` when it is unset.
 *
 * Run from backend/:  node scripts/seed_accounts.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Account = require('../models/Account.model');

const ACCOUNTS = [
  { name: 'Petty Cash', code: 'PETTY', type: 'petty_cash', limit: 50000, isDefault: true, sortOrder: 1, description: 'Cash in hand at the counter' },
  { name: 'IBFT', code: 'IBFT', type: 'ibft', sortOrder: 2, description: 'Bank transfers received / sent' },
  { name: 'Card Machine', code: 'CARD', type: 'card_machine', sortOrder: 3, description: 'Card terminal settlements' },
  { name: 'Online Payment', code: 'ONLINE', type: 'online_payment', sortOrder: 4, description: 'Online / wallet payments' },
  { name: 'Internal Company Account', code: 'INTERNAL', type: 'internal_company', isDefault: true, sortOrder: 5, description: 'The company account petty cash is swept into' },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  let created = 0;
  for (const spec of ACCOUNTS) {
    const existing = await Account.findOne({ name: new RegExp(`^${spec.name}$`, 'i') });
    if (existing) { console.log(`- ${spec.name}: exists`); continue; }
    await Account.create({ ...spec, openingBalance: 0, currentBalance: 0, status: 'active', isActive: true });
    created += 1;
    console.log(`- ${spec.name}: created`);
  }
  const petty = await Account.findOne({ type: 'petty_cash' }).sort({ sortOrder: 1 });
  const internal = await Account.findOne({ type: 'internal_company' }).sort({ sortOrder: 1 });
  if (petty && internal && !petty.sweepTo) { petty.sweepTo = internal._id; await petty.save(); console.log(`- ${petty.name} sweeps to ${internal.name}`); }
  console.log(`${created} account(s) created.`);
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
