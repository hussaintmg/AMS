const mongoose = require('mongoose');

const variableMappingSchema = new mongoose.Schema({
  templateVariable: { type: String, required: true, trim: true },
  sourceVariable: { type: String, required: true, trim: true }
}, { _id: false });

const emailUsageSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate', default: null },
  variableMappings: { type: [variableMappingSchema], default: [] },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

emailUsageSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('EmailUsage', emailUsageSchema);
