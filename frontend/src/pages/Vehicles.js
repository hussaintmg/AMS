/**
 * Vehicle Inventory Page
 * Professional corporate UI for managing vehicle inventory with full CRUD operations
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-06
 */

import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { vehicleAPI, adminAPI } from '../services/api'; // Added adminAPI
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import BulkUploadModal from '../components/BulkUploadModal';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import '../styles/vehicleInventory.css';

const Vehicles = () => {
    const { user: currentUser } = useAuth();

    // State
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorPopup, setErrorPopup] = useState(null);
    const [stats, setStats] = useState({});

    // Pagination & filtering
    const [page, setPage] = useState(1);
    const [limit] = useState(15);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';

    const [search, setSearch] = useState(urlSearch);
    const [statusFilter, setStatusFilter] = useState('');
    const [makeFilter, setMakeFilter] = useState('');

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [showBulkUpload, setShowBulkUpload] = useState(false);

    // Reference data
    const [makes, setMakes] = useState([]);
    const [models, setModels] = useState([]);
    const [variants, setVariants] = useState([]);
    const [colors, setColors] = useState([]);
    const [warehouses, setWarehouses] = useState([]);

    // Dynamic Dropdowns
    const [statusOptions, setStatusOptions] = useState([]);
    const [conditionOptions, setConditionOptions] = useState([]);

    // Form data
    const [formData, setFormData] = useState({
        vin: '',
        engineNumber: '',
        makeId: '',
        modelId: '',
        variantId: '',
        colorId: '',
        year: new Date().getFullYear(),
        status: 'at_yard',
        conditionType: 'new',
        mileage: 0,
        purchasePrice: '',
        sellingPrice: '',
        warehouseId: '',
        location: '',
        arrivalDate: '',
        notes: ''
    });

    // Fetch vehicles
    const fetchVehicles = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                page,
                limit,
                ...(search && { search }),
                ...(statusFilter && { status: statusFilter }),
                ...(makeFilter && { makeId: makeFilter })
            };

            const response = await vehicleAPI.getAll(params);
            const responseData = response?.data?.data || {};
            setVehicles(responseData.vehicles || []);
            setTotalPages(responseData.pagination?.totalPages || 1);
            setTotal(responseData.pagination?.total || 0);
        } catch (err) {
            console.error('Error fetching vehicles:', err);
            toast.error('Failed to load vehicles');
            setVehicles([]);
        } finally {
            setLoading(false);
        }
    }, [page, limit, search, statusFilter, makeFilter]);

    // Fetch reference data
    const fetchReferenceData = useCallback(async () => {
        try {
            const [makesRes, colorsRes, warehousesRes, statsRes, statusRes, conditionRes] = await Promise.all([
                vehicleAPI.getMakes(),
                vehicleAPI.getColors(),
                vehicleAPI.getWarehouses(),
                vehicleAPI.getStats(),
                adminAPI.getStatusesByTable('vehicles'),
                adminAPI.getStatusesByTable('vehicle_conditions')
            ]);

            setMakes(makesRes?.data?.data || []);
            setColors(colorsRes?.data?.data || []);
            setWarehouses(warehousesRes?.data?.data || []);
            setStats(statsRes?.data?.data || {});

            // Set dynamic options
            if (statusRes?.data?.data?.statuses) {
                setStatusOptions(statusRes.data.data.statuses);
            }

            if (conditionRes?.data?.data?.statuses) {
                setConditionOptions(conditionRes.data.data.statuses);
            }
        } catch (err) {
            console.error('Error fetching reference data:', err);
            // Don't clear main data on error, keep what we have or defaults
        }
    }, []);

    // Load models when make changes
    const loadModels = async (makeId) => {
        if (!makeId) {
            setModels([]);
            setVariants([]);
            return;
        }
        try {
            const response = await vehicleAPI.getModels(makeId);
            setModels(response?.data?.data || []);
        } catch (err) {
            console.error('Error loading models:', err);
            setModels([]);
        }
    };

    // Load variants when model changes
    const loadVariants = async (modelId) => {
        if (!modelId) {
            setVariants([]);
            return;
        }
        try {
            const response = await vehicleAPI.getVariants(modelId);
            setVariants(response?.data?.data || []);
        } catch (err) {
            console.error('Error loading variants:', err);
            setVariants([]);
        }
    };

    useEffect(() => {
        fetchVehicles();
        fetchReferenceData();
    }, [fetchVehicles, fetchReferenceData]);

    // Update search if URL search param changes
    useEffect(() => {
        if (urlSearch) {
            setSearch(urlSearch);
        }
    }, [urlSearch]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchVehicles();
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Handle form input change
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        if (name === 'makeId') {
            loadModels(value);
            setFormData(prev => ({ ...prev, modelId: '', variantId: '' }));
        }
        if (name === 'modelId') {
            loadVariants(value);
            setFormData(prev => ({ ...prev, variantId: '' }));
        }
    };

    // Open modal
    const openModal = (mode, vehicle = null) => {
        setModalMode(mode);
        setSelectedVehicle(vehicle);

        if (mode === 'create') {
            setFormData({
                vin: '',
                engineNumber: '',
                makeId: '',
                modelId: '',
                variantId: '',
                colorId: '',
                year: new Date().getFullYear(),
                status: 'at_yard',
                conditionType: 'new',
                mileage: 0,
                purchasePrice: '',
                sellingPrice: '',
                warehouseId: '',
                location: '',
                arrivalDate: '',
                notes: ''
            });
            setModels([]);
            setVariants([]);
        } else if (vehicle) {
            setFormData({
                vin: vehicle.vin,
                engineNumber: vehicle.engine_number,
                makeId: vehicle.make_id,
                modelId: vehicle.model_id,
                variantId: vehicle.variant_id,
                colorId: vehicle.color_id,
                year: vehicle.year,
                status: vehicle.status,
                conditionType: vehicle.condition_type,
                mileage: vehicle.mileage,
                purchasePrice: vehicle.purchase_price,
                sellingPrice: vehicle.selling_price,
                warehouseId: vehicle.warehouse_id || '',
                location: vehicle.location || '',
                arrivalDate: vehicle.arrival_date ? vehicle.arrival_date.split('T')[0] : '',
                notes: vehicle.notes || ''
            });
            loadModels(vehicle.make_id);
            setTimeout(() => loadVariants(vehicle.model_id), 100);
        }

        setShowModal(true);
    };

    // Close modal
    const closeModal = () => {
        setShowModal(false);
        setSelectedVehicle(null);
    };

    // Create vehicle
    const handleCreateVehicle = async (e) => {
        e.preventDefault();
        try {
            await vehicleAPI.create(formData);
            toast.success('Vehicle created successfully!');
            closeModal();
            fetchVehicles();
            fetchReferenceData();
        } catch (err) {
            console.error('Error creating vehicle:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to create vehicle' });
        }
    };

    // Update vehicle
    const handleUpdateVehicle = async (e) => {
        e.preventDefault();
        try {
            await vehicleAPI.update(selectedVehicle.id, formData);
            toast.success('Vehicle updated successfully!');
            closeModal();
            fetchVehicles();
        } catch (err) {
            console.error('Error updating vehicle:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to update vehicle' });
        }
    };

    // Delete vehicle
    const handleDeleteVehicle = async (vehicleId, vin) => {
        if (!window.confirm(`Are you sure you want to delete vehicle "${vin}"?`)) {
            return;
        }
        try {
            await vehicleAPI.delete(vehicleId);
            toast.success('Vehicle deleted successfully!');
            fetchVehicles();
            fetchReferenceData();
        } catch (err) {
            console.error('Error deleting vehicle:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to delete vehicle' });
        }
    };

    // Update status
    const handleUpdateStatus = async (vehicleId, newStatus) => {
        try {
            await vehicleAPI.updateStatus(vehicleId, newStatus);
            toast.success('Status updated successfully!');
            fetchVehicles();
            fetchReferenceData();
        } catch (err) {
            console.error('Error updating status:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to update status' });
        }
    };

    // Status badge style
    const getStatusStyle = (statusCode) => {
        const status = statusOptions.find(s => s.status_code === statusCode);
        if (status) {
            return {
                backgroundColor: status.status_bg_color,
                color: status.status_color,
                borderColor: status.status_bg_color
            };
        }
        return { backgroundColor: '#e2e8f0', color: '#475569' }; // Default gray
    };

    // Format currency
    const formatCurrency = (amount) => {
        return `PKR ${Number(amount).toLocaleString()}`;
    };

    return (
        <div className="vehicle-inventory-page">
            {/* Page Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>Vehicle Inventory</h1>
                    <p className="subtitle">Manage vehicle inventory, stock, and allocation</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        type="button"
                        className="btn btn-secondary btn-create"
                        onClick={() => setShowBulkUpload(true)}
                        title="Bulk upload vehicles (CSV / XLSX)"
                    >
                        <ArrowUpTrayIcon style={{ width: 18, height: 18, marginRight: 6 }} />
                        Upload
                    </button>
                    <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
                        <span className="icon">+</span>
                        Add Vehicle
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card stat-total">
                    <div className="stat-icon">🚗</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_vehicles || 0}</span>
                        <span className="stat-label">Total Vehicles</span>
                    </div>
                </div>
                <div className="stat-card stat-yard">
                    <div className="stat-icon">🏢</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.at_yard || 0}</span>
                        <span className="stat-label">At Yard</span>
                    </div>
                </div>
                <div className="stat-card stat-transit">
                    <div className="stat-icon">🚚</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.in_transit || 0}</span>
                        <span className="stat-label">In Transit</span>
                    </div>
                </div>
                <div className="stat-card stat-allocated">
                    <div className="stat-icon">📋</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.allocated || 0}</span>
                        <span className="stat-label">Allocated</span>
                    </div>
                </div>
                <div className="stat-card stat-sold">
                    <div className="stat-icon">💰</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.sold || 0}</span>
                        <span className="stat-label">Sold</span>
                    </div>
                </div>
            </div>

            <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search by VIN, engine number, make..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input"
                    />
                    <span className="search-icon">🔍</span>
                </div>

                <SearchableSelect
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="filter-select"
                >
                    <option value="">All Status</option>
                    {statusOptions.map(status => (
                        <option key={status.id} value={status.status_code}>{status.status_name}</option>
                    ))}
                </SearchableSelect>

                <SearchableSelect
                    value={makeFilter}
                    onChange={(e) => { setMakeFilter(e.target.value); setPage(1); }}
                    className="filter-select"
                >
                    <option value="">All Makes</option>
                    {makes.map(make => (
                        <option key={make.id} value={make.id}>{make.name}</option>
                    ))}
                </SearchableSelect>

                <span className="results-count">{total} vehicles found</span>
            </div>

            {/* Vehicles Table */}
            <div className="table-container">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading vehicles...</p>
                    </div>
                ) : vehicles.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🚗</div>
                        <h3>No Vehicles Found</h3>
                        <p>No vehicles match your search criteria.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>VIN</th>
                                <th>Vehicle</th>
                                <th>Color</th>
                                <th>Year</th>
                                <th>Status</th>
                                <th>Condition</th>
                                <th>Selling Price</th>
                                <th>Warehouse</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vehicles.map(vehicle => (
                                <tr key={vehicle.id}>
                                    <td>
                                        <strong className="vin-code">{vehicle.vin}</strong>
                                    </td>
                                    <td>
                                        <div className="vehicle-info">
                                            <span className="vehicle-name">{vehicle.make_name} {vehicle.model_name}</span>
                                            <span className="vehicle-variant">{vehicle.variant_name}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="color-badge" style={{ backgroundColor: vehicle.color_hex || '#ccc' }}>
                                            {vehicle.color_name}
                                        </span>
                                    </td>
                                    <td>{vehicle.year}</td>
                                    <td>
                                        <span className="badge" style={getStatusStyle(vehicle.status)}>
                                            {statusOptions.find(s => s.status_code === vehicle.status)?.status_name || vehicle.status?.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="condition-type">{vehicle.condition_type}</span>
                                    </td>
                                    <td className="price-cell">{formatCurrency(vehicle.selling_price)}</td>
                                    <td>{vehicle.warehouse_name || '-'}</td>
                                    <td>
                                        <ActionButtons
                                            onEdit={() => openModal('edit', vehicle)}
                                            onDelete={() => handleDeleteVehicle(vehicle.id, vehicle.vin)}
                                            title={vehicle.vin}
                                            showEdit
                                            showDelete={vehicle.status !== 'sold' && vehicle.status !== 'delivered'}
                                        />
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
                    <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{modalMode === 'create' ? 'Add New Vehicle' : 'Edit Vehicle'}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>

                        <form onSubmit={modalMode === 'create' ? handleCreateVehicle : handleUpdateVehicle}>
                            <div className="modal-body">
                                <div className="form-section">
                                    <h3>Vehicle Identification</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>VIN *</label>
                                            <input
                                                type="text"
                                                name="vin"
                                                value={formData.vin}
                                                onChange={handleInputChange}
                                                required
                                                maxLength={17}
                                                placeholder="17-character VIN"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Engine Number *</label>
                                            <input
                                                type="text"
                                                name="engineNumber"
                                                value={formData.engineNumber}
                                                onChange={handleInputChange}
                                                required
                                                placeholder="Engine number"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section">
                                    <h3>Vehicle Details</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Make *</label>
                                            <SearchableSelect
                                                name="makeId"
                                                value={formData.makeId}
                                                onChange={handleInputChange}
                                                required
                                            >
                                                <option value="">Select Make</option>
                                                {makes.map(make => (
                                                    <option key={make.id} value={make.id}>{make.name}</option>
                                                ))}
                                            </SearchableSelect>
                                        </div>
                                        <div className="form-group">
                                            <label>Model *</label>
                                            <SearchableSelect
                                                name="modelId"
                                                value={formData.modelId}
                                                onChange={handleInputChange}
                                                required
                                                disabled={!formData.makeId}
                                            >
                                                <option value="">Select Model</option>
                                                {models.map(model => (
                                                    <option key={model.id} value={model.id}>{model.name}</option>
                                                ))}
                                            </SearchableSelect>
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Variant *</label>
                                            <SearchableSelect
                                                name="variantId"
                                                value={formData.variantId}
                                                onChange={handleInputChange}
                                                required
                                                disabled={!formData.modelId}
                                            >
                                                <option value="">Select Variant</option>
                                                {variants.map(variant => (
                                                    <option key={variant.id} value={variant.id}>{variant.name}</option>
                                                ))}
                                            </SearchableSelect>
                                        </div>
                                        <div className="form-group">
                                            <label>Color *</label>
                                            <SearchableSelect
                                                name="colorId"
                                                value={formData.colorId}
                                                onChange={handleInputChange}
                                                required
                                            >
                                                <option value="">Select Color</option>
                                                {colors.map(color => (
                                                    <option key={color.id} value={color.id}>{color.name}</option>
                                                ))}
                                            </SearchableSelect>
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Year *</label>
                                            <input
                                                type="number"
                                                name="year"
                                                value={formData.year}
                                                onChange={handleInputChange}
                                                required
                                                min={2000}
                                                max={new Date().getFullYear() + 1}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Condition</label>
                                            <SearchableSelect
                                                name="conditionType"
                                                value={formData.conditionType}
                                                onChange={handleInputChange}
                                            >

                                                {conditionOptions.map(condition => (
                                                    <option key={condition.id} value={condition.status_code}>{condition.status_name}</option>
                                                ))}
                                            </SearchableSelect>
                                        </div>
                                        <div className="form-group">
                                            <label>Mileage (km)</label>
                                            <input
                                                type="number"
                                                name="mileage"
                                                value={formData.mileage}
                                                onChange={handleInputChange}
                                                min={0}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section">
                                    <h3>Pricing & Location</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Purchase Price (PKR) *</label>
                                            <input
                                                type="number"
                                                name="purchasePrice"
                                                value={formData.purchasePrice}
                                                onChange={handleInputChange}
                                                required
                                                min={0}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Selling Price (PKR) *</label>
                                            <input
                                                type="number"
                                                name="sellingPrice"
                                                value={formData.sellingPrice}
                                                onChange={handleInputChange}
                                                required
                                                min={0}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Warehouse</label>
                                            <SearchableSelect
                                                name="warehouseId"
                                                value={formData.warehouseId}
                                                onChange={handleInputChange}
                                            >
                                                <option value="">Select Warehouse</option>
                                                {warehouses.map(wh => (
                                                    <option key={wh.id} value={wh.id}>{wh.name} ({wh.code})</option>
                                                ))}
                                            </SearchableSelect>
                                        </div>
                                        <div className="form-group">
                                            <label>Arrival Date</label>
                                            <input
                                                type="date"
                                                name="arrivalDate"
                                                value={formData.arrivalDate}
                                                onChange={handleInputChange}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group full-width">
                                            <label>Notes</label>
                                            <textarea
                                                name="notes"
                                                value={formData.notes}
                                                onChange={handleInputChange}
                                                placeholder="Additional notes..."
                                                rows={3}
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
                                    {modalMode === 'create' ? 'Add Vehicle' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <BulkUploadModal
                isOpen={showBulkUpload}
                onClose={() => setShowBulkUpload(false)}
                title="Bulk upload vehicles"
                description="Import inventory rows with variant_id and color_id from Vehicle Master. Required columns are marked with * in the sample file."
                templateType="vehicles"
                onCompleted={() => {
                    setPage(1);
                    fetchVehicles();
                    fetchReferenceData();
                }}
            />
        </div>
    );
};

export default Vehicles;