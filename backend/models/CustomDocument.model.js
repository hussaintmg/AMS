const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');
const walkInFields = require('./walkIn.fields');
const { serviceChargeFields } = require('./serviceCharges.fields');
const { paymentTermFields, installCreditStatus } = require('./paymentTerm.fields');

/**
 * Custom documents: quotations, bookings and invoices for anything that is
 * neither a vehicle nor a part — a generator, a service contract, a one-off
 * job. Free-text lines, no inventory link, so nothing here ever moves stock.
 *
 * Three collections, one shape. They mirror the parts documents closely enough
 * that the PDF pipeline, the e-mail templates and the drawer treat them as
 * ordinary quotations / bookings / invoices (see services/pdfData.service.js
 * TYPES — each type lists these among its models).
 *
 * The screens are hidden and the API closed until the module is switched on
 * in Server Management → Custom (utils/moduleFlags.js).
 */

const customLineItemSchema = new mongoose.Schema({
  description: { type: String, trim: true, required: [true, 'Each line needs a description'] },
  unit: { type: String, trim: true, default: '' },
  quantity: { type: Number, default: 1, min: [0, 'Quantity cannot be negative'] },
  unitPrice: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxPercent: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
}, { _id: true });

const common = {
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  ...walkInFields,
  title: { type: String, trim: true, default: '' },
  lineItems: { type: [customLineItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  additionalCharges: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  ...serviceChargeFields,
  notes: { type: String, default: '' },
  termsAndConditions: { type: String, default: '' },
  salePerson: { type: String, trim: true, default: '' },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
};

const customQuotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, trim: true, required: true },
  ...common,
  status: { type: String, trim: true, default: 'draft' },       // draft | sent | accepted | rejected | converted | expired | cancelled
  approvalStatus: { type: String, trim: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  approvalNotes: { type: String, default: '' },
  validityDays: { type: Number, default: 7 },
  validUntil: { type: Date, default: null },
  convertedBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomBooking', default: null },
  convertedInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomInvoice', default: null },
}, { timestamps: true });
customQuotationSchema.index({ quotationNumber: 1 });
customQuotationSchema.index({ customer: 1 });
customQuotationSchema.index({ status: 1 });
customQuotationSchema.plugin(searchPlugin, { entityType: 'custom_quotation' });

const customBookingSchema = new mongoose.Schema({
  bookingNumber: { type: String, trim: true, required: true },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomQuotation', default: null },
  ...common,
  status: { type: String, trim: true, default: 'pending' },     // pending | confirmed | completed | cancelled
  priority: { type: String, trim: true, default: 'normal' },
  bookingAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  // Which money account the deposit was taken into.
  paymentAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  bookingDate: { type: Date, default: Date.now },
  expectedDeliveryDate: { type: Date, default: null },
  // A custom booking converts into a custom invoice (client decision).
  convertedInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomInvoice', default: null },
}, { timestamps: true });
customBookingSchema.index({ bookingNumber: 1 });
customBookingSchema.index({ customer: 1 });
customBookingSchema.index({ status: 1 });
customBookingSchema.plugin(searchPlugin, { entityType: 'custom_booking' });

const customInvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, trim: true, required: true },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomQuotation', default: null },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomBooking', default: null },
  ...common,
  status: { type: String, trim: true, default: 'draft' },       // draft | sent | partial | paid | overdue | cancelled
  invoiceDate: { type: Date, default: Date.now },
  dueDate: { type: Date, default: null },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  ...paymentTermFields,
  amountTendered: { type: Number, default: 0 },
  changeDue: { type: Number, default: 0 },
  paymentMethod: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', default: null },
  paymentMode: { type: String, trim: true, default: '' },
}, { timestamps: true });
customInvoiceSchema.index({ invoiceNumber: 1 });
customInvoiceSchema.index({ customer: 1 });
customInvoiceSchema.index({ status: 1 });
customInvoiceSchema.index({ paymentTerm: 1, creditStatus: 1 });
installCreditStatus(customInvoiceSchema);
customInvoiceSchema.plugin(searchPlugin, { entityType: 'custom_invoice' });

const CustomQuotation = mongoose.models.CustomQuotation || mongoose.model('CustomQuotation', customQuotationSchema, 'custom_quotations');
const CustomBooking = mongoose.models.CustomBooking || mongoose.model('CustomBooking', customBookingSchema, 'custom_bookings');
const CustomInvoice = mongoose.models.CustomInvoice || mongoose.model('CustomInvoice', customInvoiceSchema, 'custom_invoices');

module.exports = { CustomQuotation, CustomBooking, CustomInvoice, customLineItemSchema };
