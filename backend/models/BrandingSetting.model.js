const mongoose = require('mongoose');

const brandingSettingSchema = new mongoose.Schema({
  applicationName: { type: String, default: 'OMODA | JAECOO', trim: true },
  browserTitle: { type: String, default: 'AMSERP', trim: true },
  favicon: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
  sidebarLogo: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
  loginLogo: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
  loadingLogo: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
  activeTheme: { type: String, default: 'default', trim: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

module.exports = mongoose.model('BrandingSetting', brandingSettingSchema);
