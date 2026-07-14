const mongoose = require('mongoose');

const packageServiceSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  quantity: { type: Number, default: 1 },
  price: { type: Number, default: 0 },
}, { _id: false });

const servicePackageSchema = new mongoose.Schema({
  packageName: { type: String, required: [true, 'Package name is required'], trim: true },
  services: [packageServiceSchema],
  price: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  warranty: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

servicePackageSchema.index({ packageName: 1 });
servicePackageSchema.index({ isActive: 1 });

module.exports = mongoose.model('ServicePackage', servicePackageSchema);
