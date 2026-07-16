const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const TEMPLATE_STATUS = ['draft', 'published', 'archived'];

const emailTemplateSchema = new mongoose.Schema({
  templateName: { type: String, required: true, trim: true },
  subject: { type: String, default: '' },
  description: { type: String, trim: true, default: '' },
  tags: { type: [String], default: [] },
  html: { type: String, default: '' },
  css: { type: String, default: '' },
  plainText: { type: String, default: '' },
  version: { type: Number, default: 1 },
  isActive: { type: Boolean, default: false },
  status: { type: String, enum: TEMPLATE_STATUS, default: 'draft' },
  previewImage: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

emailTemplateSchema.index({ status: 1 });

emailTemplateSchema.plugin(searchPlugin, { entityType: 'email_template' });
const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);
module.exports = EmailTemplate;
