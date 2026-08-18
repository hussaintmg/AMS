const mongoose = require('mongoose');

/**
 * Something the company owes and will pay later — "we bought a generator, we
 * pay next month". The mirror of a credit invoice: that is a receivable, this
 * is a payable. Payments against it name the account the money left, and
 * `status` follows the numbers (open → partial → settled, or overdue past the
 * due date) the way SalaryAdvance and the credit invoices already do.
 */
const payablePaymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0.01 },
  paidOn: { type: Date, default: Date.now },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  reference: { type: String, trim: true, default: '' },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: true, timestamps: true });

const payableSchema = new mongoose.Schema({
  payableNumber: { type: String, trim: true, required: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  vendorName: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  category: { type: String, trim: true, default: '' },
  amount: { type: Number, required: [true, 'Amount is required'], min: [0.01, 'Amount must be greater than zero'] },
  paidAmount: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  issuedOn: { type: Date, default: Date.now },
  dueDate: { type: Date, default: null },
  sourceType: { type: String, enum: ['purchase', 'expense', 'manual'], default: 'manual' },
  sourceId: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['open', 'partial', 'settled', 'overdue', 'cancelled'], default: 'open' },
  payments: { type: [payablePaymentSchema], default: [] },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

payableSchema.index({ payableNumber: 1 });
payableSchema.index({ status: 1, dueDate: 1 });
payableSchema.index({ vendor: 1 });

// Status follows the numbers rather than being set by hand.
payableSchema.pre('save', function payableStatus() {
  const amount = Number(this.amount) || 0;
  const paid = Math.min(amount, Number(this.paidAmount) || 0);
  this.paidAmount = paid;
  this.balance = Math.round((amount - paid) * 100) / 100;
  if (this.status === 'cancelled') return;
  if (this.balance <= 0.009) this.status = 'settled';
  else if (this.dueDate && new Date(this.dueDate) < new Date()) this.status = 'overdue';
  else this.status = paid > 0 ? 'partial' : 'open';
});

module.exports = mongoose.models.Payable || mongoose.model('Payable', payableSchema);
