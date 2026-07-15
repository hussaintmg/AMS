const { User } = require('../models');

const getJob = (user, pageKey) => {
  if (user?.isSuperAdmin || user?.role_name === 'super_admin' || user?.role?.name === 'super_admin') return { superAdmin: true };
  return (user?.role?.jobs || []).find((item) => item.pageKey === pageKey || item.module === pageKey) || null;
};

const canDo = (user, pageKey, action = 'view') => {
  const job = getJob(user, pageKey);
  if (job?.superAdmin) return true;
  if (!job) return false;
  return action === 'view' ? job.actions?.view !== false : job.actions?.[action] === true;
};

const requireJob = (pageKey, action = 'view') => (req, res, next) => {
  if (!canDo(req.user, pageKey, action)) return res.status(403).json({ success: false, message: `Permission denied: cannot ${action} ${pageKey}` });
  next();
};

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
  return [...ids];
}

async function scopeFilter(user, pageKey, ownerFields = ['createdBy']) {
  const ids = await allowedOwnerIds(user, pageKey);
  if (ids === null) return {};
  const fields = Array.isArray(ownerFields) ? ownerFields : [ownerFields];
  return { $or: fields.map((field) => ({ [field]: { $in: ids } })) };
}

module.exports = { getJob, canDo, requireJob, allowedOwnerIds, scopeFilter };
