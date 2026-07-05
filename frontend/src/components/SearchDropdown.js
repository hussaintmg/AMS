/**
 * Global Search Dropdown Component
 * Created by LOGIXINVENTOR (PVT) Ltd.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    UserIcon,
    UsersIcon,
    TruckIcon,
    WrenchIcon,
    DocumentTextIcon,
    ClipboardDocumentListIcon,
    CalendarIcon,
    IdentificationIcon,
    Square3Stack3DIcon,
    ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import '../styles/searchDropdown.css';

const SearchDropdown = ({ results, loading, error, query, onClose }) => {
    const navigate = useNavigate();

    const getIcon = (type) => {
        switch (type) {
            case 'Lead': return <IdentificationIcon />;
            case 'Customer': return <UsersIcon />;
            case 'Vehicle': return <TruckIcon />;
            case 'Part': return <Square3Stack3DIcon />;
            case 'Invoice': return <DocumentTextIcon />;
            case 'Quotation': return <DocumentTextIcon />;
            case 'Booking': return <ClipboardDocumentListIcon />;
            case 'Sales Order': return <DocumentTextIcon />;
            case 'Appointment': return <CalendarIcon />;
            case 'Job Card': return <WrenchIcon />;
            case 'User': return <UserIcon />;
            default: return <DocumentTextIcon />;
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
                    <ExclamationCircleIcon style={{ width: '2rem', height: '2rem', margin: '0 auto 1rem', color: 'var(--error-500)' }} />
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
