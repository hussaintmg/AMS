import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { serverManagementAPI } from '../services/api';
import { showApiSuccess, showApiError, getErrorMessage } from '../utils/toastResponse';
import eventBus from '../utils/eventBus';

const ServerManagementContext = createContext(null);

const asArray = (value) => Array.isArray(value) ? value : [];
const responseList = (response, key) => {
    const payload = response?.data?.data ?? response?.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
    return [];
};
const responsePayload = (response) => response?.data?.data ?? response?.data ?? {};
const responseSuccess = (response) => response?.status >= 200 && response?.status < 300 && response?.data?.success === true;
const responseMessage = (response, fallback) => response?.data?.message || fallback;
const ensureSuccess = (response, fallback) => {
    if (!responseSuccess(response)) {
        throw new Error(responseMessage(response, fallback));
    }
    return responseMessage(response, fallback);
};

export function ServerManagementProvider({ children }) {
    const [pages, setPages] = useState([]);
    const [sidebarPages, setSidebarPages] = useState([]);
    const [roles, setRoles] = useState([]);
    const [users, setUsers] = useState([]);
    const [logPermissionMode, setLogPermissionMode] = useState('role');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const loaded = useRef(false);

    const pageList = useMemo(() => asArray(pages), [pages]);
    const roleList = useMemo(() => asArray(roles), [roles]);
    const userList = useMemo(() => asArray(users), [users]);
    const activePages = useMemo(() => pageList.filter((page) => page.isActive !== false), [pageList]);

    useEffect(() => {
        const reset = () => {
            setPages([]);
            setSidebarPages([]);
            setRoles([]);
            setUsers([]);
            setLogPermissionMode('role');
            setLoading(false);
            setError(null);
            loaded.current = false;
        };
        eventBus.on('auth:logout', reset);
        return () => eventBus.remove('auth:logout', reset);
    }, []);

    const loadPages = useCallback(async () => {
        try {
            const res = await serverManagementAPI.getPages();
            const nextPages = responseList(res, 'pages');
            setPages(nextPages);
            return nextPages;
        } catch (err) {
            const msg = getErrorMessage(err, 'Failed to load pages');
            setError(msg);
            throw err;
        }
    }, []);

    const loadSidebar = useCallback(async () => {
        try {
            const res = await serverManagementAPI.getSidebar();
            const nextPages = responseList(res, 'pages');
            setSidebarPages(nextPages);
            return nextPages;
        } catch (err) {
            const msg = getErrorMessage(err, 'Failed to load sidebar');
            setError(msg);
            throw err;
        }
    }, []);

    const loadRoles = useCallback(async () => {
        try {
            const res = await serverManagementAPI.getRoles();
            const nextRoles = responseList(res, 'roles');
            setRoles(nextRoles);
            return nextRoles;
        } catch (err) {
            const msg = getErrorMessage(err, 'Failed to load roles');
            setError(msg);
            throw err;
        }
    }, []);

    const loadUsers = useCallback(async () => {
        try {
            const res = await serverManagementAPI.getUserPermissions();
            const nextUsers = responseList(res, 'users');
            setUsers(nextUsers);
            return nextUsers;
        } catch (err) {
            const msg = getErrorMessage(err, 'Failed to load users');
            setError(msg);
            throw err;
        }
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [pagesRes, rolesRes, usersRes] = await Promise.all([
                serverManagementAPI.getPages(),
                serverManagementAPI.getRoles(),
                serverManagementAPI.getUserPermissions()
            ]);
            const nextPages = responseList(pagesRes, 'pages');
            const nextRoles = responseList(rolesRes, 'roles');
            const nextUsers = responseList(usersRes, 'users');
            setPages(nextPages);
            setRoles(nextRoles);
            setUsers(nextUsers);
            return { pages: nextPages, roles: nextRoles, users: nextUsers };
        } catch (err) {
            const msg = getErrorMessage(err, 'Failed to load server management data');
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const handleLogin = () => {
            loaded.current = false;
        };
        eventBus.on('auth:login', handleLogin);
        return () => eventBus.remove('auth:login', handleLogin);
    }, []);

    const refreshSidebar = useCallback(() => {
        window.dispatchEvent(new Event('ams:sidebar-refresh'));
    }, []);

    const syncPages = useCallback(async (defaults) => {
        try {
            const res = await serverManagementAPI.syncPages(defaults);
            return responsePayload(res);
        } catch (err) {
            throw err;
        }
    }, []);

    const createPage = useCallback(async (pageData) => {
        try {
            const res = await serverManagementAPI.createPage(pageData);
            const msg = ensureSuccess(res, 'Page created');
            const nextPages = responseList(res, 'pages');
            if (nextPages.length) setPages(nextPages);
            else setPages(prev => [...prev, responsePayload(res).page].filter(Boolean));
            refreshSidebar();
            showApiSuccess(res, 'Page created');
            return { success: true, message: msg };
        } catch (err) {
            showApiError(err, 'Unable to create page');
            return { success: false, message: getErrorMessage(err, 'Unable to create page') };
        }
    }, [refreshSidebar]);

    const updatePagesList = useCallback((updatedPages) => {
        setPages(updatedPages);
    }, []);

    const saveSidebar = useCallback(async (pagesOverride) => {
        try {
            const pagesToSave = pagesOverride || pageList;
            const res = await serverManagementAPI.updateSidebar(pagesToSave);
            const msg = ensureSuccess(res, 'Sidebar saved');
            const nextPages = responseList(res, 'pages');
            if (nextPages.length) setPages(nextPages);
            refreshSidebar();
            showApiSuccess(res, 'Sidebar saved');
            return { success: true, message: msg };
        } catch (err) {
            showApiError(err, 'Unable to save sidebar');
            return { success: false, message: getErrorMessage(err, 'Unable to save sidebar') };
        }
    }, [pageList, refreshSidebar]);

    const createRole = useCallback(async (roleData) => {
        try {
            const res = await serverManagementAPI.createRole(roleData);
            const msg = ensureSuccess(res, 'Role created');
            const rolesRes = await serverManagementAPI.getRoles();
            setRoles(responseList(rolesRes, 'roles'));
            showApiSuccess(res, 'Role created');
            return { success: true, message: msg };
        } catch (err) {
            showApiError(err, 'Unable to create role');
            return { success: false, message: getErrorMessage(err, 'Unable to create role') };
        }
    }, []);

    const updateRole = useCallback(async (roleData) => {
        try {
            const res = await serverManagementAPI.updateRoles(roleData);
            const msg = ensureSuccess(res, 'Role saved');
            const rolesRes = await serverManagementAPI.getRoles();
            setRoles(responseList(rolesRes, 'roles'));
            showApiSuccess(res, 'Role saved');
            return { success: true, message: msg };
        } catch (err) {
            showApiError(err, 'Unable to save role');
            return { success: false, message: getErrorMessage(err, 'Unable to save role') };
        }
    }, []);

    const deleteRole = useCallback(async (id) => {
        try {
            const res = await serverManagementAPI.deleteRole(id);
            const msg = ensureSuccess(res, 'Role deleted');
            setRoles(prev => prev.filter(r => (r._id || r.id) !== id));
            showApiSuccess(res, 'Role deleted');
            return { success: true, message: msg };
        } catch (err) {
            showApiError(err, 'Unable to delete role');
            return { success: false, message: getErrorMessage(err, 'Unable to delete role') };
        }
    }, []);

    const createUser = useCallback(async (formData) => {
        try {
            const payload = {
                email: formData.email,
                password: formData.password,
                firstName: formData.firstName,
                lastName: formData.lastName,
                phone: formData.phone,
                roleId: formData.roleId,
                department: formData.department,
                jobTitle: formData.jobTitle
            };
            const res = await serverManagementAPI.createUser(payload);
            const msg = ensureSuccess(res, 'User created successfully!');
            await loadUsers();
            showApiSuccess(res, 'User created successfully!');
            return { success: true, message: msg };
        } catch (err) {
            showApiError(err, 'Failed to create user');
            return { success: false, message: getErrorMessage(err, 'Failed to create user') };
        }
    }, [loadUsers]);

    const updateUserPermissions = useCallback(async (userId, permissions) => {
        try {
            const res = await serverManagementAPI.updateUserPermissions(userId, permissions);
            const msg = ensureSuccess(res, 'User permissions saved');
            await loadUsers();
            showApiSuccess(res, 'User permissions saved');
            return { success: true, message: msg };
        } catch (err) {
            showApiError(err, 'Unable to save user permissions');
            return { success: false, message: getErrorMessage(err, 'Unable to save user permissions') };
        }
    }, [loadUsers]);

    const updateRolePermissions = useCallback(async (roleId, permissions) => {
        try {
            const res = await serverManagementAPI.updateRolePermissions(roleId, permissions);
            const msg = ensureSuccess(res, 'Role permissions saved');
            await loadRoles();
            refreshSidebar();
            showApiSuccess(res, 'Role permissions saved');
            return { success: true, message: msg };
        } catch (err) {
            showApiError(err, 'Unable to save role permissions');
            return { success: false, message: getErrorMessage(err, 'Unable to save role permissions') };
        }
    }, [loadRoles, refreshSidebar]);

    const value = useMemo(() => ({
        pages: pageList,
        sidebarPages,
        roles: roleList,
        users: userList,
        activePages,
        logPermissionMode,
        loading,
        error,
        loadData,
        loadPages,
        loadSidebar,
        loadRoles,
        loadUsers,
        syncPages,
        createPage,
        updatePagesList,
        saveSidebar,
        createRole,
        updateRole,
        deleteRole,
        createUser,
        updateUserPermissions,
        updateRolePermissions,
        refreshSidebar,
        setPages,
        setRoles,
        setUsers
    }), [pageList, sidebarPages, roleList, userList, activePages, logPermissionMode, loading, error, loadData, loadPages, loadSidebar, loadRoles, loadUsers, syncPages, createPage, saveSidebar, createRole, updateRole, deleteRole, createUser, updateUserPermissions, updateRolePermissions, refreshSidebar]);

    return (
        <ServerManagementContext.Provider value={value}>
            {children}
        </ServerManagementContext.Provider>
    );
}

export const useServerManagement = () => useContext(ServerManagementContext);

export default ServerManagementContext;
