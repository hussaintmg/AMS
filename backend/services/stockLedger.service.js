/**
 * Where stock actually moves.
 *
 * Business rule (client, 2026-08-01): a quotation, a booking and a sales order
 * only *reserve* intent — nothing leaves the shelf. Stock is consumed at the
 * invoice and only at the invoice:
 *
 *   Quotation  → no stock effect at all
 *   Booking    → vehicles become `booked`; parts untouched
 *   SalesOrder → vehicles stay `booked`; parts untouched
 *   Invoice    → parts decrement, vehicles become `sold`   ← the only mutation
 *   Invoice cancelled → both are returned
 *
 * `Invoice.stockApplied` guards the transition so a re-save, a retry or a
 * double-click can never decrement the same invoice twice.
 */
const Part = require('../models/Part.model');
const Vehicle = require('../models/Vehicle.model');
const { AppError } = require('../middleware/errorHandler');
const { applyVehicleLifecycle, canonicalStatus } = require('../utils/vehicleLifecycle');
const { logStockMovements } = require('./partMovementLog.service');
const logger = require('../utils/logger');

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Combined quantity per part across all lines of one document. */
function partDemand(lineItems = []) {
  const demand = new Map();
  (lineItems || []).forEach((line) => {
    if (line.itemType !== 'part' || !line.part) return;
    const key = String(line.part);
    demand.set(key, (demand.get(key) || 0) + Math.max(0, num(line.quantity, 1)));
  });
  return demand;
}

/**
 * Verify every part line can be met right now. Used before invoicing so the
 * caller fails cleanly instead of writing a negative stock level.
 */
async function assertPartsAvailable(lineItems = [], { session = null } = {}) {
  const demand = partDemand(lineItems);
  if (!demand.size) return;
  let query = Part.find({ _id: { $in: [...demand.keys()] } }).select('name partCode currentStock');
  if (session) query = query.session(session);
  const parts = await query.lean();
  const found = new Set(parts.map((part) => String(part._id)));
  for (const id of demand.keys()) {
    if (!found.has(id)) throw new AppError('A part on this invoice no longer exists', 404);
  }
  for (const part of parts) {
    const wanted = demand.get(String(part._id)) || 0;
    if (num(part.currentStock) < wanted) {
      throw new AppError(
        `Insufficient stock for ${part.name}${part.partCode ? ` (${part.partCode})` : ''}. Available: ${num(part.currentStock)}, invoice needs: ${wanted}`,
        400,
      );
    }
  }
}

/**
 * Consume stock for an invoice: parts decrement, vehicles become sold.
 * Idempotent — returns { applied: false } when the invoice already moved stock.
 */
async function applyInvoiceStock(invoice, { userId = null, session = null } = {}) {
  if (!invoice?._id) return { applied: false, reason: 'no invoice' };
  if (invoice.stockApplied) return { applied: false, reason: 'already applied' };

  const lines = invoice.lineItems || [];
  // Historical invoices from the Dealer Pro import carry no product lines — the
  // import manages those vehicles itself, so there is nothing to move and no
  // flag to write.
  if (!lines.length) return { applied: false, reason: 'no line items' };
  await assertPartsAvailable(lines, { session });

  const demand = partDemand(lines);
  const partsUpdated = [];
  const movements = [];
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
      await Promise.all(partsUpdated.map(({ id, qty }) => Part.updateOne({ _id: id }, { $inc: { currentStock: qty, quantity: qty } })));
      throw new AppError('Stock changed while the invoice was being created. Try again.', 409);
    }
    partsUpdated.push({ id: partId, qty: quantity });
    movements.push({
      part: partId, partCode: updated.partCode || updated.sku || '', partName: updated.name || '',
      direction: 'out', quantity, stockAfter: num(updated.currentStock),
      source: 'sale', reference: invoice.invoiceNumber || '', sourceId: invoice._id,
      createdBy: userId || invoice.createdBy || null,
    });
  }
  // Logged only once every line has landed, so a rolled-back attempt leaves no trail.
  await logStockMovements(movements);

  const vehiclesUpdated = [];
  for (const line of lines) {
    if (line.itemType !== 'vehicle' || !line.vehicle) continue;
    let query = Vehicle.findById(line.vehicle);
    if (session) query = query.session(session);
    const vehicle = await query.lean();
    if (!vehicle) continue;
    if (['sold', 'dispatched', 'delivered'].includes(canonicalStatus(vehicle.status))) continue;
    await applyVehicleLifecycle(vehicle, 'sold', {
      session,
      userId,
      sourceType: 'invoice',
      sourceId: invoice._id,
      reference: invoice.invoiceNumber || '',
    });
    vehiclesUpdated.push(String(vehicle._id));
  }

  return { applied: true, parts: partsUpdated.length, vehicles: vehiclesUpdated.length };
}

