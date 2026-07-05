const { Types } = require('mongoose');
const Role = require('../models/Role.model');
const User = require('../models/User.model');

const normalizeRoleName = (role) => {
  const value = typeof role === 'object' ? role?.name : role;
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};

const isSuperAdmin = (user) => normalizeRoleName(user.role || user.role_name) === 'super_admin';

const normalizeLogPermissionIds = (items = []) =>
  Array.isArray(items) ? items.map((item) => String(item?._id || item)).filter(Boolean) : [];

const normalizeLogPermissionsConfig = (permissions) => {
  if (!permissions) return { mode: 'own', users: [], roles: [] };

  if (Array.isArray(permissions)) {
    const active = permissions.filter((p) => p?.isActive !== false);
    const all = active.some((p) => p?.type === 'all');
    const users = active.filter((p) => p?.type === 'user' && p.refId).map((p) => String(p.refId));
    const roles = active.filter((p) => p?.type === 'role' && p.refId).map((p) => String(p.refId));

    if (all) return { mode: 'all', users: [], roles: [] };
    if (users.length) return { mode: 'selected_users', users, roles: [] };
    if (roles.length) return { mode: 'selected_roles', users: [], roles };
    return { mode: 'own', users: [], roles: [] };
  }

  const mode = ['own', 'selected_users', 'selected_roles', 'all'].includes(permissions?.mode)
    ? permissions.mode
    : 'own';

  return {
    mode,
    users: mode === 'selected_users' ? normalizeLogPermissionIds(permissions?.users) : [],
    roles: mode === 'selected_roles' ? normalizeLogPermissionIds(permissions?.roles) : [],
  };
};

const hasCustomLogPermissions = (permissions) => {
  const normalized = normalizeLogPermissionsConfig(permissions);
  return normalized.mode !== 'own' || normalized.users.length > 0 || normalized.roles.length > 0;
};

const resolveLogPermissions = (user) => {
  if (!user) return { mode: 'own', users: [], roles: [] };
  const roleLogPerms = normalizeLogPermissionsConfig(user.role?.logsPermissions || user.roleLogPermissions);
  const userLogPerms = normalizeLogPermissionsConfig(user.logsPermissions);

  if (user.logPermissionSource === 'user' && hasCustomLogPermissions(user.logsPermissions)) {
    return userLogPerms;
  }

  return roleLogPerms;
};

const effectivePermission = (user) => {
  if (isSuperAdmin(user)) {
    return { mode: 'all', source: 'super_admin' };
  }

  const source = user.logPermissionSource || 'role';

  if (source === 'user') {
    const p = user.logsPermissions;
    const mode = ['own', 'selected_users', 'selected_roles', 'all'].includes(p?.mode) ? p.mode : 'own';
    const users = mode === 'selected_users' ? (p?.users || []).filter(Boolean).map((u) => String(u)) : [];
    const roles = mode === 'selected_roles' ? (p?.roles || []).filter(Boolean).map((r) => String(r)) : [];
    return { mode, users, roles, source: 'user' };
  }

  const rolePerms = user.role?.logsPermissions || user.roleLogPermissions || {};
  const mode = ['own', 'selected_users', 'selected_roles', 'all'].includes(rolePerms?.mode) ? rolePerms.mode : 'own';
  const users = mode === 'selected_users' ? (rolePerms?.users || []).filter(Boolean).map((u) => String(u)) : [];
  const roles = mode === 'selected_roles' ? (rolePerms?.roles || []).filter(Boolean).map((r) => String(r)) : [];
  return { mode, users, roles, source: 'role' };
};

const resolveEffectiveLogPermission = effectivePermission;

const buildAllowedLogsQuery = async (permission, currentUserId) => {
  if (!permission) return { 'user.id': { $in: [] } };

  if (permission.mode === 'all') {
    return {};
  }

  const userIdStr = String(currentUserId || '');
  const userIdOrClause = Types.ObjectId.isValid(userIdStr)
    ? [{ 'user.id': userIdStr }, { user: new Types.ObjectId(userIdStr) }]
    : [{ 'user.id': userIdStr }];

  if (permission.mode === 'own') {
    return {
      $or: userIdOrClause,
      serverError: { $ne: true },
    };
  }

  if (permission.mode === 'selected_users') {
    const allowedIds = [...new Set([userIdStr, ...(permission.users || [])])].filter(Boolean);
    if (!allowedIds.length) return { 'user.id': userIdStr, serverError: { $ne: true } };
    const validObjectIds = allowedIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    const orClause = [...userIdOrClause];
    if (allowedIds.length > 1 || allowedIds[0] !== userIdStr) {
      orClause.push({ 'user.id': { $in: allowedIds } });
    }
    if (validObjectIds.length) {
      orClause.push({ user: { $in: validObjectIds } });
    }
    return { $or: orClause, serverError: { $ne: true } };
  }

  if (permission.mode === 'selected_roles') {
    const roleIds = (permission.roles || []).filter(Boolean);
    if (!roleIds.length) return { 'user.id': userIdStr, serverError: { $ne: true } };

    const selectedRoles = await Role.find({ _id: { $in: roleIds } }).select('name').lean();
    const roleNames = [...new Set(selectedRoles.map((r) => r.name).filter(Boolean))];
    if (!roleNames.length) return { 'user.id': userIdStr, serverError: { $ne: true } };

    return {
      $or: [
        ...userIdOrClause,
        { 'user.role': { $in: roleNames } },
        { roleName: { $in: roleNames } },
        { role: { $in: roleNames } },
      ],
      serverError: { $ne: true },
    };
  }

  return { 'user.id': userIdStr, serverError: { $ne: true } };
};

const canReadLog = (effectivePermission, log, currentUserId) => {
  if (!effectivePermission || !log) return false;
  if (effectivePermission.mode === 'all') return true;

  const logUserId = String(log.user?.id || log.userId || '');
  const currentId = String(currentUserId || '');

  if (effectivePermission.mode === 'own') {
    return logUserId === currentId;
  }

  if (effectivePermission.mode === 'selected_users') {
    const allowedIds = new Set([currentId, ...(effectivePermission.users || []).map(String)]);
    return allowedIds.has(logUserId);
  }

  if (effectivePermission.mode === 'selected_roles') {
    const logRole = String(log.user?.role || log.roleName || log.role || '');
    return (effectivePermission.roles || []).some((r) => String(r) === logRole);
  }

  return false;
};

const resolveAllowedUsers = (effectivePermission, currentUserId) => {
  if (!effectivePermission) return [];
  if (effectivePermission.mode === 'all') return 'all';
  if (effectivePermission.mode === 'own') return [String(currentUserId || '')];
  if (effectivePermission.mode === 'selected_users') {
    return [...new Set([String(currentUserId || ''), ...(effectivePermission.users || []).map(String)])];
  }
  return [];
};

const resolveAllowedRoles = (effectivePermission) => {
  if (!effectivePermission) return [];
  if (effectivePermission.mode === 'all') return 'all';
  if (effectivePermission.mode === 'selected_roles') return [...(effectivePermission.roles || [])];
  return [];
};

module.exports = {
  effectivePermission,
  resolveEffectiveLogPermission,
  buildAllowedLogsQuery,
  canReadLog,
  resolveAllowedUsers,
  resolveAllowedRoles,
  isSuperAdmin,
  resolveLogPermissions,
  normalizeLogPermissionsConfig,
  hasCustomLogPermissions,
};
