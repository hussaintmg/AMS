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
  saleType: { type: String, trim: true, default: 'vehicle' }, // vehicle | parts
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
  serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType', default: null },
  partQuantity: { type: Number, default: 1 },
  status: { type: String, trim: true },
  subtotal: { type: Number, default: 0 },
  accessoriesTotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  registrationCharges: { type: Number, default: 0 },
  insuranceCharges: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  exchangeVehicleDetails: { type: String, trim: true, default: '' },
  exchangeValue: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  paymentMode: { type: String, trim: true, default: '' },
  financeCompany: { type: String, trim: true, default: '' },
  financeAmount: { type: Number, default: 0 },
  orderDate: { type: Date },
  deliveryDate: { type: Date },
  deliveredAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  items: { type: [salesOrderItemSchema], default: [] },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

salesOrderSchema.index({ orderNumber: 1 });
salesOrderSchema.index({ customer: 1 });
salesOrderSchema.index({ status: 1 });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);

module.exports = SalesOrder;
