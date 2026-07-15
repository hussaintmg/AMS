const mongoose = require('mongoose');

const pdfUsageSchema = new mongoose.Schema({
  documentType: { type: String, required: true, enum: ['quotation', 'booking', 'order', 'invoice'], unique: true },
  label: { type: String, required: true },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'PdfTemplate', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('PdfUsage', pdfUsageSchema);
