const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const expenseSchema = new mongoose.Schema({
  expenseNumber: { type: String, trim: true, required: [true, 'Expense number is required'] },
  category: { type: String, trim: true, required: [true, 'Expense category is required'] },
  account: { type: String, trim: true },
  // The money account the expense was paid from (Account.model.js).
  paidFromAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  amount: {
    type: Number,
    default: 0,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than zero']
  },
  expenseDate: { type: Date, required: [true, 'Expense date is required'] },
  description: { type: String },
  vendor: { type: String, trim: true },
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'posted'], default: 'draft', trim: true },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

expenseSchema.index({ expenseNumber: 1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ isDeleted: 1 });

expenseSchema.plugin(searchPlugin, { entityType: 'expense' });
const Expense = mongoose.model('Expense', expenseSchema);
module.exports = Expense;
