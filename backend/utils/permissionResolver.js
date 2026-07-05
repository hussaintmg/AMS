const { SystemSetting } = require('../models');

const SETTINGS_DEFAULTS = {
  logPermissionMode: 'role',
};

const normalizeRoleName = (role) => {
  const value = typeof role === 'object' ? role?.name : role;
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
};

const normalizeSettingValue = (key, value) => (
  value === 'user' || value === 'role' ? value : SETTINGS_DEFAULTS[key]
);

const getSystemSettingValue = async (key) => {
  const fallback = SETTINGS_DEFAULTS[key];
  const setting = await SystemSetting.findOneAndUpdate(
    { key },
    {
      $setOnInsert: {
        key,
        value: fallback,
        category: 'permissions',
        description: 'Controls whether log visibility comes from role log permissions or user log permissions.',
      },
    },
    { upsert: true, setDefaultsOnInsert: true, returnDocument: 'after' },
  ).lean();

  return normalizeSettingValue(key, setting?.value);
};

const getPermissionSettings = async () => ({
  logPermissionMode: await getSystemSettingValue('logPermissionMode'),
});

const hasAnyEnabledPagePermission = (permissions = []) =>
  Array.isArray(permissions) && permissions.some((p) => (
    p &&
    (p.canView === true || p.actions?.view === true) &&
    p.isActive !== false &&
    (p.pageKey || p.path || p.module)
  ));

const hasActivePagePermissions = hasAnyEnabledPagePermission;

const resolvePagePermissions = (user) => {
  if (!user) return [];
  const customPerms = Array.isArray(user.customPermissions) ? user.customPermissions : [];
  if (hasActivePagePermissions(customPerms)) {
    return customPerms.filter((p) => p && p.isActive !== false);
  }
  const perms = Array.isArray(user.role?.permissions) ? user.role.permissions : [];
  return perms.filter((p) => p && p.isActive !== false);
};

const permissionAllowsView = (permission, target) => {
  if (!permission || (permission.canView !== true && permission.actions?.view !== true)) return false;
  const candidates = [target.pageKey, target.key, target.name, target.path, target.module].filter(Boolean);
  return candidates.some((candidate) => (
    permission.pageKey === candidate ||
    permission.path === candidate ||
    permission.module === candidate
  ));
};

const canAccessTarget = (user, target) => {
  if (!user) return false;
  if (normalizeRoleName(user.role || user.role_name) === 'super_admin') return true;
  if (!target) return false;
  const permissions = resolvePagePermissions(user);
  if (!permissions.length) return false;
  return permissions.some((permission) => permissionAllowsView(permission, target));
};

const routeTarget = (req) => {
  const path = String(req.originalUrl || req.path || '').split('?')[0].replace(/^\/api/, '');
  if (path.startsWith('/server-management')) {
    return { pageKey: 'server_management', path: '/server-management', module: 'server-management' };
  }
  if (path.startsWith('/logs')) {
    return { pageKey: 'logs', path: '/logs', module: 'logs' };
  }
  if (path.startsWith('/admin/users')) {
    return { pageKey: 'user_management', path: '/admin/users', module: 'users' };
  }
  if (path.startsWith('/admin/roles') || path.startsWith('/admin/permissions')) {
    return { pageKey: 'role_management', path: '/admin/roles', module: 'roles' };
  }
  if (path.startsWith('/admin/departments')) {
    return { pageKey: 'department_management', path: '/admin/departments', module: 'departments' };
  }
  if (path.startsWith('/profile')) {
    return { pageKey: 'profile', path: '/profile', module: 'profile' };
  }
  return null;
};

const canAccessRequest = (req) => canAccessTarget(req.user, routeTarget(req));

const getEffectivePermissions = resolvePagePermissions;

module.exports = {
  getSystemSettingValue,
  getPermissionSettings,
  resolvePagePermissions,
  getEffectivePermissions,
  canAccessTarget,
  canAccessRequest,
  normalizeRoleName,
  hasActivePagePermissions,
  hasAnyEnabledPagePermission,
};
