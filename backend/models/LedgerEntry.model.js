const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const ledgerEntrySchema = new mongoose.Schema({
  transactionDate: { type: Date },
  // 'booking_deposit' is the money taken when a booking is raised, kept apart
  // from 'invoice_payment' so converting the booking can carry it across
  // without banking it twice.
  referenceType: { type: String, enum: ['expense', 'leave', 'salary', 'manual', 'advance', 'transfer', 'payable', 'invoice_payment', 'booking_deposit', 'account_adjust'], trim: true },
  referenceId: { type: String, trim: true },
  // The account name as posted (kept: reports and the journal screen read it),
  // and, since 2026-08-18, the money account it belongs to. Rows written
  // before then carry only the name; scripts/backfill_ledger_accounts.js maps
  // them (Cash → Petty Cash) so the balance sheet sees them too.
  account: { type: String, trim: true },
  accountRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  description: { type: String },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

ledgerEntrySchema.index({ transactionDate: -1 });
ledgerEntrySchema.index({ account: 1 });
ledgerEntrySchema.index({ accountRef: 1, transactionDate: -1 });
ledgerEntrySchema.index({ referenceType: 1, referenceId: 1 });
ledgerEntrySchema.index({ isDeleted: 1 });

ledgerEntrySchema.plugin(searchPlugin, { entityType: 'ledger' });
const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
module.exports = LedgerEntry;
