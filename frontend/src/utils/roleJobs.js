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
