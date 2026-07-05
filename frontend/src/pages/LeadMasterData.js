/**
 * Customer Master Data Page - CRUD for Sources, Statuses, Priorities, Cities
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    XMarkIcon,
    CheckIcon,
    TagIcon,
    MapPinIcon,
    FlagIcon,
    MegaphoneIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';

// Styles
const styles = `
.lead-master-container { padding: 1.5rem; }
.lead-master-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.lead-master-title { font-size: 1.75rem; font-weight: 700; color: var(--text-primary); }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card { background: white; border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 1rem; }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.stat-icon svg { width: 24px; height: 24px; color: white; }
.stat-icon.sources { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.stat-icon.statuses { background: linear-gradient(135deg, #10b981, #059669); }
.stat-icon.priorities { background: linear-gradient(135deg, #f59e0b, #d97706); }
.stat-icon.cities { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
.stat-content h3 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.stat-content p { font-size: 0.875rem; color: var(--text-secondary); }
.tabs-container { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--border-light); padding-bottom: 0; }
.tab-btn { padding: 0.75rem 1.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); background: transparent; border: none; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all 0.2s; display: flex; align-items: center; gap: 0.5rem; }
.tab-btn:hover { color: var(--primary-color); }
.tab-btn.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
.tab-btn svg { width: 18px; height: 18px; }
.content-card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
/* btn-add moved to global styles */
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { text-align: left; padding: 0.75rem 1rem; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 600; font-size: 0.8125rem; text-transform: uppercase; }
.data-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-light); }
.data-table tr:hover { background: var(--bg-hover); }
.color-badge { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.color-badge.info { background: #dbeafe; color: #1d4ed8; }
.color-badge.success { background: #dcfce7; color: #16a34a; }
.color-badge.warning { background: #fef3c7; color: #d97706; }
.color-badge.error { background: #fee2e2; color: #dc2626; }
.color-badge.gray { background: #f3f4f6; color: #6b7280; }
.status-badge { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-badge.active { background: #dcfce7; color: #16a34a; }
.status-badge.inactive { background: #fee2e2; color: #dc2626; }
.actions-cell { display: flex; gap: 0.5rem; }
.btn-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
.btn-icon svg { width: 16px; height: 16px; }
.btn-icon.edit { background: #dbeafe; color: #2563eb; }
.btn-icon.edit:hover { background: #2563eb; color: white; }
.btn-icon.delete { background: #fee2e2; color: #dc2626; }
.btn-icon.delete:hover { background: #dc2626; color: white; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s; }
.modal-content { background: white; border-radius: 16px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; animation: slideUp 0.3s; }
.modal-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); }
.modal-close { background: none; border: none; cursor: pointer; color: var(--text-secondary); }
.modal-close svg { width: 24px; height: 24px; }
.modal-body { padding: 1.5rem; }
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-size: 0.875rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.375rem; }
.form-input { width: 100%; padding: 0.625rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.875rem; transition: all 0.2s; }
.form-input:focus { outline: none; border-color: var(--primary-color); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.color-select { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.color-option { width: 32px; height: 32px; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; }
.color-option:hover { transform: scale(1.1); }
.color-option.selected { border-color: var(--text-primary); box-shadow: 0 0 0 2px white, 0 0 0 4px var(--text-primary); }
.color-option.info { background: #3b82f6; }
.color-option.success { background: #10b981; }
.color-option.warning { background: #f59e0b; }
.color-option.error { background: #ef4444; }
.color-option.gray { background: #6b7280; }
.modal-footer { padding: 1rem 1.5rem; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 0.75rem; background: #f9fafb; border-radius: 0 0 16px 16px; }
/* Global styles for buttons and toggle-switch are now in index.css */
.empty-state { text-align: center; padding: 3rem; color: var(--text-secondary); }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 1024px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .stats-grid { grid-template-columns: 1fr; } .tabs-container { overflow-x: auto; } .form-row { grid-template-columns: 1fr; } }
`;

// Color options for badges
const colorOptions = ['info', 'success', 'warning', 'error', 'gray'];

function LeadMasterData() {
    const [activeTab, setActiveTab] = useState('sources');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ sources: {}, statuses: {}, priorities: {}, cities: {} });

    // Data states
    const [sources, setSources] = useState([]);
    const [statuses, setStatuses] = useState([]);
    const [priorities, setPriorities] = useState([]);
    const [cities, setCities] = useState([]);

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({});

    // Load stats on mount
    useEffect(() => {
        loadStats();
    }, []);

    // Load data when tab changes
    useEffect(() => {
        loadTabData(activeTab);
    }, [activeTab]);

    const loadStats = async () => {
        try {
            const res = await api.get('/lead-master/stats');
            if (res.data.success) {
                setStats(res.data.data);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    };

    const loadTabData = useCallback(async (tab) => {
        setLoading(true);
        try {
            const res = await api.get(`/lead-master/${tab}`);
            if (res.data.success) {
                switch (tab) {
                    case 'sources': setSources(res.data.data); break;
                    case 'statuses': setStatuses(res.data.data); break;
                    case 'priorities': setPriorities(res.data.data); break;
                    case 'cities': setCities(res.data.data); break;
                }
            }
        } catch (error) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleAdd = () => {
        setModalMode('create');
        setEditingItem(null);
        setFormData(getDefaultFormData(activeTab));
        setShowModal(true);
    };

    const handleEdit = (item) => {
        setModalMode('edit');
        setEditingItem(item);
        setFormData({ ...item, is_active: item.is_active === 1 || item.is_active === true });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this item?')) return;

        try {
            const res = await api.delete(`/lead-master/${activeTab}/${id}`);
            if (res.data.success) {
                toast.success('Deleted successfully');
                loadTabData(activeTab);
                loadStats();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const endpoint = `/lead-master/${activeTab}${modalMode === 'edit' ? `/${editingItem.id}` : ''}`;
            const method = modalMode === 'edit' ? 'put' : 'post';

            const res = await api[method](endpoint, formData);
            if (res.data.success) {
                toast.success(res.data.message);
                setShowModal(false);
                loadTabData(activeTab);
                loadStats();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save');
        }
    };

    const getDefaultFormData = (tab) => {
        switch (tab) {
            case 'sources': return { name: '', description: '' };
            case 'statuses': return { name: '', display_name: '', color: 'gray', sort_order: 0, is_active: true };
            case 'priorities': return { name: '', display_name: '', color: 'gray', sort_order: 0, is_active: true };
            case 'cities': return { name: '', state: '', country: 'Pakistan', is_active: true };
            default: return {};
        }
    };

    const getCurrentData = () => {
        switch (activeTab) {
            case 'sources': return sources;
            case 'statuses': return statuses;
            case 'priorities': return priorities;
            case 'cities': return cities;
            default: return [];
        }
    };

    const renderTable = () => {
        const data = getCurrentData();

        if (loading) {
            return <div className="empty-state">Loading...</div>;
        }

        if (!data.length) {
            return <div className="empty-state">No data found. Click "Add New" to create one.</div>;
        }

        switch (activeTab) {
            case 'sources':
                return (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Customers</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(item => (
                                <tr key={item.id}>
                                    <td><strong>{item.name}</strong></td>
                                    <td>{item.description || '-'}</td>
                                    <td>{item.lead_count || 0}</td>
                                    <td>
                                        <span className={`status-badge ${item.is_active ? 'active' : 'inactive'}`}>
                                            {item.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="actions-cell">
                                        <button className="btn-icon edit" onClick={() => handleEdit(item)}>
                                            <PencilIcon />
                                        </button>
                                        <button className="btn-icon delete" onClick={() => handleDelete(item.id)}>
                                            <TrashIcon />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );

            case 'statuses':
            case 'priorities':
                return (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Display Name</th>
                                <th>Color</th>
                                <th>Order</th>
                                <th>Customers</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(item => (
                                <tr key={item.id}>
                                    <td><code>{item.name}</code></td>
                                    <td><strong>{item.display_name}</strong></td>
                                    <td>
                                        <span className={`color-badge ${item.color || 'gray'}`}>
                                            {item.color || 'gray'}
                                        </span>
                                    </td>
                                    <td>{item.sort_order}</td>
                                    <td>{item.lead_count || 0}</td>
                                    <td>
                                        <span className={`status-badge ${item.is_active ? 'active' : 'inactive'}`}>
                                            {item.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="actions-cell">
                                        <button className="btn-icon edit" onClick={() => handleEdit(item)}>
                                            <PencilIcon />
                                        </button>
                                        <button className="btn-icon delete" onClick={() => handleDelete(item.id)}>
                                            <TrashIcon />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );

            case 'cities':
                return (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>City</th>
                                <th>State/Province</th>
                                <th>Country</th>
                                <th>Customers</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(item => (
                                <tr key={item.id}>
                                    <td><strong>{item.name}</strong></td>
                                    <td>{item.state || '-'}</td>
                                    <td>{item.country || 'Pakistan'}</td>
                                    <td>{item.lead_count || 0}</td>
                                    <td>
                                        <span className={`status-badge ${item.is_active ? 'active' : 'inactive'}`}>
                                            {item.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="actions-cell">
                                        <button className="btn-icon edit" onClick={() => handleEdit(item)}>
                                            <PencilIcon />
                                        </button>
                                        <button className="btn-icon delete" onClick={() => handleDelete(item.id)}>
                                            <TrashIcon />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );

            default:
                return null;
        }
    };

    const renderModalForm = () => {
        switch (activeTab) {
            case 'sources':
                return (
                    <>
                        <div className="form-group">
                            <label>Name *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.name || ''}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.description || ''}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                        {modalMode === 'edit' && (
                            <div className="form-group">
                                <label>Active</label>
                                <div
                                    className={`toggle-switch ${formData.is_active ? 'active' : ''}`}
                                    onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                                />
                            </div>
                        )}
                    </>
                );

            case 'statuses':
            case 'priorities':
                return (
                    <>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Name (Key) *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Display Name *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.display_name || ''}
                                    onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Color</label>
                            <div className="color-select">
                                {colorOptions.map(color => (
                                    <div
                                        key={color}
                                        className={`color-option ${color} ${formData.color === color ? 'selected' : ''}`}
                                        onClick={() => setFormData({ ...formData, color })}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Sort Order</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.sort_order || 0}
                                    onChange={e => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Active</label>
                                <div
                                    className={`toggle-switch ${formData.is_active ? 'active' : ''}`}
                                    onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                                />
                            </div>
                        </div>
                    </>
                );

            case 'cities':
                return (
                    <>
                        <div className="form-group">
                            <label>City Name *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.name || ''}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>State/Province</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.state || ''}
                                    onChange={e => setFormData({ ...formData, state: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Country</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.country || 'Pakistan'}
                                    onChange={e => setFormData({ ...formData, country: e.target.value })}
                                />
                            </div>
                        </div>
                        {modalMode === 'edit' && (
                            <div className="form-group">
                                <label>Active</label>
                                <div
                                    className={`toggle-switch ${formData.is_active ? 'active' : ''}`}
                                    onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                                />
                            </div>
                        )}
                    </>
                );

            default:
                return null;
        }
    };

    const getTabTitle = () => {
        switch (activeTab) {
            case 'sources': return 'Source';
            case 'statuses': return 'Status';
            case 'priorities': return 'Priority';
            case 'cities': return 'City';
            default: return 'Item';
        }
    };

    return (
        <>
            <style>{styles}</style>
            <div className="lead-master-container">
                <div className="lead-master-header">
                    <h1 className="lead-master-title">Customer Master Data</h1>
                </div>

                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon sources"><MegaphoneIcon /></div>
                        <div className="stat-content">
                            <h3>{stats.sources?.active || 0}</h3>
                            <p>Active Sources</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon statuses"><TagIcon /></div>
                        <div className="stat-content">
                            <h3>{stats.statuses?.active || 0}</h3>
                            <p>Active Statuses</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon priorities"><FlagIcon /></div>
                        <div className="stat-content">
                            <h3>{stats.priorities?.active || 0}</h3>
                            <p>Active Priorities</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon cities"><MapPinIcon /></div>
                        <div className="stat-content">
                            <h3>{stats.cities?.active || 0}</h3>
                            <p>Active Cities</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="tabs-container">
                    <button
                        className={`tab-btn ${activeTab === 'sources' ? 'active' : ''}`}
                        onClick={() => setActiveTab('sources')}
                    >
                        <MegaphoneIcon /> Sources
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'statuses' ? 'active' : ''}`}
                        onClick={() => setActiveTab('statuses')}
                    >
                        <TagIcon /> Statuses
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'priorities' ? 'active' : ''}`}
                        onClick={() => setActiveTab('priorities')}
                    >
                        <FlagIcon /> Priorities
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'cities' ? 'active' : ''}`}
                        onClick={() => setActiveTab('cities')}
                    >
                        <MapPinIcon /> Cities
                    </button>
                </div>

                {/* Content */}
                <div className="content-card">
                    <div className="content-header">
                        <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
                        <button className="btn-add" onClick={handleAdd}>
                            <PlusIcon /> Add New
                        </button>
                    </div>
                    {renderTable()}
                </div>

                {/* Modal */}
                {showModal && (
                    <div className="modal-overlay">
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{modalMode === 'create' ? 'Add' : 'Edit'} {getTabTitle()}</h3>
                                <button className="modal-close" onClick={() => setShowModal(false)}>
                                    <XMarkIcon />
                                </button>
                            </div>
                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    {renderModalForm()}
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-save">
                                        <CheckIcon /> Save
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

export default LeadMasterData;
