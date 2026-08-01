const Vehicle = require('../models/Vehicle.model');

const STATUS_RANK = Object.freeze({
  available: 0,
  at_yard: 0,
  in_stock: 0,
  in_transit: 0,
  booked: 1,
  reserved: 1,
  allocated: 1,
  sold: 2,
  committed: 2,
  ready: 3,
  ready_for_dispatch: 3,
  dispatched: 4,
  delivered: 5,
  completed: 5,
});

const normalizeStatus = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
const CANONICAL_STATUS = Object.freeze({
  available: 'available',
  at_yard: 'available',
  in_stock: 'available',
  in_transit: 'available',
  booked: 'booked',
  reserved: 'booked',
  allocated: 'booked',
  sold: 'sold',
  committed: 'sold',
  ready: 'available',
  ready_for_dispatch: 'available',
  dispatched: 'dispatched',
  delivered: 'delivered',
  completed: 'delivered',
});

const canonicalStatus = (value) => CANONICAL_STATUS[normalizeStatus(value)] || normalizeStatus(value);

function lifecycleChange(vehicle, nextStatus, {
  sourceType = '',
  sourceId = null,
  reference = '',
  userId = null,
  force = false,
} = {}) {
  if (!vehicle?._id) return null;
  const current = canonicalStatus(vehicle.status);
  const next = canonicalStatus(nextStatus);
  if (!next || current === next) return null;
  const stockOut = (STATUS_RANK[next] ?? 0) >= STATUS_RANK.dispatched;
  if (!force && (STATUS_RANK[next] ?? 0) < (STATUS_RANK[current] ?? 0)) {
    const error = new Error(`Vehicle lifecycle cannot regress from "${current}" to "${next}".`);
    error.code = 'VEHICLE_LIFECYCLE_REGRESSION';
    throw error;
  }

  return {
    status: next,
    stockOut,
    entry: {
      status: next,
      sourceType: String(sourceType || '').trim(),
      sourceId: sourceId || null,
      reference: String(reference || '').trim(),
      changedAt: new Date(),
      changedBy: userId || null,
    },
  };
}

async function applyVehicleLifecycle(vehicle, nextStatus, options = {}) {
  const change = lifecycleChange(vehicle, nextStatus, options);
  if (!change) return { vehicle, changed: false };

  const stockOutDate = change.stockOut ? (vehicle.stockOutDate || change.entry.changedAt) : null;
  const update = {
    $set: {
      status: change.status,
      updatedBy: options.userId || null,
      isStockOut: change.stockOut,
      stockOutDate,
    },
    $push: { lifecycleHistory: change.entry },
  };
  let query = Vehicle.findByIdAndUpdate(vehicle._id, update, { returnDocument: 'after' });
  if (options.session) query = query.session(options.session);
  const updated = await query.lean();
  return { vehicle: updated, changed: Boolean(updated), before: vehicle };
}

module.exports = {
  CANONICAL_STATUS,
  STATUS_RANK,
  applyVehicleLifecycle,
  canonicalStatus,
  lifecycleChange,
  normalizeStatus,
};
