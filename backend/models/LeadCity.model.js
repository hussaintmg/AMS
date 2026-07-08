const mongoose = require('mongoose');

const leadCitySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'City name is required'], trim: true },
  code: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

leadCitySchema.index({ code: 1 });
leadCitySchema.index({ isActive: 1 });

module.exports = mongoose.model('LeadCity', leadCitySchema);
