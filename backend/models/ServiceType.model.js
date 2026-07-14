const mongoose = require('mongoose');

const serviceTypeSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  code: { type: String, trim: true },
  description: { type: String, trim: true, default: '' },
  basePrice: { type: Number, default: 0 },
  estimatedHours: { type: Number, default: 0 },
  category: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

serviceTypeSchema.index({ name: 1 });
serviceTypeSchema.index({ isActive: 1 });

module.exports = mongoose.model('ServiceType', serviceTypeSchema);
