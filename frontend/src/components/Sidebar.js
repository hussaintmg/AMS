/**
 * Sidebar Component
 * Maintained by Hussain Developer
 * AMS ERP
 */

import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { useServerManagement } from '../context/ServerManagementContext';
import { useBranding } from '../context/BrandingContext';
import logo from '../assets/white_logo.png';

const DEFAULT_ICON = 'FileText';

const Icon = ({ name }) => {
    const Comp = name && Icons[name] && typeof Icons[name]?.render === 'function' ? Icons[name] : Icons[DEFAULT_ICON];
    return <Comp size={18} strokeWidth={2} />;
};

function Sidebar({ isOpen, onClose }) {
    const location = useLocation();
    const { branding } = useBranding();
    const { sidebarPages, loadSidebar } = useServerManagement();
    const [pages, setPages] = useState([]);

    useEffect(() => {
        const doLoad = async () => {
            try {
                await loadSidebar();
            } catch (e) {
                // sidebar load failed
            }
        };
        doLoad();
        window.addEventListener('ams:sidebar-refresh', doLoad);
        return () => window.removeEventListener('ams:sidebar-refresh', doLoad);
    }, [loadSidebar]);

    useEffect(() => {
        if (sidebarPages.length) setPages(sidebarPages);
    }, [sidebarPages]);

    useEffect(() => {
        onClose && onClose();
    }, [location.pathname]);

    const groupedPages = useMemo(() => {
        return pages.reduce((groups, page) => {
            const section = page.group || page.module || 'General';
            if (!groups[section]) groups[section] = [];
            groups[section].push(page);
            return groups;
        }, {});
    }, [pages]);

    const sidebarLogo = branding?.sidebarLogo?.publicUrl || branding?.sidebarLogo?.url || logo;
    const applicationName = branding?.applicationName || 'OMODA | JAECOO';

    return (
        <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
            <div className="sidebar-logo">
                <img src={sidebarLogo} alt={applicationName} style={{ height: '40px', width: 'auto', marginRight: '10px' }} />
                <h1 style={{ fontSize: '0.9rem' }}>{applicationName}</h1>
                <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
                    <Icons.X size={24} />
                </button>
            </div>

            <nav className="sidebar-nav">
                {Object.entries(groupedPages).map(([section, items]) => (
                    <div key={section} className="nav-section">
                        <div className="nav-section-title">{section}</div>
                        {items.map((item) => (
                            <NavLink
                                key={item._id || item.path}
                                to={item.path}
                                className={({ isActive }) => {
                                    let active = isActive;
                                    if (item.path.includes('#')) {
                                        const [pathname, hashPart] = item.path.split('#');
                                        active = location.pathname === pathname && (location.hash || '').replace(/^#/, '') === hashPart;
                                    }
                                    return `nav-item ${active ? 'active' : ''}`;
                                }}
                                end={item.path === '/' || item.path === '/dashboard'}
                            >
                                <Icon name={item.icon} />
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>
        </aside>
    );
}

export default Sidebar;
