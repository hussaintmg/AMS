const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');
const lineItemSchema = require('./lineItem.schema');

const bookingSchema = new mongoose.Schema({
  bookingNumber: { type: String, trim: true, required: [true, 'Booking number is required'] },
  importKey: { type: String, trim: true, default: '' },
  externalBookingNumber: { type: String, trim: true, default: '' },
  pboNo: { type: String, trim: true, default: '' },
  externalOrderNumber: { type: String, trim: true, default: '' },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  saleType: { type: String, trim: true, default: 'vehicle' }, // vehicle | parts
  vehicleMake: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleMake', default: null },
  vehicleModel: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleModel', default: null },
  vehicleVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleVariant', default: null },
  vehicleColor: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleColor', default: null },
  preferredColor: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleColor', default: null },
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
  serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType', default: null },
  partQuantity: { type: Number, default: 1 },
  itemDescription: { type: String, trim: true, default: '' },
  // Every sellable line (vehicles and/or parts) carried over from the quotation
  // or entered directly. Booking never moves stock — see the invoice stage.
  lineItems: { type: [lineItemSchema], default: [] },
  status: { type: String, trim: true, required: [true, 'Booking status is required'] },
  priority: { type: String, trim: true, default: 'normal' },
  // bookingAmount = paid at booking time ("On Booking"); paidAmount also
  // includes later instalments ("Balance Payments"); totalAmount is the MSRP.
  bookingAmount: { type: Number, default: 0 },
  subsequentPayments: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  bookingDate: { type: Date },
  deliveryDate: { type: Date },
  notes: { type: String },
  salePerson: { type: String, trim: true, default: '' },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sellerEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  cancellationReason: { type: String, trim: true, default: '' },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ externalBookingNumber: 1 });
bookingSchema.index({ pboNo: 1 });
bookingSchema.index(
  { importKey: 1 },
  { unique: true, partialFilterExpression: { importKey: { $type: 'string', $gt: '' } } }
);
bookingSchema.index(
  { externalOrderNumber: 1 },
  { unique: true, partialFilterExpression: { externalOrderNumber: { $type: 'string', $gt: '' } } }
);
bookingSchema.index({ seller: 1 });
bookingSchema.index({ customer: 1 });
bookingSchema.index({ status: 1 });

bookingSchema.plugin(searchPlugin, { entityType: 'booking' });
const Booking = mongoose.model('Booking', bookingSchema);
module.exports = Booking;
