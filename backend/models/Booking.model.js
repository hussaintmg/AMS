const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingNumber: { type: String, trim: true },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  saleType: { type: String, trim: true, default: 'vehicle' }, // vehicle | parts
  vehicleVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleVariant', default: null },
  vehicleColor: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleColor', default: null },
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
  serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType', default: null },
  partQuantity: { type: Number, default: 1 },
  itemDescription: { type: String, trim: true, default: '' },
  status: { type: String, trim: true },
  priority: { type: String, trim: true, default: 'normal' },
  bookingAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  bookingDate: { type: Date },
  deliveryDate: { type: Date },
  notes: { type: String },
  cancellationReason: { type: String, trim: true, default: '' },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ customer: 1 });
bookingSchema.index({ status: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
