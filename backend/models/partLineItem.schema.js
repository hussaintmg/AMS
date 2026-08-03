const mongoose = require('mongoose');

/**
 * One part line on a parts quotation, booking, sales order or invoice.
 *
 * Parts sales live in their own collections (part_quotations, part_bookings,
 * part_sales_orders, part_invoices) so they never mix with the vehicle
 * documents. That makes this line simpler than models/lineItem.schema.js:
 * there is no itemType to branch on and no vehicle/variant/colour reference —
 * every line is a part, and quantity always matters.
 */
const partLineItemSchema = new mongoose.Schema({
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', required: [true, 'Each line needs a part'] },

  // Identity as printed on the document: part code and the barcode that was
  // scanned to add this line.
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

module.exports = partLineItemSchema;
