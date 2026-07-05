import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import UserFormModal from '../components/users/UserFormModal';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserManagement } from '../context/UserManagementContext';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import '../styles/userManagement.css';

const UserManagement = () => {
    const { user: currentUser } = useAuth();
    const {
        users: ctxUsers, roles, departments, stats,
        loading: ctxLoading, saving,
        loadUsers, loadReferenceData,
        createUser, updateUser, deleteUser, toggleUserStatus,
        setUsers, loading: userMgmtLoading
    } = useUserManagement();
    const [loading, setLoading] = useState(true);
    const [errorPopup, setErrorPopup] = useState(null);

    const [page, setPage] = useState(1);
    const [limit] = useState(15);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';

    const [search, setSearch] = useState(urlSearch);
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedUser, setSelectedUser] = useState(null);

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                page, limit,
                ...(search && { search }),
                ...(roleFilter && { role: roleFilter }),
                ...(statusFilter && { status: statusFilter })
            };
            const response = await loadUsers(params);
            if (response) {
                setUsers(response.users || []);
                setTotalPages(response.pagination?.totalPages || 1);
                setTotal(response.pagination?.total || 0);
            }
        } catch (err) {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [page, limit, search, roleFilter, statusFilter, loadUsers, setUsers]);

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
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedUser(null);
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

    const handleDeleteUser = async (userId, email) => {
        const result = await deleteUser(userId, email);
        if (result.success) {
            fetchUsers();
        } else if (result.error) {
            setErrorPopup(result.error);
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
            'customer': 'badge-light'
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
                <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
                    <span className="icon">+</span>
                    Add New User
                </button>
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
                    <input
                        type="text"
                        placeholder="Search by name, email, or ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input"
                    />
                    <span className="search-icon">🔍</span>
                </div>
                <SearchableSelect
                    value={roleFilter}
                    onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                    className="filter-select"
                >
                    <option value="">All Roles</option>
                    {roles.map(role => (
                        <option key={role.id} value={role.name}>{role.name.replace(/_/g, ' ').toUpperCase()}</option>
                    ))}
                </SearchableSelect>
                <SearchableSelect
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="filter-select"
                >
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </SearchableSelect>
                <span className="results-count">{total} users found</span>
            </div>

            <div className="table-container">
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
                                <th>Role</th>
                                <th>Department</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ctxUsers.map(user => (
                                <tr key={user.id} className={!user.is_active ? 'row-inactive' : ''}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="user-avatar">
                                                {user.avatar ? (
                                                    <img src={user.avatar} alt={user.full_name} />
                                                ) : (
                                                    <span>{user.first_name?.[0]}{user.last_name?.[0]}</span>
                                                )}
                                            </div>
                                            <div className="user-info">
                                                <span className="user-name">{user.full_name}</span>
                                                <span className="user-emp-id">{user.employee_id}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`badge ${getRoleBadgeClass(user.role_name)}`}>
                                            {user.role_name?.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td>{user.department_name || '-'}</td>
                                    <td>
                                        <span className={`status-badge ${user.is_active ? 'status-active' : 'status-inactive'}`}>
                                            {user.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        {user.last_login
                                            ? new Date(user.last_login).toLocaleDateString('en-GB', {
                                                day: '2-digit', month: 'short', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                              })
                                            : 'Never'
                                        }
                                    </td>
                                    <td>
                                        <ActionButtons
                                            onEdit={() => openModal('edit', user)}
                                            onToggle={() => handleToggleStatus(user.id)}
                                            onDelete={() => handleDeleteUser(user.id, user.email)}
                                            status={user.is_active}
                                            title={user.email}
                                            showEdit showToggle showDelete
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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

            <UserFormModal
                isOpen={showModal}
                mode={modalMode}
                initialData={selectedUser}
                roles={roles}
                departments={departments}
                onClose={closeModal}
                onSubmit={modalMode === 'create' ? handleCreateUser : handleUpdateUser}
                loading={saving}
            />
        </div>
    );
};

export default UserManagement;
