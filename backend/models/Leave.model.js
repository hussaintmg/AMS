const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  leaveType: { type: String, enum: ['sick', 'casual', 'annual', 'unpaid', 'maternity', 'paternity', 'other'], trim: true },
  startDate: { type: Date },
  endDate: { type: Date },
  days: { type: Number },
  reason: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', trim: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

leaveSchema.index({ employee: 1 });
leaveSchema.index({ status: 1 });
leaveSchema.index({ isDeleted: 1 });

const Leave = mongoose.model('Leave', leaveSchema);

module.exports = Leave;
