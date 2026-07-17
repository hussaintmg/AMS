const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const employeeSchema = new mongoose.Schema({
  employeeCode: { type: String, trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email address'
    }
  },
  phone: { type: String, trim: true },
  cnic: { type: String, trim: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  designation: { type: String, trim: true },
  joiningDate: { type: Date },
  salary: { type: Number, min: [0, 'Salary cannot be negative'] },
  status: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

employeeSchema.index({ employeeCode: 1 });
employeeSchema.index({ email: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ isActive: 1 });
employeeSchema.index({ isDeleted: 1 });

employeeSchema.plugin(searchPlugin, { entityType: 'employee' });
const Employee = mongoose.model('Employee', employeeSchema);
module.exports = Employee;
