const mongoose = require('mongoose');

const payrollLineSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  grossAmount: { type: Number, default: 0, min: [0, 'Gross amount cannot be negative'] },
  deductions: { type: Number, default: 0, min: [0, 'Deductions cannot be negative'] },
  netAmount: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, { _id: true });

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
