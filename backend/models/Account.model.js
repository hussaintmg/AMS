const mongoose = require('mongoose');

/**
 * A money account: where cash actually sits.
 *
 * Petty cash, IBFT (bank transfer), the card machine, online payments and the
 * internal company account — five to start with (scripts/seed_accounts.js),
 * more if the client wants them. Every expense, salary advance and payment
 * names the account it moved through, and the balance sheet is read straight
 * out of the ledger rows that carry `accountRef` (LedgerEntry.model.js).
 *
 * `limit` is what an account may hold before someone should move money on —
 * petty cash is capped at 50,000 by default; when the balance passes it the
 * Accounts screen offers a transfer to the internal company account. Editable
 * per account (client decision, 2026-08-18).
 *
 * `currentBalance` is a running figure kept by services/accounts.service.js
 * for the cards; the balance sheet never trusts it and always re-sums the
 * ledger.
 */
const ACCOUNT_TYPES = ['petty_cash', 'ibft', 'card_machine', 'online_payment', 'internal_company', 'bank', 'other'];
const ACCOUNT_STATUSES = ['active', 'in_process', 'completed', 'closed'];

const accountSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Account name is required'], trim: true },
  code: { type: String, trim: true, default: '' },
  type: { type: String, enum: ACCOUNT_TYPES, default: 'other' },
  description: { type: String, trim: true, default: '' },
  openingBalance: { type: Number, default: 0 },
  currentBalance: { type: Number, default: 0 },
  // 0 = no limit.
  limit: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ACCOUNT_STATUSES, default: 'active' },
  // The account petty cash is swept into when it passes its limit.
  sweepTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  isDefault: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

accountSchema.index({ name: 1 }, { unique: true });
accountSchema.index({ type: 1 });
accountSchema.index({ isActive: 1, sortOrder: 1 });

const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);

module.exports = Account;
module.exports.ACCOUNT_TYPES = ACCOUNT_TYPES;
module.exports.ACCOUNT_STATUSES = ACCOUNT_STATUSES;
