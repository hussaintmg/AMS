const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  type: { type: String, trim: true },
  startDate: { type: Date },
  endDate: { type: Date },
  days: { type: Number },
  reason: { type: String },
  status: { type: String, trim: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

leaveSchema.index({ employee: 1 });
leaveSchema.index({ status: 1 });

const Leave = mongoose.model('Leave', leaveSchema);

module.exports = Leave;
