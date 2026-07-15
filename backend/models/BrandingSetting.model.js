const mongoose = require('mongoose');

const brandingSettingSchema = new mongoose.Schema({
  applicationName: { type: String, default: 'OMODA | JAECOO', trim: true },
  browserTitle: { type: String, default: 'AMSERP', trim: true },
  favicon: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
  sidebarLogo: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
  sidebarBackgroundImage: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
  loginLogo: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
  loadingLogo: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
  activeTheme: { type: String, default: 'default', trim: true },
  sidebarBackgroundType: { type: String, enum: ['solid', 'gradient', 'image'], default: 'gradient' },
  sidebarBackgroundColor: { type: String, default: '#1e3a5f', trim: true },
  sidebarGradientFrom: { type: String, default: '#1e3a5f', trim: true },
  sidebarGradientTo: { type: String, default: '#0f172a', trim: true },
  sidebarGradientAngle: { type: Number, default: 180, min: 0, max: 360 },
  sidebarBackgroundSize: { type: String, enum: ['cover', 'contain', 'auto'], default: 'cover' },
  sidebarBackgroundPosition: { type: String, enum: ['left top', 'center top', 'right top', 'left center', 'center center', 'right center', 'left bottom', 'center bottom', 'right bottom'], default: 'center center' },
  sidebarBackgroundRepeat: { type: String, enum: ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'], default: 'no-repeat' },
  sidebarOverlayColor: { type: String, default: '#0f172a', trim: true },
  sidebarOverlayOpacity: { type: Number, default: 0.2, min: 0, max: 1 },
  sidebarTextColor: { type: String, default: '#e2e8f0', trim: true },
  sidebarHeadingColor: { type: String, default: '#ffffff', trim: true },
  sidebarActiveColor: { type: String, default: '#2563eb', trim: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

module.exports = mongoose.model('BrandingSetting', brandingSettingSchema);
