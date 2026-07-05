import React from 'react';

export default function DateRangeFilter({ startDate = '', endDate = '', onStartChange, onEndChange }) {
    return (
        <div className="filter-date-range">
            <div className="filter-group filter-date-group">
                <input
                    type="date"
                    className="form-control"
                    value={startDate}
                    onChange={(e) => onStartChange(e.target.value)}
                    placeholder="Start date"
                />
            </div>
            <span className="filter-date-sep">—</span>
            <div className="filter-group filter-date-group">
                <input
                    type="date"
                    className="form-control"
                    value={endDate}
                    onChange={(e) => onEndChange(e.target.value)}
                    placeholder="End date"
                />
            </div>
        </div>
    );
}
