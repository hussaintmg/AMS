import React from 'react';
import SearchableSelect from '../SearchableSelect';

export default function SelectFilter({
    value = '',
    onChange,
    options = [],
    children,
    name = '',
    placeholder = 'All',
    labelField = 'label',
    valueField = 'value',
    allLabel = 'All',
    includeAll = true,
    searchable = false
}) {
    const handleChange = (e) => {
        if (onChange) onChange(e.target.value);
    };

    if (searchable) {
        return (
            <div className="filter-group">
                <SearchableSelect
                    name={name}
                    value={value}
                    onChange={(e) => handleChange(e)}
                    placeholder={placeholder}
                    options={includeAll ? [{ [labelField]: allLabel, [valueField]: '' }, ...options] : options}
                    labelField={labelField}
                    valueField={valueField}
                />
            </div>
        );
    }

    return (
        <div className="filter-group">
            <select
                className="form-control"
                value={value}
                onChange={(e) => handleChange(e)}
            >
                {includeAll && <option value="">{allLabel}</option>}
                {options.length > 0
                    ? options.map((opt, i) => (
                        // Option values are not guaranteed unique (legacy master data can
                        // hold duplicate names), so pair the value with the index.
                        <option key={`${opt[valueField] ?? 'opt'}-${i}`} value={opt[valueField]}>
                            {opt[labelField]}
                        </option>
                    ))
                    : children
                }
            </select>
        </div>
    );
}
