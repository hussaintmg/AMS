const mongoose = require('mongoose');

const QUEUE_STATUSES = ['pending', 'sending', 'sent', 'failed'];
const MAX_RETRIES_DEFAULT = 3;

const emailQueueSchema = new mongoose.Schema({
  to: { type: String, required: true, trim: true },
  cc: { type: [String], default: [] },
  bcc: { type: [String], default: [] },
  subject: { type: String, default: '' },
  html: { type: String, default: '' },
  text: { type: String, default: '' },
  usageKey: { type: String, default: '' },
  templateId: { type: mongoose.Schema.Types.ObjectId, default: null },
  contextData: { type: mongoose.Schema.Types.Mixed, default: {} },
  attachments: { type: [String], default: [] },
  status: { type: String, enum: QUEUE_STATUSES, default: 'pending' },
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: MAX_RETRIES_DEFAULT },
  errorMessage: { type: String, default: '' }
}, { timestamps: true });

emailQueueSchema.index({ status: 1, retryCount: 1 });
emailQueueSchema.index({ createdAt: 1 });

module.exports = mongoose.model('EmailQueue', emailQueueSchema);
