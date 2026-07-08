const mongoose = require('mongoose');

const usageEntrySchema = new mongoose.Schema({
  module: { type: String, default: '' },
  page: { type: String, default: '' },
  field: { type: String, default: '' },
  path: { type: String, default: '' },
  note: { type: String, default: '' },
}, { _id: false });

const statusCollectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Collection name is required'],
    trim: true,
    unique: true,
  },
  key: {
    type: String,
    required: [true, 'Collection key is required'],
    trim: true,
    unique: true,
  },
  description: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  usage: [usageEntrySchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

statusCollectionSchema.index({ isActive: 1 });
statusCollectionSchema.index({ name: 1 });
statusCollectionSchema.index({ key: 1 });

module.exports = mongoose.model('StatusCollection', statusCollectionSchema);
