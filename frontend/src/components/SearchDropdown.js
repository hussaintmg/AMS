import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, History, TrendingUp, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useSearch } from '../context/SearchContext';
import '../styles/searchDropdown.css';

const ICON_MAP = {
  UserPlus: '👤',
  Users: '👥',
  FileText: '📄',
  ShoppingCart: '🛒',
  CalendarCheck: '📅',
  Truck: '🚛',
  Package: '📦',
  Briefcase: '💼',
  Calendar: '📋',
  DollarSign: '💰',
  BookOpen: '📖',
  UserCircle: '👤',
  Building2: '🏢',
  Wrench: '🔧',
  ClipboardList: '📋',
  Warehouse: '🏭',
  Mail: '📧',
  Layout: '📐',
  CreditCard: '💳',
  CheckCircle2: '✅',
  File: '📁',
};

function ModuleIcon({ icon, size = 16 }) {
  const emoji = ICON_MAP[icon] || '📄';
  return <span className="search-dropdown-icon" style={{ fontSize: size }}>{emoji}</span>;
}

export default function SearchDropdown({ isOpen, onClose }) {
  const navigate = useNavigate();
  const {
    searchQuery, setSearchQuery,
    searchResults, isSearching,
    suggestions, searchHistory,
    performSearch, loadHistory,
    clearHistory, recordClick,
  } = useSearch();

  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [totalItems, setTotalItems] = useState(0);
  const [inputReadOnly, setInputReadOnly] = useState(true);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const isInputFocused = useRef(false);
  const isTouchDevice = useRef(
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  ).current;

  useEffect(() => {
    if (isOpen) {
      if (!isTouchDevice) {
        inputRef.current?.focus();
      }
      setInputReadOnly(isTouchDevice);
      loadHistory();
    } else {
      setSelectedIndex(-1);
      setInputReadOnly(true);
    }
  }, [isOpen, loadHistory]);

  const handleInputInteract = useCallback(() => {
    if (inputReadOnly) {
      setInputReadOnly(false);
      inputRef.current?.focus();
    }
  }, [inputReadOnly]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchQuery]);

  const flatItems = useCallback(() => {
    const items = [];
    if (suggestions.length > 0) {
      items.push({ type: 'suggestions_header', label: 'Suggestions' });
      suggestions.forEach((s, i) => {
        items.push({ type: 'suggestion', ...s, index: i });
      });
    }
    if (searchResults?.groups) {
      searchResults.groups.forEach((group, gi) => {
        items.push({ type: 'group_header', label: group.module, moduleKey: group.moduleKey });
        group.results.forEach((result, ri) => {
          items.push({ type: 'result', ...result, groupIndex: gi, resultIndex: ri });
        });
      });
    }
    if (!searchQuery && searchHistory.length > 0) {
      items.push({ type: 'history_header', label: 'Recent Searches' });
      searchHistory.forEach((h, i) => {
        items.push({ type: 'history', ...h, index: i });
      });
    }
    return items;
  }, [suggestions, searchResults, searchHistory, searchQuery]);

  useEffect(() => {
    setTotalItems(flatItems().filter(i => ['result', 'suggestion', 'history'].includes(i.type)).length);
  }, [flatItems]);

  const handleKeyDown = (e) => {
    const items = flatItems();
    const selectable = items.filter(i => ['result', 'suggestion', 'history'].includes(i.type));

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < selectable.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : selectable.length - 1));
        break;
      case 'Enter': {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < selectable.length) {
          const item = selectable[selectedIndex];
          handleItemClick(item);
        } else if (searchQuery) {
          navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
          onClose();
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  const handleItemClick = async (item) => {
    if (item.type === 'result') {
      await recordClick(searchQuery, item.entityType, item.entityId, item.resultIndex, item.url);
      navigate(item.url);
      onClose();
    } else if (item.type === 'suggestion') {
      setSearchQuery(item.title?.replace(/<[^>]*>/g, '') || '');
    } else if (item.type === 'history') {
      setSearchQuery(item.query);
    }
  };

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('.search-dd-item');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const selectables = flatItems();

  const renderItemContent = (item, idx) => {
    switch (item.type) {
      case 'suggestions_header':
      case 'group_header':
      case 'history_header':
        return (
          <div className="search-dd-header">
            {item.type === 'history_header' && <History size={14} />}
            {item.type === 'suggestions_header' && <TrendingUp size={14} />}
            <span>{item.label}</span>
            {item.type === 'history_header' && (
              <button className="search-dd-clear-btn" onClick={(e) => { e.stopPropagation(); clearHistory(); }}>
                Clear
              </button>
            )}
          </div>
        );
      case 'result': {
        const isSelected = idx === selectedIndex;
        return (
          <div
            className={`search-dd-item search-dd-result ${isSelected ? 'selected' : ''}`}
            onClick={() => handleItemClick(item)}
            onMouseEnter={() => setSelectedIndex(idx)}
          >
            <ModuleIcon icon={item.icon} />
            <div className="search-dd-result-text">
              <span className="search-dd-title" dangerouslySetInnerHTML={{ __html: item.title }} />
              <span className="search-dd-subtitle">{item.subtitle}</span>
            </div>
            <span className="search-dd-module-badge">{item.moduleName}</span>
          </div>
        );
      }
      case 'suggestion': {
        const isSelected = idx === selectedIndex;
        return (
          <div
            className={`search-dd-item search-dd-suggestion ${isSelected ? 'selected' : ''}`}
            onClick={() => handleItemClick(item)}
            onMouseEnter={() => setSelectedIndex(idx)}
          >
            <Search size={14} />
            <span className="search-dd-title" dangerouslySetInnerHTML={{ __html: item.title }} />
          </div>
        );
      }
      case 'history': {
        const isSelected = idx === selectedIndex;
        return (
          <div
            className={`search-dd-item search-dd-history ${isSelected ? 'selected' : ''}`}
            onClick={() => handleItemClick(item)}
            onMouseEnter={() => setSelectedIndex(idx)}
          >
            <History size={14} />
            <span className="search-dd-title">{item.query}</span>
          </div>
        );
      }
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="search-dropdown-overlay open" onClick={onClose}>
      <div className="search-dropdown" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="search-dd-input-wrapper">
          <Search size={18} className="search-dd-input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-dd-input"
            placeholder="Search anything... (leads, invoices, vehicles, etc.)"
            value={searchQuery}
            readOnly={inputReadOnly}
            onFocus={() => { isInputFocused.current = true; }}
            onBlur={() => { isInputFocused.current = false; }}
            onTouchStart={handleInputInteract}
            onClick={handleInputInteract}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.length >= 2) performSearch(e.target.value);
            }}
            onKeyDown={handleKeyDown}
          />
          {isSearching && <Loader2 size={16} className="search-dd-spinner" />}
          {searchQuery && (
            <button className="search-dd-clear-input" onClick={() => setSearchQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="search-dd-body" ref={listRef}>
          {isSearching && searchQuery.length >= 2 && (
            <div className="search-dd-state">
              <Loader2 size={20} className="search-dd-spinner" />
              <span>Searching...</span>
            </div>
          )}

          {!isSearching && searchQuery && searchResults?.total === 0 && (
            <div className="search-dd-state">
              <Search size={20} />
              <span>No results found for "{searchQuery}"</span>
              <button
                className="search-dd-view-all-btn"
                onClick={() => { navigate(`/search?q=${encodeURIComponent(searchQuery)}`); onClose(); }}
              >
                Search everything for "{searchQuery}"
              </button>
            </div>
          )}

          {!isSearching && searchQuery && searchResults?.total > 0 && (
            <div className="search-dd-results-count">
              {searchResults.total} result{searchResults.total !== 1 ? 's' : ''} found
              {searchResults.duration ? ` (${(searchResults.duration / 1000).toFixed(1)}s)` : ''}
            </div>
          )}

          {selectables.map((item, idx) => (
            <React.Fragment key={`${item.type}_${idx}`}>
              {renderItemContent(item, idx)}
            </React.Fragment>
          ))}

          {!isSearching && !searchQuery && searchHistory.length === 0 && (
            <div className="search-dd-state">
              <Search size={20} />
              <span>Type to search across all modules</span>
              <span className="search-dd-hint">Use Ctrl+K to open command palette</span>
            </div>
          )}

          {!isSearching && searchQuery && searchResults?.total > 0 && (
            <button
              className="search-dd-view-all-btn"
              onClick={() => { navigate(`/search?q=${encodeURIComponent(searchQuery)}`); onClose(); }}
            >
              <Search size={14} />
              View all {searchResults.total} results
            </button>
          )}
        </div>

        <div className="search-dd-footer">
          <span><ArrowUp size={12} /> <ArrowDown size={12} /> Navigate</span>
          <span><kbd>Enter</kbd> Select</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
