const mongoose = require('mongoose');

const jobCardServiceSchema = new mongoose.Schema({
  serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType', default: null },
  laborRate: { type: mongoose.Schema.Types.ObjectId, ref: 'LaborRate', default: null },
  technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  description: { type: String },
  hours: { type: Number, default: 0 },
  rate: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, trim: true, default: 'pending' }
}, { _id: true });

const jobCardPartSchema = new mongoose.Schema({
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
  partCode: { type: String, trim: true },
  name: { type: String, trim: true },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
  isWarranty: { type: Boolean, default: false }
}, { _id: true });

const customerVehicleSchema = new mongoose.Schema({
  number: { type: String, trim: true, default: '' },
  make: { type: String, trim: true, default: '' },
  model: { type: String, trim: true, default: '' },
  year: { type: Number, default: null },
  vin: { type: String, trim: true, default: '' }
}, { _id: false });

const jobCardSchema = new mongoose.Schema({
  jobCardNumber: { type: String, trim: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceAppointment' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  customerVehicle: { type: customerVehicleSchema, default: () => ({}) },
  serviceAdvisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  warrantyType: { type: mongoose.Schema.Types.ObjectId, ref: 'WarrantyType', default: null },
  status: { type: String, trim: true },
  odometer: { type: Number },
  fuelLevel: { type: String, trim: true, default: '' },
  promisedDate: { type: Date, default: null },
  complaint: { type: String },
  diagnosis: { type: String },
  customerRemarks: { type: String, default: '' },
  technicianRemarks: { type: String, default: '' },
  services: { type: [jobCardServiceSchema], default: [] },
  parts: { type: [jobCardPartSchema], default: [] },
  laborTotal: { type: Number, default: 0 },
  partsTotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  receivedDate: { type: Date },
  completedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

jobCardSchema.index({ jobCardNumber: 1 });
jobCardSchema.index({ customer: 1 });
jobCardSchema.index({ vehicle: 1 });
jobCardSchema.index({ status: 1 });

const JobCard = mongoose.model('JobCard', jobCardSchema);

module.exports = JobCard;
