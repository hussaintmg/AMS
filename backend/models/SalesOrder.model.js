const mongoose = require('mongoose');

const salesOrderItemSchema = new mongoose.Schema({
  description: { type: String },
  quantity: { type: Number },
  unitPrice: { type: Number },
  totalPrice: { type: Number },
  type: { type: String, trim: true }
}, { _id: false });

const salesOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, trim: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  status: { type: String, trim: true },
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  orderDate: { type: Date },
  deliveryDate: { type: Date },
  items: { type: [salesOrderItemSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

salesOrderSchema.index({ orderNumber: 1 });
salesOrderSchema.index({ customer: 1 });
salesOrderSchema.index({ status: 1 });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);

module.exports = SalesOrder;
