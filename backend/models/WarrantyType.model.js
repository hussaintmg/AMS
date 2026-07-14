const mongoose = require('mongoose');

const warrantyTypeSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  code: { type: String, trim: true },
  description: { type: String, trim: true, default: '' },
  durationMonths: { type: Number, default: 0 },
  durationKm: { type: Number, default: 0 },
  terms: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

warrantyTypeSchema.index({ name: 1 });
warrantyTypeSchema.index({ isActive: 1 });

module.exports = mongoose.model('WarrantyType', warrantyTypeSchema);
