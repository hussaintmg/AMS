const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');
const partLineItemSchema = require('./partLineItem.schema');
const walkInFields = require('./walkIn.fields');

/**
 * An invoice for spare parts — the one document in the parts flow that moves
 * stock. Every line decrements Part.currentStock exactly once, guarded by
 * `stockApplied`, and cancelling the invoice puts the stock back.
 */
const partInvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, trim: true, required: [true, 'Invoice number is required'] },
  salesOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PartSalesOrder', default: null },
  // The parts flow is quotation → invoice, so an invoice raised by converting
  // a quotation keeps the link for traceability.
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'PartQuotation', default: null },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  ...walkInFields,

  lineItems: { type: [partLineItemSchema], default: [] },

  status: { type: String, trim: true, required: [true, 'Invoice status is required'], default: 'draft' },
  invoiceDate: { type: Date },
  dueDate: { type: Date },
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  // Carried from the order so subtotal - discount + tax + charges still adds up
  // to totalAmount on the printed invoice.
  otherCharges: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },

  // Set once stock has been consumed so a re-save or a retry cannot
  // double-count it.
  stockApplied: { type: Boolean, default: false },
  stockAppliedAt: { type: Date, default: null },

  // Cash handed over above the invoice total. Held for the receipt only — it is
  // never added to paidAmount and never reduces the balance.
  amountTendered: { type: Number, default: 0 },
  changeDue: { type: Number, default: 0 },

  salePerson: { type: String, trim: true, default: '' },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notes: { type: String },
  termsAndConditions: { type: String },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

partInvoiceSchema.index({ invoiceNumber: 1 });
partInvoiceSchema.index({ customer: 1 });
partInvoiceSchema.index({ salesOrder: 1 });
partInvoiceSchema.index({ status: 1 });

partInvoiceSchema.plugin(searchPlugin, { entityType: 'part_invoice' });
const PartInvoice = mongoose.model('PartInvoice', partInvoiceSchema, 'part_invoices');
module.exports = PartInvoice;
