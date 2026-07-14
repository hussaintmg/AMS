const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  customerCode: { type: String, unique: true, trim: true },
  firstName: { type: String, trim: true, default: '' },
  lastName: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  alternatePhone: { type: String, trim: true, default: '' },
  customerType: { type: String, enum: ['individual', 'corporate'], default: 'individual' },
  companyName: { type: String, trim: true, default: '' },
  source: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadSource', default: null },
  type: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadType', default: null },
  status: { type: String, default: '' },
  description: { type: String, trim: true, default: '' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  address: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
  country: { type: String, trim: true, default: 'Pakistan' },
  zipCode: { type: String, trim: true, default: '' },
  leadRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

customerSchema.virtual('name').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ isActive: 1, deletedAt: 1 });
customerSchema.index({ customerType: 1 });
customerSchema.index({ source: 1 });
customerSchema.index({ type: 1 });
customerSchema.index({ status: 1 });
customerSchema.index({ assignedTo: 1 });
customerSchema.index({ department: 1 });
customerSchema.index({ createdAt: -1 });

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
