const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  customerCode: { type: String, trim: true },
  name: { type: String, trim: true },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  alternatePhone: { type: String, trim: true },
  cnic: { type: String, trim: true },
  type: { type: String, trim: true },
  address: { type: String },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'Pakistan' },
  leadRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ customerCode: 1 });
customerSchema.index({ isActive: 1 });

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
