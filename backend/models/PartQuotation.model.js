const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');
const partLineItemSchema = require('./partLineItem.schema');
const walkInFields = require('./walkIn.fields');
const { serviceChargeFields } = require('./serviceCharges.fields');

/**
 * A quotation for spare parts.
 *
 * Parts sales are kept in their own collection so the vehicle documents in
 * `quotations` stay purely about vehicles. Numbers run on their own PQT series
 * (utils/docNumber.js), so a document number alone says which side it belongs
 * to. A quotation never touches stock — see services/partStock.service.js.
 */
const partQuotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, trim: true, required: [true, 'Quotation number is required'] },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  ...walkInFields,
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },

  lineItems: { type: [partLineItemSchema], default: [] },

  status: { type: String, trim: true, required: [true, 'Quotation status is required'], default: 'draft' },
  subtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  discountPercentage: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  additionalCharges: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  // Optional service charges block (models/serviceCharges.fields.js).
  ...serviceChargeFields,
  validityDays: { type: Number, default: 7 },
  validUntil: { type: Date },

  // Same approval gate as the vehicle side: a quotation only becomes a booking
  // once someone with the right permission approves it.
  approvalStatus: { type: String, trim: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  approvalNotes: { type: String, trim: true, default: '' },
  estimateSentAt: { type: Date, default: null },

  termsAndConditions: { type: String },
  notes: { type: String },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

partQuotationSchema.index({ quotationNumber: 1 });
partQuotationSchema.index({ customer: 1 });
partQuotationSchema.index({ status: 1 });

partQuotationSchema.plugin(searchPlugin, { entityType: 'part_quotation' });
const PartQuotation = mongoose.model('PartQuotation', partQuotationSchema, 'part_quotations');
module.exports = PartQuotation;
