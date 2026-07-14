const mongoose = require('mongoose');

const laborRateSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  code: { type: String, trim: true },
  rate: { type: Number, required: [true, 'Rate is required'], default: 0 },
  duration: { type: Number, default: 0 },
  description: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

laborRateSchema.index({ name: 1 });
laborRateSchema.index({ code: 1 });
laborRateSchema.index({ isActive: 1 });

module.exports = mongoose.model('LaborRate', laborRateSchema);
