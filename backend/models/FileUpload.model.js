const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const fileUploadSchema = new mongoose.Schema({
  fileName: { type: String, trim: true },
  batchId: { type: String, trim: true, default: '' },
  logicalType: { type: String, trim: true, default: '' },
  checksum: { type: String, trim: true, default: '' },
  originalName: { type: String, trim: true },
  filePath: { type: String },
  mimeType: { type: String, trim: true },
  size: { type: Number },
  module: { type: String, trim: true },
  status: { type: String, trim: true },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },
  sheetNames: { type: [String], default: [] },
  summary: { type: mongoose.Schema.Types.Mixed, default: null },
  mappingReport: { type: mongoose.Schema.Types.Mixed, default: null },
}, {
  timestamps: true
});

fileUploadSchema.index({ module: 1 });
fileUploadSchema.index({ batchId: 1 });
fileUploadSchema.index({ checksum: 1, logicalType: 1 });
fileUploadSchema.index({ uploadedBy: 1 });
fileUploadSchema.index({ status: 1 });

fileUploadSchema.plugin(searchPlugin, { entityType: 'file_upload' });
const FileUpload = mongoose.model('FileUpload', fileUploadSchema);
module.exports = FileUpload;
