const mongoose = require('mongoose');

const deliveryTermSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  code: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

deliveryTermSchema.index({ name: 1 });
deliveryTermSchema.index({ isActive: 1 });

module.exports = mongoose.model('DeliveryTerm', deliveryTermSchema);
