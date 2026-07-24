const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const pdfTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  documentType: { type: String, required: true, enum: ['quotation', 'booking', 'order', 'invoice'], index: true },
  status: { type: String, enum: ['draft', 'active', 'inactive'], default: 'draft', index: true },
  description: { type: String, trim: true, default: '' },
  designData: { type: mongoose.Schema.Types.Mixed, default: () => ({ pages: [] }) },
  // Authoring mode. 'designer' drives the drag-and-drop pages above; 'html'
  // renders the raw html/css below instead, which the client prints to PDF.
  mode: { type: String, enum: ['designer', 'html'], default: 'designer' },
  html: { type: String, default: '' },
  css: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

pdfTemplateSchema.index({ documentType: 1, name: 1 }, { unique: true });
pdfTemplateSchema.plugin(searchPlugin, { entityType: 'pdf_template' });
const PdfTemplate = mongoose.model('PdfTemplate', pdfTemplateSchema);
module.exports = PdfTemplate;
