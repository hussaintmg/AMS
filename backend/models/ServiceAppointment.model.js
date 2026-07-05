const mongoose = require('mongoose');

const serviceTypeSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  description: { type: String },
  basePrice: { type: Number }
}, { _id: false });

const serviceAppointmentSchema = new mongoose.Schema({
  appointmentNumber: { type: String, trim: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  serviceType: { type: serviceTypeSchema, default: {} },
  appointmentDate: { type: Date },
  status: { type: String, trim: true },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

serviceAppointmentSchema.index({ appointmentNumber: 1 });
serviceAppointmentSchema.index({ customer: 1 });
serviceAppointmentSchema.index({ status: 1 });
serviceAppointmentSchema.index({ appointmentDate: 1 });

const ServiceAppointment = mongoose.model('ServiceAppointment', serviceAppointmentSchema);

module.exports = ServiceAppointment;
