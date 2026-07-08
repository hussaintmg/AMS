const mongoose = require('mongoose');

const emailTemplateVersionSchema = new mongoose.Schema({
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate', required: true },
  version: { type: Number, required: true },
  templateName: { type: String, default: '' },
  subject: { type: String, default: '' },
  description: { type: String, default: '' },
  tags: { type: [String], default: [] },
  html: { type: String, default: '' },
  css: { type: String, default: '' },
  plainText: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  isActive: { type: Boolean, default: false },
  changeNote: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

emailTemplateVersionSchema.index({ template: 1, version: 1 }, { unique: true });
emailTemplateVersionSchema.index({ template: 1, isActive: 1 });

module.exports = mongoose.model('EmailTemplateVersion', emailTemplateVersionSchema);
