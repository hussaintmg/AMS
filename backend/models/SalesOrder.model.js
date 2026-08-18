const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');
const lineItemSchema = require('./lineItem.schema');
const walkInFields = require('./walkIn.fields');
const { serviceChargeFields } = require('./serviceCharges.fields');

const salesOrderItemSchema = new mongoose.Schema({
  description: { type: String },
  quantity: { type: Number },
  unitPrice: { type: Number },
  totalPrice: { type: Number },
  type: { type: String, trim: true }
}, { _id: false });

const paymentInstallmentSchema = new mongoose.Schema({
  importKey: { type: String, trim: true, default: '' },
  installmentNo: { type: Number },
  transactionDate: { type: Date, default: null },
  amountReceived: { type: Number, default: 0 },
  instrumentNo: { type: String, trim: true, default: '' },
  instrumentDate: { type: Date, default: null },
  instrumentBank: { type: String, trim: true, default: '' },
  instrumentBranchCity: { type: String, trim: true, default: '' },
  depositBank: { type: String, trim: true, default: '' },
  depositBankBranchName: { type: String, trim: true, default: '' },
  depositBankBranchCode: { type: String, trim: true, default: '' },
  paymentStatusDate: { type: Date, default: null },
  paymentStatus: { type: String, trim: true, default: '' }
}, { _id: false });

const salesOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, trim: true, required: [true, 'Order number is required'] },
  importKey: { type: String, trim: true, default: '' },
  importStages: { type: [String], default: [] },
  externalOrderNumber: { type: String, trim: true, default: '' },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  ...walkInFields,
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  vehicleMake: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleMake', default: null },
  vehicleModel: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleModel', default: null },
  vehicleVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleVariant', default: null },
  vehicleColor: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleColor', default: null },
  saleType: { type: String, trim: true, default: 'vehicle' }, // vehicle | parts
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
  serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType', default: null },
  partQuantity: { type: Number, default: 1 },
  status: { type: String, trim: true, required: [true, 'Order status is required'] },
  subtotal: { type: Number, default: 0 },
  accessoriesTotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  registrationCharges: { type: Number, default: 0 },
  insuranceCharges: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  exchangeVehicleDetails: { type: String, trim: true, default: '' },
  exchangeValue: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  // Optional service charges block (models/serviceCharges.fields.js).
  ...serviceChargeFields,
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  paymentMode: { type: String, trim: true, default: '' },
  financeCompany: { type: String, trim: true, default: '' },
  financeAmount: { type: Number, default: 0 },
  orderDate: { type: Date },
  deliveryDate: { type: Date },
  deliveredAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  items: { type: [salesOrderItemSchema], default: [] },
  // Every sellable line (vehicles and/or parts).
  lineItems: { type: [lineItemSchema], default: [] },
  notes: { type: String },

  // ── Dealer Pro XLSX Import: Order/Booking Tracking ──
  pboNo: { type: String, trim: true, default: '' },
  bookingNo: { type: String, trim: true, default: '' },
  bookingDate: { type: Date, default: null },
  invoiceNo: { type: String, trim: true, default: '' },
  invoiceDate: { type: Date, default: null },
  poNo: { type: String, trim: true, default: '' },
  poDate: { type: Date, default: null },

  // ── Dealer Pro XLSX Import: Dealer/Sales Info ──
  dealerName: { type: String, trim: true, default: '' },
  dealerCity: { type: String, trim: true, default: '' },
  salePerson: { type: String, trim: true, default: '' },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sellerEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  buyerType: { type: String, trim: true, default: '' },
  orderCategory: { type: String, trim: true, default: '' },
  unitType: { type: String, trim: true, default: '' },

  // ── Dealer Pro XLSX Import: Financial ──
  minPartialPayment: { type: Number, default: 0 },
  adminChargesPercent: { type: Number, default: 0 },
  adminCharges: { type: Number, default: 0 },
  premium: { type: Number, default: 0 },
  deferredPayment: { type: Number, default: 0 },

  // ── Dealer Pro XLSX Import: Dispatch ──
  dispatchNo: { type: String, trim: true, default: '' },
  dispatchDate: { type: Date, default: null },
  transportCompany: { type: String, trim: true, default: '' },
  builtyNo: { type: String, trim: true, default: '' },
  shipFrom: { type: String, trim: true, default: '' },
  shipTo: { type: String, trim: true, default: '' },
  sapOrderNo: { type: String, trim: true, default: '' },
  sapOrderDate: { type: Date, default: null },

  // ── Dealer Pro XLSX Import: Payment Installments ──
  payments: { type: [paymentInstallmentSchema], default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

salesOrderSchema.index({ orderNumber: 1 });
salesOrderSchema.index(
  { externalOrderNumber: 1 },
  { unique: true, partialFilterExpression: { externalOrderNumber: { $type: 'string', $gt: '' } } }
);
salesOrderSchema.index(
  { dispatchNo: 1 },
  { unique: true, partialFilterExpression: { dispatchNo: { $type: 'string', $gt: '' } } }
);
salesOrderSchema.index(
  { importKey: 1 },
  { unique: true, partialFilterExpression: { importKey: { $type: 'string', $gt: '' } } }
);
salesOrderSchema.index({ vehicleVariant: 1 });
salesOrderSchema.index({ seller: 1 });
salesOrderSchema.index({ customer: 1 });
salesOrderSchema.index({ status: 1 });
salesOrderSchema.index({ pboNo: 1 });
salesOrderSchema.index({ invoiceNo: 1 });

salesOrderSchema.plugin(searchPlugin, { entityType: 'order' });
const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);
module.exports = SalesOrder;
