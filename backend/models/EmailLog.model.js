const mongoose = require('mongoose');

const LOG_STATUSES = ['sent', 'failed', 'bounced', 'queued'];

const emailLogSchema = new mongoose.Schema({
  recipient: { type: String, required: true, trim: true },
  cc: { type: [String], default: [] },
  bcc: { type: [String], default: [] },
  subject: { type: String, default: '' },
  renderedSubject: { type: String, default: '' },
  renderedHtml: { type: String, default: '' },
  usage: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailUsage', default: null },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate', default: null },
  status: { type: String, enum: LOG_STATUSES, default: 'sent' },
  providerResponse: { type: String, default: '' },
  attachments: { type: [String], default: [] },
  renderedVariables: { type: mongoose.Schema.Types.Mixed, default: {} },
  executionTime: { type: Number, default: 0 },
  errorMessage: { type: String, default: '' },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: { createdAt: true, updatedAt: false } });

emailLogSchema.index({ recipient: 1 });
emailLogSchema.index({ status: 1 });
emailLogSchema.index({ createdAt: -1 });
emailLogSchema.index({ usage: 1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
