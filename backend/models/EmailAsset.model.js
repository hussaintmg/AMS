const mongoose = require('mongoose');

const ASSET_CATEGORIES = ['general', 'theme', 'component', 'inline-image'];

const emailAssetSchema = new mongoose.Schema({
  fileName: { type: String, required: true, trim: true },
  originalName: { type: String, trim: true },
  filePath: { type: String, required: true },
  publicUrl: { type: String, default: '' },
  mimeType: { type: String, trim: true },
  size: { type: Number },
  category: { type: String, enum: ASSET_CATEGORIES, default: 'general' },
  altText: { type: String, default: '' },
  width: { type: Number },
  height: { type: Number },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

emailAssetSchema.index({ category: 1 });
emailAssetSchema.index({ isDeleted: 1 });
emailAssetSchema.index({ uploadedBy: 1 });

module.exports = mongoose.model('EmailAsset', emailAssetSchema);
