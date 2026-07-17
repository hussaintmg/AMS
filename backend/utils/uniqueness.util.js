/**
 * Case-insensitive uniqueness guard for master-data names.
 *
 * Master data feeds every dropdown in the app, so duplicates there ("Toyota"
 * twice, or junk entries repeated) surface everywhere. A DB-level unique index
 * is not used because existing databases already contain duplicates from before
 * this check — those records stay readable, only new duplicates are refused.
 *
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 */

const AppError = require('./AppError');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Exact-match-but-case-insensitive regex for a whole field value. */
const exactInsensitive = (value) => new RegExp(`^${escapeRegex(String(value).trim())}$`, 'i');

/**
 * Throw 409 when `Model` already has a document whose `field` equals `value`
 * (case-insensitively), optionally within `scope` and excluding `excludeId`.
 *
 * @param {import('mongoose').Model} Model
 * @param {string} field        field to test, e.g. 'name'
 * @param {string} value        candidate value
 * @param {object} [options]
 * @param {object} [options.scope]      extra filter, e.g. { make_id }
 * @param {string} [options.excludeId]  document to ignore (updates)
 * @param {string} [options.label]      noun used in the error message
 */
async function assertUniqueName(Model, field, value, options = {}) {
    const { scope = {}, excludeId = null, label = 'Record' } = options;

    const trimmed = String(value ?? '').trim();
    if (!trimmed) return;

    const filter = { ...scope, [field]: exactInsensitive(trimmed) };
    if (excludeId) filter._id = { $ne: excludeId };

    const existing = await Model.findOne(filter).select('_id').lean();
    if (existing) {
        throw new AppError(`${label} "${trimmed}" already exists`, 409);
    }
}

module.exports = { assertUniqueName, exactInsensitive, escapeRegex };
