import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import '../styles/searchableSelect.css';

function calcDropdownPosition(triggerEl, optionCount) {
    if (!triggerEl) return {};
    const rect = triggerEl.getBoundingClientRect();
    const dropdownHeight = Math.min(260, optionCount * 44 + 52);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    let top;
    let bottom;
    let opensUp = false;
    if (spaceBelow >= dropdownHeight + 6) {
        top = rect.bottom;
    } else if (spaceAbove >= dropdownHeight + 6) {
        bottom = window.innerHeight - rect.top;
        opensUp = true;
    } else if (spaceBelow >= spaceAbove) {
        top = rect.bottom;
    } else {
        bottom = window.innerHeight - rect.top;
        opensUp = true;
    }
    return {
        position: 'fixed',
        left: rect.left + 'px',
        ...(opensUp ? { bottom: bottom + 'px' } : { top: top + 'px' }),
        width: Math.max(rect.width, 180) + 'px',
        zIndex: 9999,
        maxHeight: '260px',
        overflowY: 'auto',
        background: '#fff',
        border: '1.5px solid #3b82f6',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.12)',
        ...(opensUp
            ? { borderBottom: 'none', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, display: 'flex', flexDirection: 'column-reverse' }
            : { borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }),
    };
}

const SearchableSelect = ({
    options = [],
    value = '',
    onChange,
    name = '',
    placeholder = 'Select...',
    labelField = 'name',
    valueField = 'id',
    disabled = false,
    required = false,
    className = '',
    children,
    style = {},
    ...rest
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [menuStyle, setMenuStyle] = useState({});
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const menuRef = useRef(null);

    const childOptions = React.Children.toArray(children)
        .filter(child => React.isValidElement(child))
        .flatMap(child => {
            if (child.type === 'option') {
                return [{ label: child.props.children, value: child.props.value ?? '' }];
            }
            if (child.type === 'optgroup') {
                const groupLabel = child.props.label || '';
                return React.Children.toArray(child.props.children)
                    .filter(opt => React.isValidElement(opt) && opt.type === 'option')
                    .map(opt => ({
                        label: `${groupLabel ? `${groupLabel} / ` : ''}${opt.props.children}`,
                        value: opt.props.value ?? ''
                    }));
            }
            return [];
        });

    const normalizedOptions = childOptions.length > 0 ? childOptions : options;
    const normalizedLabelField = childOptions.length > 0 ? 'label' : labelField;
    const normalizedValueField = childOptions.length > 0 ? 'value' : valueField;

    const selectedOption = normalizedOptions.find(opt => String(opt[normalizedValueField]) === String(value));
    const displayValue = selectedOption ? selectedOption[normalizedLabelField] : '';

    const filteredOptions = normalizedOptions.filter(opt =>
        String(opt[normalizedLabelField] || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const closeMenu = useCallback(() => {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
    }, []);

    const handleScrollClose = useCallback(() => {
        if (isOpen) closeMenu();
    }, [isOpen, closeMenu]);

    const handleClickOutside = useCallback((event) => {
        if (
            menuRef.current && !menuRef.current.contains(event.target) &&
            containerRef.current && !containerRef.current.contains(event.target)
        ) {
            closeMenu();
        }
    }, [closeMenu]);

    const handleKeyDownGlobal = useCallback((e) => {
        if (e.key === 'Escape') closeMenu();
    }, [closeMenu]);

    useEffect(() => {
        if (!isOpen) return;
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDownGlobal);
        window.addEventListener('scroll', handleScrollClose, true);
        window.addEventListener('resize', handleScrollClose);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDownGlobal);
            window.removeEventListener('scroll', handleScrollClose, true);
            window.removeEventListener('resize', handleScrollClose);
        };
    }, [isOpen, handleClickOutside, handleKeyDownGlobal, handleScrollClose]);

    useEffect(() => {
        if (highlightedIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll('.ss-option');
            if (items[highlightedIndex]) {
                items[highlightedIndex].scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex]);

    const handleOpen = useCallback(() => {
        if (disabled) return;
        if (!triggerRef.current) return;
        setMenuStyle(calcDropdownPosition(triggerRef.current, filteredOptions.length));
        setIsOpen(true);
        setSearchTerm('');
        setHighlightedIndex(-1);
        setTimeout(() => {
            if (inputRef.current) inputRef.current.focus();
        }, 50);
    }, [disabled, filteredOptions.length]);

    const handleSelect = useCallback((option) => {
        const syntheticEvent = {
            target: {
                name,
                value: String(option[normalizedValueField])
            }
        };
        onChange(syntheticEvent);
        closeMenu();
    }, [name, normalizedValueField, onChange, closeMenu]);

    const handleClear = useCallback((e) => {
        e.stopPropagation();
        const syntheticEvent = {
            target: {
                name: name,
                value: ''
            }
        };
        onChange(syntheticEvent);
        closeMenu();
    }, [name, onChange, closeMenu]);

    const handleKeyDown = useCallback((e) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
                e.preventDefault();
                handleOpen();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < filteredOptions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
                    handleSelect(filteredOptions[highlightedIndex]);
                }
                break;
            case 'Escape':
                closeMenu();
                break;
            default:
                break;
        }
    }, [isOpen, highlightedIndex, filteredOptions, handleOpen, handleSelect, closeMenu]);

    const dropdown = isOpen ? createPortal(
        <div
            ref={menuRef}
            style={menuStyle}
            className="ss-portal-dropdown"
        >
            <div className="ss-search-wrapper">
                <span className="ss-search-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                </span>
                <input
                    ref={inputRef}
                    type="text"
                    className="ss-search-input"
                    placeholder="Type to search..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setHighlightedIndex(0);
                    }}
                    autoComplete="off"
                />
            </div>
            <div className="ss-options-list" ref={listRef} role="listbox">
                {filteredOptions.length === 0 ? (
                    <div className="ss-no-results">
                        {normalizedOptions.length === 0
                            ? 'No options available'
                            : `No results match "${searchTerm}"`}
                    </div>
                ) : (
                    filteredOptions.map((opt, index) => (
                        <div
                            key={opt[normalizedValueField]}
                            className={`ss-option ${String(opt[normalizedValueField]) === String(value) ? 'ss-selected' : ''} ${index === highlightedIndex ? 'ss-highlighted' : ''}`}
                            onClick={() => handleSelect(opt)}
                            role="option"
                            aria-selected={String(opt[normalizedValueField]) === String(value)}
                        >
                            <span className="ss-option-label">
                                {opt[normalizedLabelField]}
                                {opt._isInactive && <span className="ss-inactive-badge">Inactive</span>}
                            </span>
                            {String(opt[normalizedValueField]) === String(value) && (
                                <span className="ss-check">✓</span>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <div
            className={`searchable-select ${className} ${isOpen ? 'ss-open' : ''} ${disabled ? 'ss-disabled' : ''}`}
            ref={containerRef}
            onKeyDown={handleKeyDown}
            style={style}
            {...rest}
        >
            <div
                ref={triggerRef}
                className="ss-trigger"
                onClick={handleOpen}
                tabIndex={disabled ? -1 : 0}
                role="combobox"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                {value && displayValue ? (
                    <span className="ss-value">{displayValue}</span>
                ) : (
                    <span className="ss-placeholder">{placeholder}</span>
                )}
                <div className="ss-actions">
                    {value && !disabled && (
                        <span className="ss-clear" onClick={handleClear} title="Clear">
                            ×
                        </span>
                    )}
                    <span className="ss-arrow">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </span>
                </div>
            </div>

            {dropdown}

            {required && (
                <select
                    tabIndex={-1}
                    className="ss-hidden-select"
                    name={name}
                    value={value}
                    required={required}
                    onChange={() => {}}
                    aria-hidden="true"
                >
                    <option value="">{placeholder}</option>
                    {normalizedOptions.map(opt => (
                        <option key={opt[normalizedValueField]} value={opt[normalizedValueField]}>
                            {opt[normalizedLabelField]}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
};

export default SearchableSelect;
