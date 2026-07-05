const mongoose = require('mongoose');

const sourceSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true }
}, { _id: false });

const leadSchema = new mongoose.Schema({
  leadCode: { type: String, trim: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  source: { type: sourceSchema, default: {} },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, trim: true },
  customerName: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  city: { type: String, trim: true },
  status: { type: String, trim: true },
  priority: { type: String, trim: true },
  interest: { type: String, trim: true },
  notes: { type: String },
  nextFollowUp: { type: Date },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

leadSchema.index({ leadCode: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ assignedTo: 1 });
leadSchema.index({ isActive: 1 });

const Lead = mongoose.model('Lead', leadSchema);

module.exports = Lead;
