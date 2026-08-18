const mongoose = require('mongoose');
const searchPlugin = require('../plugins/searchPlugin');

/**
 * Gate passes: what came in through the gate, what went out, and the guard's
 * confirmation.
 *
 * Two entry types, each with an in and an out:
 *
 *   logistic  — a truck arrives (IN): R/O number, C/O number, invoice number,
 *               photos, and a list of what it carried. Items flagged
 *               `addToInventory` with a part behind them are received into
 *               stock through services/partStock.service.js (so the day-wise
 *               parts report stays right); water, packaging and the like are
 *               recorded only. When the truck leaves (OUT) it is issued a Goods
 *               Receiving Note against the entry (GoodsReceivingNote.model.js).
 *
 *   customer  — a customer arrives (IN) for service or a purchase: name,
 *               vehicle number, engine number, PBO if any. They receive an
 *               entry acknowledgement. When they leave (OUT) the pass is raised
 *               against their invoice (or estimate) plus the entry, and the
 *               guard verifies it before opening the gate.
 *
 * Neither the in nor the out pass moves stock on its own — the invoice already
 * did (client decision, 2026-08-18). The pass is the evidence.
 */
const gatePassItemSchema = new mongoose.Schema({
  description: { type: String, trim: true, default: '' },
  itemType: { type: String, enum: ['part', 'consumable', 'other'], default: 'other' },
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
  partNumber: { type: String, trim: true, default: '' },
  quantity: { type: Number, default: 1, min: 0 },
  unit: { type: String, trim: true, default: '' },
  // Receive into stock when the entry is issued (parts only).
  addToInventory: { type: Boolean, default: false },
  stockApplied: { type: Boolean, default: false },
  notes: { type: String, trim: true, default: '' },
}, { _id: true });

const gatePassSchema = new mongoose.Schema({
  gatePassNumber: { type: String, trim: true, required: true },
  direction: { type: String, enum: ['in', 'out'], required: true },
  entryType: { type: String, enum: ['logistic', 'customer'], required: true },

  // ── logistic ──
  roNumber: { type: String, trim: true, default: '' },
  coNumber: { type: String, trim: true, default: '' },
  invoiceNumber: { type: String, trim: true, default: '' },     // supplier / dispatch invoice #
  transporter: { type: String, trim: true, default: '' },
  truckNumber: { type: String, trim: true, default: '' },
  driverName: { type: String, trim: true, default: '' },
  driverPhone: { type: String, trim: true, default: '' },
  items: { type: [gatePassItemSchema], default: [] },

  // ── customer ──
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  walkInName: { type: String, trim: true, default: '' },
  walkInPhone: { type: String, trim: true, default: '' },
  customerVehicleNumber: { type: String, trim: true, default: '' },
  engineNumber: { type: String, trim: true, default: '' },
  chassisNumber: { type: String, trim: true, default: '' },
  pboNumber: { type: String, trim: true, default: '' },
  purpose: { type: String, trim: true, default: '' },          // routine maintenance, purchase, enquiry…

  attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FileUpload' }],

  // ── links ──
  linkedGatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', default: null },   // out ← in
  linkedInvoiceModel: { type: String, enum: ['Invoice', 'PartInvoice', 'CustomInvoice', ''], default: '' },
  linkedInvoice: { type: mongoose.Schema.Types.ObjectId, refPath: 'linkedInvoiceModel', default: null },
  linkedInvoiceNumber: { type: String, trim: true, default: '' },
  linkedEstimateModel: { type: String, enum: ['Quotation', 'PartQuotation', 'CustomQuotation', ''], default: '' },
  linkedEstimate: { type: mongoose.Schema.Types.ObjectId, refPath: 'linkedEstimateModel', default: null },
  linkedEstimateNumber: { type: String, trim: true, default: '' },
  grn: { type: mongoose.Schema.Types.ObjectId, ref: 'GoodsReceivingNote', default: null },

  barcode: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['draft', 'issued', 'verified', 'closed', 'cancelled'], default: 'draft' },
  issuedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  verificationNotes: { type: String, trim: true, default: '' },
  closedAt: { type: Date, default: null },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

gatePassSchema.index({ gatePassNumber: 1 }, { unique: true });
gatePassSchema.index({ direction: 1, entryType: 1, status: 1 });
gatePassSchema.index({ customer: 1 });
gatePassSchema.index({ linkedGatePass: 1 });
gatePassSchema.index({ barcode: 1 });
gatePassSchema.index({ createdAt: -1 });

gatePassSchema.plugin(searchPlugin, { entityType: 'gate_pass' });

module.exports = mongoose.models.GatePass || mongoose.model('GatePass', gatePassSchema, 'gate_passes');
