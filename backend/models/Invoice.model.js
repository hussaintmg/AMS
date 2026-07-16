const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const invoiceItemSchema = new mongoose.Schema({
  description: { type: String },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
  type: { type: String, trim: true }
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, trim: true },
  invoiceType: { type: String, trim: true, default: 'sales' }, // sales | service | parts
  salesOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  jobCard: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCard' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  status: { type: String, trim: true },
  invoiceDate: { type: Date },
  dueDate: { type: Date },
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  items: { type: [invoiceItemSchema], default: [] },
  notes: { type: String },
  termsAndConditions: { type: String },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ customer: 1 });
invoiceSchema.index({ salesOrder: 1 });
invoiceSchema.index({ status: 1 });

invoiceSchema.plugin(searchPlugin, { entityType: 'invoice' });
const Invoice = mongoose.model('Invoice', invoiceSchema);
module.exports = Invoice;