/** Return stock when an invoice is cancelled. Only undoes what was applied. */
async function revertInvoiceStock(invoice, { session = null } = {}) {
  if (!invoice?._id || !invoice.stockApplied) return { reverted: false };
  const demand = partDemand(invoice.lineItems || []);
  const movements = [];
  for (const [partId, quantity] of demand.entries()) {
    let query = Part.findOneAndUpdate(
      { _id: partId },
      { $inc: { currentStock: quantity, quantity } },
      { returnDocument: 'after' },
    );
    if (session) query = query.session(session);
    const updated = await query.lean();
    movements.push({
      part: partId, partCode: updated?.partCode || updated?.sku || '', partName: updated?.name || '',
      direction: 'in', quantity, stockAfter: updated ? num(updated.currentStock) : null,
      source: 'sale_reverted', reference: invoice.invoiceNumber || '', sourceId: invoice._id,
    });
  }
  await logStockMovements(movements);
  // A vehicle already dispatched or delivered has physically left; only a unit
  // still sitting at "sold" goes back to booked.
  for (const line of invoice.lineItems || []) {
    if (line.itemType !== 'vehicle' || !line.vehicle) continue;
    const vehicle = await Vehicle.findById(line.vehicle).lean();
    if (!vehicle || canonicalStatus(vehicle.status) !== 'sold') continue;
    await applyVehicleLifecycle(vehicle, 'booked', {
      session,
      sourceType: 'invoice_cancelled',
      sourceId: invoice._id,
      reference: invoice.invoiceNumber || '',
      force: true,
    });
  }
  logger.info(`Stock returned for cancelled invoice ${invoice.invoiceNumber || invoice._id}`);
  return { reverted: true, parts: demand.size };
}

/**
 * Reserve the vehicles on a booking. Parts are deliberately untouched — they
 * only leave stock at the invoice.
 */
async function reserveBookingVehicles(booking, { userId = null, session = null } = {}) {
  const reserved = [];
  for (const line of booking?.lineItems || []) {
    if (line.itemType !== 'vehicle' || !line.vehicle) continue;
    const vehicle = await Vehicle.findById(line.vehicle).lean();
    if (!vehicle) continue;
    const status = canonicalStatus(vehicle.status);
    if (status !== 'available') {
      if (status === 'booked') continue;
      throw new AppError(`Vehicle ${vehicle.chassisNumber || vehicle.vehicleCode} is not available (status: ${vehicle.status})`, 400);
    }
    await applyVehicleLifecycle(vehicle, 'booked', {
      session,
      userId,
      sourceType: 'booking',
      sourceId: booking._id,
      reference: booking.bookingNumber || '',
    });
    reserved.push(String(vehicle._id));
  }
  return reserved;
}

/** Release reserved vehicles when a booking is cancelled. */
async function releaseBookingVehicles(booking, { session = null } = {}) {
  const released = [];
  for (const line of booking?.lineItems || []) {
    if (line.itemType !== 'vehicle' || !line.vehicle) continue;
    const vehicle = await Vehicle.findById(line.vehicle).lean();
    if (!vehicle || canonicalStatus(vehicle.status) !== 'booked') continue;
    await applyVehicleLifecycle(vehicle, 'available', {
      session,
      sourceType: 'booking_cancelled',
      sourceId: booking._id,
      reference: booking.bookingNumber || '',
      force: true,
    });
    released.push(String(vehicle._id));
  }
  return released;
}

module.exports = {
  partDemand,
  assertPartsAvailable,
  applyInvoiceStock,
  revertInvoiceStock,
  reserveBookingVehicles,
  releaseBookingVehicles,
};
