const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');
const partLineItemSchema = require('./partLineItem.schema');
const walkInFields = require('./walkIn.fields');
const { serviceChargeFields } = require('./serviceCharges.fields');

/**
 * A confirmed order for spare parts.
 *
 * The order confirms intent and checks that the shelf can meet it; the invoice
 * it generates is what actually decrements stock
 * (services/partStock.service.js). None of the Dealer Pro import fields on the
 * vehicle SalesOrder appear here — parts are not imported.
 */
const partSalesOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, trim: true, required: [true, 'Order number is required'] },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'PartBooking', default: null },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'PartQuotation', default: null },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'PartInvoice', default: null },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  ...walkInFields,

  lineItems: { type: [partLineItemSchema], default: [] },

  status: { type: String, trim: true, required: [true, 'Order status is required'], default: 'confirmed' },
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  // Optional service charges block (models/serviceCharges.fields.js).
  ...serviceChargeFields,
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  // paymentMode is the method's name as it stood at the sale; paymentMethod is
  // the reference that survives a rename (see utils/paymentMethod.util.js).
  paymentMode: { type: String, trim: true, default: '' },
  paymentMethod: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', default: null },

  orderDate: { type: Date },
  deliveryDate: { type: Date },
  deliveredAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  notes: { type: String },
  salePerson: { type: String, trim: true, default: '' },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

partSalesOrderSchema.index({ orderNumber: 1 });
partSalesOrderSchema.index({ customer: 1 });
partSalesOrderSchema.index({ status: 1 });

partSalesOrderSchema.plugin(searchPlugin, { entityType: 'part_order' });
const PartSalesOrder = mongoose.model('PartSalesOrder', partSalesOrderSchema, 'part_sales_orders');
module.exports = PartSalesOrder;
