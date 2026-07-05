import React, { useState } from 'react';
import SearchableSelect from '../../components/SearchableSelect';
import {
    FunnelIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
    ArrowPathIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    CalendarIcon
} from '@heroicons/react/24/outline';

function SalesFilterBar({
    filters,
    onFilterChange,
    onClear,
    onRefresh,
    loading,
    statusOptions = [],
    customers = [],
    showCustomerFilter = true,
    showDateFilter = true,
    customFilters = null
}) {
    const [showAdvanced, setShowAdvanced] = useState(false);

    const getActiveCount = () => {
        let count = 0;
        if (filters.status) count++;
        if (filters.customerId) count++;
        if (filters.dateFrom) count++;
        if (filters.dateTo) count++;
        // Add check for other keys if any
        return count;
    };

    return (
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
                            placeholder="Search..."
                            value={filters.search}
                            onChange={(e) => onFilterChange('search', e.target.value)}
                            style={{ paddingLeft: '2.5rem' }}
                        />
                        {filters.search && (
                            <button
                                onClick={() => onFilterChange('search', '')}
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
                {statusOptions.length > 0 && (
                    <SearchableSelect
                        className="form-select"
                        value={filters.status}
                        onChange={(e) => onFilterChange('status', e.target.value)}
                        style={{ width: 'auto', minWidth: '140px' }}
                    >
                        <option value="">All Statuses</option>
                        {statusOptions.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </SearchableSelect>
                )}

                {/* Advanced Toggle */}
                <button
                    className={`btn ${showAdvanced ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <FunnelIcon style={{ width: '1rem', height: '1rem' }} />
                    Filters
                    {getActiveCount() > 0 && (
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
                            {getActiveCount()}
                        </span>
                    )}
                    {showAdvanced ? (
                        <ChevronUpIcon style={{ width: '1rem', height: '1rem' }} />
                    ) : (
                        <ChevronDownIcon style={{ width: '1rem', height: '1rem' }} />
                    )}
                </button>

                {/* Clear */}
                {getActiveCount() > 0 && (
                    <button
                        className="btn btn-secondary"
                        onClick={onClear}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <XMarkIcon style={{ width: '1rem', height: '1rem' }} />
                        Clear
                    </button>
                )}

                {/* Refresh */}
                <button
                    className="btn btn-secondary"
                    onClick={onRefresh}
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

            {/* Advanced Panel */}
            {showAdvanced && (
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
                    {showCustomerFilter && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Customer</label>
                            <SearchableSelect
                                className="form-select"
                                value={filters.customerId}
                                onChange={(e) => onFilterChange('customerId', e.target.value)}
                            >
                                <option value="">All Customers</option>
                                {customers.map(c => (
                                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name} {c.company_name ? `(${c.company_name})` : ''}</option>
                                ))}
                            </SearchableSelect>
                        </div>
                    )}

                    {showDateFilter && (
                        <>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Date From</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={filters.dateFrom}
                                    onChange={(e) => onFilterChange('dateFrom', e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Date To</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={filters.dateTo}
                                    onChange={(e) => onFilterChange('dateTo', e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {customFilters}
                </div>
            )}

            {/* Filter Chips */}
            {getActiveCount() > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: showAdvanced ? 'none' : '1px solid var(--gray-200)' }}>
                    {filters.status && (
                        <div className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Status: {filters.status}
                            <XMarkIcon style={{ width: '1rem', height: '1rem', cursor: 'pointer' }} onClick={() => onFilterChange('status', '')} />
                        </div>
                    )}
                    {filters.customerId && (
                        <div className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Customer: {customers.find(c => c.id == filters.customerId)?.first_name || 'ID ' + filters.customerId}
                            <XMarkIcon style={{ width: '1rem', height: '1rem', cursor: 'pointer' }} onClick={() => onFilterChange('customerId', '')} />
                        </div>
                    )}
                    {filters.dateFrom && (
                        <div className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            From: {filters.dateFrom}
                            <XMarkIcon style={{ width: '1rem', height: '1rem', cursor: 'pointer' }} onClick={() => onFilterChange('dateFrom', '')} />
                        </div>
                    )}
                    {filters.dateTo && (
                        <div className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            To: {filters.dateTo}
                            <XMarkIcon style={{ width: '1rem', height: '1rem', cursor: 'pointer' }} onClick={() => onFilterChange('dateTo', '')} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SalesFilterBar;