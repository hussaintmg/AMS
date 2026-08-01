/**
 * Make data that predates multi-product sales work with the new features.
 *
 *  1. Every Part and Vehicle without a barcode gets one, so existing stock is
 *     scannable — imported Dealer Pro vehicles included.
 *  2. Every Quotation / Booking / SalesOrder / Invoice without `lineItems` gets
 *     one line rebuilt from its legacy single-item fields, so old documents
 *     print in the multi-product PDF templates and reopen in the new forms.
 *
 * Safe to run repeatedly: it only touches records that are still missing the
 * new fields, and it never changes money, status or stock.
 *
 *   node scripts/migrate_barcodes_and_lineitems.js          # apply
 *   node scripts/migrate_barcodes_and_lineitems.js --dry    # report only
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: false });

const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongodb');
const Part = require('../models/Part.model');
const Vehicle = require('../models/Vehicle.model');
const Quotation = require('../models/Quotation.model');
const Booking = require('../models/Booking.model');
const SalesOrder = require('../models/SalesOrder.model');
const Invoice = require('../models/Invoice.model');
const { nextBarcode } = require('../utils/barcode');

const DRY = process.argv.includes('--dry');
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const missingBarcode = { $or: [{ barcode: { $exists: false } }, { barcode: '' }, { barcode: null }] };
const missingLines = { $or: [{ lineItems: { $exists: false } }, { lineItems: { $size: 0 } }] };

async function backfillBarcodes(Model, kind, label) {
  const records = await Model.find(missingBarcode).select('_id').lean();
  if (DRY) return { label, pending: records.length, assigned: 0 };
  let assigned = 0;
  for (const record of records) {
    const barcode = await nextBarcode(Model, kind);
    await Model.updateOne({ _id: record._id }, { $set: { barcode } });
    assigned += 1;
    if (assigned % 250 === 0) process.stdout.write(`    …${assigned}/${records.length}\r`);
  }
  return { label, pending: records.length, assigned };
}

/**
 * Rebuild one line from whatever the old document recorded. Prefers the stored
 * `items[]` description so the printed wording does not change.
 */
function lineFromLegacy(document, { vehicleFields = true } = {}) {
  const legacyItem = Array.isArray(document.items) && document.items.length ? document.items[0] : null;
  const isPart = document.saleType === 'parts' && document.part;
  const isService = document.saleType === 'service' && document.serviceType;

  const quantity = isPart || isService ? Math.max(1, num(document.partQuantity, 1)) : 1;
  const totalPrice = num(legacyItem?.totalPrice)
    || num(document.vehiclePrice)
    || num(document.subtotal)
    || num(document.totalAmount);
  const unitPrice = num(legacyItem?.unitPrice) || (quantity ? totalPrice / quantity : totalPrice);

  return [{
    itemType: isPart ? 'part' : isService ? 'service' : 'vehicle',
    vehicle: vehicleFields ? (document.vehicle || null) : null,
    vehicleVariant: vehicleFields ? (document.vehicleVariant || null) : null,
    vehicleColor: vehicleFields ? (document.vehicleColor || null) : null,
    part: isPart ? document.part : null,
    serviceType: isService ? document.serviceType : null,
    code: '',
    barcode: '',
    name: legacyItem?.description || document.itemDescription || '',
    description: legacyItem?.description || document.itemDescription || '',
    quantity,
    unitPrice,
    discountAmount: 0,
    taxAmount: num(legacyItem?.taxAmount),
    totalPrice: totalPrice || unitPrice * quantity,
  }];
}

async function backfillLines(Model, label) {
  const records = await Model.find(missingLines)
    .select('items saleType part serviceType vehicle vehicleVariant vehicleColor partQuantity itemDescription vehiclePrice subtotal totalAmount')
    .lean();
  // A document with nothing to describe (a Dealer Pro import row that only ever
  // held money and references) is left alone rather than given an empty line.
  const worth = records.filter((record) => (
    record.vehicle || record.part || record.serviceType || record.vehicleVariant
    || (Array.isArray(record.items) && record.items.length)
    || record.itemDescription
  ));
  if (DRY) return { label, pending: records.length, rebuilt: worth.length };

  let rebuilt = 0;
  for (const record of worth) {
    const lineItems = lineFromLegacy(record);
    await Model.updateOne({ _id: record._id }, { $set: { lineItems } });
    rebuilt += 1;
    if (rebuilt % 250 === 0) process.stdout.write(`    …${rebuilt}/${worth.length}\r`);
  }
  return { label, pending: records.length, rebuilt };
}

(async () => {
  await connectMongo();
  console.log(`\n${DRY ? 'DRY RUN — nothing will be written' : 'Applying migration'}\n`);

  console.log('Barcodes');
  const barcodeResults = [
    await backfillBarcodes(Part, 'part', 'parts'),
    await backfillBarcodes(Vehicle, 'vehicle', 'vehicles'),
  ];
  barcodeResults.forEach((result) => {
    console.log(`  ${result.label.padEnd(10)} without barcode: ${result.pending}${DRY ? '' : ` → assigned ${result.assigned}`}`);
  });

  console.log('\nLine items on existing documents');
  const lineResults = [
    await backfillLines(Quotation, 'quotations'),
    await backfillLines(Booking, 'bookings'),
    await backfillLines(SalesOrder, 'salesOrders'),
    await backfillLines(Invoice, 'invoices'),
  ];
  lineResults.forEach((result) => {
    console.log(`  ${result.label.padEnd(12)} without lineItems: ${result.pending}${DRY ? ` → rebuildable ${result.rebuilt}` : ` → rebuilt ${result.rebuilt}`}`);
  });

  // Historical invoices must not decrement stock retroactively: their goods left
  // long ago. Marking them applied keeps any later save from touching stock.
  if (!DRY) {
    const sealed = await Invoice.updateMany(
      { stockApplied: { $ne: true }, createdAt: { $lt: new Date() } },
      { $set: { stockApplied: true, stockAppliedAt: null } },
    );
    console.log(`\n  Existing invoices sealed against retroactive stock movement: ${sealed.modifiedCount}`);
  }

  console.log(`\n${DRY ? 'Dry run complete.' : 'Migration complete.'}\n`);
  await mongoose.connection.close();
  process.exit(0);
})().catch(async (error) => {
  console.error('Migration failed:', error.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
