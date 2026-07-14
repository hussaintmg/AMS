const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  warehouseName: { type: String, required: [true, 'Warehouse name is required'], trim: true },
  code: { type: String, required: [true, 'Code is required'], trim: true },
  type: { type: String, trim: true, default: '' },
  manager: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  address: { type: String, default: '' },
  city: { type: String, trim: true, default: '' },
  capacity: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

warehouseSchema.index({ warehouseName: 1 });
warehouseSchema.index({ code: 1 });
warehouseSchema.index({ isActive: 1 });

module.exports = mongoose.model('Warehouse', warehouseSchema);
