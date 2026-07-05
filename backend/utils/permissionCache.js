const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

const now = () => Date.now();

const get = (userId) => {
  if (!userId) return null;
  const entry = cache.get(String(userId));
  if (!entry) return null;
  if (now() > entry.expiresAt) {
    cache.delete(String(userId));
    return null;
  }
  return entry.permission;
};

const set = (userId, permission) => {
  if (!userId) return;
  cache.set(String(userId), {
    permission,
    expiresAt: now() + CACHE_TTL_MS,
  });
};

const invalidate = (userId) => {
  if (userId) {
    cache.delete(String(userId));
  }
};

const invalidateAll = () => {
  cache.clear();
};

const invalidateByRolePermissionChange = async (roleId) => {
  const User = require('../models/User.model');
  const users = await User.find({ role: roleId }).select('_id').lean();
  for (const user of users) {
    cache.delete(String(user._id));
  }
};

const invalidateByUserIds = (userIds) => {
  for (const id of userIds) {
    if (id) cache.delete(String(id));
  }
};

const size = () => cache.size;

module.exports = {
  get,
  set,
  invalidate,
  invalidateAll,
  invalidateByRolePermissionChange,
  invalidateByUserIds,
  size,
};
