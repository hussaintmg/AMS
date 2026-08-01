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

// Physical dispatch of the unit. Populated either by a Dispatch Report row
// that resolved a Sales Order, or by a stock dispatch row that carries only
// chassis/engine evidence (no customer/booking/order is ever invented).
const dispatchInfoSchema = new mongoose.Schema({
  dispatchNo: { type: String, trim: true, default: '' },
  dispatchDate: { type: Date, default: null },
  pboNo: { type: String, trim: true, default: '' },
  invoiceNo: { type: String, trim: true, default: '' },
  invoiceDate: { type: Date, default: null },
  sapOrderNo: { type: String, trim: true, default: '' },
  transportCompany: { type: String, trim: true, default: '' },
  builtyNo: { type: String, trim: true, default: '' },
  shipFrom: { type: String, trim: true, default: '' },
  shipTo: { type: String, trim: true, default: '' },
  salesOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', default: null },
  source: { type: String, trim: true, default: '' }, // sales_order | stock_dispatch
}, { _id: false });

const lifecycleEntrySchema = new mongoose.Schema({
  status: { type: String, trim: true, required: true },
  sourceType: { type: String, trim: true, default: '' },
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reference: { type: String, trim: true, default: '' },
  changedAt: { type: Date, default: Date.now },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const vehicleSchema = new mongoose.Schema({
  vehicleCode: { type: String, trim: true, required: [true, 'Vehicle code is required'] },
  importIdentityKey: { type: String, trim: true, default: '' },
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
  year: {
    type: Number,
    min: [1900, 'Year must be 1900 or later'],
    // Dealers legitimately stock next-model-year vehicles, so allow one year ahead.
    max: [new Date().getFullYear() + 1, `Year cannot be later than ${new Date().getFullYear() + 1}`]
  },
  purchasePrice: { type: Number, min: [0, 'Purchase price cannot be negative'] },
  salePrice: { type: Number, min: [0, 'Sale price cannot be negative'] },
  status: { type: String, trim: true, required: [true, 'Vehicle status is required'] },
  conditionType: { type: String, trim: true },
  mileage: { type: Number, min: [0, 'Mileage cannot be negative'] },
  location: { type: String, trim: true },
  arrivalDate: { type: Date },
  notes: { type: String },
  dispatch: { type: dispatchInfoSchema, default: () => ({}) },
  lifecycleHistory: { type: [lifecycleEntrySchema], default: [] },
  isStockOut: { type: Boolean, default: false, index: true },
  stockOutDate: { type: Date, default: null },
  // Scannable identity, unique across parts and vehicles. Assigned by
  // utils/barcode.js; the scan page resolves a scanned code back to this unit.
  barcode: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

vehicleSchema.index({ vin: 1 });
vehicleSchema.index(
  { importIdentityKey: 1 },
  { unique: true, partialFilterExpression: { importIdentityKey: { $type: 'string', $gt: '' } } }
);
vehicleSchema.index({ chassisNumber: 1 });
vehicleSchema.index({ engineNumber: 1 });
vehicleSchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } }
);
vehicleSchema.index({ 'dispatch.dispatchNo': 1 });
vehicleSchema.index({ registrationNumber: 1 });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ isActive: 1 });

vehicleSchema.pre('save', async function () {
  if (this.isNew && !this.vehicleCode) {
    const count = await mongoose.model('Vehicle').countDocuments();
    this.vehicleCode = `VEH-${String(count + 1).padStart(5, '0')}`;
  }
});

vehicleSchema.plugin(searchPlugin, { entityType: 'vehicle' });
const Vehicle = mongoose.model('Vehicle', vehicleSchema);
module.exports = Vehicle;
