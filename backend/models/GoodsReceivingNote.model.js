const mongoose = require('mongoose');

/**
 * Goods Receiving Note — issued to the logistics truck when it leaves,
 * against the logistic gate-pass entry it arrived on. Lists what was received
 * (as recorded on the entry, less anything rejected) and who signed for it.
 * The out-going gate pass references it (`GatePass.grn`).
 */
const grnItemSchema = new mongoose.Schema({
  description: { type: String, trim: true, default: '' },
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
  partNumber: { type: String, trim: true, default: '' },
  quantityExpected: { type: Number, default: 0 },
  quantityReceived: { type: Number, default: 0 },
  quantityRejected: { type: Number, default: 0 },
  unit: { type: String, trim: true, default: '' },
  remarks: { type: String, trim: true, default: '' },
}, { _id: true });

const grnSchema = new mongoose.Schema({
  grnNumber: { type: String, trim: true, required: true },
  gatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', required: true },   // the logistic IN entry
  outGatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', default: null }, // the OUT pass it went with
  transporter: { type: String, trim: true, default: '' },
  truckNumber: { type: String, trim: true, default: '' },
  driverName: { type: String, trim: true, default: '' },
  roNumber: { type: String, trim: true, default: '' },
  coNumber: { type: String, trim: true, default: '' },
  invoiceNumber: { type: String, trim: true, default: '' },
  items: { type: [grnItemSchema], default: [] },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  receivedAt: { type: Date, default: Date.now },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

grnSchema.index({ grnNumber: 1 }, { unique: true });
grnSchema.index({ gatePass: 1 });

module.exports = mongoose.models.GoodsReceivingNote || mongoose.model('GoodsReceivingNote', grnSchema, 'goods_receiving_notes');
