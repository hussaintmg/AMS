import React from 'react';

export default function ResetFiltersButton({ onClick, activeCount = 0 }) {
    return (
        <button
            type="button"
            className="btn btn-outline btn-sm filter-reset-btn"
            onClick={onClick}
            title="Reset all filters"
        >
            Reset
            {activeCount > 0 && <span className="filter-badge">{activeCount}</span>}
        </button>
    );
}
