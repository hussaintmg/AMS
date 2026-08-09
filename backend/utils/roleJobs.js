const { User } = require('../models');

const getJob = (user, pageKey) => {
  if (user?.isSuperAdmin || user?.role_name === 'super_admin' || user?.role?.name === 'super_admin') return { superAdmin: true };
  return (user?.role?.jobs || []).find((item) => item.pageKey === pageKey || item.module === pageKey) || null;
};

const canDo = (user, pageKey, action = 'view') => {
  const job = getJob(user, pageKey);
  if (job?.superAdmin) return true;
  // Granting the page in Roles Permissions is itself the read grant, so a role
  // that has never been through Role Jobs is read-only rather than locked out.
  // Anything that writes still needs the job to say so explicitly.
  if (!job) return action === 'view';
  return action === 'view' ? job.actions?.view !== false : job.actions?.[action] === true;
};

const requireJob = (pageKey, action = 'view') => (req, res, next) => {
  if (!canDo(req.user, pageKey, action)) return res.status(403).json({ success: false, message: `Permission denied: cannot ${action} ${pageKey}` });
  next();
};

/** Ids of every super admin — never included in another role's data scope. */
async function superAdminIds() {
  const { Role } = require('../models');
  const roles = await Role.find({ name: 'super_admin' }).select('_id').lean();
  if (!roles.length) return [];
  const users = await User.find({ role: { $in: roles.map((role) => role._id) } }).select('_id').lean();
  return users.map((user) => String(user._id));
}

/**
 * Which users' records this user may see on a page.
 * `null` means no restriction (super admin, or dataScope "all").
 * Otherwise it is always own data plus whatever the scope adds — and never a
 * super admin's data, whatever the scope says.
 */
async function allowedOwnerIds(user, pageKey) {
  const ownId = String(user?.id || user?._id || '');
  const job = getJob(user, pageKey);
  if (job?.superAdmin || job?.dataScope?.mode === 'all') return null;
  const ids = new Set(ownId ? [ownId] : []);
  if (job?.dataScope?.mode === 'selected_users') (job.dataScope.users || []).forEach((id) => ids.add(String(id?._id || id)));
  if (job?.dataScope?.mode === 'selected_roles') {
    const roleIds = (job.dataScope.roles || []).map((id) => id?._id || id);
    const users = await User.find({ role: { $in: roleIds }, isActive: true }).select('_id').lean();
    users.forEach((item) => ids.add(String(item._id)));
  }
  if (ids.size > (ownId ? 1 : 0)) {
    // Enforced here, not only hidden in the picker: a scope must never reach a
    // super admin's records.
    const superAdmins = await superAdminIds();
    superAdmins.forEach((id) => { if (id !== ownId) ids.delete(id); });
  }
  return [...ids];
}

async function scopeFilter(user, pageKey, ownerFields = ['createdBy']) {
  const ids = await allowedOwnerIds(user, pageKey);
  if (ids === null) return {};
  const fields = Array.isArray(ownerFields) ? ownerFields : [ownerFields];
  return { $or: fields.map((field) => ({ [field]: { $in: ids } })) };
}

module.exports = { getJob, canDo, requireJob, allowedOwnerIds, scopeFilter, superAdminIds };
