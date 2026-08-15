/**
 * One-time backfill for the parts stock movement trail.
 *
 * Movements are only recorded from the day the feature shipped; this script
 * reconstructs the 'sale' rows for every invoice that already consumed stock
 * (PartInvoice and vehicle-side Invoice with part lines, stockApplied: true),
 * dated on the invoice date, so Reports → Parts Inventory shows history too.
 *
 * Idempotent: an invoice whose _id already appears as a movement sourceId is
 * skipped, so running it twice — or after the runtime has logged the same
 * invoice — cannot double-count.
 *
 * Run from backend/:  node scripts/backfill_part_stock_movements.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const { PartInvoice, Invoice, Part, PartStockMovement } = require('../models');

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

async function backfillFrom(model, label, isPartLine) {
  const invoices = await model.find({ stockApplied: true })
    .select('invoiceNumber invoiceDate createdAt createdBy lineItems stockAppliedAt')
    .lean();
  const existing = new Set(
    (await PartStockMovement.distinct('sourceId', { sourceId: { $ne: null } })).map(String),
  );
  const partIds = new Set();
  invoices.forEach((inv) => (inv.lineItems || []).forEach((line) => {
    if (isPartLine(line)) partIds.add(String(line.part));
  }));
  const parts = await Part.find({ _id: { $in: [...partIds] } }).select('name partCode sku').lean();
  const partById = new Map(parts.map((part) => [String(part._id), part]));

  const rows = [];
  let skipped = 0;
  for (const inv of invoices) {
    if (existing.has(String(inv._id))) { skipped += 1; continue; }
    const demand = new Map();
    (inv.lineItems || []).forEach((line) => {
      if (!isPartLine(line)) return;
      const key = String(line.part);
      demand.set(key, (demand.get(key) || 0) + Math.max(0, num(line.quantity) || 1));
    });
    for (const [partId, quantity] of demand.entries()) {
      if (!quantity) continue;
      const part = partById.get(partId);
      rows.push({
        part: partId,
        partCode: part?.partCode || part?.sku || '',
        partName: part?.name || '(deleted part)',
        direction: 'out', quantity, stockAfter: null,
        source: 'sale', reference: inv.invoiceNumber || '', sourceId: inv._id,
        movementDate: inv.stockAppliedAt || inv.invoiceDate || inv.createdAt,
        createdBy: inv.createdBy || null,
      });
    }
  }
  if (rows.length) await PartStockMovement.insertMany(rows, { ordered: false });
  console.log(`${label}: ${invoices.length} invoices seen, ${skipped} already logged, ${rows.length} movements written`);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  await backfillFrom(PartInvoice, 'Part invoices', (line) => !!line.part);
  await backfillFrom(Invoice, 'Vehicle invoices (part lines)', (line) => line.itemType === 'part' && !!line.part);
  await mongoose.disconnect();
  console.log('Backfill complete.');
})().catch((error) => { console.error(error); process.exit(1); });
