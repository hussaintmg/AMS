const mongoose = require('mongoose');

const statusItemSchema = new mongoose.Schema({
  collection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StatusCollection',
    required: [true, 'Collection is required'],
  },
  label: {
    type: String,
    required: [true, 'Status label is required'],
    trim: true,
  },
  value: {
    type: String,
    required: [true, 'Status value is required'],
    trim: true,
  },
  color: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  order: { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

statusItemSchema.index({ collection: 1, value: 1 }, { unique: true });
statusItemSchema.index({ collection: 1, order: 1 });
statusItemSchema.index({ collection: 1, isActive: 1 });

module.exports = mongoose.model('StatusItem', statusItemSchema);
