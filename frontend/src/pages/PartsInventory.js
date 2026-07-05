/**
 * Vehicle Parts Inventory Page
 * Professional corporate UI for managing vehicle parts with manufacturer/third-party categorization
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-06
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { partsAPI } from '../services/api';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import SearchableSelect from '../components/SearchableSelect';
import '../styles/partsInventory.css';

const PartsInventory = () => {
    const { user: currentUser } = useAuth();

    // State
    const [parts, setParts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorPopup, setErrorPopup] = useState(null);
    const [stats, setStats] = useState({});

    // Tabs
    const [activeTab, setActiveTab] = useState('all');

    // Pagination & filtering
    const [page, setPage] = useState(1);
    const [limit] = useState(15);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';

    const [search, setSearch] = useState(urlSearch);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [stockFilter, setStockFilter] = useState('');

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedPart, setSelectedPart] = useState(null);
    const [showStockModal, setShowStockModal] = useState(false);

    // Reference data
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);

    // Form data
    const [formData, setFormData] = useState({
        partNumber: '',
        name: '',
        categoryId: '',
        description: '',
        brand: '',
        sourceType: 'manufacturer',
        supplierId: '',
        unit: 'piece',
        purchasePrice: '',
        sellingPrice: '',
        currentStock: 0,
        minimumStock: 5,
        maximumStock: 100,
        reorderLevel: 10,
        warehouseId: '',
        binLocation: ''
    });

    // Stock adjustment form
    const [stockForm, setStockForm] = useState({
        adjustmentType: 'increase',
        quantity: '',
        reason: ''
    });

    // Fetch parts
    const fetchParts = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                page,
                limit,
                ...(search && { search }),
                ...(activeTab !== 'all' && { sourceType: activeTab }),
                ...(categoryFilter && { categoryId: categoryFilter }),
                ...(stockFilter && { stockStatus: stockFilter })
            };

            const response = await partsAPI.getAll(params);
            const responseData = response?.data?.data || {};
            setParts(responseData.parts || []);
            setTotalPages(responseData.pagination?.totalPages || 1);
            setTotal(responseData.pagination?.total || 0);
        } catch (err) {
            console.error('Error fetching parts:', err);
            toast.error('Failed to load parts');
            setParts([]);
        } finally {
            setLoading(false);
        }
    }, [page, limit, search, activeTab, categoryFilter, stockFilter]);

    // Fetch reference data
    const fetchReferenceData = useCallback(async () => {
        try {
            const [categoriesRes, suppliersRes, statsRes] = await Promise.all([
                partsAPI.getCategories(),
                partsAPI.getSuppliers(),
                partsAPI.getStats()
            ]);

            setCategories(categoriesRes?.data?.data || []);
            setSuppliers(suppliersRes?.data?.data || []);
            setStats(statsRes?.data?.data || {});
        } catch (err) {
            console.error('Error fetching reference data:', err);
            setCategories([]);
            setSuppliers([]);
        }
    }, []);

    useEffect(() => {
        fetchParts();
        fetchReferenceData();
    }, [fetchParts, fetchReferenceData]);

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
            fetchParts();
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Tab change
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setPage(1);
    };

    // Handle form input change
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handle stock form change
    const handleStockFormChange = (e) => {
        const { name, value } = e.target;
        setStockForm(prev => ({ ...prev, [name]: value }));
    };

    // Open modal
    const openModal = (mode, part = null) => {
        setModalMode(mode);
        setSelectedPart(part);

        if (mode === 'create') {
            setFormData({
                partNumber: '',
                name: '',
                categoryId: '',
                description: '',
                brand: '',
                sourceType: activeTab !== 'all' ? activeTab : 'manufacturer',
                supplierId: '',
                unit: 'piece',
                purchasePrice: '',
                sellingPrice: '',
                currentStock: 0,
                minimumStock: 5,
                maximumStock: 100,
                reorderLevel: 10,
                warehouseId: '',
                binLocation: ''
            });
        } else if (part) {
            setFormData({
                partNumber: part.part_number,
                name: part.name,
                categoryId: part.category_id || '',
                description: part.description || '',
                brand: part.brand || '',
                sourceType: part.source_type,
                supplierId: part.supplier_id || '',
                unit: part.unit,
                purchasePrice: part.purchase_price,
                sellingPrice: part.selling_price,
                currentStock: part.current_stock,
                minimumStock: part.minimum_stock,
                maximumStock: part.maximum_stock,
                reorderLevel: part.reorder_level,
                warehouseId: part.warehouse_id || '',
                binLocation: part.bin_location || ''
            });
        }

        setShowModal(true);
    };

    // Close modal
    const closeModal = () => {
        setShowModal(false);
        setSelectedPart(null);
    };

    // Open stock adjustment modal
    const openStockModal = (part) => {
        setSelectedPart(part);
        setStockForm({
            adjustmentType: 'increase',
            quantity: '',
            reason: ''
        });
        setShowStockModal(true);
    };

    // Close stock modal
    const closeStockModal = () => {
        setShowStockModal(false);
        setSelectedPart(null);
    };

    // Create part
    const handleCreatePart = async (e) => {
        e.preventDefault();
        try {
            await partsAPI.create(formData);
            toast.success('Part created successfully!');
            closeModal();
            fetchParts();
            fetchReferenceData();
        } catch (err) {
            console.error('Error creating part:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to create part' });
        }
    };

    // Update part
    const handleUpdatePart = async (e) => {
        e.preventDefault();
        try {
            await partsAPI.update(selectedPart.id, formData);
            toast.success('Part updated successfully!');
            closeModal();
            fetchParts();
        } catch (err) {
            console.error('Error updating part:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to update part' });
        }
    };

    // Delete part
    const handleDeletePart = async (partId, partNumber) => {
        if (!window.confirm(`Are you sure you want to delete part "${partNumber}"?`)) {
            return;
        }
        try {
            await partsAPI.delete(partId);
            toast.success('Part deleted successfully!');
            fetchParts();
            fetchReferenceData();
        } catch (err) {
            console.error('Error deleting part:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to delete part' });
        }
    };

    // Adjust stock
    const handleAdjustStock = async (e) => {
        e.preventDefault();
        try {
            await partsAPI.adjustStock(selectedPart.id, stockForm);
            toast.success('Stock adjusted successfully!');
            closeStockModal();
            fetchParts();
            fetchReferenceData();
        } catch (err) {
            console.error('Error adjusting stock:', err);
            setErrorPopup(err.response?.data || { message: 'Failed to adjust stock' });
        }
    };

    // Get stock status badge
    const getStockStatusBadge = (stockStatus) => {
        const badges = {
            'out_of_stock': { class: 'badge-danger', text: 'Out of Stock' },
            'low_stock': { class: 'badge-warning', text: 'Low Stock' },
            'normal': { class: 'badge-success', text: 'Normal' },
            'overstocked': { class: 'badge-info', text: 'Overstocked' }
        };
        return badges[stockStatus] || { class: 'badge-secondary', text: stockStatus };
    };

    // Get source type badge
    const getSourceTypeBadge = (sourceType) => {
        return sourceType === 'manufacturer'
            ? { class: 'badge-primary', text: 'Manufacturer' }
            : { class: 'badge-purple', text: '3rd Party' };
    };

    // Format currency
    const formatCurrency = (amount) => {
        return `PKR ${Number(amount).toLocaleString()}`;
    };

    const showHelp = (message) => {
        toast(message, { duration: 3000 });
    };

    const InfoLabel = ({ label, help }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span>{label}</span>
            {help ? (
                <button
                    type="button"
                    onClick={() => showHelp(help)}
                    aria-label={`Help: ${label}`}
                    title="Help"
                    style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#475569',
                        fontSize: 12,
                        lineHeight: '16px',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    i
                </button>
            ) : null}
        </span>
    );

    const toNumber = (v, fallback = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    };

    return (
        <div className="parts-inventory-page">
            {/* Page Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>Parts Inventory</h1>
                    <p className="subtitle">Manage vehicle parts from manufacturers and third-party suppliers</p>
                </div>
                <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
                    <span className="icon">+</span>
                    Add Part
                </button>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card stat-total">
                    <div className="stat-icon">🔧</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.total_parts || 0}</span>
                        <span className="stat-label">Total Parts</span>
                    </div>
                </div>
                <div className="stat-card stat-manufacturer">
                    <div className="stat-icon">🏭</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.manufacturer_parts || 0}</span>
                        <span className="stat-label">Manufacturer</span>
                    </div>
                </div>
                <div className="stat-card stat-third-party">
                    <div className="stat-icon">🏪</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.third_party_parts || 0}</span>
                        <span className="stat-label">3rd Party</span>
                    </div>
                </div>
                <div className="stat-card stat-low-stock">
                    <div className="stat-icon">⚠️</div>
                    <div className="stat-content">
                        <span className="stat-value">{stats.low_stock_count || 0}</span>
                        <span className="stat-label">Low Stock</span>
                    </div>
                </div>
                <div className="stat-card stat-value">
                    <div className="stat-icon">💵</div>
                    <div className="stat-content">
                        <span className="stat-value">{formatCurrency(stats.total_inventory_value || 0)}</span>
                        <span className="stat-label">Inventory Value</span>
                    </div>
                </div>
            </div>

            <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

            {/* Tabs */}
            <div className="tabs-container">
                <button
                    className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                    onClick={() => handleTabChange('all')}
                >
                    All Parts
                </button>
                <button
                    className={`tab-btn ${activeTab === 'manufacturer' ? 'active' : ''}`}
                    onClick={() => handleTabChange('manufacturer')}
                >
                    🏭 Manufacturer Parts
                </button>
                <button
                    className={`tab-btn ${activeTab === 'third_party' ? 'active' : ''}`}
                    onClick={() => handleTabChange('third_party')}
                >
                    🏪 3rd Party Parts
                </button>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search by part number, name, brand..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input"
                    />
                    <span className="search-icon">🔍</span>
                </div>

                <SearchableSelect
                    value={categoryFilter}
                    onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                    className="filter-select"
                >
                    <option value="">All Categories</option>
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                </SearchableSelect>

                <SearchableSelect
                    value={stockFilter}
                    onChange={(e) => { setStockFilter(e.target.value); setPage(1); }}
                    className="filter-select"
                >
                    <option value="">All Stock</option>
                    <option value="low">Low Stock</option>
                    <option value="out">Out of Stock</option>
                    <option value="normal">Normal</option>
                </SearchableSelect>

                <span className="results-count">{total} parts found</span>
            </div>

            {/* Parts Table */}
            <div className="table-container">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading parts...</p>
                    </div>
                ) : parts.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🔧</div>
                        <h3>No Parts Found</h3>
                        <p>No parts match your search criteria.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Part #</th>
                                <th>Name</th>
                                <th>Source</th>
                                <th>Category</th>
                                <th>Stock</th>
                                <th>Status</th>
                                <th>Purchase Price</th>
                                <th>Selling Price</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parts.map(part => (
                                <tr key={part.id} className={part.stock_status === 'out_of_stock' ? 'row-warning' : ''}>
                                    <td>
                                        <strong className="part-number">{part.part_number}</strong>
                                    </td>
                                    <td>
                                        <div className="part-info">
                                            <span className="part-name">{part.name}</span>
                                            {part.brand && <span className="part-brand">{part.brand}</span>}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge ${getSourceTypeBadge(part.source_type).class}`}>
                                            {getSourceTypeBadge(part.source_type).text}
                                        </span>
                                    </td>
                                    <td>{part.category_name || '-'}</td>
                                    <td>
                                        <span className="stock-qty">{part.current_stock}</span>
                                        <span className="stock-unit"> {part.unit}</span>
                                    </td>
                                    <td>
                                        <span className={`badge ${getStockStatusBadge(part.stock_status).class}`}>
                                            {getStockStatusBadge(part.stock_status).text}
                                        </span>
                                    </td>
                                    <td className="price-cell">{formatCurrency(part.purchase_price)}</td>
                                    <td className="price-cell">{formatCurrency(part.selling_price)}</td>
                                    <td>
                                        <div className="action-group">
                                            <button
                                                className="btn-icon btn-adjust"
                                                onClick={() => openStockModal(part)}
                                                title="Adjust Stock"
                                            >
                                                📦
                                            </button>
                                            <ActionButtons
                                                onEdit={() => openModal('edit', part)}
                                                onDelete={() => handleDeletePart(part.id, part.part_number)}
                                                title={part.part_number}
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
                    <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{modalMode === 'create' ? 'Add New Part' : 'Edit Part'}</h2>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>

                        <form onSubmit={modalMode === 'create' ? handleCreatePart : handleUpdatePart}>
                            <div className="modal-body">
                                <div className="form-section">
                                    <h3>Part Information</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Part Number *"
                                                    help="Unique identifier for this part (e.g., OEM-TOY-001)."
                                                />
                                            </label>
                                            <input
                                                type="text"
                                                name="partNumber"
                                                value={formData.partNumber}
                                                onChange={handleInputChange}
                                                required
                                                placeholder="e.g., OEM-TOY-001"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Name *"
                                                    help="Human-friendly name of the part (e.g., Oil Filter)."
                                                />
                                            </label>
                                            <input
                                                type="text"
                                                name="name"
                                                value={formData.name}
                                                onChange={handleInputChange}
                                                required
                                                placeholder="Part name"
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Source Type *"
                                                    help="Manufacturer = OEM. 3rd Party = aftermarket supplier."
                                                />
                                            </label>
                                            <SearchableSelect
                                                name="sourceType"
                                                value={formData.sourceType}
                                                onChange={handleInputChange}
                                                required
                                            >
                                                <option value="manufacturer">Manufacturer (OEM)</option>
                                                <option value="third_party">3rd Party</option>
                                            </SearchableSelect>
                                        </div>
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Category"
                                                    help="Optional grouping for reporting and filtering (e.g., Engine, Electrical)."
                                                />
                                            </label>
                                            <SearchableSelect
                                                name="categoryId"
                                                value={formData.categoryId}
                                                onChange={handleInputChange}
                                                options={categories}
                                                placeholder="Select Category"
                                                labelField="name"
                                                valueField="id"
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Brand"
                                                    help="Brand/manufacturer name printed on the part (optional)."
                                                />
                                            </label>
                                            <input
                                                type="text"
                                                name="brand"
                                                value={formData.brand}
                                                onChange={handleInputChange}
                                                placeholder="Brand name"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Supplier"
                                                    help="Supplier you purchase this part from (optional)."
                                                />
                                            </label>
                                            <SearchableSelect
                                                name="supplierId"
                                                value={formData.supplierId}
                                                onChange={handleInputChange}
                                            >
                                                <option value="">Select Supplier</option>
                                                {suppliers.map(sup => (
                                                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                                                ))}
                                            </SearchableSelect>
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group full-width">
                                            <label>
                                                <InfoLabel
                                                    label="Description"
                                                    help="Optional notes/specs to help staff identify the exact part."
                                                />
                                            </label>
                                            <textarea
                                                name="description"
                                                value={formData.description}
                                                onChange={handleInputChange}
                                                placeholder="Part description..."
                                                rows={2}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section">
                                    <h3>Pricing</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Purchase Price (PKR) *"
                                                    help="Your cost price (used for inventory valuation and profit calculation)."
                                                />
                                            </label>
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
                                            <label>
                                                <InfoLabel
                                                    label="Selling Price (PKR) *"
                                                    help="Default selling price for invoices/job cards."
                                                />
                                            </label>
                                            <input
                                                type="number"
                                                name="sellingPrice"
                                                value={formData.sellingPrice}
                                                onChange={handleInputChange}
                                                required
                                                min={0}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Unit"
                                                    help="How this part is counted (piece/set/pair/liter/kg)."
                                                />
                                            </label>
                                            <SearchableSelect
                                                name="unit"
                                                value={formData.unit}
                                                onChange={handleInputChange}
                                            >
                                                <option value="piece">Piece</option>
                                                <option value="set">Set</option>
                                                <option value="pair">Pair</option>
                                                <option value="liter">Liter</option>
                                                <option value="kg">Kilogram</option>
                                            </SearchableSelect>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-section">
                                    <h3>Stock Levels</h3>
                                    <div className="form-row">
                                        {modalMode === 'create' && (
                                            <div className="form-group">
                                                <label>
                                                    <InfoLabel
                                                        label="Initial Stock"
                                                        help="Starting quantity when you add this part."
                                                    />
                                                </label>
                                                <input
                                                    type="number"
                                                    name="currentStock"
                                                    value={formData.currentStock}
                                                    onChange={handleInputChange}
                                                    min={0}
                                                />
                                            </div>
                                        )}
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Total Inventory"
                                                    help="Read-only preview of current total stock. Updates in real time as you change stock quantity."
                                                />
                                            </label>
                                            <input
                                                type="number"
                                                value={toNumber(formData.currentStock, 0)}
                                                disabled
                                                style={{ background: '#f8fafc' }}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Minimum Stock"
                                                    help="When stock goes below this, it will show as Low Stock."
                                                />
                                            </label>
                                            <input
                                                type="number"
                                                name="minimumStock"
                                                value={formData.minimumStock}
                                                onChange={handleInputChange}
                                                min={0}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Maximum Stock"
                                                    help="Target maximum quantity (helps prevent overstocking)."
                                                />
                                            </label>
                                            <input
                                                type="number"
                                                name="maximumStock"
                                                value={formData.maximumStock}
                                                onChange={handleInputChange}
                                                min={0}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Reorder Level"
                                                    help="When stock reaches this level, consider reordering."
                                                />
                                            </label>
                                            <input
                                                type="number"
                                                name="reorderLevel"
                                                value={formData.reorderLevel}
                                                onChange={handleInputChange}
                                                min={0}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>
                                                <InfoLabel
                                                    label="Bin Location"
                                                    help="Optional warehouse shelf/bin location (e.g., A1-S2-R3)."
                                                />
                                            </label>
                                            <input
                                                type="text"
                                                name="binLocation"
                                                value={formData.binLocation}
                                                onChange={handleInputChange}
                                                placeholder="e.g., A1-S2-R3"
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
                                    {modalMode === 'create' ? 'Add Part' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Stock Adjustment Modal */}
            {showStockModal && selectedPart && (
                <div className="modal-overlay">
                    <div className="modal-content modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Adjust Stock</h2>
                            <button className="modal-close" onClick={closeStockModal}>×</button>
                        </div>

                        <form onSubmit={handleAdjustStock}>
                            <div className="modal-body">
                                <div className="stock-info">
                                    <p><strong>{selectedPart.name}</strong></p>
                                    <p>Current Stock: <span className="stock-value">{selectedPart.current_stock} {selectedPart.unit}</span></p>
                                </div>

                                <div className="form-group">
                                    <label>
                                        <InfoLabel
                                            label="Adjustment Type *"
                                            help="Increase adds stock, Decrease subtracts stock, Set overwrites stock to an exact value."
                                        />
                                    </label>
                                    <SearchableSelect
                                        name="adjustmentType"
                                        value={stockForm.adjustmentType}
                                        onChange={handleStockFormChange}
                                        required
                                    >
                                        <option value="increase">Increase (+)</option>
                                        <option value="decrease">Decrease (-)</option>
                                        <option value="set">Set to Exact Value</option>
                                    </SearchableSelect>
                                </div>

                                <div className="form-group">
                                    <label>
                                        <InfoLabel
                                            label="Quantity *"
                                            help="Enter quantity to increase/decrease, or the exact quantity when using Set."
                                        />
                                    </label>
                                    <input
                                        type="number"
                                        name="quantity"
                                        value={stockForm.quantity}
                                        onChange={handleStockFormChange}
                                        required
                                        min={1}
                                        placeholder="Enter quantity"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>
                                        <InfoLabel
                                            label="New Total Inventory"
                                            help="Live preview of the resulting stock after this adjustment."
                                        />
                                    </label>
                                    <input
                                        type="number"
                                        disabled
                                        style={{ background: '#f8fafc' }}
                                        value={(() => {
                                            const current = toNumber(selectedPart.current_stock, 0);
                                            const qty = toNumber(stockForm.quantity, 0);
                                            if (stockForm.adjustmentType === 'increase') return current + qty;
                                            if (stockForm.adjustmentType === 'decrease') return Math.max(0, current - qty);
                                            if (stockForm.adjustmentType === 'set') return Math.max(0, qty);
                                            return current;
                                        })()}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>
                                        <InfoLabel
                                            label="Reason"
                                            help="Optional note for auditing (e.g., Purchase received, Damaged, Stock count)."
                                        />
                                    </label>
                                    <textarea
                                        name="reason"
                                        value={stockForm.reason}
                                        onChange={handleStockFormChange}
                                        placeholder="Reason for adjustment..."
                                        rows={2}
                                    />
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeStockModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Update Stock
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PartsInventory;
