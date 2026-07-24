const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const serviceTypeSnapshotSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  description: { type: String },
  basePrice: { type: Number }
}, { _id: false });

const customerVehicleSchema = new mongoose.Schema({
  number: { type: String, trim: true, default: '' },
  make: { type: String, trim: true, default: '' },
  model: { type: String, trim: true, default: '' },
  variant: { type: String, trim: true, default: '' },
  year: { type: Number, default: null },
  vin: { type: String, trim: true, default: '' }
}, { _id: false });

const serviceAppointmentSchema = new mongoose.Schema({
  appointmentNumber: { type: String, trim: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  customerVehicle: { type: customerVehicleSchema, default: () => ({}) },
  serviceTypeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType', default: null },
  serviceType: { type: serviceTypeSnapshotSchema, default: {} },
  serviceAdvisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  appointmentDate: { type: Date },
  appointmentTime: { type: String, trim: true, default: '' },
  estimatedDuration: { type: Number, default: null },
  customerConcerns: { type: String, default: '' },
  status: { type: String, trim: true },
  notes: { type: String },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

serviceAppointmentSchema.index({ appointmentNumber: 1 });
serviceAppointmentSchema.index({ customer: 1 });
serviceAppointmentSchema.index({ status: 1 });
serviceAppointmentSchema.index({ appointmentDate: 1 });

serviceAppointmentSchema.plugin(searchPlugin, { entityType: 'service_appointment' });
const ServiceAppointment = mongoose.model('ServiceAppointment', serviceAppointmentSchema);
module.exports = ServiceAppointment;
