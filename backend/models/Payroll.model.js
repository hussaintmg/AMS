const mongoose = require('mongoose');

const payrollLineSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  basicSalary: { type: Number, default: 0 },
  allowances: { type: Number, default: 0 },
  deductions: { type: Number, default: 0 },
  netSalary: { type: Number, default: 0 },
  status: { type: String, trim: true }
}, { _id: false });

const payrollSchema = new mongoose.Schema({
  periodName: { type: String, trim: true },
  startDate: { type: Date },
  endDate: { type: Date },
  status: { type: String, trim: true },
  lines: { type: [payrollLineSchema], default: [] }
}, {
  timestamps: true
});

payrollSchema.index({ periodName: 1 });
payrollSchema.index({ status: 1 });

const Payroll = mongoose.model('Payroll', payrollSchema);

module.exports = Payroll;
