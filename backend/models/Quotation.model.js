const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

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
  validityDays: { type: Number, default: 7 },
  validUntil: { type: Date },
  items: { type: [quotationItemSchema], default: [] },
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
