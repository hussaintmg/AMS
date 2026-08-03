/**
 * Where parts stock actually moves.
 *
 * Same rule as the vehicle side (services/stockLedger.service.js): a quotation,
 * a booking and a sales order record intent only — nothing leaves the shelf.
 * Stock is consumed at the invoice and only at the invoice:
 *
 *   Part quotation → no stock effect
 *   Part booking   → no stock effect
 *   Part order     → availability is checked, nothing is consumed
 *   Part invoice   → currentStock decrements          ← the only mutation
 *   Invoice cancelled → the stock is returned
 *
 * `PartInvoice.stockApplied` guards the transition so a re-save, a retry or a
 * double-click can never decrement the same invoice twice.
 */
const Part = require('../models/Part.model');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Combined quantity per part across all lines of one document. */
function partDemand(lineItems = []) {
  const demand = new Map();
  (lineItems || []).forEach((line) => {
    if (!line?.part) return;
    const key = String(line.part);
    demand.set(key, (demand.get(key) || 0) + Math.max(0, num(line.quantity, 1)));
  });
  return demand;
}

/**
 * Verify every line can be met right now.
 *
 * Checking the *combined* quantity matters: two lines of the same part can each
 * pass on their own and together still overdraw the shelf.
 */
async function assertPartsAvailable(lineItems = [], { session = null } = {}) {
  const demand = partDemand(lineItems);
  if (!demand.size) return;
  let query = Part.find({ _id: { $in: [...demand.keys()] } }).select('name partCode currentStock');
  if (session) query = query.session(session);
  const parts = await query.lean();
  const found = new Set(parts.map((part) => String(part._id)));
  for (const id of demand.keys()) {
    if (!found.has(id)) throw new AppError('A part on this document no longer exists', 404);
  }
  for (const part of parts) {
    const wanted = demand.get(String(part._id)) || 0;
    if (num(part.currentStock) < wanted) {
      throw new AppError(
        `Insufficient stock for ${part.name}${part.partCode ? ` (${part.partCode})` : ''}. Available: ${num(part.currentStock)}, needed: ${wanted}`,
        400,
      );
    }
  }
}

/**
 * Consume stock for a parts invoice.
 * Idempotent — returns { applied: false } when the invoice already moved stock.
 */
async function applyInvoiceStock(invoice, { session = null } = {}) {
  if (!invoice?._id) return { applied: false, reason: 'no invoice' };
  if (invoice.stockApplied) return { applied: false, reason: 'already applied' };

  const lines = invoice.lineItems || [];
  if (!lines.length) return { applied: false, reason: 'no line items' };
  await assertPartsAvailable(lines, { session });

  const demand = partDemand(lines);
  const taken = [];
  for (const [partId, quantity] of demand.entries()) {
    // Guarded update: the filter re-checks the level, so two invoices racing for
    // the last unit cannot both succeed.
    let query = Part.findOneAndUpdate(
      { _id: partId, currentStock: { $gte: quantity } },
      { $inc: { currentStock: -quantity, quantity: -quantity } },
      { returnDocument: 'after' },
    );
    if (session) query = query.session(session);
    const updated = await query.lean();
    if (!updated) {
      // Put back whatever this call already took before giving up.
      await Promise.all(taken.map(({ id, qty }) =>
        Part.updateOne({ _id: id }, { $inc: { currentStock: qty, quantity: qty } })));
      throw new AppError('Stock changed while the invoice was being created. Try again.', 409);
    }
    taken.push({ id: partId, qty: quantity });
  }

  return { applied: true, parts: taken.length };
}

/** Return stock when a parts invoice is cancelled. Only undoes what was applied. */
async function revertInvoiceStock(invoice, { session = null } = {}) {
  if (!invoice?._id || !invoice.stockApplied) return { reverted: false };
  const demand = partDemand(invoice.lineItems || []);
  for (const [partId, quantity] of demand.entries()) {
    let query = Part.updateOne({ _id: partId }, { $inc: { currentStock: quantity, quantity } });
    if (session) query = query.session(session);
    await query;
  }
  logger.info(`Parts stock returned for cancelled invoice ${invoice.invoiceNumber || invoice._id}`);
  return { reverted: true, parts: demand.size };
}

module.exports = { partDemand, assertPartsAvailable, applyInvoiceStock, revertInvoiceStock };
