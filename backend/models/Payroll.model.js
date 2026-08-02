const mongoose = require('mongoose');

/**
 * One handover of cash (or a transfer) against a month's salary. Salaries are
 * often paid in instalments here, so a line keeps every payment rather than a
 * single "paid" flag — that is what makes the remaining figure trustworthy.
 */
const salaryPaymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: [0.01, 'Payment must be greater than zero'] },
  paidOn: { type: Date, default: Date.now },
  method: { type: String, trim: true, default: 'cash' },
  reference: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: true, timestamps: true });

const payrollLineSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  grossAmount: { type: Number, default: 0, min: [0, 'Gross amount cannot be negative'] },
  deductions: { type: Number, default: 0, min: [0, 'Deductions cannot be negative'] },
  // Salary paid early and now being taken back. Kept apart from `deductions`
  // so the payslip can show what was held against an advance and what is left
  // to recover, rather than one lump the employee cannot account for.
  advanceDeduction: { type: Number, default: 0, min: [0, 'Advance deduction cannot be negative'] },
  advanceBalance: { type: Number, default: 0, min: [0, 'Advance balance cannot be negative'] },
  netAmount: { type: Number, default: 0 },
  // Sum of `payments`, kept on the line so listing a period does not have to
  // add up every instalment.
  paidAmount: { type: Number, default: 0, min: [0, 'Paid amount cannot be negative'] },
  payments: { type: [salaryPaymentSchema], default: [] },
  notes: { type: String, default: '' }
}, { _id: true });

/** What is still owed to the employee for this month. */
payrollLineSchema.virtual('remainingAmount').get(function () {
  return Math.max(0, Math.round(((this.netAmount || 0) - (this.paidAmount || 0)) * 100) / 100);
});

const payrollSchema = new mongoose.Schema({
  label: { type: String, required: [true, 'Label is required'], trim: true },
  periodStart: { type: Date, required: [true, 'Period start is required'] },
  periodEnd: { type: Date, required: [true, 'Period end is required'] },
  status: {
    type: String,
    enum: { values: ['draft', 'locked', 'posted'], message: 'Invalid payroll status' },
    default: 'draft'
  },
  lines: { type: [payrollLineSchema], default: [] },
  postedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true
});

payrollSchema.index({ label: 1 });
payrollSchema.index({ status: 1 });
payrollSchema.index({ periodStart: -1 });

// A period only makes sense when it ends on or after it starts.
payrollSchema.pre('validate', async function () {
  if (this.periodStart && this.periodEnd && this.periodEnd < this.periodStart) {
    this.invalidate('periodEnd', 'Period end must be on or after period start');
  }
});

const Payroll = mongoose.model('Payroll', payrollSchema);

module.exports = Payroll;
