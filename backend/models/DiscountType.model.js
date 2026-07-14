const mongoose = require('mongoose');

const discountTypeSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  code: { type: String, trim: true, default: '' },
  type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  value: { type: Number, default: 0 },
  description: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

discountTypeSchema.index({ name: 1 });
discountTypeSchema.index({ isActive: 1 });

module.exports = mongoose.model('DiscountType', discountTypeSchema);
