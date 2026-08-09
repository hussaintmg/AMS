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
