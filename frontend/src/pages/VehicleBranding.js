/**
 * Vehicle Branding Management Page
 * Main page component with CRUD operations, search, filtering, and pagination
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 * Date: 2026-05-08
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import VehicleBrandingTable from '../components/VehicleBrandingTable';
import VehicleBrandingForm from '../components/VehicleBrandingForm';
import ErrorPopup from '../components/ErrorPopup';
import BulkUploadModal from '../components/BulkUploadModal';
import { useAuth } from '../context/AuthContext';
import vehicleBrandingService from '../services/vehicleBrandingService';
import './VehicleBranding.css';

const VehicleBranding = () => {
    const { user } = useAuth();
    const canBulkUpload = ['super_admin', 'admin', 'inventory_manager'].includes(user?.role);

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    const [brands, setBrands] = useState([]);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');

    // Search and filtering
    const [searchTerm, setSearchTerm] = useState('');
    const [filterActive, setFilterActive] = useState(null);

    // Form management
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [isFormLoading, setIsFormLoading] = useState(false);

    // Error popup
    const [errorPopup, setErrorPopup] = useState({
        isOpen: false,
        title: '',
        message: '',
        steps: []
    });
    const [showBulkUpload, setShowBulkUpload] = useState(false);

    // ═══════════════════════════════════════════════════════════════════════════
    // FETCH BRANDS
    // ═══════════════════════════════════════════════════════════════════════════

    const fetchBrands = useCallback(async (page = 1, search = '', isActive = null) => {
        try {
            setLoading(true);
            setError(null);

            const response = await vehicleBrandingService.getAllBrands({
                page,
                limit: pagination.limit,
                search,
                is_active: isActive
            });

            if (response.success) {
                setBrands(response.data.brands);
                setPagination(response.data.pagination);
            } else {
                throw new Error(response.message || 'Failed to fetch brands');
            }
        } catch (err) {
            const errorMessage = err.message || 'Failed to fetch vehicle brands';
            setError(errorMessage);
            showErrorPopup(
                'Error Loading Brands',
                errorMessage,
                [
                    'Check your internet connection',
                    'Ensure the server is running',
                    'Try refreshing the page'
                ]
            );
        } finally {
            setLoading(false);
        }
    }, [pagination.limit]);

    // Initial load
    useEffect(() => {
        fetchBrands(1, '', filterActive);
    }, []);

    // ═══════════════════════════════════════════════════════════════════════════
    // SEARCH AND FILTER
    // ═══════════════════════════════════════════════════════════════════════════

    const handleSearch = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        fetchBrands(1, value, filterActive);
    };

    const handleFilterChange = (e) => {
        const value = e.target.value === '' ? null : e.target.value === 'true';
        setFilterActive(value);
        fetchBrands(1, searchTerm, value);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGINATION
    // ═══════════════════════════════════════════════════════════════════════════

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            fetchBrands(newPage, searchTerm, filterActive);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FORM OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    const handleOpenForm = () => {
        setSelectedBrand(null);
        setIsEditMode(false);
        setIsFormOpen(true);
    };

    const handleEditBrand = (brand) => {
        setSelectedBrand(brand);
        setIsEditMode(true);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setSelectedBrand(null);
        setIsEditMode(false);
    };

    const handleFormSubmit = async (formData) => {
        try {
            setIsFormLoading(true);

            if (isEditMode && selectedBrand) {
                // Update brand
                const response = await vehicleBrandingService.updateBrand(selectedBrand.id, formData);
                if (response.success) {
                    setSuccessMessage(`${formData.name} updated successfully!`);
                    fetchBrands(pagination.page, searchTerm, filterActive);
                    handleCloseForm();
                    setTimeout(() => setSuccessMessage(''), 3000);
                }
            } else {
                // Create brand
                const response = await vehicleBrandingService.createBrand(formData);
                if (response.success) {
                    setSuccessMessage(`${formData.name} created successfully!`);
                    fetchBrands(1, '', filterActive);
                    handleCloseForm();
                    setTimeout(() => setSuccessMessage(''), 3000);
                }
            }
        } catch (err) {
            const errorMessage = err.message || 'Failed to save brand';
            showErrorPopup(
                isEditMode ? 'Update Error' : 'Create Error',
                errorMessage,
                [
                    'Check if the brand name is unique',
                    'Ensure all required fields are filled',
                    'Try again or contact support'
                ]
            );
        } finally {
            setIsFormLoading(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // DELETE OPERATION
    // ═══════════════════════════════════════════════════════════════════════════

    const handleDeleteBrand = async (brandId) => {
        try {
            setLoading(true);

            const response = await vehicleBrandingService.deleteBrand(brandId);
            if (response.success) {
                const deletedBrand = brands.find(b => b.id === brandId);
                setSuccessMessage(`${deletedBrand?.name || 'Brand'} deleted successfully!`);
                fetchBrands(pagination.page, searchTerm, filterActive);
                setTimeout(() => setSuccessMessage(''), 3000);
            }
        } catch (err) {
            const errorMessage = err.message || 'Failed to delete brand';
            showErrorPopup(
                'Delete Error',
                errorMessage,
                [
                    'The brand might be linked to vehicles',
                    'Check if the brand is in use',
                    'Try again or contact support'
                ]
            );
        } finally {
            setLoading(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // BULK STATUS UPDATE
    // ═══════════════════════════════════════════════════════════════════════════

    const handleBulkStatusChange = async (brandIds, isActive) => {
        try {
            setLoading(true);

            const response = await vehicleBrandingService.bulkUpdateStatus(brandIds, isActive);
            if (response.success) {
                setSuccessMessage(`${brandIds.length} brand(s) ${isActive ? 'activated' : 'deactivated'} successfully!`);
                fetchBrands(pagination.page, searchTerm, filterActive);
                setTimeout(() => setSuccessMessage(''), 3000);
            }
        } catch (err) {
            const errorMessage = err.message || 'Failed to update brands';
            showErrorPopup(
                'Bulk Update Error',
                errorMessage,
                [
                    'Some brands might be in use',
                    'Check the selected brands',
                    'Try again or contact support'
                ]
            );
        } finally {
            setLoading(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // ERROR POPUP
    // ═══════════════════════════════════════════════════════════════════════════

    const showErrorPopup = (title, message, steps) => {
        setErrorPopup({
            isOpen: true,
            title,
            message,
            steps
        });
    };

    const closeErrorPopup = () => {
        setErrorPopup({
            isOpen: false,
            title: '',
            message: '',
            steps: []
        });
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    return (
        <div className="vehicle-branding-page">
            {/* Page Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>🏢 Vehicle Branding Management</h1>
                    <p className="header-subtitle">Manage all vehicle brands, makes, and models</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {canBulkUpload && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setShowBulkUpload(true)}
                            disabled={loading}
                            title="Bulk upload brands (CSV / XLSX)"
                        >
                            <ArrowUpTrayIcon style={{ width: 18, height: 18, marginRight: 6 }} />
                            Upload
                        </button>
                    )}
                    <button
                        className="btn btn-add btn-primary"
                        onClick={handleOpenForm}
                        disabled={loading}
                    >
                        + Add New Brand
                    </button>
                </div>
            </div>

            {/* Success Message */}
            {successMessage && (
                <div className="success-banner" role="alert">
                    <span className="success-icon">✓</span>
                    <span>{successMessage}</span>
                </div>
            )}

            {/* Filters and Search */}
            <div className="filters-section">
                <div className="search-group">
                    <input
                        type="text"
                        placeholder="🔍 Search brands by name or description..."
                        value={searchTerm}
                        onChange={handleSearch}
                        className="search-input"
                        disabled={loading}
                    />
                </div>

                <div className="filters-group">
                    <select
                        value={filterActive === null ? '' : filterActive}
                        onChange={handleFilterChange}
                        className="filter-select"
                        disabled={loading}
                    >
                        <option value="">All Status</option>
                        <option value="true">Active Only</option>
                        <option value="false">Inactive Only</option>
                    </select>
                </div>
            </div>

            {/* Brands Table */}
            <VehicleBrandingTable
                brands={brands}
                onEdit={handleEditBrand}
                onDelete={handleDeleteBrand}
                onStatusChange={handleBulkStatusChange}
                loading={loading}
                error={error}
                pagination={pagination}
            />

            {/* Pagination Controls */}
            {!loading && pagination.totalPages > 1 && (
                <div className="pagination-controls">
                    <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                        className="btn btn-secondary"
                    >
                        ← Previous
                    </button>

                    <div className="page-numbers">
                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                onClick={() => handlePageChange(page)}
                                className={`page-number ${page === pagination.page ? 'active' : ''}`}
                            >
                                {page}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page === pagination.totalPages}
                        className="btn btn-secondary"
                    >
                        Next →
                    </button>
                </div>
            )}

            {/* Form Modal */}
            <VehicleBrandingForm
                isOpen={isFormOpen}
                isLoading={isFormLoading}
                isEditMode={isEditMode}
                brandData={selectedBrand}
                onSubmit={handleFormSubmit}
                onCancel={handleCloseForm}
            />

            {/* Error Popup */}
            <ErrorPopup
                isOpen={errorPopup.isOpen}
                title={errorPopup.title}
                message={errorPopup.message}
                steps={errorPopup.steps}
                onClose={closeErrorPopup}
            />

            <BulkUploadModal
                isOpen={showBulkUpload}
                onClose={() => setShowBulkUpload(false)}
                title="Bulk upload vehicle brands"
                description="Import brands from CSV or XLSX. Only name is required; optional columns are listed in the sample file."
                templateType="vehicle-brands"
                onCompleted={() => fetchBrands(1, searchTerm, filterActive)}
            />
        </div>
    );
};

export default VehicleBranding;
