const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const categorySchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true }
}, { _id: false });

const supplierSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true }
}, { _id: false });

const warehouseRefSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true }
}, { _id: false });

const partSchema = new mongoose.Schema({
  partCode: { type: String, trim: true },
  sku: { type: String, trim: true },
  name: { type: String, required: [true, 'Part name is required'], trim: true },
  description: { type: String },
  category: { type: categorySchema, default: {} },
  supplier: { type: supplierSchema, default: {} },
  warehouse: { type: warehouseRefSchema, default: {} },
  brand: { type: String, trim: true },
  unit: { type: String, trim: true },
  costPrice: { type: Number, min: [0, 'Purchase price cannot be negative'] },
  sellingPrice: { type: Number, min: [0, 'Selling price cannot be negative'] },
  quantity: { type: Number, default: 0, min: [0, 'Quantity cannot be negative'] },
  currentStock: { type: Number, default: 0, min: [0, 'Current stock cannot be negative'] },
  minStock: { type: Number, default: 0, min: [0, 'Minimum stock cannot be negative'] },
  maxStock: { type: Number, default: 0, min: [0, 'Maximum stock cannot be negative'] },
  reorderLevel: { type: Number, default: 0, min: [0, 'Reorder level cannot be negative'] },
  binLocation: { type: String, trim: true, default: '' },
  sourceType: { type: String, trim: true, default: 'manufacturer' },
  // Scannable identity, unique across parts and vehicles. Assigned on create by
  // utils/barcode.js; the scan page resolves a scanned code back to this part.
  barcode: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

partSchema.index({ partCode: 1 });
partSchema.index({ sku: 1 });
partSchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } }
);
partSchema.index({ name: 1 });
partSchema.index({ isActive: 1 });
partSchema.index({ sourceType: 1 });

partSchema.plugin(searchPlugin, { entityType: 'part' });
const Part = mongoose.model('Part', partSchema);
module.exports = Part;
