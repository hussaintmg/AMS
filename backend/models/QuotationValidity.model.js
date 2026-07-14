const mongoose = require('mongoose');

const quotationValiditySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  code: { type: String, trim: true, default: '' },
  days: { type: Number, default: 0 },
  description: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

quotationValiditySchema.index({ name: 1 });
quotationValiditySchema.index({ isActive: 1 });

module.exports = mongoose.model('QuotationValidity', quotationValiditySchema);
