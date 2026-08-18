const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');
const lineItemSchema = require('./lineItem.schema');
const walkInFields = require('./walkIn.fields');
const { serviceChargeFields } = require('./serviceCharges.fields');

const quotationItemSchema = new mongoose.Schema({
  description: { type: String },
  quantity: { type: Number },
  unitPrice: { type: Number },
  totalPrice: { type: Number },
  type: { type: String, trim: true }
}, { _id: false });

const quotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, trim: true, required: [true, 'Quotation number is required'] },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  ...walkInFields,
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  saleType: { type: String, trim: true, default: 'vehicle' }, // vehicle | parts
  vehicleVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleVariant', default: null },
  vehicleColor: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleColor', default: null },
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
  serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType', default: null },
  partQuantity: { type: Number, default: 1 },
  status: { type: String, trim: true, required: [true, 'Quotation status is required'] },
  vehiclePrice: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  discountPercentage: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  additionalCharges: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  // Optional service charges block (models/serviceCharges.fields.js).
  ...serviceChargeFields,
  validityDays: { type: Number, default: 7 },
  validUntil: { type: Date },
  items: { type: [quotationItemSchema], default: [] },
  // Every sellable line (vehicles and/or parts). `items` above stays as the
  // printable one-line-per-entry summary the older PDF variables read.
  lineItems: { type: [lineItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  // A quotation only becomes a Booking once someone with the right permission
  // approves it — see approveQuotation in salesManagement.controller.js.
  approvalStatus: { type: String, trim: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  approvalNotes: { type: String, trim: true, default: '' },
  estimateSentAt: { type: Date, default: null },
  termsAndConditions: { type: String },
  notes: { type: String },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

quotationSchema.index({ quotationNumber: 1 });
quotationSchema.index({ customer: 1 });
quotationSchema.index({ status: 1 });

quotationSchema.plugin(searchPlugin, { entityType: 'quotation' });
const Quotation = mongoose.model('Quotation', quotationSchema);
module.exports = Quotation;
