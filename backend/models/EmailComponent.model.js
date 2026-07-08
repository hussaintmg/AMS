const mongoose = require('mongoose');

const COMPONENT_CATEGORIES = ['header', 'footer', 'layout', 'content', 'media', 'cta', 'legal', 'custom'];

const PARAMETER_TYPES = ['text', 'textarea', 'number', 'color', 'url', 'image', 'boolean', 'date', 'email', 'phone', 'richtext', 'select'];

const parameterSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, trim: true },
  type: { type: String, enum: PARAMETER_TYPES, default: 'text' },
  label: { type: String, default: '' },
  defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
  required: { type: Boolean, default: false },
  options: { type: [String], default: [] },
  placeholder: { type: String, default: '' },
  order: { type: Number, default: 0 },
}, { _id: false });

const emailComponentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, unique: true, trim: true, lowercase: true },
  category: { type: String, enum: COMPONENT_CATEGORIES, default: 'custom' },
  description: { type: String, trim: true, default: '' },
  html: { type: String, default: '' },
  css: { type: String, default: '' },
  parameters: { type: [parameterSchema], default: [] },
  variablesUsed: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

emailComponentSchema.index({ category: 1, isActive: 1 });
emailComponentSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('EmailComponent', emailComponentSchema);
