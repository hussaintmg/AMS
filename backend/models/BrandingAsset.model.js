const mongoose = require('mongoose');

const brandingAssetSchema = new mongoose.Schema({
  originalName: { type: String, trim: true },
  fileName: { type: String, required: true, trim: true },
  filePath: { type: String, required: true, trim: true },
  publicUrl: { type: String, required: true, trim: true },
  mimeType: { type: String, trim: true },
  size: { type: Number, default: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  placements: { type: [String], default: [] },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

brandingAssetSchema.index({ isActive: 1 });
brandingAssetSchema.index({ placements: 1 });

module.exports = mongoose.model('BrandingAsset', brandingAssetSchema);
