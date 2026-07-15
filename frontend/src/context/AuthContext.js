import React, { createContext, useState, useContext, useEffect } from 'react';
import { authAPI } from '../services/api';
import { isSuperAdmin, canViewPage, canAccessPath, getEffectivePermissions } from '../utils/permissions';
import eventBus from '../utils/eventBus';

const AuthContext = createContext(null);

const normalizeUser = (user) => {
    if (!user) return null;
    const roleName = typeof user.role === 'object'
        ? user.role?.name
        : user.role;
    const roleDisplayName = typeof user.role === 'object'
        ? user.role?.displayName || user.role?.name
        : user.roleDisplayName || user.role_display_name || roleName;
    const roleObject = typeof user.role === 'object' ? user.role : user.roleObject || null;
    const roleLogPermissions = user.roleLogPermissions || roleObject?.logsPermissions || [];
    const customPermissions = user.customPermissions || [];

    return {
        ...user,
        firstName: user.firstName || user.first_name || '',
        lastName: user.lastName || user.last_name || '',
        first_name: user.first_name || user.firstName || '',
        last_name: user.last_name || user.lastName || '',
        role: roleName || user.role_name || '',
        roleObject,
        role_name: user.role_name || roleName || '',
        roleDisplayName: roleDisplayName || '',
        role_display_name: roleDisplayName || '',
        logPermissionMode: user.logPermissionMode || 'role',
        permissions: getEffectivePermissions({ ...user, role: roleObject, customPermissions }),
        customPermissions,
        logPermissionSource: user.logPermissionSource || 'role',
        logsPermissions: user.logsPermissions || [],
        roleLogPermissions,
        isSuperAdmin: isSuperAdmin({ ...user, role: roleName || user.role_name || '' }),
    };
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const restoreSession = async () => {
            try {
                const response = await authAPI.getProfile();
                const normalizedUser = normalizeUser(response.data.data);
                setUser(normalizedUser);
                eventBus.dispatch('auth:login', normalizedUser);
            } catch (error) {
                setUser(null);
            }

            setLoading(false);
        };

        restoreSession();
        const handleProfileUpdate = (payload) => {
            setUser((current) => current ? normalizeUser({ ...current, ...(payload.user || {}), avatar: payload.avatar ?? payload.user?.avatar ?? current.avatar }) : current);
        };
        eventBus.on('profile:updated', handleProfileUpdate);
        return () => eventBus.remove('profile:updated', handleProfileUpdate);
    }, []);

    const login = async (email, password) => {
        try {
            const response = await authAPI.login({ email, password });
            const payload = response.data.data;
            if (payload.token) localStorage.setItem('token', payload.token);
            if (payload.refreshToken) localStorage.setItem('refreshToken', payload.refreshToken);
            const meResponse = await authAPI.getProfile();
            const normalizedUser = normalizeUser({
                ...(meResponse.data?.data || payload.user),
                ...payload.user,
                logPermissionMode: payload.logPermissionMode || payload.user?.logPermissionMode,
            });
            normalizedUser.permissions = getEffectivePermissions(normalizedUser);

            setUser(normalizedUser);
            eventBus.dispatch('auth:login', normalizedUser);
            return { success: true };
        } catch (error) {
            const message = error.response?.data?.message || 'Login failed';
            return { success: false, message };
        }
    };

    const logout = async () => {
        try {
            await authAPI.logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('refreshToken');
            sessionStorage.removeItem('user');
            eventBus.dispatch('auth:logout');
            setUser(null);
        }
    };

    const hasRole = (allowedRoles) => {
        if (!user) return false;
        if (!allowedRoles || allowedRoles.length === 0) return true;
        const normalize = (r) => String(r || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const ur = normalize(user.role);
        return allowedRoles.some((ar) => normalize(ar) === ur);
    };

    const canView = (pageKey) => {
        if (!user) return false;
        return canViewPage(user, pageKey);
    };

    const canAccess = (path) => {
        if (!user) return false;
        return canAccessPath(user, path);
    };

    const refreshUser = async () => {
        try {
            const response = await authAPI.getProfile();
            const normalizedUser = normalizeUser(response.data.data);
            setUser(normalizedUser);
            eventBus.dispatch('auth:login', normalizedUser);
        } catch (error) {
            console.error('Failed to refresh user:', error);
        }
    };

    return (
        <AuthContext.Provider value={{
            user, loading, login, logout, hasRole,
            canView, canAccess, refreshUser,
            isSuperAdmin: user?.isSuperAdmin || false,
            logPermissionMode: user?.logPermissionMode || 'role',
            effectivePermissions: user ? getEffectivePermissions(user) : [],
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
