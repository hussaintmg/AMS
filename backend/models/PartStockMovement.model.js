const mongoose = require('mongoose');

/**
 * One row per stock change on a part — the audit trail behind the day-wise
 * Parts Inventory report. Writers must treat logging as best-effort (via
 * services/partMovementLog.service.js): a failed log line must never block
 * the sale or adjustment that caused it.
 */
const partStockMovementSchema = new mongoose.Schema({
  part: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', required: true, index: true },
  // Snapshotted so the report survives a part being renamed or deleted.
  partCode: { type: String, trim: true, default: '' },
  partName: { type: String, trim: true, default: '' },
  direction: { type: String, enum: ['in', 'out'], required: true },
  quantity: { type: Number, required: true, min: 0 },
  // Stock level right after this movement, when the writer knows it.
  stockAfter: { type: Number, default: null },
  source: {
    type: String,
    required: true,
    // gate_receipt: parts received on a logistic gate-pass entry.
    enum: ['initial', 'adjustment', 'sale', 'sale_reverted', 'import', 'import_update', 'gate_receipt'],
  },
  // Human-readable anchor: invoice number, adjustment reason, import note.
  reference: { type: String, trim: true, default: '' },
  // The document that caused the movement (e.g. the invoice _id). Lets a
  // backfill run skip anything the runtime already logged.
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  movementDate: { type: Date, default: Date.now, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

partStockMovementSchema.index({ movementDate: -1, part: 1 });

module.exports = mongoose.model('PartStockMovement', partStockMovementSchema);
