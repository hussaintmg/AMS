/**
 * Vehicle Branding Table Component
 * Professional CRUD UI for vehicle brands management
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 * Date: 2026-05-08
 */

import React, { useState } from 'react';
import { SquarePen, Trash2 } from 'lucide-react';
import './VehicleBrandingTable.css';

const VehicleBrandingTable = ({
    brands = [],
    onEdit,
    onDelete,
    onStatusChange,
    onBulkDelete,
    selectedBrandIds: externalSelected,
    onSelectedBrandIdsChange,
    loading = false,
    error = null,
    pagination = {}
    ,
    // optional filter props (controlled by parent)
    searchTerm = '',
    onSearchTermChange = null,
    filterActive = null,
    onFilterActiveChange = null,
}) => {
    const [internalSelected, setInternalSelected] = useState(new Set());
    const selectedBrands = externalSelected ?? internalSelected;
    const setSelectedBrands = onSelectedBrandIdsChange ?? setInternalSelected;

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedBrands(new Set(brands.map(b => b.id)));
        } else {
            setSelectedBrands(new Set());
        }
    };

    const handleSelectBrand = (id) => {
        const newSelected = new Set(selectedBrands);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedBrands(newSelected);
    };

    const handleBulkStatusChange = async (status) => {
        if (selectedBrands.size === 0) {
            alert('Please select at least one brand');
            return;
        }
        
        if (window.confirm(`Are you sure you want to ${status ? 'activate' : 'deactivate'} ${selectedBrands.size} brand(s)?`)) {
            await onStatusChange(Array.from(selectedBrands), status);
            setSelectedBrands(new Set());
        }
    };

    if (error) {
        return (
            <div className="table-error-container">
                <div className="error-icon">⚠️</div>
                <p className="error-message">{error}</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="table-loading-container">
                <div className="loading-spinner"></div>
                <p>Loading brands...</p>
            </div>
        );
    }

    return (
        <div className="vehicle-branding-table-wrapper">
            {selectedBrands.size > 0 && (
                <div className="bulk-actions">
                    <span>{selectedBrands.size} selected</span>
                    <button
                        className="btn btn-primary"
                        onClick={() => handleBulkStatusChange(true)}
                    >
                        ✓ Activate
                    </button>
                    <button
                        className="btn btn-danger"
                        onClick={() => handleBulkStatusChange(false)}
                    >
                        ✕ Deactivate
                    </button>
                    {onBulkDelete && (
                        <button
                            className="btn btn-danger"
                            style={{ background: '#dc2626' }}
                            onClick={() => onBulkDelete(Array.from(selectedBrands))}
                        >
                            🗑 Delete
                        </button>
                    )}
                </div>
            )}

            <div className="table-responsive">
                <div className="desktop-only">
                <table className="vehicle-branding-table">
                    <thead>
                        <tr>
                            <th className="checkbox-col">
                                <input
                                    type="checkbox"
                                    checked={selectedBrands.size === brands.length && brands.length > 0}
                                    onChange={handleSelectAll}
                                    aria-label="Select all brands"
                                />
                            </th>
                            <th>Logo</th>
                            <th>Brand Name</th>
                            <th>Country</th>
                            <th>Makes</th>
                            <th>Vehicles</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                        {/* Filter row - mirrors other table UIs (desktop only) */}
                        <tr className="filter-row desktop-only">
                            <th></th>
                            <th></th>
                            <th>
                                <input
                                    type="text"
                                    className="form-input filter-input"
                                    placeholder="Filter brand..."
                                    value={searchTerm}
                                    onChange={(e) => onSearchTermChange?.(e.target.value)}
                                />
                            </th>
                            <th>
                                <input
                                    type="text"
                                    className="form-input filter-input"
                                    placeholder="Filter country..."
                                    value={''}
                                    onChange={() => {}}
                                />
                            </th>
                            <th></th>
                            <th></th>
                            <th>
                                <select className="form-input filter-input" value={filterActive === null ? '' : filterActive} onChange={(e) => onFilterActiveChange?.(e.target.value === '' ? null : (e.target.value === 'true'))}>
                                    <option value="">All</option>
                                    <option value="true">Active</option>
                                    <option value="false">Inactive</option>
                                </select>
                            </th>
                            <th></th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {brands.length === 0 ? (
                            <tr className="empty-row">
                                <td colSpan="9" className="empty-message">
                                    No vehicle brands found. Click "Add Brand" to create one.
                                </td>
                            </tr>
                        ) : (
                            brands.map((brand) => (
                                <tr key={brand.id} className={`brand-row ${brand.is_active ? 'active' : 'inactive'}`}>
                                    <td className="checkbox-col">
                                        <input
                                            type="checkbox"
                                            checked={selectedBrands.has(brand.id)}
                                            onChange={() => handleSelectBrand(brand.id)}
                                            aria-label={`Select ${brand.name}`}
                                        />
                                    </td>
                                    <td className="logo-col">
                                        {brand.logo_url ? (
                                            <>
                                                <img
                                                    src={brand.logo_url}
                                                    alt={brand.name}
                                                    className="brand-logo"
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                        const placeholder = e.currentTarget.nextElementSibling;
                                                        if (placeholder) placeholder.style.display = 'flex';
                                                    }}
                                                />
                                                <div className="logo-placeholder" style={{ display: 'none' }}>
                                                    {brand.name?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="logo-placeholder">
                                                {brand.name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div className="brand-info">
                                            <strong>{brand.name}</strong>
                                            {brand.description && (
                                                <small className="description">{brand.description.substring(0, 50)}...</small>
                                            )}
                                        </div>
                                    </td>
                                    <td className="country-col">
                                        {brand.country_of_origin || 'N/A'}
                                    </td>
                                    <td className="center-col">
                                        <span className="badge badge-makes">{brand.total_makes || 0}</span>
                                    </td>
                                    <td className="center-col">
                                        <span className="badge badge-vehicles">{brand.total_vehicles || 0}</span>
                                    </td>
                                    <td className="status-col">
                                        <span className={`status-badge ${brand.is_active ? 'status-active' : 'status-inactive'}`}>
                                            {brand.is_active ? '● Active' : '● Inactive'}
                                        </span>
                                    </td>
                                    <td className="date-col">
                                        {brand.created_at ? new Date(brand.created_at).toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td className="actions-col">
                                        <div className="action-buttons">
                                            <button
                                                className="btn-action btn-edit"
                                                onClick={() => onEdit(brand)}
                                                title="Edit brand"
                                                aria-label={`Edit ${brand.name}`}
                                            >
                                                <SquarePen size={17} className="action-icon" />
                                            </button>
                                            <button
                                                className="btn-action btn-delete"
                                                onClick={() => {
                                                    if (window.confirm(`Are you sure you want to delete ${brand.name}?`)) {
                                                        onDelete(brand.id);
                                                    }
                                                }}
                                                title="Delete brand"
                                                aria-label={`Delete ${brand.name}`}
                                            >
                                                <Trash2 size={17} className="action-icon" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                </div>
            </div>

            {/* Mobile card view */}
            <div className="mobile-cards-container mobile-only">
                {brands.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">🏷️</div>
                        <h3>No Brands Found</h3>
                        <p>No brands match your search criteria.</p>
                    </div>
                ) : (
                    <div className="brands-cards-grid">
                        {brands.map(brand => (
                            <div key={brand.id} className={`brand-card ${brand.is_active ? '' : 'card-inactive'}`}>
                                <div className="brand-card-header">
                                    <div className="brand-card-logo">
                                        {brand.logo_url ? (
                                            <img src={brand.logo_url} alt={brand.name} />
                                        ) : (
                                            <div className="logo-placeholder-small">{brand.name?.charAt(0)?.toUpperCase() || '?'}</div>
                                        )}
                                    </div>
                                    <div className="brand-card-title">
                                        <strong>{brand.name}</strong>
                                        <div className="brand-card-sub">{brand.country_of_origin || 'N/A'}</div>
                                    </div>
                                    <div className={`status-badge ${brand.is_active ? 'status-active' : 'status-inactive'}`}>
                                        {brand.is_active ? 'Active' : 'Inactive'}
                                    </div>
                                </div>
                                <div className="brand-card-body">
                                    <div className="brand-stat"><span className="stat-label">Makes</span><span className="stat-value">{brand.total_makes || 0}</span></div>
                                    <div className="brand-stat"><span className="stat-label">Vehicles</span><span className="stat-value">{brand.total_vehicles || 0}</span></div>
                                </div>
                                <div className="brand-card-actions">
                                    <button className="btn btn-sm" onClick={() => onEdit(brand)}>Edit</button>
                                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(brand.id)}>Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {pagination && pagination.totalPages > 1 && (
                <div className="pagination-info">
                    Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total brands)
                </div>
            )}
        </div>
    );
};

export default VehicleBrandingTable;
