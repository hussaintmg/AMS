/**
 * Department Management Page
 * Manage organizational departments and hierarchy
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 * Date: 2026-01-06
 */

import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../services/api';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import '../styles/userManagement.css';

const DepartmentManagement = () => {
    const { user } = useAuth();

    // State
    const [departments, setDepartments] = useState([]); // Hierarchical
    const [flatDepartments, setFlatDepartments] = useState([]); // Flat list for selects
    const [loading, setLoading] = useState(true);
    const [errorPopup, setErrorPopup] = useState(null);
    const [success, setSuccess] = useState(null);
    const [stats, setStats] = useState({});

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedDept, setSelectedDept] = useState(null);

    // Form data
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        description: '',
        parentId: '',
        managerId: '',
        email: '',
        phone: '',
        location: '',
        budget: 0,
        isActive: true
    });

    // Managers list (users)
    const [users, setUsers] = useState([]);

    // Fetch data
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [deptRes, statsRes, usersRes] = await Promise.all([
                adminAPI.getDepartments(),
                adminAPI.getDepartmentStats(),
                adminAPI.getUsers({ limit: 100 }) // Get potential managers
            ]);

            const deptData = deptRes.data.data || {};
            setDepartments(Array.isArray(deptData.hierarchy) ? deptData.hierarchy : []);
            setFlatDepartments(Array.isArray(deptData.flat) ? deptData.flat : []);
            setStats(statsRes.data.data);
            setUsers(usersRes.data.data.users);
        } catch (err) {
            console.error('Error fetching department data:', err);
            toast.error('Failed to load department data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Recursive component to render department tree
    const DepartmentNode = ({ dept, level = 0 }) => {
        const [isExpanded, setIsExpanded] = useState(true);

        return (
            <div className="dept-node" style={{ marginLeft: `${level * 20}px` }}>
                <div className="dept-card">
                    <div className="dept-header">
                        <div className="dept-title">
                            {dept.children && dept.children.length > 0 && (
                                <button
                                    className="btn-expand"
                                    onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                >
                                    {isExpanded ? '▼' : '▶'}
                                </button>
                            )}
                            <h3>{dept.name}</h3>
                            <span className="badge badge-secondary">{dept.code}</span>
                        </div>
                        <div className="dept-actions">
                            <ActionButtons
                                onEdit={() => openModal('edit', dept)}
                                onDelete={() => handleDelete(dept)}
                                showEdit
                                showDelete
                                title={dept.name}
                            />
                        </div>
                    </div>

                    <div className="dept-details">
                        <div className="dept-detail-item">
                            <span className="label">Manager:</span>
                            <span className="value">{dept.manager_name || 'Unassigned'}</span>
                        </div>
                        <div className="dept-detail-item">
                            <span className="label">Staff:</span>
                            <span className="value">{dept.total_users || 0}</span>
                        </div>
                        <div className="dept-detail-item">
                            <span className="label">Status:</span>
                            <span className={`status-dot ${dept.is_active ? 'active' : 'inactive'}`}></span>
                        </div>
                    </div>
                </div>

                {isExpanded && dept.children && dept.children.length > 0 && (
                    <div className="dept-children">
                        {dept.children.map(child => (
                            <DepartmentNode key={child.id} dept={child} level={level + 1} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Modal handlers
    const openModal = (mode, dept = null) => {
        setModalMode(mode);
        setSelectedDept(dept);

        if (mode === 'create') {
            setFormData({
                name: '',
                code: '',
                description: '',
                parentId: dept ? dept.id : '', // If adding sub-department
                managerId: '',
                email: '',
                phone: '',
                location: '',
                budget: 0,
                isActive: true
            });
        } else if (dept) {
            setFormData({
                name: dept.name,
                code: dept.code,
                description: dept.description || '',
                parentId: dept.parent_id || '',
                managerId: dept.manager_id || '',
                email: dept.email || '',
                phone: dept.phone || '',
                location: dept.location || '',
                budget: dept.budget || 0,
                isActive: !!dept.is_active
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedDept(null);
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // Submit handler
    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (modalMode === 'edit') {
                await adminAPI.updateDepartment(selectedDept.id, formData);
            } else {
                await adminAPI.createDepartment(formData);
            }

            toast.success(`Department ${modalMode === 'create' ? 'created' : 'updated'} successfully!`);
            closeModal();
            fetchData();
        } catch (err) {
            console.error('Error saving department:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to save department' });
        }
    };

    // Delete handler
    const handleDelete = async (dept) => {
        if (!window.confirm(`Delete department "${dept.name}"? This cannot be undone.`)) return;

        try {
            await adminAPI.deleteDepartment(dept.id);
            toast.success('Department deleted successfully!');
            fetchData();
        } catch (err) {
            console.error('Error deleting department:', err);
            toast.error(err.response?.data?.message || 'Failed to delete department');
        }
    };

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div className="header-content">
                    <h1>Departments</h1>
                    <p className="subtitle">Manage organizational structure</p>
                </div>
                <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
                    <span className="icon">+</span>
                    New Department
                </button>
            </div>

            {/* Stats */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">🏢</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_departments || 0}</span>
                        <span className="stat-label">Total Departments</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">🌳</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.root_departments || 0}</span>
                        <span className="stat-label">Root Units</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.users_with_department || 0}</span>
                        <span className="stat-label">Assigned Staff</span>
                    </div>
                </div>
            </div>

            <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

            {/* Hierarchy Tree */}
            <div className="department-tree-container">
                {loading ? (
                    <div className="loading-state"><div className="spinner"></div></div>
                ) : departments.length === 0 ? (
                    <div className="empty-state">No departments found. Create one.</div>
                ) : (
                    <div className="tree-view">
                        {departments.map(dept => (
                            <DepartmentNode key={dept.id} dept={dept} />
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{modalMode === 'create' ? 'New Department' : 'Edit Department'}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Department Name *</label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleInputChange}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Code *</label>
                                        <input
                                            type="text"
                                            name="code"
                                            value={formData.code}
                                            onChange={handleInputChange}
                                            required
                                            placeholder="e.g. HR, IT"
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Parent Department</label>
                                        <SearchableSelect
                                            name="parentId"
                                            value={formData.parentId}
                                            onChange={handleInputChange}
                                        >
                                            <option value="">None (Top Level)</option>
                                            {flatDepartments
                                                .filter(d => (!selectedDept || d.id !== selectedDept.id)) // Prevent self-parenting
                                                .map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))
                                            }
                                        </SearchableSelect>
                                    </div>
                                    <div className="form-group">
                                        <label>Manager</label>
                                        <SearchableSelect
                                            name="managerId"
                                            value={formData.managerId}
                                            onChange={handleInputChange}
                                        >
                                            <option value="">Unassigned</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                                            ))}
                                        </SearchableSelect>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleInputChange}
                                        rows="3"
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Budget</label>
                                        <input
                                            type="number"
                                            name="budget"
                                            value={formData.budget}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </div>

                                <div className="form-group checkbox-group">
                                    <label>
                                        <input
                                            type="checkbox"
                                            name="isActive"
                                            checked={formData.isActive}
                                            onChange={handleInputChange}
                                        />
                                        Active Department
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DepartmentManagement;