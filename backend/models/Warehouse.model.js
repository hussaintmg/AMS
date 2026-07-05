const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  warehouseCode: { type: String, trim: true },
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  address: { type: String },
  city: { type: String, trim: true },
  contactPerson: { type: String, trim: true },
  contactPhone: { type: String, trim: true },
  capacity: { type: Number },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

warehouseSchema.index({ warehouseCode: 1 });
warehouseSchema.index({ code: 1 });
warehouseSchema.index({ isActive: 1 });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);

module.exports = Warehouse;
