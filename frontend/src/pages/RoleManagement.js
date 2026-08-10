/**
 * Role Management Page
 * Manage roles and permissions
 * Maintained by Hussain Developer
 * AMS ERP
 * Date: 2026-01-06
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { pageActions } from '../utils/roleJobs';
import { adminAPI } from '../services/api';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ConfirmModal from '../components/ConfirmModal';
import ActionButtons from '../components/ActionButtons';
import '../styles/userManagement.css';

const roleId = (r) => r?._id || r?.id;

const RoleManagement = () => {
    const { user } = useAuth();
    const can = pageActions(user, 'role_management');

    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorPopup, setErrorPopup] = useState(null);
    const [success, setSuccess] = useState(null);

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedRole, setSelectedRole] = useState(null);
    const [permissionGroups, setPermissionGroups] = useState([]);
    const [selectedPermissions, setSelectedPermissions] = useState([]);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Form data
    const [formData, setFormData] = useState({
        name: '',
        description: ''
    });

    // Fetch roles
    const fetchRoles = useCallback(async () => {
        try {
            setLoading(true);
            const response = await adminAPI.getRoles();
            setRoles(response.data.data);
            // setError(null); <--- removed
        } catch (err) {
            console.error('Error fetching roles:', err);
            // set error popup if needed, or just toast for load failure
            toast.error('Failed to load roles');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch permissions
    const fetchPermissions = useCallback(async () => {
        try {
            const response = await adminAPI.getPermissions();
            setPermissionGroups(response.data.data);
        } catch (err) {
            console.error('Error fetching permissions:', err);
            toast.error('Failed to load permissions');
        }
    }, []);

    useEffect(() => {
        fetchRoles();
        fetchPermissions();
    }, [fetchRoles, fetchPermissions]);

    // Open modal
    const openModal = async (mode, role = null) => {
        setModalMode(mode);
        setSelectedRole(role);

        if (mode === 'create') {
            setFormData({ name: '', description: '' });
            setSelectedPermissions([]);
        } else if (role) {
            // Fetch role details with permissions
            try {
                const response = await adminAPI.getRole(roleId(role));
                const roleData = response.data.data;
                setFormData({
                    name: roleData.name,
                    description: roleData.description || ''
                });
                setSelectedPermissions(roleData.assignedPermissions || []);
            } catch (err) {
                console.error('Error fetching role details:', err);
                toast.error('Failed to load role details');
            }
        }

        setShowModal(true);
    };

    // Close modal
    const closeModal = () => {
        setShowModal(false);
        setSelectedRole(null);
        setSelectedPermissions([]);
    };

    // Handle form change
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Toggle permission
    const togglePermission = (permId) => {
        setSelectedPermissions(prev =>
            prev.includes(permId)
                ? prev.filter(id => id !== permId)
                : [...prev, permId]
        );
    };

    // Toggle all permissions in a module
    const toggleModulePermissions = (module) => {
        const modulePermIds = module.permissions.map(p => p.id);
        const allSelected = modulePermIds.every(id => selectedPermissions.includes(id));

        if (allSelected) {
            setSelectedPermissions(prev => prev.filter(id => !modulePermIds.includes(id)));
        } else {
            setSelectedPermissions(prev => [...new Set([...prev, ...modulePermIds])]);
        }
    };

    // Create role
    const handleCreateRole = async (e) => {
        e.preventDefault();

        try {
            await adminAPI.createRole({
                ...formData,
                permissions: selectedPermissions
            });

            toast.success('Role created successfully!');
            closeModal();
            fetchRoles();
        } catch (err) {
            console.error('Error creating role:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to create role' });
        }
    };

    // Update role
    const handleUpdateRole = async (e) => {
        e.preventDefault();

        try {
            // Update role details
            await adminAPI.updateRole(roleId(selectedRole), formData);

            // Update permissions
            await adminAPI.updateRolePermissions(roleId(selectedRole), selectedPermissions);

            toast.success('Role updated successfully!');
            closeModal();
            fetchRoles();
        } catch (err) {
            console.error('Error updating role:', err);
            toast.error(err.response?.data?.message || 'Failed to update role');
        }
    };

    // Delete role
    const requestDeleteRole = (role) => {
        setDeleteTarget({ id: roleId(role), name: role.name });
    };

    const confirmDeleteRole = async () => {
        if (!deleteTarget) return;
        const { id } = deleteTarget;
        setDeleteTarget(null);
        try {
            await adminAPI.deleteRole(id);
            toast.success('Role deleted successfully!');
            fetchRoles();
        } catch (err) {
            console.error('Error deleting role:', err);
            toast.error(err.response?.data?.message || 'Failed to delete role');
        }
    };

    return (
        <div className="user-management-page">
            {/* Page Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>Role Management</h1>
                    <p className="subtitle">Define roles and assign permissions</p>
                </div>
                {can('create') && (
                    <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
                        <span className="icon">+</span>
                        Create Role
                    </button>
                )}
            </div>

            {/* Error Popup */}
            <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

            {/* Roles Grid */}
            <div className="roles-grid">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading roles...</p>
                    </div>
                ) : roles.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🔐</div>
                        <h3>No Roles Found</h3>
                        <p>Create your first role to get started.</p>
                    </div>
                ) : (
                    roles.map(role => (
                        <div className="role-card" key={roleId(role)}>
                            <div className="role-header">
                                <h3 className="role-name">{role.name.replace(/_/g, ' ')}</h3>
                                <span className={`role-badge ${role.name === 'super_admin' ? 'badge-danger' : 'badge-primary'}`}>
                                    {role.permission_count} permissions
                                </span>
                            </div>

                            <p className="role-description">{role.description || 'No description'}</p>

                            <div className="role-stats">
                                <div className="role-stat">
                                    <span className="stat-value">{role.user_count}</span>
                                    <span className="stat-label">Total Users</span>
                                </div>
                                <div className="role-stat">
                                    <span className="stat-value">{role.active_user_count}</span>
                                    <span className="stat-label">Active</span>
                                </div>
                            </div>

                            <div className="role-actions">
                                <ActionButtons
                                    onEdit={can('edit') ? () => openModal('edit', role) : null}
                                    // Only show delete if not super_admin (logic handled by showDelete prop effectively or by conditional rendering)
                                    onDelete={can('delete') && role.name !== 'super_admin' ? () => requestDeleteRole(role) : null}
                                    showEdit={can('edit')}
                                    showDelete={can('delete') && role.name !== 'super_admin'}
                                    title={role.name}
                                // Custom label for "Edit Permissions" can be handled via customActions if strict text is needed, 
                                // but standardizing to icons is the goal.
                                // However, the user might want "Edit Permissions" text. 
                                // For now, let's stick to the icon standardization as requested ("global action buttons").
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{modalMode === 'create' ? 'Create New Role' : `Edit Role: ${selectedRole?.name}`}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>

                        <form onSubmit={modalMode === 'create' ? handleCreateRole : handleUpdateRole}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Role Name *</label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleInputChange}
                                            required
                                            placeholder="e.g., sales_manager"
                                            disabled={selectedRole?.name === 'super_admin'}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Description</label>
                                        <input
                                            type="text"
                                            name="description"
                                            value={formData.description}
                                            onChange={handleInputChange}
                                            placeholder="Brief role description"
                                        />
                                    </div>
                                </div>

                                <div className="permissions-section">
                                    <h3>Permissions ({selectedPermissions.length} selected)</h3>

                                    <div className="permission-groups">
                                        {permissionGroups.map(group => {
                                            const modulePermIds = group.permissions.map(p => p.id);
                                            const selectedCount = modulePermIds.filter(id => selectedPermissions.includes(id)).length;
                                            const isAllSelected = selectedCount === modulePermIds.length;

                                            return (
                                                <div className="permission-group" key={group.module}>
                                                    <div className="group-header" onClick={() => toggleModulePermissions(group)}>
                                                        <div className="group-info">
                                                            <input
                                                                type="checkbox"
                                                                checked={isAllSelected}
                                                                onChange={() => toggleModulePermissions(group)}
                                                                onClick={e => e.stopPropagation()}
                                                            />
                                                            <span className="group-icon">{group.icon || '📁'}</span>
                                                            <span className="group-name">{group.displayName}</span>
                                                        </div>
                                                        <span className="group-count">{selectedCount}/{modulePermIds.length}</span>
                                                    </div>

                                                    <div className="group-permissions">
                                                        {group.permissions.map(perm => (
                                                            <label
                                                                key={perm.id}
                                                                className={`permission-item ${selectedPermissions.includes(perm.id) ? 'selected' : ''}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedPermissions.includes(perm.id)}
                                                                    onChange={() => togglePermission(perm.id)}
                                                                />
                                                                <span className="perm-action">{perm.action}</span>
                                                                <span className="perm-desc">{perm.description}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {modalMode === 'create' ? 'Create Role' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={!!deleteTarget}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={confirmDeleteRole}
                title="Delete Role"
                message={`Are you sure you want to delete the role "${deleteTarget?.name}"? Users assigned to this role will have their role removed.`}
                confirmText="Delete"
                cancelText="Cancel"
                type="danger"
            />
        </div>
    );
};

export default RoleManagement;
