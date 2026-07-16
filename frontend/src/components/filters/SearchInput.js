import React from 'react';

export default function SearchInput({ value = '', onChange, placeholder = 'Search...' }) {
    const handleChange = (e) => {
        if (onChange) onChange(e.target.value);
    };

    const handleClear = () => {
        if (onChange) onChange('');
    };

    return (
        <div className="filter-search-wrapper">
            <svg className="filter-search-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
                type="text"
                className="form-control filter-search-input"
                placeholder={placeholder}
                value={value}
                onChange={handleChange}
            />
            {value && (
                <button
                    type="button"
                    className="filter-clear-btn"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={handleClear}
                    title="Clear search"
                >
                    ×
                </button>
            )}
        </div>
    );
}
