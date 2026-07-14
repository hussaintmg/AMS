const mongoose = require('mongoose');

const leadPrioritySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Priority name is required'], trim: true },
  code: { type: String, trim: true, unique: true },
  color: { type: String, trim: true, default: '#6b7280' },
  level: { type: Number, default: 0, min: 0, max: 10 },
  description: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

leadPrioritySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('LeadPriority', leadPrioritySchema);
