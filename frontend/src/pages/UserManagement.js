import React, { useState, useEffect, useCallback, useRef } from 'react';
import UserFormModal from '../components/users/UserFormModal';
import DepartmentFormModal from '../components/departments/DepartmentFormModal';
import RoleFormModal from '../components/roles/rolesFormModel';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { pageActions } from '../utils/roleJobs';
import { useUserManagement } from '../context/UserManagementContext';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ConfirmModal from '../components/ConfirmModal';
import ActionButtons from '../components/ActionButtons';
import { Search } from "lucide-react";
import '../styles/userManagement.css';

const UserManagement = () => {
    const { user: currentUser } = useAuth();
    const can = pageActions(currentUser, 'user_management');
    const {
        users: ctxUsers, roles, departments, stats,
        loading: ctxLoading, saving,
        loadUsers, loadReferenceData,
        createUser, updateUser, deleteUser, toggleUserStatus,
        createRole, createDepartment,
        setUsers,
    } = useUserManagement();
    const [loading, setLoading] = useState(true);
    const [errorPopup, setErrorPopup] = useState(null);

    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';

    const [search, setSearch] = useState(urlSearch);

    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedUser, setSelectedUser] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Nested department creation modal state
    const [showDeptModal, setShowDeptModal] = useState(false);
    const [savingDept, setSavingDept] = useState(false);
    const [createdDepartmentId, setCreatedDepartmentId] = useState(null);
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [savingRole, setSavingRole] = useState(false);
    const [createdRoleId, setCreatedRoleId] = useState(null);

    // Ref to track user form data to auto-select created department
    const userFormRef = useRef(null);

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                page, limit,
                ...(search && { search }),
            };
            const response = await loadUsers(params);
            if (response) {
                const userList = response.users || [];
                setUsers(userList);
                setTotalPages(response.pagination?.totalPages || 1);
                setTotal(response.pagination?.total || 0);
            }
        } catch (err) {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [page, limit, search, loadUsers, setUsers]);

    useEffect(() => {
        if (currentUser) {
            fetchUsers();
        }
    }, [currentUser, fetchUsers]);

    useEffect(() => {
        if (currentUser) {
            loadReferenceData().catch(() => {});
        }
    }, [currentUser, loadReferenceData]);

    useEffect(() => {
        if (urlSearch) setSearch(urlSearch);
    }, [urlSearch]);

    useEffect(() => {
        if (!currentUser) return undefined;
        const timer = setTimeout(() => { setPage(1); fetchUsers(); }, 300);
        return () => clearTimeout(timer);
    }, [currentUser, search, fetchUsers]);

    const openModal = (mode, user = null) => {
        setModalMode(mode);
        setSelectedUser(user);
        setCreatedDepartmentId(null);
        setCreatedRoleId(null);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedUser(null);
        setCreatedDepartmentId(null);
        setCreatedRoleId(null);
    };

    const handleCreateUser = async (formData) => {
        const result = await createUser(formData);
        if (result.success) {
            closeModal();
            fetchUsers();
        } else if (result.error) {
            setErrorPopup(result.error);
        }
    };

    const handleUpdateUser = async (formData) => {
        const userId = selectedUser?._id || selectedUser?.id;
        const result = await updateUser(userId, formData);
        if (result.success) {
            closeModal();
            fetchUsers();
        } else if (result.error) {
            setErrorPopup(result.error);
        }
    };

    const handleToggleStatus = async (userId) => {
        const result = await toggleUserStatus(userId);
        if (!result.success && result.error) {
            setErrorPopup(result.error);
        }
        if (result.success) fetchUsers();
    };

    const requestDeleteUser = (userId, email) => {
        setDeleteTarget({ id: userId, email });
    };

    const confirmDeleteUser = async () => {
        if (!deleteTarget) return;
        const { id, email } = deleteTarget;
        setDeleteTarget(null);
        const result = await deleteUser(id, email);
        if (result.success) {
            fetchUsers();
        } else if (result.error) {
            setErrorPopup(result.error);
        }
    };

    // Open nested Department modal from User form
    const openCreateDepartment = () => {
        setShowDeptModal(true);
    };

    const closeCreateDepartment = () => {
        setShowDeptModal(false);
    };

    const openCreateRole = () => {
        setShowRoleModal(true);
    };

    const closeCreateRole = () => {
        setShowRoleModal(false);
    };

    const handleRoleCreated = async (formData) => {
        setSavingRole(true);
        try {
            const result = await createRole(formData);
            if (result.success) {
                const newRoleId = result.data?.id || result.data?._id;
                setCreatedRoleId(newRoleId || '');
                setShowRoleModal(false);
            } else {
                setErrorPopup(result.error || { message: 'Failed to create role' });
            }
        } catch (err) {
            setErrorPopup({ message: 'Failed to create role' });
        } finally {
            setSavingRole(false);
        }
    };

    // Department created → auto-select in user form
    const handleDeptCreated = async (formData, mode) => {
        setSavingDept(true);
        try {
            const result = await createDepartment(formData);
            if (result.success) {
                const newDeptId = result.data?.data?._id || result.data?._id;
                setCreatedDepartmentId(newDeptId || formData.code);
                toast.success('Department created');
                setShowDeptModal(false);
            } else {
                setErrorPopup(result.error || { message: 'Failed to create department' });
            }
        } catch (err) {
            setErrorPopup({ message: 'Failed to create department' });
        } finally {
            setSavingDept(false);
        }
    };

    const getRoleBadgeClass = (roleName) => {
        const roleColors = {
            'super_admin': 'badge-danger',
            'sales_manager': 'badge-primary',
            'sales_executive': 'badge-info',
            'service_manager': 'badge-warning',
            'service_advisor': 'badge-secondary',
            'technician': 'badge-dark',
            'inventory_manager': 'badge-success',
            'accountant': 'badge-purple',
            'customer': 'badge-light',
        };
        return roleColors[roleName] || 'badge-secondary';
    };

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div className="header-content">
                    <h1>User Management</h1>
                    <p className="subtitle">Manage system users, roles, and permissions</p>
                </div>
                {can('create') && (
                    <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
                        <span className="icon">+</span>
                        Add New User
                    </button>
                )}
            </div>

            <div className="stats-grid">
                <div className="stat-card stat-total">
                    <div className="stat-icon">👥</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_users || 0}</span>
                        <span className="stat-label">Total Users</span>
                    </div>
                </div>
                <div className="stat-card stat-active">
                    <div className="stat-icon">✓</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.active_users || 0}</span>
                        <span className="stat-label">Active Users</span>
                    </div>
                </div>
                <div className="stat-card stat-inactive">
                    <div className="stat-icon">⊘</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.inactive_users || 0}</span>
                        <span className="stat-label">Inactive Users</span>
                    </div>
                </div>
                <div className="stat-card stat-today">
                    <div className="stat-icon">📅</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.logged_in_today || 0}</span>
                        <span className="stat-label">Logged in Today</span>
                    </div>
                </div>
            </div>

            <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

            <div className="filters-bar">
                <div className="search-box">
                    <span className="search-icon">
                                  <Search size={18} style={{ color: "#9ca3af" }} />
                                </span>
                    <input
                        type="text"
                        placeholder="Search by name, email, phone, or ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input"
                    />
                </div>
                <span className="results-count">{total} users found</span>
            </div>

            <div className="table-container desktop-only">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading users...</p>
                    </div>
                ) : ctxUsers.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">👤</div>
                        <h3>No Users Found</h3>
                        <p>No users match your search criteria.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Role</th>
                                <th>Department</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ctxUsers.map(user => {
                                const uid = user._id || user.id;
                                const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
                                const statusText = user.status || (user.isActive ? 'active' : 'inactive');
                                const roleName = user.role?.displayName || user.role?.name || '-';
                                const roleKey = user.role?.name || roleName;
                                const isSuperAdmin = roleKey === 'super_admin';
                                const deptName = user.department?.name || '-';
                                return (
                                <tr key={uid} className={statusText !== 'active' ? 'row-inactive' : ''}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="user-avatar">
                                                {user.avatar ? (
                                                    <img src={user.avatar} alt={fullName} />
                                                ) : (
                                                    <span>{(user.firstName || '?')[0]}{(user.lastName || '')[0] || (user.firstName || '?')[1]}</span>
                                                )}
                                            </div>
                                            <div className="user-info">
                                                <span className="user-name">{fullName}</span>
                                                <span className="user-emp-id">{user.employeeId || user.employee_id || ''}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{user.email}</td>
                                    <td>{user.phone || '-'}</td>
                                    <td>
                                        <span className={`badge ${getRoleBadgeClass(user.role?.name || roleName)}`}>
                                            {roleName.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td>{deptName}</td>
                                    <td>
                                        <span className={`status-badge ${statusText === 'active' ? 'status-active' : 'status-inactive'}`}>
                                            {statusText.charAt(0).toUpperCase() + statusText.slice(1)}
                                        </span>
                                    </td>
                                    <td>
                                        {user.lastLogin || user.last_login
                                            ? new Date(user.lastLogin || user.last_login).toLocaleDateString('en-GB', {
                                                day: '2-digit', month: 'short', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                              })
                                            : 'Never'
                                        }
                                    </td>
                                    <td>
                                        <ActionButtons
                                            onEdit={can('edit') ? () => openModal('edit', user) : null}
                                            onToggle={can('edit') ? () => handleToggleStatus(uid) : null}
                                            onDelete={can('delete') ? () => requestDeleteUser(uid, user.email) : null}
                                            status={statusText === 'active'}
                                            title={user.email}
                                            disableToggle={isSuperAdmin}
                                            disableDelete={isSuperAdmin}
                                            toggleDisabledTitle="Super admin cannot be deactivated"
                                            deleteDisabledTitle="Super admin cannot be deleted"
                                            showEdit showToggle showDelete
                                        />
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="mobile-cards-container mobile-only">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading users...</p>
                    </div>
                ) : ctxUsers.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">👤</div>
                        <h3>No Users Found</h3>
                        <p>No users match your search criteria.</p>
                    </div>
                ) : (
                    <div className="users-cards-grid">
                        {ctxUsers.map(user => {
                            const uid = user._id || user.id;
                            const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
                            const statusText = user.status || (user.isActive ? 'active' : 'inactive');
                            const roleName = user.role?.displayName || user.role?.name || '-';
                            const roleKey = user.role?.name || roleName;
                            const isSuperAdmin = roleKey === 'super_admin';
                            const deptName = user.department?.name || '-';
                            return (
                                <div key={uid} className={`user-card ${statusText !== 'active' ? 'card-inactive' : ''}`}>
                                    <div className="user-card-header">
                                        <div className="user-card-avatar">
                                            {user.avatar ? (
                                                <img src={user.avatar} alt={fullName} />
                                            ) : (
                                                <span>{(user.firstName || '?')[0]}{(user.lastName || '')[0] || ''}</span>
                                            )}
                                        </div>
                                        <div className="user-card-title">
                                            <span className="user-card-name">{fullName}</span>
                                            <span className="user-card-role">{roleName}</span>
                                        </div>
                                        <span className={`status-badge ${statusText === 'active' ? 'status-active' : 'status-inactive'}`}>
                                            {statusText.charAt(0).toUpperCase() + statusText.slice(1)}
                                        </span>
                                    </div>
                                    <div className="user-card-body">
                                        <div className="user-card-field">
                                            <span className="field-label">Email</span>
                                            <span className="field-value">{user.email}</span>
                                        </div>
                                        <div className="user-card-field">
                                            <span className="field-label">Phone</span>
                                            <span className="field-value">{user.phone || '-'}</span>
                                        </div>
                                        <div className="user-card-field">
                                            <span className="field-label">Department</span>
                                            <span className="field-value">{deptName}</span>
                                        </div>
                                        <div className="user-card-field">
                                            <span className="field-label">Employee ID</span>
                                            <span className="field-value">{user.employeeId || user.employee_id || '-'}</span>
                                        </div>
                                    </div>
                                    <div className="user-card-actions">
                                        <ActionButtons
                                            onEdit={can('edit') ? () => openModal('edit', user) : null}
                                            onToggle={can('edit') ? () => handleToggleStatus(uid) : null}
                                            onDelete={can('delete') ? () => requestDeleteUser(uid, user.email) : null}
                                            status={statusText === 'active'}
                                            title={user.email}
                                            disableToggle={isSuperAdmin}
                                            disableDelete={isSuperAdmin}
                                            toggleDisabledTitle="Super admin cannot be deactivated"
                                            deleteDisabledTitle="Super admin cannot be deleted"
                                            showEdit showToggle showDelete
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="pagination">
                    <button className="btn-page" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                        ← Previous
                    </button>
                    <div className="page-numbers">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                                pageNum = i + 1;
                            } else if (page <= 3) {
                                pageNum = i + 1;
                            } else if (page >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                            } else {
                                pageNum = page - 2 + i;
                            }
                            return (
                                <button key={pageNum} className={`btn-page ${page === pageNum ? 'active' : ''}`} onClick={() => setPage(pageNum)}>
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>
                    <button className="btn-page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                        Next →
                    </button>
                </div>
            )}

            {/* User form modal */}
            <UserFormModal
                isOpen={showModal}
                mode={modalMode}
                initialData={selectedUser}
                roles={roles}
                departments={departments}
                onClose={closeModal}
                onSubmit={modalMode === 'create' ? handleCreateUser : handleUpdateUser}
                loading={saving}
                allowCreateDepartment={true}
                onOpenCreateDepartment={openCreateDepartment}
                allowCreateRole={true}
                onOpenCreateRole={openCreateRole}
                createdRoleId={createdRoleId}
                keyboardDisabled={showDeptModal || showRoleModal}
            />

            {/* Nested Department creation modal */}
            <DepartmentFormModal
                isOpen={showDeptModal}
                mode="create"
                initialData={null}
                departments={departments}
                users={[]}
                onClose={closeCreateDepartment}
                onSubmit={handleDeptCreated}
                loading={savingDept}
                allowCreateManagerUser={false}
            />

            <RoleFormModal
                isOpen={showRoleModal}
                onClose={closeCreateRole}
                onSubmit={handleRoleCreated}
                loading={savingRole}
            />

            <ConfirmModal
                isOpen={!!deleteTarget}
                title="Delete User"
                message={`Are you sure you want to permanently delete user "${deleteTarget?.email || ''}"? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                type="danger"
                onConfirm={confirmDeleteUser}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
};

export default UserManagement;
