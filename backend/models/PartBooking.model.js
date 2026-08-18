const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');
const partLineItemSchema = require('./partLineItem.schema');
const walkInFields = require('./walkIn.fields');
const { serviceChargeFields } = require('./serviceCharges.fields');

/**
 * A booking (advance order) for spare parts.
 *
 * Unlike a vehicle booking there is nothing to reserve: a vehicle booking flips
 * the physical unit to `booked`, but parts are interchangeable, so a parts
 * booking records intent only. Stock still moves at the invoice and nowhere
 * else — see services/partStock.service.js.
 */
const partBookingSchema = new mongoose.Schema({
  bookingNumber: { type: String, trim: true, required: [true, 'Booking number is required'] },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'PartQuotation', default: null },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  ...walkInFields,

  lineItems: { type: [partLineItemSchema], default: [] },
  itemDescription: { type: String, trim: true, default: '' },

  status: { type: String, trim: true, required: [true, 'Booking status is required'], default: 'confirmed' },
  priority: { type: String, trim: true, default: 'normal' },

  // bookingAmount = taken at booking time; paidAmount also includes later
  // instalments; totalAmount is the full value of the parts booked.
  bookingAmount: { type: Number, default: 0 },
  subsequentPayments: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  // Optional service charges block (models/serviceCharges.fields.js).
  ...serviceChargeFields,

  bookingDate: { type: Date },
  deliveryDate: { type: Date },
  notes: { type: String },
  salePerson: { type: String, trim: true, default: '' },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancellationReason: { type: String, trim: true, default: '' },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

partBookingSchema.index({ bookingNumber: 1 });
partBookingSchema.index({ customer: 1 });
partBookingSchema.index({ status: 1 });

partBookingSchema.plugin(searchPlugin, { entityType: 'part_booking' });
const PartBooking = mongoose.model('PartBooking', partBookingSchema, 'part_bookings');
module.exports = PartBooking;
