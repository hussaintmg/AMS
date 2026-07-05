const normalizeRole = (role) => {
    const value = typeof role === 'object' ? role?.name : role;
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
};

const normalizePagePermission = (permission = {}) => ({
    pageKey: permission.pageKey || permission.name || permission.key || '',
    path: permission.path || '',
    module: permission.module || '',
    canView: permission.canView === true || permission.actions?.view === true,
    isActive: permission.isActive !== false,
});

const normalizePermissions = (permissions = []) => (
    Array.isArray(permissions)
        ? permissions.map(normalizePagePermission).filter((p) => p.pageKey || p.path || p.module)
        : []
);

const hasActivePagePermissions = (permissions = []) =>
    normalizePermissions(permissions).filter((p) => p.isActive && p.canView).length > 0;

const hasAnyEnabledPagePermission = hasActivePagePermissions;

export const isSuperAdmin = (user) => normalizeRole(user?.role_name || user?.role) === 'super_admin';

export const getEffectivePermissions = (user) => {
    if (!user) return [];
    const customPermissions = normalizePermissions(user.customPermissions || []);
    if (hasActivePagePermissions(customPermissions)) {
        return customPermissions;
    }
    return normalizePermissions(user.role?.permissions || user.permissions || []);
};

export const canViewPage = (user, pageKey) => {
    if (!user) return false;
    if (isSuperAdmin(user)) return true;
    const permissions = getEffectivePermissions(user);
    if (!permissions.length) return false;
    return permissions.some((p) => (
        p.isActive && p.canView &&
        (p.pageKey === pageKey || p.module === pageKey || p.path === pageKey)
    ));
};

export const canAccessPath = (user, path) => {
    if (!user) return false;
    if (isSuperAdmin(user)) return true;

    const normalizedPath = String(path || '').split('?')[0].replace(/\/$/, '') || '/';

    const permissions = getEffectivePermissions(user);
    return permissions.some((p) => {
        if (!p.isActive || !p.canView) return false;
        const permissionPath = String(p.path || '').replace(/\/$/, '');
        return permissionPath === normalizedPath ||
            (permissionPath && normalizedPath.startsWith(`${permissionPath}/`)) ||
            p.pageKey === normalizedPath ||
            p.module === normalizedPath.replace(/^\//, '');
    });
};

export const getFirstAllowedPage = (permissions) => {
    const enabled = (permissions || []).filter((p) => p.canView === true && p.isActive !== false);
    if (!enabled.length) return '/no-access';
    const first = enabled[0];
    return first.path || `/${first.pageKey}` || `/${first.module}` || '/no-access';
};

export default {
    getEffectivePermissions,
    canViewPage,
    canAccessPath,
    isSuperAdmin,
    getFirstAllowedPage,
    hasAnyEnabledPagePermission,
};
