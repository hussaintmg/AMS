const normalizePermission = (permission = {}) => ({
  pageKey: permission.pageKey || permission.name || permission.key || '',
  path: permission.path || '',
  module: permission.module || '',
  canView: permission.canView === true || permission.actions?.view === true,
  isActive: permission.isActive !== false
});

const normalizePermissions = (permissions = []) => (
  Array.isArray(permissions)
    ? permissions.map(normalizePermission).filter((p) => p.pageKey || p.path || p.module)
    : []
);

const hasPagePermission = (user, pageKeyOrPath) => {
  if (!user || !pageKeyOrPath) return false;
  const roleName = typeof user.role === 'object' ? user.role?.name : user.role;
  if (roleName === 'super_admin' || user.isSuperAdmin) return true;
  const permissions = normalizePermissions(user.role?.permissions || user.permissions || []);
  if (!permissions.length) return false;
  return permissions.some((p) => (
    p.canView === true && p.isActive !== false &&
    (p.pageKey === pageKeyOrPath || p.path === pageKeyOrPath || p.module === pageKeyOrPath)
  ));
};

module.exports = {
  normalizePermission,
  normalizePermissions,
  hasPagePermission,
};
