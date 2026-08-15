/**
 * Best-effort writer for the parts stock movement trail.
 *
 * Every stock mutation (sale, cancellation, manual adjustment, part creation,
 * import) records one row per part here so Reports → Parts Inventory can show
 * a day-by-day account of what went in and out. The log is an audit artefact,
 * not a ledger the business runs on: if the insert fails, the stock change
 * that caused it must still stand, so failures are logged and swallowed.
 */
const PartStockMovement = require('../models/PartStockMovement.model');
const logger = require('../utils/logger');

/**
 * entries: [{ part, partCode, partName, direction, quantity, stockAfter,
 *             source, reference, sourceId, movementDate, createdBy }]
 * Rows with a zero/negative quantity are dropped — a no-op is not a movement.
 */
async function logStockMovements(entries = []) {
  const rows = (entries || []).filter((entry) => Number(entry?.quantity) > 0);
  if (!rows.length) return;
  try {
    await PartStockMovement.insertMany(rows.map((entry) => ({
      ...entry,
      quantity: Number(entry.quantity),
      movementDate: entry.movementDate || new Date(),
    })), { ordered: false });
  } catch (error) {
    logger.error('Failed to record part stock movement (stock change already applied):', error);
  }
}

module.exports = { logStockMovements };
