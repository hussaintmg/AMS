/**
 * One-time backfill for payroll periods posted before salary payments existed.
 *
 * The old posting wrote `Dr Salaries Expense / Cr Cash` — it assumed the whole
 * net was handed over the moment a period was posted. Payments are now recorded
 * separately, so those periods would otherwise read as fully unpaid and a clerk
 * clicking "Pay everyone" would send the cash out a second time.
 *
 * A period is identified as old by its ledger rows: the old posting credited
 * Cash, the new one credits Salaries Payable. Only the former is backfilled, and
 * no new ledger rows are written — that money already left.
 *
 *   node scripts/backfill_payroll_payments.js          # report only
 *   node scripts/backfill_payroll_payments.js --apply  # write the changes
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Payroll = require('../models/Payroll.model');
const LedgerEntry = require('../models/LedgerEntry.model');

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const apply = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || 'amserp' });

  const periods = await Payroll.find({ status: 'posted' });
  const touched = [];

  for (const period of periods) {
    const paidCash = await LedgerEntry.exists({
      referenceType: 'salary',
      referenceId: `PR-${period._id}`,
      account: 'Cash',
      credit: { $gt: 0 },
      isDeleted: false,
    });
    // Posted under the new rules — its salaries are genuinely still owed.
    if (!paidCash) continue;

    let settled = 0;
    for (const line of period.lines) {
      const net = round2(line.netAmount);
      if (net <= 0 || round2(line.paidAmount) >= net || (line.payments || []).length) continue;
      line.paidAmount = net;
      line.payments.push({
        amount: net,
        paidOn: period.postedAt || period.periodEnd,
        method: 'cash',
        notes: 'Settled at posting, before salary payments were tracked separately.',
      });
      settled = round2(settled + net);
    }

    if (!settled) continue;
    touched.push({ label: period.label, settled });
    if (apply) await period.save();
  }

  const total = round2(touched.reduce((sum, t) => sum + t.settled, 0));
  for (const t of touched) console.log(`${apply ? 'settled' : 'would settle'}  ${t.label.padEnd(28)} ${t.settled}`);
  console.log(`\n${touched.length} period(s), ${total} total.`);
  if (!apply && touched.length) console.log('Re-run with --apply to write these.');

  await mongoose.disconnect();
})().catch((error) => { console.error(error.message); process.exit(1); });
