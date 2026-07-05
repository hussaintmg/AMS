import React from 'react';

export default function StatusFilter({ value = '', onChange, activeLabel = 'Active', inactiveLabel = 'Inactive' }) {
    return (
        <div className="filter-group">
            <select
                className="form-control"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">All</option>
                <option value="active">{activeLabel}</option>
                <option value="inactive">{inactiveLabel}</option>
            </select>
        </div>
    );
}
