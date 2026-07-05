const mongoose = require('mongoose');

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
  name: { type: String, trim: true },
  description: { type: String },
  category: { type: categorySchema, default: {} },
  supplier: { type: supplierSchema, default: {} },
  warehouse: { type: warehouseRefSchema, default: {} },
  brand: { type: String, trim: true },
  unit: { type: String, trim: true },
  costPrice: { type: Number },
  sellingPrice: { type: Number },
  quantity: { type: Number, default: 0 },
  currentStock: { type: Number, default: 0 },
  minStock: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

partSchema.index({ partCode: 1 });
partSchema.index({ sku: 1 });
partSchema.index({ name: 1 });
partSchema.index({ isActive: 1 });

const Part = mongoose.model('Part', partSchema);

module.exports = Part;
