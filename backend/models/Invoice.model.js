const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  description: { type: String },
  quantity: { type: Number },
  unitPrice: { type: Number },
  totalPrice: { type: Number },
  type: { type: String, trim: true }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, trim: true },
  salesOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder' },
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
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ customer: 1 });
invoiceSchema.index({ salesOrder: 1 });
invoiceSchema.index({ status: 1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;
