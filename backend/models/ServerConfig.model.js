const mongoose = require('mongoose');

const sidebarPageSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, trim: true },
  path: { type: String, trim: true },
  module: { type: String, trim: true },
  icon: { type: String, trim: true },
  group: { type: String, trim: true },
  enabled: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { _id: false });

const serverConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  sidebarPages: { type: [sidebarPageSchema], default: [] },
  brandingAssignments: {
    type: Map,
    of: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandingAsset' },
    default: () => ({})
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

module.exports = mongoose.model('ServerConfig', serverConfigSchema);
