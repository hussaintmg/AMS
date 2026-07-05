/**
 * Warehouse Management Page
 * Professional corporate UI for managing warehouses
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-07
 */

import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { warehouseAPI } from '../services/api';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import '../styles/warehouseManagement.css';

const WarehouseManagement = () => {
    const { user: currentUser } = useAuth();

    // State
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorPopup, setErrorPopup] = useState(null);
    const [stats, setStats] = useState({});

    // Pagination & filtering
    const [page, setPage] = useState(1);
    const [limit] = useState(15);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [cityFilter, setCityFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedWarehouse, setSelectedWarehouse] = useState(null);
    const [showInventoryModal, setShowInventoryModal] = useState(false);
    const [inventoryData, setInventoryData] = useState(null);

    // Reference data
    const [cities, setCities] = useState([]);
    const [managers, setManagers] = useState([]);

    // Form data
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        address: '',
        city: '',
        phone: '',
        email: '',
        managerId: '',
        capacity: ''
    });

    // Debounced search state
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Fetch warehouses
    const fetchWarehouses = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                page,
                limit,
                search: debouncedSearch,
                ...(cityFilter && { city: cityFilter }),
                ...(statusFilter && { isActive: statusFilter === 'active' })
            };

            const response = await warehouseAPI.getAll(params);
            const responseData = response?.data?.data || {};
            setWarehouses(responseData.warehouses || []);
            setTotalPages(responseData.pagination?.totalPages || 1);
            setTotal(responseData.pagination?.total || 0);
        } catch (err) {
            console.error('Error fetching warehouses:', err);
            toast.error('Failed to load warehouses');
            setWarehouses([]);
        } finally {
            setLoading(false);
        }
    }, [page, limit, debouncedSearch, cityFilter, statusFilter]);

    // Fetch reference data
    const fetchReferenceData = useCallback(async () => {
        try {
            const [citiesRes, managersRes, statsRes] = await Promise.all([
                warehouseAPI.getCities(),
                warehouseAPI.getManagers(),
                warehouseAPI.getStats()
            ]);

            setCities(citiesRes?.data?.data || []);
            setManagers(managersRes?.data?.data || []);
            setStats(statsRes?.data?.data || {});
        } catch (err) {
            console.error('Error fetching reference data:', err);
            setCities([]);
            setManagers([]);
        }
    }, []);

    useEffect(() => {
        fetchWarehouses();
    }, [fetchWarehouses]);

    useEffect(() => {
        fetchReferenceData();
    }, [fetchReferenceData]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Handle form input change
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Open modal
    const openModal = (mode, warehouse = null) => {
        setModalMode(mode);
        setSelectedWarehouse(warehouse);

        if (mode === 'create') {
            setFormData({
                name: '',
                code: '',
                address: '',
                city: '',
                phone: '',
                email: '',
                managerId: '',
                capacity: ''
            });
        } else if (warehouse) {
            setFormData({
                name: warehouse.name,
                code: warehouse.code,
                address: warehouse.address || '',
                city: warehouse.city || '',
                phone: warehouse.phone || '',
                email: warehouse.email || '',
                managerId: warehouse.manager_id || '',
                capacity: warehouse.capacity || '',
                isActive: warehouse.is_active,
                phone: warehouse.phone || warehouse.manager_phone || '',
                email: warehouse.email || warehouse.manager_email || ''
            });
        }

        setShowModal(true);
    };

    // Close modal
    const closeModal = () => {
        setShowModal(false);
        setSelectedWarehouse(null);
    };

    // Open inventory modal
    const openInventoryModal = async (warehouse) => {
        try {
            const response = await warehouseAPI.getInventory(warehouse.id);
            setInventoryData(response?.data?.data || null);
            setSelectedWarehouse(warehouse);
            setShowInventoryModal(true);
        } catch (err) {
            console.error('Error fetching inventory:', err);
            toast.error('Failed to load inventory');
        }
    };

    // Close inventory modal
    const closeInventoryModal = () => {
        setShowInventoryModal(false);
        setInventoryData(null);
        setSelectedWarehouse(null);
    };

    // Create warehouse
    const handleCreateWarehouse = async (e) => {
        e.preventDefault();
        try {
            await warehouseAPI.create(formData);
            toast.success('Warehouse created successfully!');
            closeModal();
            fetchWarehouses();
            fetchReferenceData();
        } catch (err) {
            console.error('Error creating warehouse:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to create warehouse' });
        }
    };

    // Update warehouse
    const handleUpdateWarehouse = async (e) => {
        e.preventDefault();
        try {
            await warehouseAPI.update(selectedWarehouse.id, formData);
            toast.success('Warehouse updated successfully!');
            closeModal();
            fetchWarehouses();
        } catch (err) {
            console.error('Error updating warehouse:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to update warehouse' });
        }
    };

    // Delete warehouse
    const handleDeleteWarehouse = async (warehouseId, warehouseName) => {
        if (!window.confirm(`Are you sure you want to delete warehouse "${warehouseName}"?`)) {
            return;
        }
        try {
            await warehouseAPI.delete(warehouseId);
            toast.success('Warehouse deleted successfully!');
            fetchWarehouses();
            fetchReferenceData();
        } catch (err) {
            console.error('Error deleting warehouse:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to delete warehouse' });
        }
    };

    // Format currency
    const formatCurrency = (amount) => {
        return `PKR ${Number(amount || 0).toLocaleString()}`;
    };

    return (
        <div className="warehouse-management-page">
            {/* Page Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>Warehouse Management</h1>
                    <p className="subtitle">Manage storage locations and inventory distribution</p>
                </div>
                <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
                    <span className="icon">+</span>
                    Add Warehouse
                </button>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card stat-total">
                    <div className="stat-icon">🏭</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_warehouses || 0}</span>
                        <span className="stat-label">Total Warehouses</span>
                    </div>
                </div>
                <div className="stat-card stat-vehicles">
                    <div className="stat-icon">🚗</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_vehicles || 0}</span>
                        <span className="stat-label">Vehicles Stored</span>
                    </div>
                </div>
                <div className="stat-card stat-parts">
                    <div className="stat-icon">🔧</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_parts || 0}</span>
                        <span className="stat-label">Parts Stored</span>
                    </div>
                </div>
                <div className="stat-card stat-cities">
                    <div className="stat-icon">📍</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.cities_covered || 0}</span>
                        <span className="stat-label">Cities Covered</span>
                    </div>
                </div>
                <div className="stat-card stat-value">
                    <div className="stat-icon">💵</div>
                    <div className="stat-content">
                        <span className="stat-value">{formatCurrency(stats.total_value)}</span>
                        <span className="stat-label">Total Inventory Value</span>
                    </div>
                </div>
            </div>

            <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search by name, code, or city..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input"
                    />
                    <span className="search-icon">🔍</span>
                </div>

                <SearchableSelect
                    value={cityFilter}
                    onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
                    className="filter-select"
                >
                    <option value="">All Cities</option>
                    {cities.map(city => (
                        <option key={city} value={city}>{city}</option>
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

                <span className="results-count">{total} warehouses found</span>
            </div>

            {/* Warehouses Table */}
            <div className="table-container">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading warehouses...</p>
                    </div>
                ) : warehouses.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🏭</div>
                        <h3>No Warehouses Found</h3>
                        <p>No warehouses match your search criteria.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Name</th>
                                <th>City</th>
                                <th>Manager</th>
                                <th>Vehicles</th>
                                <th>Parts</th>
                                <th>Total Value</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {warehouses.map(warehouse => (
                                <tr key={warehouse.id} className={!warehouse.is_active ? 'row-inactive' : ''}>
                                    <td>
                                        <strong className="warehouse-code">{warehouse.code}</strong>
                                    </td>
                                    <td>
                                        <div className="warehouse-info">
                                            <span className="warehouse-name">{warehouse.name}</span>
                                            {warehouse.address && <span className="warehouse-address">{warehouse.address}</span>}
                                        </div>
                                    </td>
                                    <td>{warehouse.city || '-'}</td>
                                    <td>
                                        {warehouse.manager_name ? (
                                            <div className="manager-info">
                                                <span className="manager-name">{warehouse.manager_name}</span>
                                                {warehouse.manager_email && <span className="manager-email">{warehouse.manager_email}</span>}
                                            </div>
                                        ) : (
                                            <span className="no-manager">Not Assigned</span>
                                        )}
                                    </td>
                                    <td className="count-cell">{warehouse.vehicle_count || 0}</td>
                                    <td className="count-cell">{warehouse.parts_count || 0}</td>
                                    <td className="value-cell">{formatCurrency(warehouse.total_value)}</td>
                                    <td>
                                        <span className={`badge ${warehouse.is_active ? 'badge-success' : 'badge-danger'}`}>
                                            {warehouse.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="action-group">
                                            <button
                                                className="btn-icon btn-view"
                                                onClick={() => openInventoryModal(warehouse)}
                                                title="View Inventory"
                                            >
                                                📦
                                            </button>
                                            <ActionButtons
                                                onEdit={() => openModal('edit', warehouse)}
                                                onDelete={() => handleDeleteWarehouse(warehouse.id, warehouse.name)}
                                                title={warehouse.name}
                                                showEdit
                                                showDelete
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="pagination">
                    <button
                        className="btn-page"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
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
                                <button
                                    key={pageNum}
                                    className={`btn-page ${page === pageNum ? 'active' : ''}`}
                                    onClick={() => setPage(pageNum)}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        className="btn-page"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                    >
                        Next →
                    </button>
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content modal-md" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{modalMode === 'create' ? 'Add New Warehouse' : 'Edit Warehouse'}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>

                        <form onSubmit={modalMode === 'create' ? handleCreateWarehouse : handleUpdateWarehouse}>
                            <div className="modal-body">
                                <div className="form-section">
                                    <h3>Warehouse Information</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label htmlFor="name">Name *</label>
                                            <input
                                                id="name"
                                                type="text"
                                                name="name"
                                                value={formData.name}
                                                onChange={handleInputChange}
                                                required
                                                placeholder="Warehouse name"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="code">Code *</label>
                                            <input
                                                id="code"
                                                type="text"
                                                name="code"
                                                value={formData.code}
                                                onChange={handleInputChange}
                                                required
                                                placeholder="e.g., WH-001"
                                                maxLength={20}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group full-width">
                                            <label htmlFor="address">Address</label>
                                            <textarea
                                                id="address"
                                                name="address"
                                                value={formData.address}
                                                onChange={handleInputChange}
                                                placeholder="Full address..."
                                                rows={2}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label htmlFor="city">City</label>
                                            <input
                                                id="city"
                                                type="text"
                                                name="city"
                                                value={formData.city}
                                                onChange={handleInputChange}
                                                placeholder="City"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="managerId">Manager</label>
                                            <SearchableSelect
                                                id="managerId"
                                                name="managerId"
                                                value={formData.managerId}
                                                onChange={handleInputChange}
                                            >
                                                <option value="">Select Manager</option>
                                                {managers.map(manager => (
                                                    <option key={manager.id} value={manager.id}>{manager.name}</option>
                                                ))}
                                            </SearchableSelect>
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label htmlFor="capacity">Capacity (Units)</label>
                                            <input
                                                id="capacity"
                                                type="number"
                                                name="capacity"
                                                value={formData.capacity}
                                                onChange={handleInputChange}
                                                placeholder="Total storage capacity"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="isActive">Status</label>
                                            <SearchableSelect
                                                id="isActive"
                                                name="isActive"
                                                value={formData.isActive}
                                                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.value === 'true' }))}
                                            >
                                                <option value="true">Active</option>
                                                <option value="false">Inactive</option>
                                            </SearchableSelect>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section">
                                    <h3>Contact Information</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label htmlFor="phone">Phone</label>
                                            <input
                                                id="phone"
                                                type="text"
                                                name="phone"
                                                value={formData.phone}
                                                onChange={handleInputChange}
                                                placeholder="Phone number"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="email">Email</label>
                                            <input
                                                id="email"
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleInputChange}
                                                placeholder="Email address"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {modalMode === 'create' ? 'Add Warehouse' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Inventory Modal */}
            {showInventoryModal && inventoryData && (
                <div className="modal-overlay">
                    <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Warehouse Inventory: {selectedWarehouse?.name}</h2>
                            <button className="modal-close" onClick={closeInventoryModal}>×</button>
                        </div>

                        <div className="modal-body">
                            <div className="inventory-summary">
                                <div className="summary-item">
                                    <span className="summary-label">Vehicles</span>
                                    <span className="summary-value">{inventoryData.summary?.vehicleCount || 0}</span>
                                </div>
                                <div className="summary-item">
                                    <span className="summary-label">Parts</span>
                                    <span className="summary-value">{inventoryData.summary?.partsCount || 0}</span>
                                </div>
                                <div className="summary-item">
                                    <span className="summary-label">Vehicle Value</span>
                                    <span className="summary-value">{formatCurrency(inventoryData.summary?.vehicleValue)}</span>
                                </div>
                                <div className="summary-item">
                                    <span className="summary-label">Parts Value</span>
                                    <span className="summary-value">{formatCurrency(inventoryData.summary?.partsValue)}</span>
                                </div>
                            </div>

                            {inventoryData.vehicles?.length > 0 && (
                                <div className="inventory-section">
                                    <h3>🚗 Vehicles ({inventoryData.vehicles.length})</h3>
                                    <table className="data-table compact">
                                        <thead>
                                            <tr>
                                                <th>VIN</th>
                                                <th>Vehicle</th>
                                                <th>Color</th>
                                                <th>Status</th>
                                                <th>Price</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inventoryData.vehicles?.slice(0, 10).map(v => (
                                                <tr key={v.id}>
                                                    <td>{v.vin}</td>
                                                    <td>{v.make_name} {v.model_name} {v.variant_name}</td>
                                                    <td>{v.color_name}</td>
                                                    <td><span className="badge badge-info">{v.status}</span></td>
                                                    <td>{formatCurrency(v.selling_price)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {inventoryData.vehicles.length > 10 && (
                                        <p className="more-items">...and {inventoryData.vehicles.length - 10} more vehicles</p>
                                    )}
                                </div>
                            )}

                            {inventoryData.parts?.length > 0 && (
                                <div className="inventory-section">
                                    <h3>🔧 Parts ({inventoryData.parts.length})</h3>
                                    <table className="data-table compact">
                                        <thead>
                                            <tr>
                                                <th>Part #</th>
                                                <th>Name</th>
                                                <th>Brand</th>
                                                <th>Stock</th>
                                                <th>Bin</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inventoryData.parts?.slice(0, 10).map(p => (
                                                <tr key={p.id}>
                                                    <td>{p.part_number}</td>
                                                    <td>{p.name}</td>
                                                    <td>{p.brand || '-'}</td>
                                                    <td>{p.current_stock} {p.unit}</td>
                                                    <td>{p.bin_location || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {inventoryData.parts.length > 10 && (
                                        <p className="more-items">...and {inventoryData.parts.length - 10} more parts</p>
                                    )}
                                </div>
                            )}

                            {inventoryData.vehicles?.length === 0 && inventoryData.parts?.length === 0 && (
                                <div className="empty-inventory">
                                    <p>No inventory in this warehouse</p>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={closeInventoryModal}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WarehouseManagement;