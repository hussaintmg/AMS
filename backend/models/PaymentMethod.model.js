const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

const paymentMethodSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  code: { type: String, trim: true, default: '' },
  type: { type: String, trim: true, default: 'other' }, // cash | bank | card | cheque | online | other
  description: { type: String, trim: true, default: '' },
  accountId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

paymentMethodSchema.index({ name: 1 });
paymentMethodSchema.index({ isActive: 1 });
paymentMethodSchema.index({ sortOrder: 1 });

paymentMethodSchema.plugin(searchPlugin, { entityType: 'payment_method' });
const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);
module.exports = PaymentMethod;
