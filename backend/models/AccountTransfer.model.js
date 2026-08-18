const mongoose = require('mongoose');

/**
 * Money moved from one account to another — petty cash swept into the
 * internal company account when it passes its limit, cash banked, a float
 * topped up. Posts a balanced pair to the ledger (debit the receiving account,
 * credit the giving one) through services/accounts.service.js, so the balance
 * sheet and the transfer list can never disagree.
 */
const accountTransferSchema = new mongoose.Schema({
  transferNumber: { type: String, trim: true, required: true },
  fromAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: [true, 'From account is required'] },
  toAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: [true, 'To account is required'] },
  amount: { type: Number, required: [true, 'Amount is required'], min: [0.01, 'Amount must be greater than zero'] },
  transferDate: { type: Date, default: Date.now },
  reference: { type: String, trim: true, default: '' },
  notes: { type: String, default: '' },
  // Why it happened: by hand, or the petty-cash limit sweep.
  reason: { type: String, enum: ['manual', 'limit_sweep', 'float_topup', 'banking'], default: 'manual' },
  status: { type: String, enum: ['completed', 'reversed'], default: 'completed' },
  reversedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

accountTransferSchema.index({ transferNumber: 1 });
accountTransferSchema.index({ fromAccount: 1, transferDate: -1 });
accountTransferSchema.index({ toAccount: 1, transferDate: -1 });

module.exports = mongoose.models.AccountTransfer || mongoose.model('AccountTransfer', accountTransferSchema);
