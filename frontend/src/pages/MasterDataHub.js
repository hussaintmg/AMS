/**
 * Master Data hub — entry points to all reference-data CRUD screens
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/userManagement.css';

const MASTER_LINKS = [
    {
        to: '/lead-master',
        title: 'Customer & lead master',
        description: 'Sources, segments, and CRM reference data used on leads and customers.',
        roles: ['super_admin', 'admin', 'sales_manager']
    },
    {
        to: '/sales-master',
        title: 'Sales master data',
        description: 'Price lists, terms, and sales configuration for quotations and orders.',
        roles: ['super_admin', 'admin', 'sales_manager']
    },
    {
        to: '/vehicle-master',
        title: 'Vehicle master data',
        description: 'Makes, models, variants, colors, part categories, and suppliers.',
        roles: ['super_admin', 'admin', 'inventory_manager']
    },
    {
        to: '/service-master',
        title: 'Service master data',
        description: 'Service types, labor rates, packages, and warranty definitions.',
        roles: ['super_admin', 'admin', 'service_manager']
    },
    {
        to: '/warehouses',
        title: 'Warehouses',
        description: 'Storage locations, codes, and warehouse CRUD.',
        roles: ['super_admin', 'admin', 'manager', 'inventory_manager']
    },
    {
        to: '/admin/users',
        title: 'Users',
        description: 'System accounts, roles assignment, and activation.',
        roles: ['super_admin']
    },
    {
        to: '/admin/roles',
        title: 'Roles & permissions',
        description: 'Security roles and module permissions.',
        roles: ['super_admin']
    },
    {
        to: '/admin/departments',
        title: 'Departments',
        description: 'Organizational structure and department hierarchy.',
        roles: ['super_admin']
    },
    {
        to: '/admin/statuses',
        title: 'Statuses',
        description: 'Centralized workflow statuses across ERP tables.',
        roles: ['super_admin']
    },
    {
        to: '/hr/expenses#categories',
        title: 'Expense categories & GL',
        description: 'Workshop, general, and salary expense categories mapped to accounts.',
        roles: ['super_admin', 'admin', 'accountant', 'hr_admin']
    },
    {
        to: '/payment-methods',
        title: 'Payment methods',
        description: 'Cash, bank, card, and custom payment channels.',
        roles: ['super_admin']
    }
];

function MasterDataHub() {
    const { hasRole } = useAuth();
    const visible = MASTER_LINKS.filter((item) => hasRole(item.roles));

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1>Master data</h1>
                    <p className="text-muted">
                        Reference data and configuration used across the ERP. Open any card to manage full CRUD for that area.
                    </p>
                </div>
            </div>

            <div className="master-data-grid">
                {visible.map((item) => (
                    <Link key={item.to} to={item.to} className="master-data-card">
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                        <span className="master-data-card-cta">Open →</span>
                    </Link>
                ))}
            </div>

            {!visible.length && (
                <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                    <p>No master data modules are available for your role.</p>
                </div>
            )}
        </div>
    );
}

export default MasterDataHub;
