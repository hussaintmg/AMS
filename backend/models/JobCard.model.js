const mongoose = require('mongoose');

const jobCardServiceSchema = new mongoose.Schema({
  description: { type: String },
  laborHours: { type: Number },
  rate: { type: Number },
  amount: { type: Number }
}, { _id: false });

const jobCardPartSchema = new mongoose.Schema({
  partCode: { type: String, trim: true },
  name: { type: String, trim: true },
  quantity: { type: Number },
  unitPrice: { type: Number },
  totalPrice: { type: Number }
}, { _id: false });

const jobCardSchema = new mongoose.Schema({
  jobCardNumber: { type: String, trim: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceAppointment' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  status: { type: String, trim: true },
  odometer: { type: Number },
  complaint: { type: String },
  diagnosis: { type: String },
  services: { type: [jobCardServiceSchema], default: [] },
  parts: { type: [jobCardPartSchema], default: [] },
  totalAmount: { type: Number, default: 0 },
  receivedDate: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

jobCardSchema.index({ jobCardNumber: 1 });
jobCardSchema.index({ customer: 1 });
jobCardSchema.index({ vehicle: 1 });
jobCardSchema.index({ status: 1 });

const JobCard = mongoose.model('JobCard', jobCardSchema);

module.exports = JobCard;
