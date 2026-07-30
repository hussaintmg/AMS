const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const activitySchema = new mongoose.Schema({
  type: { type: String, enum: ['created', 'updated', 'status_change', 'assignment_change', 'note_added', 'attachment_added', 'converted', 'deactivated', 'reactivated'], required: true },
  description: { type: String, default: '' },
  oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
  newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  performedAt: { type: Date, default: Date.now },
}, { _id: false });

const noteSchema = new mongoose.Schema({
  content: { type: String, required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  addedAt: { type: Date, default: Date.now },
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  path: { type: String, default: '' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const leadSchema = new mongoose.Schema({
  leadNo: { type: String, unique: true, trim: true },
  leadDate: { type: Date, default: Date.now },

  customerName: { type: String, required: [true, 'Customer name is required'], trim: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  alternatePhone: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  customerType: { type: String, enum: ['individual', 'corporate'], default: 'individual' },
  state: { type: String, trim: true, default: '' },
  country: { type: String, trim: true, default: '' },
  zipCode: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },

  source: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadSource', default: null },
  type: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadType', default: null },
  priority: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadPriority', default: null },
  status: { type: String, default: 'new', required: [true, 'Lead status is required'] },
  leadValue: { type: Number, default: 0 },
  probability: { type: Number, default: 0, min: 0, max: 100 },
  expectedCloseDate: { type: Date, default: null },
  nextFollowUpAt: { type: Date, default: null },
  convertedToCustomer: { type: Boolean, default: false },
  convertedCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  convertedAt: { type: Date, default: null },
  lostReason: { type: String, trim: true, default: '' },
  lostAt: { type: Date, default: null },
  description: { type: String, trim: true, default: '' },
  notes: [noteSchema],
  activities: [activitySchema],
  attachments: [attachmentSchema],

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedAt: { type: Date, default: null },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },

  isActive: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

leadSchema.index({ email: 1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ source: 1 });
leadSchema.index({ priority: 1 });
leadSchema.index({ type: 1 });
leadSchema.index({ assignedTo: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ nextFollowUpAt: 1 });
leadSchema.index({ customerType: 1 });
leadSchema.index({ isActive: 1, deletedAt: 1 });

leadSchema.plugin(searchPlugin, { entityType: 'lead' });
const Lead = mongoose.model('Lead', leadSchema);
module.exports = Lead;
