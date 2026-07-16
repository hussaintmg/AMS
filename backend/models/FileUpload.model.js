const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const fileUploadSchema = new mongoose.Schema({
  fileName: { type: String, trim: true },
  originalName: { type: String, trim: true },
  filePath: { type: String },
  mimeType: { type: String, trim: true },
  size: { type: Number },
  module: { type: String, trim: true },
  status: { type: String, trim: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String }
}, {
  timestamps: true
});

fileUploadSchema.index({ module: 1 });
fileUploadSchema.index({ uploadedBy: 1 });
fileUploadSchema.index({ status: 1 });

fileUploadSchema.plugin(searchPlugin, { entityType: 'file_upload' });
const FileUpload = mongoose.model('FileUpload', fileUploadSchema);
module.exports = FileUpload;
