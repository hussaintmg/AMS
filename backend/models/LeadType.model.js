const mongoose = require('mongoose');

const leadTypeSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Type name is required'], trim: true },
  code: { type: String, trim: true, unique: true },
  category: { type: String, enum: ['vehicle', 'service', 'parts', 'general', 'corporate', 'other'], default: 'general' },
  description: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  portalModules: [{ type: String, enum: ['services', 'vehicles', 'parts', 'bookings', 'invoices', 'payments', 'support'] }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

leadTypeSchema.index({ isActive: 1 });
leadTypeSchema.index({ category: 1 });

module.exports = mongoose.model('LeadType', leadTypeSchema);
