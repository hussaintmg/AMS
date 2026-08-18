import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { adminAPI } from '../services/api';
import { showApiSuccess, showApiError, getErrorMessage } from '../utils/toastResponse';
import eventBus from '../utils/eventBus';

const UserManagementContext = createContext(null);

export function UserManagementProvider({ children }) {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const reset = () => {
            setUsers([]);
            setRoles([]);
            setDepartments([]);
            setStats({});
            setLoading(false);
            setSaving(false);
            setError(null);
        };
        eventBus.on('auth:logout', reset);
        return () => eventBus.remove('auth:logout', reset);
    }, []);

    const loadUsers = useCallback(async (params = {}) => {
        try {
            setLoading(true);
            const res = await adminAPI.getUsers(params);
            const payload = res.data?.data || res.data;
            const users = Array.isArray(payload) ? payload : (payload?.users || []);
            const pagination = payload?.pagination || {};
            return { users, pagination };
        } catch (err) {
            const msg = getErrorMessage(err, 'Failed to load users');
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    const loadRoles = useCallback(async () => {
        try {
            const res = await adminAPI.getRoles();
            const data = res.data.data;
            setRoles(data || []);
            return data;
        } catch (err) {
            showApiError(err, 'Failed to load roles');
            throw err;
        }
    }, []);

    const loadDepartments = useCallback(async () => {
        try {
            // Names its dropdown so Role Jobs → User Management → Forms can narrow which departments it lists.
            const res = await adminAPI.getDepartments({ flat: true, forPage: 'user_management', forForm: 'create', forField: 'department' });
            const data = res.data.data;
            const deptList = (data && Array.isArray(data.flat)) ? data.flat : (data || []);
            // `departments` feeds the pickers in user/department forms, so only
            // expose active ones there. Callers that need the full list
            // (e.g. Department Management) use the returned payload instead.
            setDepartments(deptList.filter((d) => (d.is_active ?? d.isActive) !== false));
            return data || { hierarchy: [], flat: deptList };
        } catch (err) {
            showApiError(err, 'Failed to load departments');
            throw err;
        }
    }, []);

    const loadStats = useCallback(async () => {
        try {
            const res = await adminAPI.getUserStats();
            const data = res.data.data;
            setStats(data || {});
            return data;
        } catch (err) {
            const msg = err.response?.data?.message || 'Failed to load stats';
            setError(msg);
            throw err;
        }
    }, []);

    const loadDepartmentStats = useCallback(async () => {
        try {
            const res = await adminAPI.getDepartmentStats();
            const data = res.data.data;
            setStats(data || {});
            return data;
        } catch (err) {
            const msg = err.response?.data?.message || 'Failed to load department stats';
            setError(msg);
            throw err;
        }
    }, []);

    const loadReferenceData = useCallback(async () => {
        await Promise.all([
            loadRoles(),
            loadDepartments(),
            loadStats()
        ]);
    }, [loadRoles, loadDepartments, loadStats]);

    const createUser = useCallback(async (formData) => {
        try {
            setSaving(true);
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
            const res = await adminAPI.createUser(payload);
            if (!(res?.status >= 200 && res?.status < 300 && res?.data?.success === true)) {
                throw new Error(res?.data?.message || 'Failed to create user');
            }
            showApiSuccess(res, 'User created successfully!');
            await loadReferenceData();
            return { success: true };
        } catch (err) {
            showApiError(err, 'Failed to create user');
            return { success: false, message: getErrorMessage(err, 'Failed to create user'), error: err.response?.data };
        } finally {
            setSaving(false);
        }
    }, [loadReferenceData]);

    const updateUser = useCallback(async (userId, formData) => {
        try {
            setSaving(true);
            const payload = { ...formData };
            if (!payload.password) delete payload.password;
            const res = await adminAPI.updateUser(userId, payload);
            if (!(res?.status >= 200 && res?.status < 300 && res?.data?.success === true)) {
                throw new Error(res?.data?.message || 'Failed to update user');
            }
            showApiSuccess(res, 'User updated successfully!');
            return { success: true };
        } catch (err) {
            showApiError(err, 'Failed to update user');
            return { success: false, message: getErrorMessage(err, 'Failed to update user'), error: err.response?.data };
        } finally {
            setSaving(false);
        }
    }, []);

    const deleteUser = useCallback(async (userId) => {
        try {
            const res = await adminAPI.deleteUser(userId);
            if (!(res?.status >= 200 && res?.status < 300 && res?.data?.success === true)) {
                throw new Error(res?.data?.message || 'Failed to delete user');
            }
            showApiSuccess(res, 'User deleted successfully!');
            return { success: true };
        } catch (err) {
            showApiError(err, 'Failed to delete user');
            return { success: false, message: getErrorMessage(err, 'Failed to delete user'), error: err.response?.data };
        }
    }, []);

    const toggleUserStatus = useCallback(async (userId) => {
        try {
            const res = await adminAPI.toggleUserStatus(userId);
            if (!(res?.status >= 200 && res?.status < 300 && res?.data?.success === true)) {
                throw new Error(res?.data?.message || 'Failed to toggle status');
            }
            const isActive = res.data.data.isActive;
            showApiSuccess(res, `User ${isActive ? 'activated' : 'deactivated'} successfully!`);
            await loadReferenceData();
            return { success: true, isActive };
        } catch (err) {
            return { success: false, message: getErrorMessage(err, 'Failed to toggle status'), error: err.response?.data };
        }
    }, [loadReferenceData]);

    const createDepartment = useCallback(async (data) => {
        try {
            const res = await adminAPI.createDepartment(data);
            ensureSuccess(res, 'Department created');
            await loadDepartments();
            showApiSuccess(res, 'Department created');
            return { success: true };
        } catch (err) {
            showApiError(err, 'Failed to create department');
            return { success: false, message: getErrorMessage(err, 'Failed to create department') };
        }
    }, [loadDepartments]);

    const createRole = useCallback(async (data) => {
        try {
            const res = await adminAPI.createRole(data);
            ensureSuccess(res, 'Role created');
            await loadRoles();
            showApiSuccess(res, 'Role created');
            return { success: true, data: res.data?.data || res.data };
        } catch (err) {
            showApiError(err, 'Failed to create role');
            return { success: false, message: getErrorMessage(err, 'Failed to create role'), error: err.response?.data };
        }
    }, [loadRoles]);

    const updateDepartment = useCallback(async (id, data) => {
        try {
            const res = await adminAPI.updateDepartment(id, data);
            ensureSuccess(res, 'Department updated');
            await loadDepartments();
            showApiSuccess(res, 'Department updated');
            return { success: true };
        } catch (err) {
            showApiError(err, 'Failed to update department');
            return { success: false, message: getErrorMessage(err, 'Failed to update department') };
        }
    }, [loadDepartments]);

    const deleteDepartment = useCallback(async (id) => {
        try {
            const res = await adminAPI.deleteDepartment(id);
            ensureSuccess(res, 'Department deleted');
            await loadDepartments();
            showApiSuccess(res, 'Department deleted');
            return { success: true };
        } catch (err) {
            showApiError(err, 'Failed to delete department');
            return { success: false, message: getErrorMessage(err, 'Failed to delete department') };
        }
    }, [loadDepartments]);

    const toggleDepartmentStatus = useCallback(async (id) => {
        try {
            const res = await adminAPI.toggleDepartmentStatus(id);
            ensureSuccess(res, 'Department status updated');
            await loadDepartments();
            showApiSuccess(res, 'Department status updated');
            return { success: true, isActive: res.data?.data?.isActive };
        } catch (err) {
            showApiError(err, 'Failed to update department status');
            return { success: false, message: getErrorMessage(err, 'Failed to update department status') };
        }
    }, [loadDepartments]);

    const loadDepartmentById = useCallback(async (id) => {
        try {
            const res = await adminAPI.getDepartment(id);
            const data = res.data.data;
            return data || null;
        } catch (err) {
            showApiError(err, 'Failed to load department');
            throw err;
        }
    }, []);

    const assignUserDepartment = useCallback(async (userId, deptId) => {
        try {
            const res = await adminAPI.assignDepartment(userId, deptId);
            ensureSuccess(res, 'Department assigned');
            showApiSuccess(res, 'Department assigned');
            return { success: true };
        } catch (err) {
            showApiError(err, 'Failed to assign department');
            return { success: false, message: getErrorMessage(err, 'Failed to assign department') };
        }
    }, []);

    const removeUserDepartment = useCallback(async (userId, deptId) => {
        try {
            const res = await adminAPI.removeDepartment(userId, deptId);
            ensureSuccess(res, 'User removed from department');
            showApiSuccess(res, 'User removed from department');
            return { success: true };
        } catch (err) {
            showApiError(err, 'Failed to remove user from department');
            return { success: false, message: getErrorMessage(err, 'Failed to remove user from department') };
        }
    }, []);

    const value = useMemo(() => ({
        users, roles, departments, stats,
        loading, saving, error,
        setUsers, setRoles, setDepartments,
        loadUsers, loadRoles, loadDepartments, loadStats, loadDepartmentStats, loadReferenceData,
        loadDepartmentById,
        assignUserDepartment, removeUserDepartment,
        createUser, updateUser, deleteUser, toggleUserStatus,
        createRole,
        createDepartment, updateDepartment, deleteDepartment, toggleDepartmentStatus
    }), [users, roles, departments, stats, loading, saving, error,
        loadUsers, loadRoles, loadDepartments, loadStats, loadDepartmentStats, loadReferenceData,
        loadDepartmentById,
        assignUserDepartment, removeUserDepartment,
        createUser, updateUser, deleteUser, toggleUserStatus,
        createRole, createDepartment, updateDepartment, deleteDepartment, toggleDepartmentStatus]);

    return (
        <UserManagementContext.Provider value={value}>
            {children}
        </UserManagementContext.Provider>
    );
}

const ensureSuccess = (response, fallback) => {
    if (!(response?.status >= 200 && response?.status < 300 && response?.data?.success === true)) {
        throw new Error(response?.data?.message || fallback);
    }
    return response?.data?.message || fallback;
};

export const useUserManagement = () => useContext(UserManagementContext);

export default UserManagementContext;
