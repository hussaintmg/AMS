import React from 'react';
import logo from '../assets/logo.png';
import { useBranding } from '../context/BrandingContext';

const Splash = () => {
    const { branding } = useBranding();
    const loadingLogo = branding?.loadingLogo?.publicUrl || branding?.loadingLogo?.url || logo;
    const applicationName = branding?.applicationName || 'OMODA | JAECOO';

    return (
        <div className="splash-container">
            <div className="splash-content">
                <div className="splash-logo-wrapper">
                    <div className="splash-ring"></div>
                    <img src={loadingLogo} alt={`${applicationName} Logo`} className="splash-logo" style={{ width: '200px', height: 'auto' }} />
                </div>
                <h1 className="splash-title">{applicationName}</h1>
                <p className="splash-subtitle">Auto Management System - Gulberg</p>
                <div className="splash-loader">
                    <div className="splash-loader-bar"></div>
                </div>
            </div>
        </div>
    );
};

export default Splash;
