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
