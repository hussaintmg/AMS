const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  code: { type: String, trim: true },
  type: { type: String, trim: true }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  paymentNumber: { type: String, trim: true },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  methodRef: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', default: null },
  method: { type: paymentMethodSchema, default: {} },
  amount: { type: Number, default: 0 },
  paymentDate: { type: Date },
  referenceNumber: { type: String, trim: true },
  notes: { type: String },
  status: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

paymentSchema.index({ paymentNumber: 1 });
paymentSchema.index({ invoice: 1 });
paymentSchema.index({ customer: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
