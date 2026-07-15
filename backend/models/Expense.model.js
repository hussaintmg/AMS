const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  expenseNumber: { type: String, trim: true },
  category: { type: String, trim: true },
  account: { type: String, trim: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  amount: { type: Number, default: 0 },
  expenseDate: { type: Date },
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

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
