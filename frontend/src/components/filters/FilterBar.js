import React from 'react';
import SearchInput from './SearchInput';
import SelectFilter from './SelectFilter';
import DateRangeFilter from './DateRangeFilter';
import StatusFilter from './StatusFilter';
import ResetFiltersButton from './ResetFiltersButton';

export { SearchInput, SelectFilter, DateRangeFilter, StatusFilter, ResetFiltersButton };

export default function FilterBar({ children, className = '' }) {
    return (
        <div className={`filter-bar ${className}`}>
            {children}
        </div>
    );
}
