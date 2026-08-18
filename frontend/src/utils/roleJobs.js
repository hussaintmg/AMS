export const getRoleJob = (user, pageKey) => {
  const role = user?.roleObject || (typeof user?.role === 'object' ? user.role : null);
  const roleName = role?.name || user?.role_name || user?.role;
  if (roleName === 'super_admin') return { superAdmin: true };
  return (role?.jobs || user?.jobs || []).find((item) => item.pageKey === pageKey || item.module === pageKey) || null;
};

export const canRoleDo = (user, pageKey, action = 'view') => {
  const job = getRoleJob(user, pageKey);
  if (job?.superAdmin) return true;
  if (!job) return false;
  return action === 'view' ? job.actions?.view !== false : job.actions?.[action] === true;
};

/**
 * What this role may do on one page, ready to gate buttons with.
 *
 *   const can = pageActions(user, 'employees');
 *   {can('create') && <button>Add Employee</button>}
 *
 * A role that has never been through Role Jobs has no job row at all, and page
 * access on its own is read-only by design. Screens were written before that
 * existed, so `legacy` decides what such a role sees — `true` keeps today's
 * behaviour rather than emptying the toolbar of every role nobody has configured
 * yet. Once a job row exists it is the only thing consulted.
 *
 * The server enforces the same rule regardless; this is so the operator is not
 * offered a button whose only outcome is a 403.
 */
export const pageActions = (user, pageKey, legacy = true) => (action) => (
  getRoleJob(user, pageKey) ? canRoleDo(user, pageKey, action) : legacy
);

export const roleDataScope = (user, pageKey) => {
  const job = getRoleJob(user, pageKey);
  return job?.superAdmin ? { mode: 'all', ownIncluded: true } : { mode: job?.dataScope?.mode || 'own', roles: job?.dataScope?.roles || [], users: job?.dataScope?.users || [], ownIncluded: true };
};

/**
 * Whether a role may read one field of a page — the customer's phone on
 * Invoices, the purchase price on Parts, and so on.
 *
 * The API strips withheld keys from its responses, so this is only about not
 * drawing an empty column: anything it lets through is data the server already
 * agreed to send. A page with no field restriction (the default) shows
 * everything, which is why an absent job or an absent `fields` block means yes.
 *
 * `pageKey` may be a list for screens that serve several pages — the parts and
 * vehicle sales tabs share one component — and the first page the role holds a
 * job on decides.
 */
export const canSeeField = (user, pageKey, fieldKey) => {
  const keys = Array.isArray(pageKey) ? pageKey : [pageKey];
  const resolved = keys.find((key) => getRoleJob(user, key)) || keys[0];
  const job = getRoleJob(user, resolved);
  if (!job || job.superAdmin) return true;
  const fields = job.fields;
  if (!fields || fields.mode !== 'selected') return true;
  return (fields.allowed || []).includes(fieldKey);
};

/** Bound helper so a screen can write `showField('customer')`. */
export const fieldAccessor = (user, pageKey) => (fieldKey) => canSeeField(user, pageKey, fieldKey);

// ═══════════════════════════════════════════════════════════════════════════
// Screen-level grants (constants/pageCatalog.js on the server)
// ═══════════════════════════════════════════════════════════════════════════
//
// The API-level `fields` mask above decides what data the server sends. These
// decide what the *screen* draws with it: which table columns, which rows of a
// record's drawer, which of the drawer's own buttons, which "+ Create X"
// shortcuts inside a form, and whose records a dropdown offers. Every default
// is "everything", so a role nobody has configured looks exactly as it did.

/** "Selling Price" → "selling_price" — the same slug the catalog uses. */
export const catalogSlug = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const allowList = (job, block) => {
  if (!job || job.superAdmin) return null;
  const setting = job[block];
  if (!setting || setting.mode !== 'selected') return null;
  return new Set((setting.allowed || []).map(String));
};

/** May the role see this table column (by catalog key, or by header text)? */
export const canSeeColumn = (user, pageKey, columnKeyOrLabel) => {
  const allowed = allowList(getRoleJob(user, pageKey), 'columns');
  if (!allowed) return true;
  const key = catalogSlug(columnKeyOrLabel);
  // Selection and Actions columns are never withheld — nothing to grant there.
  if (!key || key === 'actions') return true;
  return allowed.has(key);
};

/** May the role see this row of the record's drawer (by key or label)? */
export const canSeeDrawerField = (user, pageKey, fieldKeyOrLabel) => {
  const allowed = allowList(getRoleJob(user, pageKey), 'drawerFields');
  if (!allowed) return true;
  const key = catalogSlug(fieldKeyOrLabel);
  return !key || allowed.has(key);
};

/** May the role use this button inside the drawer (e.g. 'drawer.record_payment')? */
export const canUseDrawerExtra = (user, pageKey, extraKey) => {
  const allowed = allowList(getRoleJob(user, pageKey), 'drawerExtras');
  return !allowed || allowed.has(String(extraKey));
};

/**
 * May the role raise a new record from inside this page's form?
 * `form` is 'create' or 'edit'; `key` is what the shortcut raises
 * ('source', 'department', 'customer', 'service_type'…). The owning page's
 * Create right is still required — the caller checks that separately.
 */
export const canQuickCreate = (user, pageKey, form, key) => {
  const job = getRoleJob(user, pageKey);
  if (!job || job.superAdmin) return true;
  const setting = job.quickCreate;
  if (!setting || setting.mode !== 'selected') return true;
  const list = form === 'edit' ? setting.edit : setting.create;
  return (list || []).map(String).includes(String(key));
};

/**
 * The role's rule for one dropdown of one form: { mode, roles, users }, or
 * null when unrestricted. 'none' means the dropdown is hidden altogether.
 */
export const dropdownRule = (user, pageKey, form, key) => {
  const job = getRoleJob(user, pageKey);
  if (!job || job.superAdmin) return null;
  const rows = Array.isArray(job.dropdowns) ? job.dropdowns : [];
  return rows.find((row) => row.key === key && (row.form || 'create') === form) || null;
};

/** Whether a dropdown is shown at all for this role. */
export const canSeeDropdown = (user, pageKey, form, key) => dropdownRule(user, pageKey, form, key)?.mode !== 'none';

/**
 * Query-string hint a dropdown loader sends so the server can apply the
 * role's rule for exactly this dropdown:
 *   customerAPI.getAll({ ...dropdownHint('invoices', 'create', 'customer') })
 */
export const dropdownHint = (pageKey, form, key) => ({ forPage: pageKey, forForm: form, forField: key });

/**
 * The page key for the screen the browser is on, from the catalog's paths —
 * the longest page path the current path starts with, so /vehicle-sales/…
 * never resolves to a shorter unrelated page.
 */
export const pageKeyForPath = (user, pathname) => {
  const catalog = user?.pageCatalog || {};
  const target = String(pathname || '').split('?')[0].replace(/\/+$/, '').toLowerCase() || '/';
  let best = '';
  let bestLength = 0;
  Object.entries(catalog).forEach(([key, entry]) => {
    const path = String(entry?.path || '').toLowerCase();
    if (!path) return;
    if ((target === path || target.startsWith(`${path}/`)) && path.length > bestLength) { best = key; bestLength = path.length; }
  });
  return best;
};
