/**
 * Global Search Dropdown Component
 * Maintained by Hussain Developer
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User,
    Users,
    Truck,
    Wrench,
    FileText,
    ClipboardList,
    Calendar,
    IdCard,
    Layers,
    AlertCircle
} from 'lucide-react';
import '../styles/searchDropdown.css';

const SearchDropdown = ({ results, loading, error, query, onClose, activeIndex = 0, suggestions = [] }) => {
    const navigate = useNavigate();

    const getIcon = (type) => {
        switch (type) {
            case 'Lead': return <IdCard />;
            case 'Customer': return <Users />;
            case 'Vehicle': return <Truck />;
            case 'Part':
            case 'Product': return <Layers />;
            case 'Invoice': return <FileText />;
            case 'Quotation': return <FileText />;
            case 'Booking': return <ClipboardList />;
            case 'Sales Order':
            case 'Order': return <FileText />;
            case 'Employee': return <IdCard />;
            case 'Appointment': return <Calendar />;
            case 'Job Card': return <Wrench />;
            case 'User': return <User />;
            default: return <FileText />;
        }
    };

    const handleResultClick = (link) => {
        if (!link) return;
        navigate(link);
        onClose();
    };
    const highlight = (value) => {
        const escaped = String(value || '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
        if (!query) return escaped;
        return escaped.replace(new RegExp(`(${query.trim().split(/\s+/).filter(Boolean).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig'), '<mark>$1</mark>');
    };

    if (loading) {
            return (
            <div className="search-dropdown">
                <div className="search-loading">
                    <div className="spinner"></div>
                    <p>Searching ERP...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="search-dropdown">
                <div className="search-error">
                    <AlertCircle size={32} style={{ margin: '0 auto 1rem', color: 'var(--error-500)' }} />
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    if (!results || results.length === 0) {
        return (
            <div className="search-dropdown">
                <div className="search-no-results">
                    <p>No results found for "<strong>{query}</strong>"</p>
                </div>
            </div>
        );
    }

    return (
        <div className="search-dropdown">
        {suggestions.length > 0 && <div className="search-suggestions"><small>Suggestions</small>{suggestions.slice(0, 5).map(item => <button key={item} onClick={() => { onClose(); navigate(`/search?q=${encodeURIComponent(item)}`); }}>{item}</button>)}</div>}
        <div className="search-results-section" id="global-search-results" role="listbox" aria-label="Search results">
                {results.map((result, index) => (
                    <div
                        key={`${result.type}-${result.id}-${index}`}
                        className={`search-result-item ${index === activeIndex ? 'active' : ''}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        onClick={() => handleResultClick(result.link || result.url)}
                    >
                        <div className="result-icon">
                            {getIcon(result.type)}
                        </div>
                        <div className="result-content">
                            <div className="result-title" dangerouslySetInnerHTML={{__html:highlight(result.title)}} />
                            <div className="result-subtitle" dangerouslySetInnerHTML={{__html:highlight(result.subtitle)}} />
                        </div>
                        <div className="result-type">{result.type}</div>
                    </div>
                ))}
                <button className="search-view-all" onClick={() => { navigate(`/search?q=${encodeURIComponent(query)}`); onClose(); }}>View all results</button>
            </div>
        </div>
    );
};

export default SearchDropdown;
