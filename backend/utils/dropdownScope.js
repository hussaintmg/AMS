/**
 * Whose records a dropdown offers this user.
 *
 * Role Jobs lets an administrator say, per page and per form, that the
 * "Assign To" list on the lead form shows only users created by the role's
 * own members, or only those of selected roles, or nothing at all. That
 * choice is stored on the role (`jobs[].dropdowns[]`, see Role.model.js) and
 * turned into a Mongo filter here.
 *
 * Endpoints that feed dropdowns call `dropdownFilter(req, pageKey, form, key,
 * ownerFields)`. Page-specific meta endpoints know their page; shared list
 * endpoints read the page/form/field the browser names in the query string
 * (`?forPage=leads&forForm=create&forField=assignedTo`), because one list of
 * users serves a dozen dropdowns and only the caller knows which one this is.
 * A request that names no dropdown gets the page's own data scope, which is
 * what it got before this existed.
 *
 * `null` means "no restriction"; an object is a filter to merge into the
 * query; `HIDDEN` means the dropdown is switched off for this role and the
 * endpoint should answer with an empty list.
 */
const { getJob, allowedOwnerIds } = require('./roleJobs');

const HIDDEN = Object.freeze({ __hidden: true });

/** The role's stored choice for one dropdown, or null when unrestricted. */
const dropdownRule = (user, pageKey, form, key) => {
  const job = getJob(user, pageKey);
  if (!job || job.superAdmin) return null;
  const rows = Array.isArray(job.dropdowns) ? job.dropdowns : [];
  return rows.find((row) => row.key === key && (row.form || 'create') === form)
    || null;
};

/**
 * Filter for one dropdown. `ownerFields` are the fields on the target model
 * that name who created / owns the record — `createdBy` for most, `_id` for
 * the User model itself (a user "owns" their own row).
 */
async function dropdownFilter(user, pageKey, form, key, ownerFields = ['createdBy']) {
  const rule = dropdownRule(user, pageKey, form, key);
  if (!rule || rule.mode === 'all') return null;
  if (rule.mode === 'none') return HIDDEN;

  const ownId = String(user?.id || user?._id || '');
  const ids = new Set(ownId ? [ownId] : []);
  if (rule.mode === 'selected_users') (rule.users || []).forEach((id) => ids.add(String(id?._id || id)));
  if (rule.mode === 'selected_roles') {
    const { User } = require('../models');
    const roleIds = (rule.roles || []).map((id) => id?._id || id);
    const users = await User.find({ role: { $in: roleIds }, isActive: true }).select('_id').lean();
    users.forEach((item) => ids.add(String(item._id)));
  }
  const list = [...ids];
  if (ownerFields.length === 1) return { [ownerFields[0]]: { $in: list } };
  return { $or: ownerFields.map((field) => ({ [field]: { $in: list } })) };
}

/**
 * The filter for the dropdown a request names in its query string, falling
 * back to the page's ordinary data scope when it names none.
 */
async function requestDropdownFilter(req, fallbackPageKey, ownerFields = ['createdBy']) {
  const pageKey = String(req.query.forPage || '').trim();
  const form = String(req.query.forForm || 'create').trim();
  const key = String(req.query.forField || '').trim();
  if (pageKey && key) {
    const scoped = await dropdownFilter(req.user, pageKey, form, key, ownerFields);
    if (scoped !== null) return scoped;
  }
  if (!fallbackPageKey) return null;
  const ids = await allowedOwnerIds(req.user, fallbackPageKey);
  if (ids === null) return null;
  if (ownerFields.length === 1) return { [ownerFields[0]]: { $in: ids } };
  return { $or: ownerFields.map((field) => ({ [field]: { $in: ids } })) };
}

const isHidden = (filter) => filter === HIDDEN;

/**
 * Apply one dropdown's rule to rows already loaded — for the meta endpoints
 * that assemble a dozen small lists in one response, where re-querying each
 * would cost more than filtering in memory. Rows are kept when any of
 * `ownerFields` names an allowed user; hidden dropdowns come back empty.
 *
 * `form` may be a list: the meta endpoint serves the create form, the edit
 * form and the filter bar alike, and the *most permissive* rule among the
 * forms named decides, so a filter-bar grant is never withheld by a stricter
 * create-form rule (each form still enforces its own rule in the browser).
 */
async function filterRows(user, pageKey, forms, key, rows, ownerFields = ['createdBy']) {
  const list = Array.isArray(rows) ? rows : [];
  const formList = Array.isArray(forms) ? forms : [forms];
  const filters = await Promise.all(formList.map((form) => dropdownFilter(user, pageKey, form, key, ownerFields)));
  if (filters.some((filter) => filter === null)) return list;
  const allowed = new Set();
  filters.forEach((filter) => {
    if (isHidden(filter)) return;
    const clauses = filter.$or ? filter.$or : [filter];
    clauses.forEach((clause) => Object.values(clause).forEach((cond) => (cond.$in || []).forEach((id) => allowed.add(String(id)))));
  });
  if (!allowed.size) return [];
  return list.filter((row) => ownerFields.some((field) => {
    const value = row?.[field];
    return value != null && allowed.has(String(value?._id || value));
  }));
}

module.exports = { HIDDEN, isHidden, dropdownRule, dropdownFilter, requestDropdownFilter, filterRows };
