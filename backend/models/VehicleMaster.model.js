const mongoose = require('mongoose');

const vehicleMakeSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Brand name is required'], trim: true },
  country: { type: String, trim: true, default: '' },
  logo: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  established_year: { type: Number, default: null },
  website: { type: String, trim: true, default: '' },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

vehicleMakeSchema.index({ name: 1 });
vehicleMakeSchema.index({ is_active: 1 });

const vehicleModelSchema = new mongoose.Schema({
  make_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleMake', required: [true, 'Make is required'] },
  name: { type: String, required: [true, 'Model name is required'], trim: true },
  year: { type: Number, default: new Date().getFullYear() },
  body_type: { type: String, trim: true, default: 'sedan' },
  fuel_type: { type: String, trim: true, default: 'petrol' },
  transmission: { type: String, trim: true, default: 'automatic' },
  engine_capacity: { type: String, trim: true, default: '' },
  seating_capacity: { type: Number, default: 5 },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

vehicleModelSchema.index({ name: 1 });
vehicleModelSchema.index({ make_id: 1 });
vehicleModelSchema.index({ is_active: 1 });

const vehicleVariantSchema = new mongoose.Schema({
  model_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleModel', required: [true, 'Model is required'] },
  name: { type: String, required: [true, 'Variant name is required'], trim: true },
  base_price: { type: Number, default: 0 },
  features: { type: String, trim: true, default: '' },
  specifications: { type: mongoose.Schema.Types.Mixed, default: null },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

vehicleVariantSchema.index({ name: 1 });
vehicleVariantSchema.index({ model_id: 1 });
vehicleVariantSchema.index({ is_active: 1 });

const vehicleColorSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Color name is required'], trim: true },
  hex_code: { type: String, trim: true, default: '#000000' },
  is_metallic: { type: Boolean, default: false },
  additional_cost: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

vehicleColorSchema.index({ name: 1 });
vehicleColorSchema.index({ is_active: 1 });

const partCategorySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Category name is required'], trim: true },
  description: { type: String, trim: true, default: '' },
  parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PartCategory', default: null },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

partCategorySchema.index({ name: 1 });
partCategorySchema.index({ parent_id: 1 });
partCategorySchema.index({ is_active: 1 });

const supplierSchema = new mongoose.Schema({
  supplier_code: { type: String, required: [true, 'Supplier code is required'], trim: true, unique: true },
  name: { type: String, required: [true, 'Supplier name is required'], trim: true },
  type: { type: String, enum: ['oem', 'distributor', 'local_vendor'], default: 'oem' },
  contact_person: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  country: { type: String, trim: true, default: 'Pakistan' },
  tax_number: { type: String, trim: true, default: '' },
  payment_terms: { type: String, trim: true, default: '' },
  credit_limit: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

const vehicleConditionSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Condition name is required'], trim: true },
  description: { type: String, trim: true, default: '' },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

vehicleConditionSchema.index({ name: 1 });
vehicleConditionSchema.index({ is_active: 1 });

module.exports = {
  VehicleMake: mongoose.model('VehicleMake', vehicleMakeSchema),
  VehicleModel: mongoose.model('VehicleModel', vehicleModelSchema),
  VehicleVariant: mongoose.model('VehicleVariant', vehicleVariantSchema),
  VehicleColor: mongoose.model('VehicleColor', vehicleColorSchema),
  PartCategory: mongoose.model('PartCategory', partCategorySchema),
  Supplier: mongoose.model('Supplier', supplierSchema),
  VehicleCondition: mongoose.model('VehicleCondition', vehicleConditionSchema),
};
