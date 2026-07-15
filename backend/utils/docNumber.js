/**
 * Sequential document number generator for MongoDB collections.
 * Produces numbers like SO-2026-000001, scoped per calendar year.
 */
async function nextDocNumber(Model, field, prefix, pad = 6) {
  const year = new Date().getFullYear();
  const yearPrefix = `${prefix}-${year}-`;
  const last = await Model.findOne({ [field]: { $regex: `^${yearPrefix}` } })
    .sort({ [field]: -1 })
    .select(field)
    .lean();

  let sequence = 1;
  if (last && last[field]) {
    const match = String(last[field]).match(/(\d+)$/);
    if (match) sequence = parseInt(match[1], 10) + 1;
  }
  return `${yearPrefix}${String(sequence).padStart(pad, '0')}`;
}

module.exports = { nextDocNumber };
