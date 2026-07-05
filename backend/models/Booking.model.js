const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingNumber: { type: String, trim: true },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  status: { type: String, trim: true },
  bookingAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  bookingDate: { type: Date },
  deliveryDate: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ customer: 1 });
bookingSchema.index({ status: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
