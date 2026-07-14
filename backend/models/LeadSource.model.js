const mongoose = require('mongoose');

const leadSourceSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Source name is required'], trim: true },
  code: { type: String, trim: true, unique: true },
  description: { type: String, trim: true, default: '' },
  color: { type: String, trim: true, default: '#6b7280' },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

leadSourceSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('LeadSource', leadSourceSchema);
