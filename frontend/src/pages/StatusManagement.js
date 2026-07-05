/**
 * Status Management Page
 * Centralized status management for the entire ERP
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 * Date: 2026-01-06
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../services/api';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import '../styles/userManagement.css';

const StatusManagement = () => {
    const { user } = useAuth();

    // State
    const [tables, setTables] = useState([]);
    const [selectedTable, setSelectedTable] = useState(null);
    const [statuses, setStatuses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorPopup, setErrorPopup] = useState(null);
    const [success, setSuccess] = useState(null);
    const [stats, setStats] = useState({});

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [currentStatus, setCurrentStatus] = useState(null);

    // Form data
    const [formData, setFormData] = useState({
        statusName: '',
        statusCode: '',
        statusColor: '#6B7280',
        statusBgColor: '#F3F4F6',
        description: '',
        isDefault: false,
        isFinal: false,
        isActive: true
    });

    // Fetch initial data (table list and stats)
    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const [tableRes, statsRes] = await Promise.all([
                    adminAPI.getAvailableTables(),
                    adminAPI.getStatusAnalytics()
                ]);

                setTables(tableRes.data.data);
                if (tableRes.data.data.length > 0) setSelectedTable(tableRes.data.data[0]);

                setStats(statsRes.data.data);
            } catch (err) {
                console.error(err);
                setErrorPopup({ message: 'Failed to load metadata' });
                toast.error('Failed to load metadata');
            }
        };
        fetchMeta();
    }, []);

    // Fetch statuses when table selection changes
    useEffect(() => {
        if (!selectedTable) return;

        const fetchStatuses = async () => {
            setLoading(true);
            try {
                const response = await adminAPI.getStatusesByTable(selectedTable.table_name, { includeInactive: true });
                setStatuses(response.data.data.statuses);
            } catch (err) {
                setErrorPopup(err.response?.data || { message: 'Failed to load statuses' });
                toast.error('Failed to load statuses');
            } finally {
                setLoading(false);
            }
        };

        fetchStatuses();
    }, [selectedTable]);

    // Form handlers
    const openModal = (mode, status = null) => {
        setModalMode(mode);
        setCurrentStatus(status);

        if (mode === 'create') {
            setFormData({
                statusName: '',
                statusCode: '',
                statusColor: '#3B82F6',
                statusBgColor: '#DBEAFE',
                description: '',
                isDefault: false,
                isFinal: false,
                isActive: true
            });
        } else if (status) {
            setFormData({
                statusName: status.status_name,
                statusCode: status.status_code,
                statusColor: status.status_color || '#6B7280',
                statusBgColor: status.status_bg_color || '#F3F4F6',
                description: status.description || '',
                isDefault: !!status.is_default,
                isFinal: !!status.is_final,
                isActive: !!status.is_active
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setCurrentStatus(null);
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // Auto-generate status code from name
    const handleNameChange = (e) => {
        const name = e.target.value;
        setFormData(prev => ({
            ...prev,
            statusName: name,
            statusCode: modalMode === 'create' ? name.toLowerCase().replace(/[^a-z0-9]/g, '_') : prev.statusCode
        }));
    };

    // Submit handler
    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            const body = {
                ...formData,
                tableName: selectedTable.table_name,
                tableSlug: selectedTable.table_slug
            };

            if (modalMode === 'create') {
                await adminAPI.createStatus(body);
            } else {
                await adminAPI.updateStatus(currentStatus.id, body);
            }

            toast.success('Status saved successfully!');
            closeModal();

            // Refresh statuses
            const refreshRes = await adminAPI.getStatusesByTable(selectedTable.table_name, { includeInactive: true });
            setStatuses(refreshRes.data.data.statuses);

        } catch (err) {
            setErrorPopup(err.response?.data || { message: 'Failed to save status' });
        }
    };

    // Delete handler
    const handleDelete = async (status) => {
        if (!window.confirm(`Delete status "${status.status_name}"?`)) return;

        try {
            await adminAPI.deleteStatus(status.id);

            setStatuses(prev => prev.filter(s => s.id !== status.id));
            toast.success('Status deleted successfully!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete status');
        }
    };

    // Drag and Drop Reordering Handlers (Simplistic approach)
    const moveStatus = async (index, direction) => {
        const newStatuses = [...statuses];
        const [moved] = newStatuses.splice(index, 1);
        newStatuses.splice(index + direction, 0, moved);
        setStatuses(newStatuses); // Optimistic update

        // Send new order to backend
        try {
            const statusIds = newStatuses.map(s => s.id);
            await adminAPI.reorderStatuses(selectedTable.table_name, statusIds);
        } catch (err) {
            console.error('Failed to reorder', err);
            toast.error('Failed to update order');
            // Revert on error would be ideal here
        }
    };

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1>System Statuses</h1>
                    <p className="subtitle">Centralized status configuration</p>
                </div>
            </div>

            <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

            {/* Layout: Sidebar for Tables, Main for Statuses */}
            <div className="status-mgmt-layout">
                {/* Tables Sidebar */}
                <div className="tables-sidebar">
                    <h3>Modules</h3>
                    <div className="tables-list">
                        {tables.map(table => (
                            <div
                                key={table.table_name}
                                className={`table-item ${selectedTable?.table_name === table.table_name ? 'active' : ''}`}
                                onClick={() => setSelectedTable(table)}
                            >
                                <span className="table-name">{table.table_name.replace(/_/g, ' ').toUpperCase()}</span>
                                <span className="status-count">{table.status_count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                <div className="statuses-main">
                    {selectedTable && (
                        <>
                            <div className="section-header">
                                <h2>{selectedTable.table_name.replace(/_/g, ' ').toUpperCase()} Statuses</h2>
                                <button className="btn btn-primary btn-sm" onClick={() => openModal('create')}>
                                    + Add Status
                                </button>
                            </div>

                            {loading ? (
                                <div className="spinner"></div>
                            ) : (
                                <div className="statuses-list">
                                    {statuses.map((status, index) => (
                                        <div key={status.id} className={`status-card ${!status.is_active ? 'inactive' : ''}`}>
                                            <div className="status-handle">
                                                <div className="order-buttons">
                                                    <button
                                                        disabled={index === 0}
                                                        onClick={() => moveStatus(index, -1)}
                                                    >▲</button>
                                                    <button
                                                        disabled={index === statuses.length - 1}
                                                        onClick={() => moveStatus(index, 1)}
                                                    >▼</button>
                                                </div>
                                            </div>

                                            <div className="status-preview">
                                                <span
                                                    className="status-badge-lg"
                                                    style={{
                                                        backgroundColor: status.status_bg_color,
                                                        color: status.status_color,
                                                        borderColor: status.status_color
                                                    }}
                                                >
                                                    {status.status_icon && <i className={`material-icons`}>{status.status_icon}</i>}
                                                    {status.status_name}
                                                </span>
                                                <small>{status.status_code}</small>
                                            </div>

                                            <div className="status-attributes">
                                                {status.is_default && <span className="attr-tag default">Default</span>}
                                                {status.is_final && <span className="attr-tag final">Final</span>}
                                                {!status.is_active && <span className="attr-tag inactive">Inactive</span>}
                                            </div>

                                            <div className="status-desc">{status.description}</div>

                                            <div className="status-actions">
                                                <ActionButtons
                                                    onEdit={() => openModal('edit', status)}
                                                    onDelete={() => handleDelete(status)}
                                                    showEdit
                                                    showDelete
                                                    title={status.status_name}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{modalMode === 'create' ? 'New Status' : 'Edit Status'}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Status Name *</label>
                                        <input
                                            type="text"
                                            name="statusName"
                                            value={formData.statusName}
                                            onChange={handleNameChange}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Code *</label>
                                        <input
                                            type="text"
                                            name="statusCode"
                                            value={formData.statusCode}
                                            onChange={handleInputChange}
                                            required
                                            disabled={modalMode === 'edit'} // Lock code on edit
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Text Color</label>
                                        <div className="color-picker-wrapper">
                                            <input
                                                type="color"
                                                name="statusColor"
                                                value={formData.statusColor}
                                                onChange={handleInputChange}
                                            />
                                            <input
                                                type="text"
                                                name="statusColor"
                                                value={formData.statusColor}
                                                onChange={handleInputChange}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Background Color</label>
                                        <div className="color-picker-wrapper">
                                            <input
                                                type="color"
                                                name="statusBgColor"
                                                value={formData.statusBgColor}
                                                onChange={handleInputChange}
                                            />
                                            <input
                                                type="text"
                                                name="statusBgColor"
                                                value={formData.statusBgColor}
                                                onChange={handleInputChange}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <input
                                        type="text"
                                        name="description"
                                        value={formData.description}
                                        onChange={handleInputChange}
                                    />
                                </div>

                                <div className="checkbox-row">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            name="isDefault"
                                            checked={formData.isDefault}
                                            onChange={handleInputChange}
                                        />
                                        Is Default (First status)
                                    </label>
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            name="isFinal"
                                            checked={formData.isFinal}
                                            onChange={handleInputChange}
                                        />
                                        Is Final (Completed/Closed)
                                    </label>
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            name="isActive"
                                            checked={formData.isActive}
                                            onChange={handleInputChange}
                                        />
                                        Active
                                    </label>
                                </div>

                                {/* Live Preview */}
                                <div className="preview-box">
                                    <label>Preview:</label>
                                    <span
                                        className="status-badge-lg"
                                        style={{
                                            backgroundColor: formData.statusBgColor,
                                            color: formData.statusColor,
                                            borderColor: formData.statusColor,
                                            padding: '8px 16px',
                                            borderRadius: '20px',
                                            display: 'inline-block',
                                            border: '1px solid'
                                        }}
                                    >
                                        {formData.statusName || 'Status Name'}
                                    </span>
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

export default StatusManagement;
