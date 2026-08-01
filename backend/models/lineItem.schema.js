const mongoose = require('mongoose');

/**
 * One sellable line on a Quotation, Booking, Sales Order or Invoice.
 *
 * A single document can now carry any mix of inventory Vehicles and Parts, so
 * every sales document shares this shape. The legacy single-item fields
 * (saleType/vehicle/part/partQuantity) are still written from the first line by
 * services/lineItems.service.js — reports, the Dealer Pro import and the
 * existing PDF variables all read them.
 */
const lineItemSchema = new mongoose.Schema({
  itemType: { type: String, trim: true, enum: ['vehicle', 'part', 'service'], default: 'vehicle' },

  // Whichever of these applies to itemType; the rest stay null.
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
  vehicleVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleVariant', default: null },
  vehicleColor: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleColor', default: null },
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
  serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType', default: null },

  // Identity as printed on the document: part code, chassis number, or the
  // barcode that was scanned to add this line.
  code: { type: String, trim: true, default: '' },
  barcode: { type: String, trim: true, default: '' },
  name: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },

  quantity: { type: Number, default: 1, min: [0, 'Quantity cannot be negative'] },
  unitPrice: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
}, { _id: true });

module.exports = lineItemSchema;
