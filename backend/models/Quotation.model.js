const mongoose = require('mongoose');

const quotationItemSchema = new mongoose.Schema({
  description: { type: String },
  quantity: { type: Number },
  unitPrice: { type: Number },
  totalPrice: { type: Number },
  type: { type: String, trim: true }
}, { _id: false });

const quotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, trim: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  status: { type: String, trim: true },
  totalAmount: { type: Number, default: 0 },
  validUntil: { type: Date },
  items: { type: [quotationItemSchema], default: [] },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

quotationSchema.index({ quotationNumber: 1 });
quotationSchema.index({ customer: 1 });
quotationSchema.index({ status: 1 });

const Quotation = mongoose.model('Quotation', quotationSchema);

module.exports = Quotation;
