const mongoose = require('mongoose');

const pageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  path: { type: String, required: true, unique: true, trim: true },
  module: { type: String, trim: true },
  group: { type: String, trim: true },
  icon: { type: String, trim: true },
  sortOrder: { type: Number, default: 0 },
  description: { type: String, default: '' },
  isCore: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

pageSchema.index({ isActive: 1, sortOrder: 1 });
pageSchema.index({ group: 1 });

module.exports = mongoose.model('Page', pageSchema);
