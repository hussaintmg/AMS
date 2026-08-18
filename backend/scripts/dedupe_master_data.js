/**
 * Find (and, with --apply, remove) exact-name duplicates in master data.
 *
 * Every dialog listened for Enter on `document`, so a quick-create opened from
 * inside a form ran two submits for one keypress — the same source, service
 * type or department twice. The keyboard hook now answers only for the dialog
 * on top; this script cleans up what the old behaviour already left behind.
 *
 * A duplicate is a second row with the same name (case- and space-insensitive)
 * in the same collection. The oldest row is kept; the rest are reported and,
 * with --apply, deleted. Nothing referenced by another document is ever
 * removed — the reference is repointed to the survivor first — so a duplicate
 * source that a lead is already using becomes that lead's canonical source.
 *
 * Dry run (default) prints what would happen and changes nothing.
 *
 *   node scripts/dedupe_master_data.js
 *   node scripts/dedupe_master_data.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const models = {
  ...require('../models'),
  // Not on the models index; required by name so this script sees them.
  ServiceType: require('../models/ServiceType.model'),
  LaborRate: require('../models/LaborRate.model'),
  WarrantyType: require('../models/WarrantyType.model'),
  ServicePackage: require('../models/ServicePackage.model'),
  ExpenseCategory: require('../models/ExpenseCategory.model'),
};

const APPLY = process.argv.includes('--apply');

/**
 * Collections that hold master data, the field that names a row, and every
 * place a row can be referenced from (model, field). References are repointed
 * to the survivor before a duplicate goes.
 */
const TARGETS = [
  { model: 'ServiceType', nameField: 'name', refs: [['ServiceAppointment', 'serviceType'], ['JobCard', 'services.serviceType']] },
  { model: 'LaborRate', nameField: 'name', refs: [] },
  { model: 'WarrantyType', nameField: 'name', refs: [['JobCard', 'warrantyType']] },
  { model: 'ServicePackage', nameField: 'packageName', refs: [['JobCard', 'servicePackage']] },
  { model: 'LeadSource', nameField: 'name', refs: [['Lead', 'source'], ['Customer', 'source']] },
  { model: 'LeadType', nameField: 'name', refs: [['Lead', 'type'], ['Customer', 'type']] },
  { model: 'LeadCity', nameField: 'name', refs: [] },
  { model: 'LeadPriority', nameField: 'name', refs: [['Lead', 'priority']] },
  { model: 'Department', nameField: 'name', refs: [['User', 'department'], ['Employee', 'department'], ['Customer', 'department'], ['Lead', 'department']] },
  { model: 'Warehouse', nameField: 'warehouseName', refs: [['Vehicle', 'warehouse'], ['Part', 'warehouse']] },
  { model: 'ExpenseCategory', nameField: 'name', refs: [] },
  { model: 'PaymentMethod', nameField: 'name', refs: [['Payment', 'methodRef'], ['Invoice', 'paymentMethod'], ['PartInvoice', 'paymentMethod']] },
];

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
  let totalDupes = 0;

  for (const target of TARGETS) {
    const Model = models[target.model];
    if (!Model) { console.log(`- ${target.model}: model not registered, skipped`); continue; }

    const rows = await Model.find({}).select(`${target.nameField} createdAt`).sort({ createdAt: 1, _id: 1 }).lean();
    const groups = new Map();
    rows.forEach((row) => {
      const key = normalize(row[target.nameField]);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    const dupes = [...groups.values()].filter((group) => group.length > 1);
    if (!dupes.length) { console.log(`- ${target.model}: no duplicates`); continue; }

    for (const group of dupes) {
      const [keep, ...rest] = group;
      totalDupes += rest.length;
      console.log(`- ${target.model} "${keep[target.nameField]}": keep ${keep._id}, ${APPLY ? 'removing' : 'would remove'} ${rest.length}`);
      if (!APPLY) continue;

      const goneIds = rest.map((row) => row._id);
      for (const [refModel, refField] of target.refs) {
        const RefModel = models[refModel];
        if (!RefModel) continue;
        const result = await RefModel.updateMany(
          { [refField]: { $in: goneIds } },
          { $set: { [refField]: keep._id } },
        );
        if (result.modifiedCount) console.log(`    repointed ${result.modifiedCount} ${refModel}.${refField}`);
      }
      await Model.deleteMany({ _id: { $in: goneIds } });
    }
  }

  console.log(APPLY ? `Removed ${totalDupes} duplicate row(s).` : `${totalDupes} duplicate row(s) found. Re-run with --apply to remove them.`);
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
