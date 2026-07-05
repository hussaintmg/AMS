/**
 * Customers Page - Advanced Filter, Search & CRUD Operations
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { useSearchParams } from 'react-router-dom';
import { leadAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
    PencilIcon,
    TrashIcon,
    FunnelIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ArrowPathIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    UserPlusIcon
} from '@heroicons/react/24/outline';
import BulkUploadModal from '../components/BulkUploadModal';

// Debounce hook for search
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => clearTimeout(handler);
    }, [value, delay]);

    return debouncedValue;
}

function Leads() {
    // State for customers data (backend entity is still "leads")
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

    // State for modals
    const [showModal, setShowModal] = useState(false);
    const [selectedLead, setSelectedLead] = useState(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [showBulkUpload, setShowBulkUpload] = useState(false);

    // State for filter options (from API)
    const [filterOptions, setFilterOptions] = useState({
        statuses: [],
        priorities: [],
        sources: [],
        cities: [],
        assignedUsers: []
    });

    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';

    // State for active filters
    const [filters, setFilters] = useState({
        search: urlSearch,
        status: '',
        source_id: '',
        priority: '',
        city: '',
        assigned_to: '',
        date_from: '',
        date_to: '',
        sort_by: 'created_at',
        sort_order: 'desc'
    });

    // State for form data
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        source_id: '',
        priority: 'medium',
        interested_in: '',
        city: '',
        notes: ''
    });

    // Debounced search value
    const debouncedSearch = useDebounce(filters.search, 300);

    // Abort controller for cancelling requests
    const abortControllerRef = useRef(null);

    // Load filter options on mount
    useEffect(() => {
        loadFilterOptions();
    }, []);

    // Update filters if URL search param changes
    useEffect(() => {
        if (urlSearch) {
            setFilters(prev => ({ ...prev, search: urlSearch }));
        }
    }, [urlSearch]);

    // Load leads when filters or pagination changes
    useEffect(() => {
        loadLeads();
    }, [debouncedSearch, filters.status, filters.source_id, filters.priority,
        filters.city, filters.assigned_to, filters.date_from, filters.date_to,
        filters.sort_by, filters.sort_order, pagination.page, pagination.limit]);

    // Load filter options from API
    const loadFilterOptions = async () => {
        try {
            const res = await leadAPI.getFilterOptions();
            if (res.data.success) {
                setFilterOptions(res.data.data);
            }
        } catch (error) {
            console.error('Failed to load filter options:', error);
        }
    };

    // Load leads with current filters
    const loadLeads = useCallback(async () => {
        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setLoading(true);
        try {
            const params = {
                ...filters,
                search: debouncedSearch,
                page: pagination.page,
                limit: pagination.limit
            };

            // Remove empty params
            Object.keys(params).forEach(key => {
                if (params[key] === '' || params[key] === null || params[key] === undefined) {
                    delete params[key];
                }
            });

            const res = await leadAPI.getAll(params);
            if (res.data.success) {
                setLeads(res.data.data || []);
                setPagination(prev => ({
                    ...prev,
                    total: res.data.pagination?.total || 0,
                    totalPages: res.data.pagination?.totalPages || 0
                }));
            }
        } catch (error) {
            if (error.name !== 'CanceledError') {
                console.error('Failed to load leads:', error);
                toast.error('Failed to load customers');
            }
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, filters, pagination.page, pagination.limit]);

    // Handle filter change
    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        // Reset to first page when filter changes
        if (key !== 'sort_by' && key !== 'sort_order') {
            setPagination(prev => ({ ...prev, page: 1 }));
        }
    };

    // Clear all filters
    const clearFilters = () => {
        setFilters({
            search: '',
            status: '',
            source_id: '',
            priority: '',
            city: '',
            assigned_to: '',
            date_from: '',
            date_to: '',
            sort_by: 'created_at',
            sort_order: 'desc'
        });
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    // Get active filter count
    const getActiveFilterCount = () => {
        let count = 0;
        if (filters.search) count++;
        if (filters.status) count++;
        if (filters.source_id) count++;
        if (filters.priority) count++;
        if (filters.city) count++;
        if (filters.assigned_to) count++;
        if (filters.date_from) count++;
        if (filters.date_to) count++;
        return count;
    };

    // Handle export
    const handleExport = async () => {
        try {
            toast.loading('Exporting customers...', { id: 'export' });
            const res = await leadAPI.export(filters);

            // Create download link
            const blob = new Blob([res.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `customers_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success('Customers exported successfully!', { id: 'export' });
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Failed to export customers', { id: 'export' });
        }
    };

    // Handle edit
    const handleEdit = (lead) => {
        setSelectedLead(lead);
        setFormData({
            first_name: lead.first_name || '',
            last_name: lead.last_name || '',
            email: lead.email || '',
            phone: lead.phone || '',
            source_id: lead.source_id || '',
            priority: lead.priority || 'medium',
            interested_in: lead.interested_in || '',
            city: lead.city || '',
            notes: lead.notes || ''
        });
        setShowModal(true);
    };

    // Handle delete
    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this customer?')) return;
        try {
            await leadAPI.delete(id);
            toast.success('Customer deleted successfully');
            loadLeads();
        } catch (error) {
            console.error('Delete failed:', error);
            toast.error('Failed to delete customer');
        }
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (selectedLead) {
                await leadAPI.update(selectedLead.id, formData);
                toast.success('Customer updated successfully!');
            } else {
                await leadAPI.create(formData);
                toast.success('Customer created successfully!');
            }
            handleCloseModal();
            loadLeads();
        } catch (error) {
            console.error('Submit failed:', error);
            toast.error(selectedLead ? 'Failed to update customer' : 'Failed to create customer');
        }
    };

    // Handle modal close
    const handleCloseModal = () => {
        setShowModal(false);
        setSelectedLead(null);
        setFormData({
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
            source_id: '',
            priority: 'medium',
            interested_in: '',
            city: '',
            notes: ''
        });
    };

    // Get status badge color
    const getStatusColor = (status) => {
        const colors = {
            new: 'info',
            contacted: 'info',
            qualified: 'warning',
            unqualified: 'gray',
            converted: 'success',
            lost: 'error'
        };
        return colors[status] || 'gray';
    };

    // Get priority badge color
    const getPriorityColor = (priority) => {
        const colors = {
            urgent: 'error',
            high: 'warning',
            medium: 'info',
            low: 'gray'
        };
        return colors[priority] || 'gray';
    };

    return (
        <div className="leads-page">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Customer Management</h1>
                    <p style={{ color: 'var(--gray-500)', fontSize: 'var(--font-size-sm)', marginTop: '0.25rem' }}>
                        {pagination.total} total customers
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-secondary" onClick={handleExport} title="Export to CSV">
                        <ArrowDownTrayIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                        Export
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowBulkUpload(true)}
                        title="Bulk upload customers (CSV / XLSX)"
                    >
                        <ArrowUpTrayIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                        Upload
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <UserPlusIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                        Add Customer
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Search Input */}
                    <div className="search-input-wrapper" style={{ flex: '1', minWidth: '250px', maxWidth: '400px' }}>
                        <div style={{ position: 'relative' }}>
                            <MagnifyingGlassIcon
                                style={{
                                    position: 'absolute',
                                    left: '0.75rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '1.25rem',
                                    height: '1.25rem',
                                    color: 'var(--gray-400)'
                                }}
                            />
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Search customers..."
                                value={filters.search}
                                onChange={(e) => handleFilterChange('search', e.target.value)}
                                style={{ paddingLeft: '2.5rem' }}
                            />
                            {filters.search && (
                                <button
                                    onClick={() => handleFilterChange('search', '')}
                                    style={{
                                        position: 'absolute',
                                        right: '0.5rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '0.25rem'
                                    }}
                                >
                                    <XMarkIcon style={{ width: '1rem', height: '1rem', color: 'var(--gray-400)' }} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Status Filter */}
                    <SearchableSelect
                        className="form-select"
                        value={filters.status}
                        onChange={(e) => handleFilterChange('status', e.target.value)}
                        style={{ width: 'auto', minWidth: '140px' }}
                    >
                        <option value="">All Statuses</option>
                        {filterOptions.statuses.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </SearchableSelect>

                    {/* Source Filter */}
                    <SearchableSelect
                        className="form-select"
                        value={filters.source_id}
                        onChange={(e) => handleFilterChange('source_id', e.target.value)}
                        style={{ width: 'auto', minWidth: '140px' }}
                    >
                        <option value="">All Sources</option>
                        {filterOptions.sources.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </SearchableSelect>

                    {/* Priority Filter */}
                    <SearchableSelect
                        className="form-select"
                        value={filters.priority}
                        onChange={(e) => handleFilterChange('priority', e.target.value)}
                        style={{ width: 'auto', minWidth: '140px' }}
                    >
                        <option value="">All Priorities</option>
                        {filterOptions.priorities.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </SearchableSelect>

                    {/* Advanced Filters Toggle */}
                    <button
                        className={`btn ${showAdvancedFilters ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <FunnelIcon style={{ width: '1rem', height: '1rem' }} />
                        Advanced
                        {getActiveFilterCount() > 0 && (
                            <span style={{
                                background: 'var(--primary-500)',
                                color: 'white',
                                borderRadius: '50%',
                                width: '1.25rem',
                                height: '1.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: '600'
                            }}>
                                {getActiveFilterCount()}
                            </span>
                        )}
                        {showAdvancedFilters ? (
                            <ChevronUpIcon style={{ width: '1rem', height: '1rem' }} />
                        ) : (
                            <ChevronDownIcon style={{ width: '1rem', height: '1rem' }} />
                        )}
                    </button>

                    {/* Clear Filters */}
                    {getActiveFilterCount() > 0 && (
                        <button
                            className="btn btn-secondary"
                            onClick={clearFilters}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <XMarkIcon style={{ width: '1rem', height: '1rem' }} />
                            Clear
                        </button>
                    )}

                    {/* Refresh */}
                    <button
                        className="btn btn-secondary"
                        onClick={loadLeads}
                        disabled={loading}
                        style={{ padding: '0.5rem' }}
                        title="Refresh"
                    >
                        <ArrowPathIcon
                            style={{
                                width: '1.25rem',
                                height: '1.25rem',
                                animation: loading ? 'spin 1s linear infinite' : 'none'
                            }}
                        />
                    </button>
                </div>

                {/* Advanced Filters Panel */}
                {showAdvancedFilters && (
                    <div
                        className="advanced-filters-panel"
                        style={{
                            marginTop: '1rem',
                            paddingTop: '1rem',
                            borderTop: '1px solid var(--gray-200)',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '1rem'
                        }}
                    >
                        {/* City Filter */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">City</label>
                            <SearchableSelect
                                className="form-select"
                                value={filters.city}
                                onChange={(e) => handleFilterChange('city', e.target.value)}
                            >
                                <option value="">All Cities</option>
                                {filterOptions.cities.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </SearchableSelect>
                        </div>

                        {/* Assigned To Filter */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Assigned To</label>
                            <SearchableSelect
                                className="form-select"
                                value={filters.assigned_to}
                                onChange={(e) => handleFilterChange('assigned_to', e.target.value)}
                            >
                                <option value="">All Users</option>
                                {filterOptions.assignedUsers.map(u => (
                                    <option key={u.value} value={u.value}>{u.label}</option>
                                ))}
                            </SearchableSelect>
                        </div>

                        {/* Date From */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Created From</label>
                            <input
                                type="date"
                                className="form-input"
                                value={filters.date_from}
                                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                            />
                        </div>

                        {/* Date To */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Created To</label>
                            <input
                                type="date"
                                className="form-input"
                                value={filters.date_to}
                                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Active Filter Chips */}
            {getActiveFilterCount() > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                    {filters.search && (
                        <FilterChip
                            label={`Search: "${filters.search}"`}
                            onRemove={() => handleFilterChange('search', '')}
                        />
                    )}
                    {filters.status && (
                        <FilterChip
                            label={`Status: ${filters.status}`}
                            onRemove={() => handleFilterChange('status', '')}
                        />
                    )}
                    {filters.source_id && (
                        <FilterChip
                            label={`Source: ${filterOptions.sources.find(s => s.value == filters.source_id)?.label || filters.source_id}`}
                            onRemove={() => handleFilterChange('source_id', '')}
                        />
                    )}
                    {filters.priority && (
                        <FilterChip
                            label={`Priority: ${filters.priority}`}
                            onRemove={() => handleFilterChange('priority', '')}
                        />
                    )}
                    {filters.city && (
                        <FilterChip
                            label={`City: ${filters.city}`}
                            onRemove={() => handleFilterChange('city', '')}
                        />
                    )}
                    {filters.assigned_to && (
                        <FilterChip
                            label={`Assigned: ${filterOptions.assignedUsers.find(u => u.value == filters.assigned_to)?.label || filters.assigned_to}`}
                            onRemove={() => handleFilterChange('assigned_to', '')}
                        />
                    )}
                    {filters.date_from && (
                        <FilterChip
                            label={`From: ${filters.date_from}`}
                            onRemove={() => handleFilterChange('date_from', '')}
                        />
                    )}
                    {filters.date_to && (
                        <FilterChip
                            label={`To: ${filters.date_to}`}
                            onRemove={() => handleFilterChange('date_to', '')}
                        />
                    )}
                </div>
            )}

            {/* Data Table */}
            <div className="card">
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <div className="spinner" style={{ margin: '0 auto' }}></div>
                        <p style={{ marginTop: '1rem', color: 'var(--gray-500)' }}>Loading customers...</p>
                    </div>
                ) : leads.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <FunnelIcon style={{ width: '3rem', height: '3rem', color: 'var(--gray-300)', margin: '0 auto' }} />
                        <h3 style={{ marginTop: '1rem', color: 'var(--gray-700)' }}>No customers found</h3>
                        <p style={{ color: 'var(--gray-500)' }}>
                            {getActiveFilterCount() > 0
                                ? 'Try adjusting your filters or search terms'
                                : 'Create your first customer to get started'}
                        </p>
                        {getActiveFilterCount() > 0 && (
                            <button className="btn btn-secondary" onClick={clearFilters} style={{ marginTop: '1rem' }}>
                                Clear Filters
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Customer #</th>
                                        <th>Name</th>
                                        <th>Contact</th>
                                        <th>Source</th>
                                        <th>Interested In</th>
                                        <th>Status</th>
                                        <th>Priority</th>
                                        <th>Age</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leads.map((lead) => (
                                        <tr key={lead.id}>
                                            <td><strong>{lead.lead_number}</strong></td>
                                            <td>
                                                <div>
                                                    <strong>{lead.first_name} {lead.last_name}</strong>
                                                    {lead.city && (
                                                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-500)' }}>
                                                            {lead.city}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div>{lead.phone}</div>
                                                {lead.email && (
                                                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-500)' }}>
                                                        {lead.email}
                                                    </div>
                                                )}
                                            </td>
                                            <td>{lead.source_name || '-'}</td>
                                            <td>{lead.interested_in || '-'}</td>
                                            <td>
                                                <span className={`badge badge-${getStatusColor(lead.status)}`}>
                                                    {lead.status}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge badge-${getPriorityColor(lead.priority)}`}>
                                                    {lead.priority || 'medium'}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{
                                                    color: lead.age_days > 30 ? 'var(--error-500)' :
                                                        lead.age_days > 14 ? 'var(--warning-500)' : 'var(--gray-600)'
                                                }}>
                                                    {lead.age_days}d
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        className="btn-icon"
                                                        onClick={() => handleEdit(lead)}
                                                        title="Edit"
                                                    >
                                                        <PencilIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                                                    </button>
                                                    <button
                                                        className="btn-icon btn-icon-danger"
                                                        onClick={() => handleDelete(lead.id)}
                                                        title="Delete"
                                                    >
                                                        <TrashIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div
                            className="pagination-controls"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '1rem 1.5rem',
                                borderTop: '1px solid var(--gray-100)'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: 'var(--gray-500)', fontSize: 'var(--font-size-sm)' }}>
                                    Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                                </span>
                                <SearchableSelect
                                    className="form-select"
                                    value={pagination.limit}
                                    onChange={(e) => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
                                    style={{ width: 'auto', marginLeft: '1rem' }}
                                >
                                    <option value="10">10 per page</option>
                                    <option value="20">20 per page</option>
                                    <option value="50">50 per page</option>
                                    <option value="100">100 per page</option>
                                </SearchableSelect>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                    disabled={pagination.page <= 1}
                                    style={{ padding: '0.5rem' }}
                                >
                                    <ChevronLeftIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                                </button>
                                <span style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 1rem',
                                    color: 'var(--gray-600)'
                                }}>
                                    Page {pagination.page} of {pagination.totalPages || 1}
                                </span>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                    disabled={pagination.page >= pagination.totalPages}
                                    style={{ padding: '0.5rem' }}
                                >
                                    <ChevronRightIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Lead Modal */}
            {showModal && (
                <Modal onClose={handleCloseModal}>
                    <h2 style={{ marginBottom: '1.5rem' }}>
                        {selectedLead ? 'Edit Customer' : 'Add New Customer'}
                    </h2>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">First Name *</label>
                                <input
                                    className="form-input"
                                    value={formData.first_name}
                                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Last Name *</label>
                                <input
                                    className="form-input"
                                    value={formData.last_name}
                                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Phone *</label>
                                <input
                                    className="form-input"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email</label>
                                <input
                                    className="form-input"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Source</label>
                                <SearchableSelect
                                    className="form-select"
                                    value={formData.source_id}
                                    onChange={(e) => setFormData({ ...formData, source_id: e.target.value })}
                                >
                                    <option value="">Select Source</option>
                                    {filterOptions.sources.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                </SearchableSelect>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Priority</label>
                                <SearchableSelect
                                    className="form-select"
                                    value={formData.priority}
                                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </SearchableSelect>
                            </div>
                            <div className="form-group">
                                <label className="form-label">City</label>
                                <input
                                    className="form-input"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    placeholder="e.g., Karachi"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Interested In</label>
                                <input
                                    className="form-input"
                                    value={formData.interested_in}
                                    onChange={(e) => setFormData({ ...formData, interested_in: e.target.value })}
                                    placeholder="e.g., Honda Civic 2024"
                                />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label className="form-label">Notes</label>
                                <textarea
                                    className="form-input"
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows="3"
                                    placeholder="Additional notes about this lead..."
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                            <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary">
                                {selectedLead ? 'Update Customer' : 'Save Customer'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            <BulkUploadModal
                isOpen={showBulkUpload}
                onClose={() => setShowBulkUpload(false)}
                title="Bulk upload customers"
                description="Import customers from a spreadsheet. Sample files list required fields with an asterisk (*) in the header row."
                templateType="leads"
                onCompleted={() => {
                    setPagination((prev) => ({ ...prev, page: 1 }));
                    loadLeads();
                }}
            />
        </div>
    );
}

// Filter Chip Component
function FilterChip({ label, onRemove }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.25rem 0.75rem',
                background: 'var(--primary-50)',
                color: 'var(--primary-700)',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: '500'
            }}
        >
            {label}
            <button
                onClick={onRemove}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.125rem',
                    borderRadius: '50%'
                }}
            >
                <XMarkIcon style={{ width: '0.875rem', height: '0.875rem' }} />
            </button>
        </span>
    );
}

// Modal Component
function Modal({ children, onClose }) {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '1rem'
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                style={{
                    background: 'white',
                    borderRadius: '1rem',
                    padding: '2rem',
                    width: '100%',
                    maxWidth: '700px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    position: 'relative',
                    animation: 'modalSlideIn 0.3s ease'
                }}
            >
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'none',
                        border: 'none',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        color: 'var(--gray-400)',
                        padding: '0.5rem'
                    }}
                >
                    <XMarkIcon style={{ width: '1.5rem', height: '1.5rem' }} />
                </button>
                {children}
            </div>
        </div>
    );
}

// Add modal animation to index.css if not exists
const style = document.createElement('style');
style.textContent = `
    @keyframes modalSlideIn {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .btn-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border: none;
        background: var(--gray-100);
        border-radius: var(--radius-md);
        cursor: pointer;
        color: var(--gray-600);
        transition: all var(--transition-fast);
    }
    
    .btn-icon:hover {
        background: var(--gray-200);
        color: var(--gray-800);
    }
    
    .btn-icon-danger:hover {
        background: var(--error-100);
        color: var(--error-500);
    }
`;
if (!document.getElementById('leads-styles')) {
    style.id = 'leads-styles';
    document.head.appendChild(style);
}

export default Leads;