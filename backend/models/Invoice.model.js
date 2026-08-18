const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');
const lineItemSchema = require('./lineItem.schema');
const walkInFields = require('./walkIn.fields');
const { serviceChargeFields } = require('./serviceCharges.fields');
const { paymentTermFields, installCreditStatus } = require('./paymentTerm.fields');

const invoiceItemSchema = new mongoose.Schema({
  description: { type: String },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
  type: { type: String, trim: true }
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, trim: true, required: [true, 'Invoice number is required'] },
  importKey: { type: String, trim: true, default: '' },
  externalInvoiceNumber: { type: String, trim: true, default: '' },
  invoiceType: { type: String, trim: true, default: 'sales' }, // sales | service | parts
  salesOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
  jobCard: { type: mongoose.Schema.Types.ObjectId, ref: 'JobCard' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  ...walkInFields,
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sellerEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  salePerson: { type: String, trim: true, default: '' },
  status: { type: String, trim: true, required: [true, 'Invoice status is required'] },
  invoiceDate: { type: Date },
  dueDate: { type: Date },
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  // Optional service charges block (models/serviceCharges.fields.js).
  ...serviceChargeFields,
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  // Paid at the counter, or issued on credit and collected later.
  ...paymentTermFields,
  items: { type: [invoiceItemSchema], default: [] },
  // Every sellable line (vehicles and/or parts). Reaching an invoice is what
  // moves stock: parts decrement here, vehicles become sold here.
  lineItems: { type: [lineItemSchema], default: [] },
  // Set once stock has been applied so a re-save or a retry cannot double-count.
  stockApplied: { type: Boolean, default: false },
  stockAppliedAt: { type: Date, default: null },
  // Cash handed over above the invoice total. Held for the receipt/list only —
  // it is never added to paidAmount and never reduces the balance.
  amountTendered: { type: Number, default: 0 },
  changeDue: { type: Number, default: 0 },
  // The preferred method for the remaining balance. Individual payments keep
  // their own method snapshot for audit history.
  paymentMethod: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', default: null },
  paymentMode: { type: String, trim: true, default: '' },
  notes: { type: String },
  termsAndConditions: { type: String },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index(
  { importKey: 1 },
  { unique: true, partialFilterExpression: { importKey: { $type: 'string', $gt: '' } } }
);
invoiceSchema.index(
  { externalInvoiceNumber: 1 },
  { unique: true, partialFilterExpression: { externalInvoiceNumber: { $type: 'string', $gt: '' } } }
);
invoiceSchema.index({ customer: 1 });
invoiceSchema.index({ salesOrder: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ paymentTerm: 1, creditStatus: 1 });
installCreditStatus(invoiceSchema);

invoiceSchema.plugin(searchPlugin, { entityType: 'invoice' });
const Invoice = mongoose.model('Invoice', invoiceSchema);
module.exports = Invoice;
