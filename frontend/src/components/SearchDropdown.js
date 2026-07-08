/**
 * Global Search Dropdown Component
 * Created by LOGIXINVENTOR (PVT) Ltd.
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

const SearchDropdown = ({ results, loading, error, query, onClose }) => {
    const navigate = useNavigate();

    const getIcon = (type) => {
        switch (type) {
            case 'Lead': return <IdCard />;
            case 'Customer': return <Users />;
            case 'Vehicle': return <Truck />;
            case 'Part': return <Layers />;
            case 'Invoice': return <FileText />;
            case 'Quotation': return <FileText />;
            case 'Booking': return <ClipboardList />;
            case 'Sales Order': return <FileText />;
            case 'Appointment': return <Calendar />;
            case 'Job Card': return <Wrench />;
            case 'User': return <User />;
            default: return <FileText />;
        }
    };

    const handleResultClick = (link) => {
        navigate(link);
        onClose();
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
            <div className="search-results-section">
                {results.map((result, index) => (
                    <div
                        key={`${result.type}-${result.id}-${index}`}
                        className="search-result-item"
                        onClick={() => handleResultClick(result.link)}
                    >
                        <div className="result-icon">
                            {getIcon(result.type)}
                        </div>
                        <div className="result-content">
                            <div className="result-title">{result.title}</div>
                            <div className="result-subtitle">{result.subtitle}</div>
                        </div>
                        <div className="result-type">{result.type}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SearchDropdown;
