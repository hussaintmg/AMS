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
 * A role that has never been through Role Jobs has no job row at all. Granting
 * the page in Roles & Permissions is itself the read grant, so such a role is
 * read-only — anything that writes needs a job row that says so. That is the
 * rule the server applies (`utils/roleJobs.js canDo`), and it is the rule here,
 * because the whole point of this helper is that the operator is never offered a
 * button whose only outcome is a 403. It used to answer `true` for every action
 * of an unconfigured role, which drew the full toolbar and then refused every
 * click on it — the "access denied everywhere" the operators were reporting.
 *
 * `legacy` overrides that for the one screen that has a reason to (Payroll's
 * run controls); leave it alone everywhere else.
 */
export const pageActions = (user, pageKey, legacy) => (action) => {
  if (getRoleJob(user, pageKey)) return canRoleDo(user, pageKey, action);
  return legacy === undefined ? action === 'view' : legacy;
};

/**
 * Is an optional module switched on for this installation?
 *
 * The flags ride on the session (`/auth/me` → `modules`), set in Server
 * Management → Custom. A screen that offers to send someone to a module that is
 * off would be offering a door that is locked: the page is not in the menu and
 * its API answers 404.
 *
 * Unknown flags read as ON, so a build that has not been told about a module
 * behaves exactly as it did before the flag existed.
 */
export const moduleOn = (user, key) => {
  const modules = user?.modules;
  if (!modules || !(key in modules)) return true;
  return modules[key] === true;
};

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
 * May the operator use a "+ Create X" shortcut on this form — the whole
 * question, in one call.
 *
 *   canUseQuickCreate(user, { host: 'customers', form, key: 'source', owner: 'lead_master' })
 *
 * `host` is the page whose form the shortcut sits in, `key` is what it raises
 * and `owner` is the master-data page that record belongs to.
 *
 * Two ways to be allowed, and either is enough:
 *   1. the owning master-data page's Create right — a Lead Master Data user may
 *      raise a source from anywhere, as before; or
 *   2. Create on the page hosting the form, with the shortcut still ticked in
 *      Role Jobs -> <page> -> Forms.
 *
 * The second is what makes the tick worth having. Requiring the owning page as
 * well meant a sales clerk could only be allowed to name a new source by being
 * handed the entire Lead Master Data screen, so nobody was — and the shortcut
 * was drawn for them regardless, with a 403 behind it. Withholding the shortcut
 * in Role Jobs closes both the button and the endpoint; `authorizeQuickCreate`
 * on the server answers exactly this question again.
 */
export const canUseQuickCreate = (user, { host, form = 'create', key, owner }) => {
  if (host && !canQuickCreate(user, host, form, key)) return false;
  if (owner && pageActions(user, owner)('create')) return true;
  return Boolean(host) && Boolean(getRoleJob(user, host)) && canRoleDo(user, host, 'create');
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
