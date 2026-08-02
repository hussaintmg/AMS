const mongoose = require('mongoose');

/**
 * Money handed to an employee ahead of payday.
 *
 * The company is owed the amount back, so an advance behaves like a small
 * receivable: `amount` is what was given, `recovered` is what has come back
 * (through payroll deductions or a cash repayment), and the difference is the
 * balance still outstanding. Payroll reads that balance to work out how much to
 * hold back from the next salary.
 */
const salaryAdvanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: [true, 'Employee is required'] },
  amount: {
    type: Number,
    required: [true, 'Advance amount is required'],
    min: [0.01, 'Advance amount must be greater than zero'],
  },
  issuedOn: { type: Date, default: Date.now },
  reason: { type: String, trim: true, default: '' },
  // Never exceeds `amount` — the controller caps every recovery.
  recovered: { type: Number, default: 0, min: [0, 'Recovered amount cannot be negative'] },
  status: {
    type: String,
    enum: { values: ['outstanding', 'settled', 'cancelled'], message: 'Invalid advance status' },
    default: 'outstanding',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

salaryAdvanceSchema.index({ employee: 1, status: 1 });
salaryAdvanceSchema.index({ issuedOn: -1 });

/** What is still owed. Cancelled advances owe nothing. */
salaryAdvanceSchema.virtual('balance').get(function () {
  if (this.status === 'cancelled') return 0;
  return Math.max(0, Math.round(((this.amount || 0) - (this.recovered || 0)) * 100) / 100);
});

// Status follows the numbers rather than being set by hand, so a fully
// recovered advance can never sit in the "outstanding" list.
salaryAdvanceSchema.pre('save', async function () {
  if (this.recovered > this.amount) this.recovered = this.amount;
  if (this.status !== 'cancelled') {
    this.status = this.recovered >= this.amount ? 'settled' : 'outstanding';
  }
});

const SalaryAdvance = mongoose.model('SalaryAdvance', salaryAdvanceSchema);

module.exports = SalaryAdvance;
