const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const ledgerEntrySchema = new mongoose.Schema({
  transactionDate: { type: Date },
  referenceType: { type: String, enum: ['expense', 'leave', 'salary', 'manual'], trim: true },
  referenceId: { type: String, trim: true },
  account: { type: String, trim: true },
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
ledgerEntrySchema.index({ referenceType: 1, referenceId: 1 });
ledgerEntrySchema.index({ isDeleted: 1 });

ledgerEntrySchema.plugin(searchPlugin, { entityType: 'ledger' });
const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
module.exports = LedgerEntry;
