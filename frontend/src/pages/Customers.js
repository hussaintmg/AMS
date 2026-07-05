/**
 * Customers Page - Professional CRUD with Animated Modal
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { useSearchParams } from 'react-router-dom';
import { customerAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
    PencilSquareIcon,
    TrashIcon,
    EyeIcon,
    MagnifyingGlassIcon,
    UserPlusIcon,
    UsersIcon,
    BuildingOfficeIcon,
    UserIcon,
    XMarkIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Customers() {
    // State Management
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({});
    const [showModal, setShowModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerToDelete, setCustomerToDelete] = useState(null);
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';

    const [searchTerm, setSearchTerm] = useState(urlSearch);
    const [filterType, setFilterType] = useState('all');
    const [submitting, setSubmitting] = useState(false);

    // Initial form data
    const initialFormData = {
        firstName: '', lastName: '', email: '', phone: '', alternatePhone: '',
        dateOfBirth: '', gender: '', cnicNumber: '', address: '', city: '',
        state: '', postalCode: '', country: 'Pakistan', customerType: 'individual',
        companyName: '', companyNtn: '', creditLimit: ''
    };
    const [formData, setFormData] = useState(initialFormData);

    // ═══════════════════════════════════════════════════════════════════════
    // DATA FETCHING
    // ═══════════════════════════════════════════════════════════════════════

    const loadCustomers = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (searchTerm) params.search = searchTerm;
            if (filterType && filterType !== 'all') params.type = filterType;

            const res = await customerAPI.getAll(params);
            setCustomers(res.data.data || []);
        } catch (error) {
            console.error('Failed to load customers:', error);
            toast.error('Failed to load customers');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, filterType]);

    const loadStats = async () => {
        try {
            const res = await customerAPI.getStats();
            setStats(res.data.data || {});
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    };

    useEffect(() => {
        loadCustomers();
        loadStats();
    }, [loadCustomers]);

    // Update search term if URL search param changes
    useEffect(() => {
        if (urlSearch) {
            setSearchTerm(urlSearch);
        }
    }, [urlSearch]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            loadCustomers();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, filterType, loadCustomers]);

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD HANDLERS
    // ═══════════════════════════════════════════════════════════════════════

    const handleAdd = () => {
        setSelectedCustomer(null);
        setFormData(initialFormData);
        setShowModal(true);
    };

    const handleEdit = (customer) => {
        setSelectedCustomer(customer);
        setFormData({
            firstName: customer.first_name || '',
            lastName: customer.last_name || '',
            email: customer.email || '',
            phone: customer.phone || '',
            alternatePhone: customer.alternate_phone || '',
            dateOfBirth: customer.date_of_birth ? customer.date_of_birth.split('T')[0] : '',
            gender: customer.gender || '',
            cnicNumber: customer.cnic_number || '',
            address: customer.address || '',
            city: customer.city || '',
            state: customer.state || '',
            postalCode: customer.postal_code || '',
            country: customer.country || 'Pakistan',
            customerType: customer.customer_type || 'individual',
            companyName: customer.company_name || '',
            companyNtn: customer.company_ntn || '',
            creditLimit: customer.credit_limit || ''
        });
        setShowModal(true);
    };

    const handleView = async (customer) => {
        try {
            const res = await customerAPI.getById(customer.id);
            setSelectedCustomer(res.data.data);
            setShowViewModal(true);
        } catch (error) {
            toast.error('Failed to load customer details');
        }
    };

    const handleDeleteClick = (customer) => {
        setCustomerToDelete(customer);
        setShowDeleteConfirm(true);
    };

    const handleDelete = async () => {
        if (!customerToDelete) return;
        try {
            await customerAPI.delete(customerToDelete.id);
            toast.success('Customer deleted successfully');
            setShowDeleteConfirm(false);
            setCustomerToDelete(null);
            loadCustomers();
            loadStats();
        } catch (error) {
            toast.error('Failed to delete customer');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            if (selectedCustomer) {
                await customerAPI.update(selectedCustomer.id, formData);
                toast.success('Customer updated successfully!');
            } else {
                await customerAPI.create(formData);
                toast.success('Customer created successfully!');
            }
            setShowModal(false);
            setFormData(initialFormData);
            setSelectedCustomer(null);
            loadCustomers();
            loadStats();
        } catch (error) {
            console.error('Submit error:', error);
            toast.error(error.response?.data?.message || 'Operation failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setSelectedCustomer(null);
        setFormData(initialFormData);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    const getTypeBadge = (type) => {
        if (type === 'corporate') {
            return <span className="badge badge-info">Corporate</span>;
        }
        return <span className="badge badge-gray">Individual</span>;
    };

    if (loading && customers.length === 0) {
        return (
            <div className="loading-overlay">
                <div className="spinner"></div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div className="customers-page">
            {/* Page Header */}
            <div className="page-header">
                <h1 className="page-title">Customer Management</h1>
                <button className="btn btn-primary" onClick={handleAdd}>
                    <UserPlusIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                    Add Customer
                </button>
            </div>

            {/* Statistics Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon blue">
                        <UsersIcon style={{ width: '28px', height: '28px', color: 'white' }} />
                    </div>
                    <div className="stat-info">
                        <h3>{stats.total_customers || 0}</h3>
                        <p>Total Customers</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green">
                        <UserIcon style={{ width: '28px', height: '28px', color: 'white' }} />
                    </div>
                    <div className="stat-info">
                        <h3>{stats.individual_count || 0}</h3>
                        <p>Individual</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon purple">
                        <BuildingOfficeIcon style={{ width: '28px', height: '28px', color: 'white' }} />
                    </div>
                    <div className="stat-info">
                        <h3>{stats.corporate_count || 0}</h3>
                        <p>Corporate</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon orange">
                        <UserPlusIcon style={{ width: '28px', height: '28px', color: 'white' }} />
                    </div>
                    <div className="stat-info">
                        <h3>{stats.new_this_month || 0}</h3>
                        <p>New This Month</p>
                    </div>
                </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                        <MagnifyingGlassIcon style={{
                            width: '1.25rem', height: '1.25rem',
                            position: 'absolute', left: '12px', top: '50%',
                            transform: 'translateY(-50%)', color: 'var(--gray-400)'
                        }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by name, phone, email, or customer number..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                    <SearchableSelect
                        className="form-select"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        style={{ width: '180px' }}
                    >
                        <option value="all">All Types</option>
                        <option value="individual">Individual</option>
                        <option value="corporate">Corporate</option>
                    </SearchableSelect>
                </div>
            </div>

            {/* Customers Table */}
            <div className="card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Customer #</th>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>City</th>
                            <th>Type</th>
                            <th>Outstanding</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.length === 0 ? (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                                    No customers found. Click "Add Customer" to create one.
                                </td>
                            </tr>
                        ) : (
                            customers.map((customer) => (
                                <tr key={customer.id}>
                                    <td><strong>{customer.customer_number}</strong></td>
                                    <td>{customer.first_name} {customer.last_name}</td>
                                    <td>{customer.phone}</td>
                                    <td>{customer.email || '-'}</td>
                                    <td>{customer.city || '-'}</td>
                                    <td>{getTypeBadge(customer.customer_type)}</td>
                                    <td>PKR {(customer.outstanding_balance || 0).toLocaleString()}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn-icon"
                                                onClick={() => handleView(customer)}
                                                title="View Details"
                                            >
                                                <EyeIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                                            </button>
                                            <button
                                                className="btn-icon"
                                                onClick={() => handleEdit(customer)}
                                                title="Edit"
                                            >
                                                <PencilSquareIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                                            </button>
                                            <button
                                                className="btn-icon btn-icon-danger"
                                                onClick={() => handleDeleteClick(customer)}
                                                title="Delete"
                                            >
                                                <TrashIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <CustomerModal
                    isOpen={showModal}
                    onClose={handleCloseModal}
                    onSubmit={handleSubmit}
                    formData={formData}
                    setFormData={setFormData}
                    isEditing={!!selectedCustomer}
                    submitting={submitting}
                />
            )}

            {/* View Details Modal */}
            {showViewModal && selectedCustomer && (
                <ViewCustomerModal
                    customer={selectedCustomer}
                    onClose={() => { setShowViewModal(false); setSelectedCustomer(null); }}
                />
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && customerToDelete && (
                <DeleteConfirmModal
                    customer={customerToDelete}
                    onConfirm={handleDelete}
                    onCancel={() => { setShowDeleteConfirm(false); setCustomerToDelete(null); }}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER MODAL COMPONENT (Add/Edit)
// ═══════════════════════════════════════════════════════════════════════════

function CustomerModal({ isOpen, onClose, onSubmit, formData, setFormData, isEditing, submitting }) {
    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="modal-overlay">
            <div
                className="modal-container modal-lg"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'slideIn 0.3s ease-out' }}
            >
                <div className="modal-header">
                    <h2>{isEditing ? 'Edit Customer' : 'Add New Customer'}</h2>
                    <button className="modal-close" onClick={onClose}>
                        <XMarkIcon style={{ width: '1.5rem', height: '1.5rem' }} />
                    </button>
                </div>

                <form onSubmit={onSubmit}>
                    <div className="modal-body">
                        {/* Basic Information Section */}
                        <div className="form-section">
                            <h3 className="form-section-title">Basic Information</h3>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">First Name *</label>
                                    <input
                                        className="form-input"
                                        value={formData.firstName}
                                        onChange={(e) => handleChange('firstName', e.target.value)}
                                        required
                                        placeholder="Enter first name"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Last Name *</label>
                                    <input
                                        className="form-input"
                                        value={formData.lastName}
                                        onChange={(e) => handleChange('lastName', e.target.value)}
                                        required
                                        placeholder="Enter last name"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone *</label>
                                    <input
                                        className="form-input"
                                        value={formData.phone}
                                        onChange={(e) => handleChange('phone', e.target.value)}
                                        required
                                        placeholder="+92 3XX XXXXXXX"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Alternate Phone</label>
                                    <input
                                        className="form-input"
                                        value={formData.alternatePhone}
                                        onChange={(e) => handleChange('alternatePhone', e.target.value)}
                                        placeholder="+92 3XX XXXXXXX"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input
                                        className="form-input"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => handleChange('email', e.target.value)}
                                        placeholder="email@example.com"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Customer Type</label>
                                    <SearchableSelect
                                        className="form-select"
                                        value={formData.customerType}
                                        onChange={(e) => handleChange('customerType', e.target.value)}
                                    >
                                        <option value="individual">Individual</option>
                                        <option value="corporate">Corporate</option>
                                    </SearchableSelect>
                                </div>
                            </div>
                        </div>

                        {/* Personal Details Section */}
                        <div className="form-section">
                            <h3 className="form-section-title">Personal Details</h3>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">Date of Birth</label>
                                    <input
                                        className="form-input"
                                        type="date"
                                        value={formData.dateOfBirth}
                                        onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Gender</label>
                                    <SearchableSelect
                                        className="form-select"
                                        value={formData.gender}
                                        onChange={(e) => handleChange('gender', e.target.value)}
                                    >
                                        <option value="">Select Gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </SearchableSelect>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">CNIC Number</label>
                                    <input
                                        className="form-input"
                                        value={formData.cnicNumber}
                                        onChange={(e) => handleChange('cnicNumber', e.target.value)}
                                        placeholder="XXXXX-XXXXXXX-X"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Credit Limit (PKR)</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        value={formData.creditLimit}
                                        onChange={(e) => handleChange('creditLimit', e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Address Section */}
                        <div className="form-section">
                            <h3 className="form-section-title">Address</h3>
                            <div className="form-grid">
                                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                    <label className="form-label">Street Address</label>
                                    <input
                                        className="form-input"
                                        value={formData.address}
                                        onChange={(e) => handleChange('address', e.target.value)}
                                        placeholder="Enter street address"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">City</label>
                                    <input
                                        className="form-input"
                                        value={formData.city}
                                        onChange={(e) => handleChange('city', e.target.value)}
                                        placeholder="City"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">State/Province</label>
                                    <input
                                        className="form-input"
                                        value={formData.state}
                                        onChange={(e) => handleChange('state', e.target.value)}
                                        placeholder="State/Province"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Postal Code</label>
                                    <input
                                        className="form-input"
                                        value={formData.postalCode}
                                        onChange={(e) => handleChange('postalCode', e.target.value)}
                                        placeholder="Postal Code"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Country</label>
                                    <input
                                        className="form-input"
                                        value={formData.country}
                                        onChange={(e) => handleChange('country', e.target.value)}
                                        placeholder="Pakistan"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Corporate Details Section (Conditional) */}
                        {formData.customerType === 'corporate' && (
                            <div className="form-section">
                                <h3 className="form-section-title">Corporate Details</h3>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label className="form-label">Company Name</label>
                                        <input
                                            className="form-input"
                                            value={formData.companyName}
                                            onChange={(e) => handleChange('companyName', e.target.value)}
                                            placeholder="Company Name"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Company NTN</label>
                                        <input
                                            className="form-input"
                                            value={formData.companyNtn}
                                            onChange={(e) => handleChange('companyNtn', e.target.value)}
                                            placeholder="National Tax Number"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? (
                                <>
                                    <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span>
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <CheckCircleIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                                    {isEditing ? 'Update Customer' : 'Save Customer'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW CUSTOMER MODAL
// ═══════════════════════════════════════════════════════════════════════════

function ViewCustomerModal({ customer, onClose }) {
    return (
        <div className="modal-overlay">
            <div
                className="modal-container modal-md"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'slideIn 0.3s ease-out' }}
            >
                <div className="modal-header">
                    <h2>Customer Details</h2>
                    <button className="modal-close" onClick={onClose}>
                        <XMarkIcon style={{ width: '1.5rem', height: '1.5rem' }} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="customer-profile">
                        <div className="customer-avatar">
                            {customer.first_name?.charAt(0)}{customer.last_name?.charAt(0)}
                        </div>
                        <h3>{customer.first_name} {customer.last_name}</h3>
                        <p className="customer-number">{customer.customer_number}</p>
                        <span className={`badge ${customer.customer_type === 'corporate' ? 'badge-info' : 'badge-gray'}`}>
                            {customer.customer_type}
                        </span>
                    </div>

                    <div className="customer-details-grid">
                        <div className="detail-item">
                            <span className="detail-label">Phone</span>
                            <span className="detail-value">{customer.phone || '-'}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Email</span>
                            <span className="detail-value">{customer.email || '-'}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">City</span>
                            <span className="detail-value">{customer.city || '-'}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">CNIC</span>
                            <span className="detail-value">{customer.cnic_number || '-'}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Total Orders</span>
                            <span className="detail-value">{customer.total_orders || 0}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Total Spent</span>
                            <span className="detail-value">PKR {(customer.total_spent || 0).toLocaleString()}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Outstanding</span>
                            <span className="detail-value" style={{ color: customer.outstanding_balance > 0 ? 'var(--error-500)' : 'inherit' }}>
                                PKR {(customer.outstanding_balance || 0).toLocaleString()}
                            </span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Credit Limit</span>
                            <span className="detail-value">PKR {(customer.credit_limit || 0).toLocaleString()}</span>
                        </div>
                        {customer.company_name && (
                            <>
                                <div className="detail-item">
                                    <span className="detail-label">Company</span>
                                    <span className="detail-value">{customer.company_name}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">NTN</span>
                                    <span className="detail-value">{customer.company_ntn || '-'}</span>
                                </div>
                            </>
                        )}
                        <div className="detail-item" style={{ gridColumn: 'span 2' }}>
                            <span className="detail-label">Address</span>
                            <span className="detail-value">
                                {[customer.address, customer.city, customer.state, customer.postal_code, customer.country]
                                    .filter(Boolean).join(', ') || '-'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE CONFIRMATION MODAL
// ═══════════════════════════════════════════════════════════════════════════

function DeleteConfirmModal({ customer, onConfirm, onCancel }) {
    return (
        <div className="modal-overlay">
            <div
                className="modal-container modal-sm"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'scaleIn 0.2s ease-out' }}
            >
                <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="delete-icon">
                        <ExclamationTriangleIcon style={{ width: '3rem', height: '3rem', color: 'var(--error-500)' }} />
                    </div>
                    <h3 style={{ marginBottom: '0.5rem' }}>Delete Customer?</h3>
                    <p style={{ color: 'var(--gray-500)', marginBottom: '1.5rem' }}>
                        Are you sure you want to delete <strong>{customer.first_name} {customer.last_name}</strong>?
                        This action cannot be undone.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                        <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT STYLES (Inline for CSS-in-JS approach, can be moved to CSS file)
// ═══════════════════════════════════════════════════════════════════════════

const styles = `
    /* Modal Animations */
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    @keyframes scaleIn {
        from {
            opacity: 0;
            transform: scale(0.9);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    /* Modal Styles */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1rem;
    }

    .modal-container {
        background: white;
        border-radius: 1rem;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        max-height: 90vh;
        overflow-y: auto;
        width: 100%;
    }

    .modal-sm { max-width: 400px; }
    .modal-md { max-width: 600px; }
    .modal-lg { max-width: 800px; }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem 2rem;
        border-bottom: 1px solid var(--gray-200);
    }

    .modal-header h2 {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--gray-800);
    }

    .modal-close {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--gray-500);
        padding: 0.25rem;
        border-radius: 0.5rem;
        transition: all 0.2s;
    }

    .modal-close:hover {
        background: var(--gray-100);
        color: var(--gray-700);
    }

    .modal-body {
        padding: 2rem;
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        padding: 1.5rem 2rem;
        border-top: 1px solid var(--gray-200);
        background: var(--gray-50);
    }

    /* Form Sections */
    .form-section {
        margin-bottom: 2rem;
    }

    .form-section:last-child {
        margin-bottom: 0;
    }

    .form-section-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--gray-700);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--gray-200);
    }

    .form-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
    }

    /* Customer Profile */
    .customer-profile {
        text-align: center;
        padding-bottom: 1.5rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid var(--gray-200);
    }

    .customer-avatar {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 700;
        font-size: 1.5rem;
        margin: 0 auto 1rem;
    }

    .customer-profile h3 {
        font-size: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
    }

    .customer-number {
        color: var(--gray-500);
        font-size: 0.875rem;
        margin-bottom: 0.5rem;
    }

    /* Customer Details Grid */
    .customer-details-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
    }

    .detail-item {
        padding: 0.75rem;
        background: var(--gray-50);
        border-radius: 0.5rem;
    }

    .detail-label {
        display: block;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--gray-500);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.25rem;
    }

    .detail-value {
        font-size: 0.875rem;
        color: var(--gray-800);
        font-weight: 500;
    }

    /* Delete Icon */
    .delete-icon {
        width: 4rem;
        height: 4rem;
        border-radius: 50%;
        background: var(--error-100);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1rem;
    }

    /* Button Icon Styles */
    .btn-icon {
        width: 32px;
        height: 32px;
        border-radius: 0.5rem;
        border: none;
        background: var(--gray-100);
        color: var(--gray-600);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
    }

    .btn-icon:hover {
        background: var(--primary-100);
        color: var(--primary-600);
    }

    .btn-icon-danger:hover {
        background: var(--error-100);
        color: var(--error-500);
    }

    /* Responsive */
    @media (max-width: 640px) {
        .form-grid {
            grid-template-columns: 1fr;
        }
        .customer-details-grid {
            grid-template-columns: 1fr;
        }
    }
`;

// Inject styles
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

export default Customers;