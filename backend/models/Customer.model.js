const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

// One entry per sales/service document created for this customer.
// Written by utils/customerSync.js whenever quotations, bookings,
// orders, invoices, payments or service documents are created.
const salesHistoryEntrySchema = new mongoose.Schema({
  docType: { type: String, trim: true }, // quotation | booking | sales_order | invoice | payment | service_appointment | job_card
  docId: { type: mongoose.Schema.Types.ObjectId, default: null },
  number: { type: String, trim: true, default: '' },
  amount: { type: Number, default: 0 },
  description: { type: String, trim: true, default: '' },
  date: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const salesSummarySchema = new mongoose.Schema({
  totalQuotations: { type: Number, default: 0 },
  totalBookings: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  totalInvoices: { type: Number, default: 0 },
  totalServiceVisits: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  totalPaid: { type: Number, default: 0 },
  outstandingBalance: { type: Number, default: 0 },
  lastDocumentNumber: { type: String, trim: true, default: '' },
  lastActivityAt: { type: Date, default: null },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  customerCode: { type: String, unique: true, trim: true, required: [true, 'Customer code is required'] },
  importIdentityKey: { type: String, trim: true, default: '' },
  firstName: { type: String, trim: true, default: '', required: [true, 'Customer name is required'] },
  lastName: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  alternatePhone: { type: String, trim: true, default: '' },
  customerType: { type: String, enum: ['individual', 'corporate'], default: 'individual' },
  companyName: { type: String, trim: true, default: '' },
  source: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadSource', default: null },
  importSource: { type: String, trim: true, default: '' },
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

  // ── Dealer Pro XLSX Import: Customer Identity ──
  relation: { type: String, trim: true, default: '' },
  dob: { type: Date, default: null },
  cnic: { type: String, trim: true, default: '' },
  ntn: { type: String, trim: true, default: '' },
  atlStatus: { type: String, trim: true, default: '' },

  leadRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  salesSummary: { type: salesSummarySchema, default: () => ({}) },
  salesHistory: { type: [salesHistoryEntrySchema], default: [] },
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
customerSchema.index(
  { importIdentityKey: 1 },
  { unique: true, partialFilterExpression: { importIdentityKey: { $type: 'string', $gt: '' } } }
);
customerSchema.index({ phone: 1 });
customerSchema.index({ cnic: 1 });
customerSchema.index({ ntn: 1 });
customerSchema.index({ isActive: 1, deletedAt: 1 });
customerSchema.index({ customerType: 1 });
customerSchema.index({ source: 1 });
customerSchema.index({ type: 1 });
customerSchema.index({ status: 1 });
customerSchema.index({ assignedTo: 1 });
customerSchema.index({ department: 1 });
customerSchema.index({ createdAt: -1 });

customerSchema.plugin(searchPlugin, { entityType: 'customer' });
const Customer = mongoose.model('Customer', customerSchema);
module.exports = Customer;
