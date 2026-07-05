import React, { useEffect } from 'react';
import '../styles/userManagement.css'; // We will put the styles here or in a new file

const ErrorPopup = ({ error, onClose }) => {
    if (!error) return null;

    return (
        <div className="error-popup-overlay">
            <div className="error-popup-content" onClick={e => e.stopPropagation()}>
                <div className="error-header">
                    <div className="error-icon-circle">
                        <span className="material-icons">error_outline</span>
                    </div>
                    <h3>Action Required</h3>
                </div>

                <div className="error-body">
                    <p className="error-message">{error.message || 'An unexpected error occurred.'}</p>

                    {error.resolution && (
                        <div className="error-resolution">
                            <div className="res-title">
                                <span className="material-icons">lightbulb</span>
                                <span>Suggested Resolution</span>
                            </div>
                            <p>{error.resolution}</p>
                        </div>
                    )}
                </div>

                <div className="error-footer">
                    <button className="btn btn-primary btn-full" onClick={onClose}>
                        I Understand
                    </button>
                    {/* Add a specific action button if needed later */}
                </div>
            </div>
        </div>
    );
};

export default ErrorPopup;
