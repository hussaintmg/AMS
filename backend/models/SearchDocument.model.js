const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  entityType: { type: String, required: true, index: true },
  entityId: { type: String, required: true },
  moduleName: { type: String, default: '' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  searchableText: { type: String, default: '' },
  keywords: [{ type: String }],
  url: { type: String, default: '' },
  permissionKey: { type: String, default: '', index: true },
  assignedTo: { type: String, default: null, index: true },
  createdBy: { type: String, default: null, index: true },
  companyId: { type: String, default: null, index: true },
  branchId: { type: String, default: null, index: true },
  workspaceId: { type: String, default: null, index: true },
  organizationId: { type: String, default: null, index: true },
  status: { type: String, default: '' },
  isActive: { type: Boolean, default: true, index: true },
  score: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: false });

schema.index({ entityType: 1, entityId: 1 }, { unique: true });
schema.index({ searchableText: 'text', title: 'text', subtitle: 'text', keywords: 'text' });
schema.index({ permissionKey: 1, isActive: 1, score: -1 });
schema.index({ permissionKey: 1, isActive: 1, updatedAt: -1 });
schema.index({ assignedTo: 1, isActive: 1 });
schema.index({ createdBy: 1, isActive: 1 });
schema.index({ companyId: 1, permissionKey: 1, isActive: 1 });
schema.index({ updatedAt: -1 });
schema.index({ score: -1 });

module.exports = mongoose.model('SearchDocument', schema);
