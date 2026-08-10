import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canViewPage, getFirstAllowedPage } from '../utils/permissions';

const pageKeyMap = {
    '/admin/users': 'users',
    '/admin/roles': 'roles',
    '/admin/departments': 'departments',
    '/admin/statuses': 'statuses',
    '/server-management': 'server-management',
    '/logs': 'logs',
};

const PrivateRoute = ({ allowedRoles = [], pageKey }) => {
    const { user, loading, hasRole, effectivePermissions, isSuperAdmin } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (location.pathname === '/no-access') {
        return <Outlet />;
    }

    if (isSuperAdmin) {
        return <Outlet />;
    }

    const enabledPerms = (effectivePermissions || []).filter((p) => p.canView === true && p.isActive !== false);
    if (!enabledPerms.length) {
        return <Navigate to="/no-access" replace />;
    }

    const effectivePageKey = pageKey || pageKeyMap[location.pathname];

    if (allowedRoles.length > 0 && !hasRole(allowedRoles)) {
        return <Navigate to={getFirstAllowedPage(effectivePermissions)} replace />;
    }

    if (effectivePageKey && !canViewPage(user, effectivePageKey)) {
        // Named, not bounced — see the note in App.js's ProtectedPage.
        return <Navigate to="/no-access" replace state={{ deniedPath: location.pathname }} />;
    }

    return <Outlet />;
};

export default PrivateRoute;
