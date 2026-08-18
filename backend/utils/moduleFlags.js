/**
 * Optional modules that an administrator switches on and off.
 *
 * The custom-document screens (free-text quotations, invoices and bookings)
 * exist in every build but are hidden until turned on in Server Management →
 * Custom. Each flag is one SystemSetting row so nothing new had to be
 * invented for storage; this module is the one place that knows the keys.
 *
 * Read on every login and `/auth/me`, and by the route guard on the custom
 * endpoints, so a flag turned off hides the page *and* closes its API.
 */
const { SystemSetting } = require('../models');

const MODULES = [
  { key: 'custom_quotations', setting: 'module.custom_quotations', label: 'Custom Quotations', pages: ['custom_quotations'] },
  { key: 'custom_invoices', setting: 'module.custom_invoices', label: 'Custom Invoices', pages: ['custom_invoices'] },
  { key: 'custom_bookings', setting: 'module.custom_bookings', label: 'Custom Bookings', pages: ['custom_bookings'] },
];

/** { custom_quotations: false, custom_invoices: false, custom_bookings: false } by default. */
async function moduleFlags() {
  const rows = await SystemSetting.find({ key: { $in: MODULES.map((item) => item.setting) } }).lean();
  const byKey = new Map(rows.map((row) => [row.key, row.value === true || row.value === 'true']));
  return Object.fromEntries(MODULES.map((item) => [item.key, byKey.get(item.setting) === true]));
}

async function setModuleFlag(key, enabled, userId) {
  const item = MODULES.find((entry) => entry.key === key);
  if (!item) return null;
  await SystemSetting.findOneAndUpdate(
    { key: item.setting },
    { $set: { value: enabled === true, category: 'modules', description: `${item.label} module enabled` } },
    { upsert: true, new: true },
  );
  return { key, enabled: enabled === true, updatedBy: userId || null };
}

/** The page keys hidden while a module is off. */
const pagesOfModule = (key) => MODULES.find((entry) => entry.key === key)?.pages || [];

/** Which module (if any) a page belongs to. */
const moduleOfPage = (pageKey) => MODULES.find((entry) => entry.pages.includes(pageKey))?.key || null;

/**
 * Express guard: 404 while the module is off. A 404 rather than a 403 because
 * the feature is not merely denied to this role — it does not exist on this
 * installation until switched on.
 */
const requireModule = (key) => async (req, res, next) => {
  try {
    const flags = await moduleFlags();
    if (!flags[key]) return res.status(404).json({ success: false, message: 'This module is not enabled' });
    return next();
  } catch (error) { return next(error); }
};

module.exports = { MODULES, moduleFlags, setModuleFlag, pagesOfModule, moduleOfPage, requireModule };
