/**
 * Service Master Data Management Page
 * Full CRUD operations for Service Types, Labor Rates, Packages, and Warranty Types
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-09
 */

import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { serviceMasterAPI, vehicleMasterAPI } from '../services/api';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import '../styles/serviceMasterData.css';

const toArray = (value) => Array.isArray(value) ? value : [];

function ServiceMasterData() {
    // State
    const [activeTab, setActiveTab] = useState('types');
    const [stats, setStats] = useState({
        serviceTypes: 0,
        laborRates: 0,
        packages: 0,
        warranties: 0
    });
    const [loading, setLoading] = useState(false);
    const [tableData, setTableData] = useState([]);
    const [search, setSearch] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('create'); // create, edit
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({});

    // Lookups
    const [categories, setCategories] = useState([]);
    const [vehicleMakes, setVehicleMakes] = useState([]);
    const [vehicleModels, setVehicleModels] = useState([]);

    // ═══════════════════════════════════════════════════════════════════════════
    // INITIALIZATION & DATA FETCHING
    // ═══════════════════════════════════════════════════════════════════════════

    const fetchStats = useCallback(async () => {
        try {
            const res = await serviceMasterAPI.getStats();
            if (res.data.success) {
                setStats(res.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    }, []);

    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            let res;
            const params = { search, page: pagination.page, limit: pagination.limit };

            switch (activeTab) {
                case 'types':
                    res = await serviceMasterAPI.getTypes(params);
                    break;
                case 'rates':
                    res = await serviceMasterAPI.getLaborRates(params);
                    break;
                case 'packages':
                    res = await serviceMasterAPI.getPackages(params);
                    break;
                case 'warranties':
                    res = await serviceMasterAPI.getWarranties(params);
                    break;
                default:
                    res = { data: { data: [] } };
            }

            if (res.data.success) {
                setTableData(toArray(res.data.data));
                if (res.data.pagination) {
                    setPagination(res.data.pagination);
                }
            }
        } catch (error) {
            toast.error('Failed to fetch data');
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [activeTab, search, pagination.page, pagination.limit]);

    const fetchLookups = useCallback(async () => {
        try {
            const [cats, makes] = await Promise.all([
                serviceMasterAPI.getCategories(),
                vehicleMasterAPI.getMakes({ limit: 100 })
            ]);
            setCategories(toArray(cats.data.data));
            setVehicleMakes(toArray(makes.data.data));
        } catch (error) {
            console.error('Failed to fetch lookups', error);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        fetchLookups();
    }, [fetchStats, fetchLookups]);

    useEffect(() => {
        fetchTableData();
    }, [fetchTableData]);

    // Fetch models when make changes (for package form)
    const fetchModels = async (makeId) => {
        if (!makeId) {
            setVehicleModels([]);
            return;
        }
        try {
            const res = await vehicleMasterAPI.getModels({ makeId });
            setVehicleModels(toArray(res.data.data));
        } catch (error) {
            console.error('Failed to fetch models', error);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSearch('');
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const handleSearch = (e) => {
        setSearch(e.target.value);
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setCurrentItem(item);

        // Reset form data based on tab
        const initialData = item ? { ...item } : {};

        // Tab specific defaults
        if (activeTab === 'types' && !item) {
            initialData.categoryId = categories[0]?.id;
        }

        if (activeTab === 'packages') {
            if (item?.vehicle_make_id) fetchModels(item.vehicle_make_id);
            if (!item) {
                initialData.isActive = true;
                initialData.basePrice = 0;
            }
        }

        setFormData(initialData);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setFormData({});
        setCurrentItem(null);
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));

        if (name === 'makeId') {
            fetchModels(value);
            setFormData(prev => ({ ...prev, modelId: '' }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            let res;
            const data = { ...formData };

            // Format numbers
            if (data.basePrice) data.basePrice = parseFloat(data.basePrice);
            if (data.hourlyRate) data.hourlyRate = parseFloat(data.hourlyRate);
            if (data.estimatedHours) data.estimatedHours = parseFloat(data.estimatedHours);

            if (modalMode === 'create') {
                switch (activeTab) {
                    case 'types': res = await serviceMasterAPI.createType(data); break;
                    case 'rates': res = await serviceMasterAPI.createLaborRate(data); break;
                    case 'packages': res = await serviceMasterAPI.createPackage(data); break;
                    case 'warranties': res = await serviceMasterAPI.createWarranty(data); break;
                }
            } else {
                switch (activeTab) {
                    case 'types': res = await serviceMasterAPI.updateType(currentItem.id, data); break;
                    case 'rates': res = await serviceMasterAPI.updateLaborRate(currentItem.id, data); break;
                    case 'packages': res = await serviceMasterAPI.updatePackage(currentItem.id, data); break;
                    case 'warranties': res = await serviceMasterAPI.updateWarranty(currentItem.id, data); break;
                }
            }

            if (res.data.success) {
                toast.success(res.data.message);
                fetchTableData();
                fetchStats();
                closeModal();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        }
    };

    const handleDelete = async (item) => {
        if (!window.confirm('Are you sure you want to delete this item?')) return;

        try {
            let res;
            switch (activeTab) {
                case 'types': res = await serviceMasterAPI.deleteType(item.id); break;
                case 'rates': res = await serviceMasterAPI.deleteLaborRate(item.id); break;
                case 'packages': res = await serviceMasterAPI.deletePackage(item.id); break;
                case 'warranties': res = await serviceMasterAPI.deleteWarranty(item.id); break;
            }

            if (res.data.success) {
                toast.success('Deleted successfully');
                fetchTableData();
                fetchStats();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Delete failed');
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER TABLES
    // ═══════════════════════════════════════════════════════════════════════════

    const renderServiceTypesTable = () => (
        <div className="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Base Price</th>
                        <th>Est. Hours</th>
                        <th>Usage</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {toArray(tableData).length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center' }}>No Service Types found</td></tr>
                    ) : (
                        toArray(tableData).map(item => (
                            <tr key={item.id}>
                                <td>
                                    <strong>{item.name}</strong>
                                    <div style={{ fontSize: '12px', color: '#666' }}>{item.description}</div>
                                </td>
                                <td>{item.category_name}</td>
                                <td>${Number(item.base_price).toFixed(2)}</td>
                                <td>{item.estimated_hours} hrs</td>
                                <td>{item.usage_count} times</td>
                                <td>
                                    <ActionButtons
                                        onEdit={() => openModal('edit', item)}
                                        onDelete={() => handleDelete(item)}
                                    />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderLaborRatesTable = () => (
        <div className="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Hourly Rate</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {toArray(tableData).length === 0 ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center' }}>No Labor Rates found</td></tr>
                    ) : (
                        toArray(tableData).map(item => (
                            <tr key={item.id}>
                                <td><strong>{item.name}</strong></td>
                                <td>${Number(item.hourly_rate).toFixed(2)}/hr</td>
                                <td>{item.description}</td>
                                <td>
                                    <span className={`status-badge ${item.is_active ? 'active' : 'inactive'}`}>
                                        {item.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <ActionButtons
                                        onEdit={() => openModal('edit', item)}
                                        onDelete={() => handleDelete(item)}
                                    />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderPackagesTable = () => (
        <div className="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Package Name</th>
                        <th>Vehicle</th>
                        <th>Base Price</th>
                        <th>Items</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {toArray(tableData).length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center' }}>No Packages found</td></tr>
                    ) : (
                        toArray(tableData).map(item => (
                            <tr key={item.id}>
                                <td>
                                    <strong>{item.name}</strong>
                                    <div style={{ fontSize: '12px', color: '#666' }}>{item.description}</div>
                                </td>
                                <td>
                                    {item.vehicle_make_name ? `${item.vehicle_make_name} ${item.vehicle_model_name || ''}` : 'Universal'}
                                </td>
                                <td>${Number(item.base_price).toFixed(2)}</td>
                                <td>{item.items_count} items</td>
                                <td>
                                    <span className={`status-badge ${item.is_active ? 'active' : 'inactive'}`}>
                                        {item.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <ActionButtons
                                        onEdit={() => openModal('edit', item)}
                                        onDelete={() => handleDelete(item)}
                                        customActions={[{
                                            label: 'Items',
                                            icon: 'inventory_2',
                                            onClick: () => toast('Manage items feature coming soon')
                                        }]}
                                    />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderWarrantiesTable = () => (
        <div className="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Duration</th>
                        <th>Km Limit</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {toArray(tableData).length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center' }}>No Warranty Types found</td></tr>
                    ) : (
                        toArray(tableData).map(item => (
                            <tr key={item.id}>
                                <td><strong>{item.name}</strong></td>
                                <td>{item.duration_months} months</td>
                                <td>{item.duration_km.toLocaleString()} km</td>
                                <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.description}
                                </td>
                                <td>
                                    <span className={`status-badge ${item.is_active ? 'active' : 'inactive'}`}>
                                        {item.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <ActionButtons
                                        onEdit={() => openModal('edit', item)}
                                        onDelete={() => handleDelete(item)}
                                    />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER FORMS
    // ═══════════════════════════════════════════════════════════════════════════

    const renderServiceTypeForm = () => (
        <>
            <div className="form-group">
                <label>Category *</label>
                <SearchableSelect name="categoryId" value={formData.categoryId || ''} onChange={handleInputChange} required>
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SearchableSelect>
            </div>
            <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                    <label>Base Price ($) *</label>
                    <input type="number" name="basePrice" value={formData.basePrice || ''} onChange={handleInputChange} min="0" step="0.01" required />
                </div>
                <div className="form-group">
                    <label>Estimated Hours *</label>
                    <input type="number" name="estimatedHours" value={formData.estimatedHours || ''} onChange={handleInputChange} min="0" step="0.1" required />
                </div>
            </div>
        </>
    );

    const renderLaborRateForm = () => (
        <>
            <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required />
            </div>
            <div className="form-group">
                <label>Hourly Rate ($) *</label>
                <input type="number" name="hourlyRate" value={formData.hourlyRate || ''} onChange={handleInputChange} min="0" step="0.01" required />
            </div>
            <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
            </div>
            <div className="form-group">
                <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive || false} onChange={handleInputChange} />
                    Active
                </label>
            </div>
        </>
    );

    const renderPackageForm = () => (
        <>
            <div className="form-group">
                <label>Package Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                    <label>Vehicle Make (Optional)</label>
                    <SearchableSelect name="makeId" value={formData.makeId || formData.vehicle_make_id || ''} onChange={handleInputChange}>
                        <option value="">Universal / All Makes</option>
                        {vehicleMakes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </SearchableSelect>
                </div>
                <div className="form-group">
                    <label>Vehicle Model (Optional)</label>
                    <SearchableSelect name="modelId" value={formData.modelId || formData.vehicle_model_id || ''} onChange={handleInputChange} disabled={!formData.makeId && !formData.vehicle_make_id}>
                        <option value="">All Models</option>
                        {vehicleModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </SearchableSelect>
                </div>
            </div>
            <div className="form-group">
                <label>Base Price ($)</label>
                <input type="number" name="basePrice" value={formData.basePrice || ''} onChange={handleInputChange} min="0" step="0.01" />
                <small className="text-gray-500">Leave 0 to auto-calculate from items</small>
            </div>
            <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
            </div>
            <div className="form-group">
                <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive || false} onChange={handleInputChange} />
                    Active
                </label>
            </div>
        </>
    );

    const renderWarrantyForm = () => (
        <>
            <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                    <label>Duration (Months)</label>
                    <input type="number" name="durationMonths" value={formData.durationMonths || ''} onChange={handleInputChange} min="0" />
                </div>
                <div className="form-group">
                    <label>Duration (Km)</label>
                    <input type="number" name="durationKm" value={formData.durationKm || ''} onChange={handleInputChange} min="0" />
                </div>
            </div>
            <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description || ''} onChange={handleInputChange} />
            </div>
            <div className="form-group">
                <label>Terms & Conditions</label>
                <textarea name="terms" value={formData.terms || ''} onChange={handleInputChange} rows="3" />
            </div>
            <div className="form-group">
                <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive || false} onChange={handleInputChange} />
                    Active
                </label>
            </div>
        </>
    );

    return (
        <div className="service-master-container">
            <div className="page-header">
                <h1>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="28">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Service Master Data
                </h1>
            </div>

            {/* Stats */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon types">🛠️</div>
                    <div className="stat-info">
                        <h3>Service Types</h3>
                        <div className="value">{stats.serviceTypes}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon rates">💲</div>
                    <div className="stat-info">
                        <h3>Labor Rates</h3>
                        <div className="value">{stats.laborRates}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon packages">📦</div>
                    <div className="stat-info">
                        <h3>Packages</h3>
                        <div className="value">{stats.packages}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon warranties">🛡️</div>
                    <div className="stat-info">
                        <h3>Warranties</h3>
                        <div className="value">{stats.warranties}</div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="tabs-container">
                <div className="tabs-header">
                    <button className={`tab-btn ${activeTab === 'types' ? 'active' : ''}`} onClick={() => handleTabChange('types')}>
                        Service Types
                    </button>
                    <button className={`tab-btn ${activeTab === 'rates' ? 'active' : ''}`} onClick={() => handleTabChange('rates')}>
                        Labor Rates
                    </button>
                    <button className={`tab-btn ${activeTab === 'packages' ? 'active' : ''}`} onClick={() => handleTabChange('packages')}>
                        Service Packages
                    </button>
                    <button className={`tab-btn ${activeTab === 'warranties' ? 'active' : ''}`} onClick={() => handleTabChange('warranties')}>
                        Warranty Types
                    </button>
                </div>

                <div className="tab-content">
                    <div className="action-bar">
                        <div className="search-box">
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search..."
                                value={search}
                                onChange={handleSearch}
                            />
                        </div>
                        <button className="add-btn" onClick={() => openModal('create')}>
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Add New
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center p-12"><div className="spinner"></div></div>
                    ) : (
                        <>
                            {activeTab === 'types' && renderServiceTypesTable()}
                            {activeTab === 'rates' && renderLaborRatesTable()}
                            {activeTab === 'packages' && renderPackagesTable()}
                            {activeTab === 'warranties' && renderWarrantiesTable()}
                        </>
                    )}
                </div>
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>
                                {modalMode === 'create' ? 'Create' : 'Edit'}
                                {activeTab === 'types' ? ' Service Type' :
                                    activeTab === 'rates' ? ' Labor Rate' :
                                        activeTab === 'packages' ? ' Service Package' : ' Warranty Type'}
                            </h2>
                            <button className="close-btn" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {activeTab === 'types' && renderServiceTypeForm()}
                                {activeTab === 'rates' && renderLaborRateForm()}
                                {activeTab === 'packages' && renderPackageForm()}
                                {activeTab === 'warranties' && renderWarrantyForm()}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn-primary">
                                    {modalMode === 'create' ? 'Create' : 'Update'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ServiceMasterData;
