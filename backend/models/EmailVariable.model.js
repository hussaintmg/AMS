const mongoose = require('mongoose');

const emailVariableSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, unique: true, trim: true, lowercase: true },
  description: { type: String, trim: true, default: '' },
  reference: { type: String, required: true, trim: true },
  defaultValue: { type: String, trim: true, default: '' },
  category: { type: String, trim: true, default: 'General' },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

emailVariableSchema.index({ category: 1, isActive: 1 });
emailVariableSchema.index({ isDeleted: 1 });
emailVariableSchema.index({ reference: 1 });

module.exports = mongoose.model('EmailVariable', emailVariableSchema);
