const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const brandSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  logoUrl: { type: String }
}, { _id: false });

const makeSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  country: { type: String, trim: true }
}, { _id: false });

const modelSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  yearFrom: { type: Number },
  yearTo: { type: Number }
}, { _id: false });

const variantSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  engineType: { type: String, trim: true },
  transmission: { type: String, trim: true },
  fuelType: { type: String, trim: true },
  price: { type: Number }
}, { _id: false });

const colorSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  hexCode: { type: String, trim: true }
}, { _id: false });

const warehouseRefSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true }
}, { _id: false });

const vehicleSchema = new mongoose.Schema({
  vehicleCode: { type: String, trim: true },
  vin: {
    type: String,
    trim: true
  },
  chassisNumber: {
    type: String,
    trim: true
  },
  engineNumber: {
    type: String,
    trim: true
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  brand: { type: brandSchema, default: {} },
  make: { type: makeSchema, default: {} },
  model: { type: modelSchema, default: {} },
  variant: { type: variantSchema, default: {} },
  color: { type: colorSchema, default: {} },
  warehouse: { type: warehouseRefSchema, default: {} },
  year: { type: Number },
  purchasePrice: { type: Number },
  salePrice: { type: Number },
  status: { type: String, trim: true },
  conditionType: { type: String, trim: true },
  mileage: { type: Number },
  location: { type: String, trim: true },
  arrivalDate: { type: Date },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

vehicleSchema.index({ vin: 1 });
vehicleSchema.index({ chassisNumber: 1 });
vehicleSchema.index({ registrationNumber: 1 });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ isActive: 1 });

vehicleSchema.plugin(searchPlugin, { entityType: 'vehicle' });
const Vehicle = mongoose.model('Vehicle', vehicleSchema);
module.exports = Vehicle;
