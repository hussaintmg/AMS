const mongoose = require('mongoose');

const ENCRYPTION_TYPES = ['none', 'ssl', 'tls'];

const emailConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'smtp' },
  host: { type: String, trim: true, default: '' },
  port: { type: Number, default: 587 },
  encryption: { type: String, enum: ENCRYPTION_TYPES, default: 'tls' },
  username: { type: String, trim: true, default: '' },
  password: { type: String, default: '' },
  senderName: { type: String, trim: true, default: '' },
  senderEmail: { type: String, trim: true, default: '' },
  replyTo: { type: String, trim: true, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('EmailConfig', emailConfigSchema);
