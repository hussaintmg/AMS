/**
 * ERP Settings Page
 * Comprehensive settings management with tabs for Companies, Branches, Settings, Currencies, and Taxes
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-08
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import SearchableSelect from '../components/SearchableSelect';
import { erpSettingsAPI, paymentMethodsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { pageActions } from '../utils/roleJobs';

/**
 * Every tab here writes the same ERP Settings page and none of them asked
 * whether the role may — New Company, New Branch, New Currency, New Tax, New
 * Payment Method and every row's Edit/Delete were drawn for anyone who could
 * open Settings. One hook so each tab reads the same job row.
 */
const useSettingsActions = () => pageActions(useAuth().user, 'settings');
import toast from 'react-hot-toast';
import '../styles/userManagement.css';

// ═══════════════════════════════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function Modal({ title, children, onClose, maxWidth = '600px' }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            // Let an open SearchableSelect dropdown consume Esc first
            if (document.querySelector('.ss-portal-dropdown')) return;
            onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleOverlayMouseDown = (e) => {
        if (e.target !== e.currentTarget) return;
        // Clicking outside an open SearchableSelect dropdown should only close the dropdown
        if (document.querySelector('.ss-portal-dropdown')) return;
        onClose();
    };

    return (
        <div className="modal-overlay" onMouseDown={handleOverlayMouseDown}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth }}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
}

function ActionButtons({ onView, onEdit, onDelete, showView = false }) {
    return (
        <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
            {showView && onView && (
                <button className="btn btn-sm btn-info" onClick={onView} title="View">
                    <span className="material-icons" style={{ fontSize: '16px' }}>visibility</span>
                </button>
            )}
            {onEdit && (
                <button className="btn btn-sm btn-warning" onClick={onEdit} title="Edit">
                    <span className="material-icons" style={{ fontSize: '16px' }}>edit</span>
                </button>
            )}
            {onDelete && (
                <button className="btn btn-sm btn-danger" onClick={onDelete} title="Deactivate">
                    <span className="material-icons" style={{ fontSize: '16px' }}>block</span>
                </button>
            )}
        </div>
    );
}

function StatCard({ title, value, icon, color = 'primary' }) {
    return (
        <div className={`stat-card stat-${color}`} style={{ padding: '20px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h4 style={{ margin: 0, opacity: 0.8 }}>{title}</h4>
                    <h2 style={{ margin: '5px 0 0', fontSize: '28px' }}>{value}</h2>
                </div>
                <span className="material-icons" style={{ fontSize: '48px', opacity: 0.3 }}>{icon}</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function CompanyTab() {
    const can = useSettingsActions();
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [formData, setFormData] = useState({
        companyName: '', legalName: '', registrationNumber: '', taxId: '',
        email: '', phone: '', website: '', address: '', city: '', state: '',
        country: 'Pakistan', postalCode: '', currencyCode: 'PKR'
    });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await erpSettingsAPI.getCompanies({ active: true });
            setCompanies(res.data.data || []);
        } catch (error) {
            console.error('Error fetching companies:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        if (item && mode === 'edit') {
            setFormData({
                companyName: item.company_name || '', legalName: item.legal_name || '',
                registrationNumber: item.registration_number || '', taxId: item.tax_id || '',
                email: item.email || '', phone: item.phone || '', website: item.website || '',
                address: item.address || '', city: item.city || '', state: item.state || '',
                country: item.country || 'Pakistan', postalCode: item.postal_code || '',
                currencyCode: item.currency_code || 'PKR'
            });
        } else {
            setFormData({
                companyName: '', legalName: '', registrationNumber: '', taxId: '',
                email: '', phone: '', website: '', address: '', city: '', state: '',
                country: 'Pakistan', postalCode: '', currencyCode: 'PKR'
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'edit') {
                await erpSettingsAPI.updateCompany(selectedItem.id, formData);
                toast.success('Company updated successfully');
            } else {
                await erpSettingsAPI.createCompany(formData);
                toast.success('Company created successfully');
            }
            setShowModal(false);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save company');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to deactivate this company?')) return;
        try {
            await erpSettingsAPI.deleteCompany(id);
            toast.success('Company deactivated');
            fetchData();
        } catch (error) {
            toast.error('Failed to deactivate company');
        }
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card">
            <div className="card-header">
                <h3>Companies</h3>
                {can('create') && <button className="btn btn-primary" onClick={() => openModal('create')}>
                    + New Company
                </button>}
            </div>

            <div className="desktop-only table-scroll-x">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Company Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>City</th>
                            <th>Branches</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {companies.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center' }}>No companies found</td></tr>
                        ) : (
                            companies.map(c => (
                                <tr key={c.id}>
                                    <td><strong>{c.company_code}</strong></td>
                                    <td>{c.company_name}</td>
                                    <td>{c.email}</td>
                                    <td>{c.phone}</td>
                                    <td>{c.city}</td>
                                    <td><span className="badge badge-info">{c.branch_count || 0}</span></td>
                                    <td>
                                        <ActionButtons onEdit={can('edit') ? () => openModal('edit', c) : null} onDelete={can('delete') ? () => handleDelete(c.id) : null} />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mobile-only">
                <div className="mobile-cards-container">
                    {companies.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>No companies found</div>
                    ) : companies.map(c => (
                        <div key={c.id} className="data-card">
                            <div className="data-card-top">
                                <div className="data-card-avatar avatar-purple">{c.company_name?.[0] || 'C'}</div>
                                <div className="data-card-info">
                                    <span className="data-card-title">{c.company_name}</span>
                                    <span className="data-card-subtitle">{c.company_code}</span>
                                </div>
                            </div>
                            <div className="data-card-body">
                                <div className="data-card-row"><span className="row-icon">📧</span><span className="row-label">Email</span><span className="row-value">{c.email || '-'}</span></div>
                                <div className="data-card-row"><span className="row-icon">📞</span><span className="row-label">Phone</span><span className="row-value">{c.phone || '-'}</span></div>
                                <div className="data-card-row"><span className="row-icon">📍</span><span className="row-label">City</span><span className="row-value">{c.city || '-'}</span></div>
                                <div className="data-card-row"><span className="row-icon">🏢</span><span className="row-label">Branches</span><span className="row-value">{c.branch_count || 0}</span></div>
                            </div>
                            <div className="data-card-footer">
                                <ActionButtons onEdit={can('edit') ? () => openModal('edit', c) : null} onDelete={can('delete') ? () => handleDelete(c.id) : null} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showModal && (
                <Modal title={`${modalMode === 'create' ? 'Create' : 'Edit'} Company`} onClose={() => setShowModal(false)} maxWidth="700px">
                    <form onSubmit={handleSubmit}>
                        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div className="form-group">
                                <label>Company Name *</label>
                                <input type="text" className="form-control" value={formData.companyName}
                                    onChange={e => setFormData({ ...formData, companyName: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Legal Name</label>
                                <input type="text" className="form-control" value={formData.legalName}
                                    onChange={e => setFormData({ ...formData, legalName: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Registration Number</label>
                                <input type="text" className="form-control" value={formData.registrationNumber}
                                    onChange={e => setFormData({ ...formData, registrationNumber: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Tax ID / NTN</label>
                                <input type="text" className="form-control" value={formData.taxId}
                                    onChange={e => setFormData({ ...formData, taxId: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input type="email" className="form-control" value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Phone</label>
                                <input type="text" className="form-control" value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label>Website</label>
                                <input type="text" className="form-control" value={formData.website}
                                    onChange={e => setFormData({ ...formData, website: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label>Address</label>
                                <textarea className="form-control" rows="2" value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>City</label>
                                <input type="text" className="form-control" value={formData.city}
                                    onChange={e => setFormData({ ...formData, city: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>State/Province</label>
                                <input type="text" className="form-control" value={formData.state}
                                    onChange={e => setFormData({ ...formData, state: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Country</label>
                                <input type="text" className="form-control" value={formData.country}
                                    onChange={e => setFormData({ ...formData, country: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Currency</label>
                                <SearchableSelect className="form-control" value={formData.currencyCode}
                                    onChange={e => setFormData({ ...formData, currencyCode: e.target.value })}>
                                    <option value="PKR">PKR - Pakistani Rupee</option>
                                    <option value="USD">USD - US Dollar</option>
                                    <option value="EUR">EUR - Euro</option>
                                    <option value="GBP">GBP - British Pound</option>
                                </SearchableSelect>
                            </div>
                        </div>
                        <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary">{modalMode === 'create' ? 'Create' : 'Update'}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// BRANCHES TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function BranchesTab() {
    const can = useSettingsActions();
    const [branches, setBranches] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [managers, setManagers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [filter, setFilter] = useState({ companyId: '', branchType: '' });
    const [formData, setFormData] = useState({
        companyId: '', branchName: '', branchType: 'regional', managerId: '',
        email: '', phone: '', address: '', city: '', state: '', country: 'Pakistan'
    });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [branchRes, companyRes, managerRes] = await Promise.all([
                erpSettingsAPI.getBranches({ active: true, ...filter }),
                erpSettingsAPI.getCompanies({ active: true }),
                erpSettingsAPI.getManagers()
            ]);
            setBranches(branchRes.data.data || []);
            setCompanies(companyRes.data.data || []);
            setManagers(managerRes.data.data || []);
        } catch (error) {
            console.error('Error fetching branches:', error);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        if (item && mode === 'edit') {
            setFormData({
                companyId: item.company_id || '', branchName: item.branch_name || '',
                branchType: item.branch_type || 'regional', managerId: item.manager_id || '',
                email: item.email || '', phone: item.phone || '', address: item.address || '',
                city: item.city || '', state: item.state || '', country: item.country || 'Pakistan'
            });
        } else {
            setFormData({
                companyId: companies[0]?.id || '', branchName: '', branchType: 'regional', managerId: '',
                email: '', phone: '', address: '', city: '', state: '', country: 'Pakistan'
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'edit') {
                await erpSettingsAPI.updateBranch(selectedItem.id, formData);
                toast.success('Branch updated successfully');
            } else {
                await erpSettingsAPI.createBranch(formData);
                toast.success('Branch created successfully');
            }
            setShowModal(false);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save branch');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to deactivate this branch?')) return;
        try {
            await erpSettingsAPI.deleteBranch(id);
            toast.success('Branch deactivated');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to deactivate branch');
        }
    };

    const branchTypeLabels = {
        head_office: 'Head Office',
        regional: 'Regional',
        sales_center: 'Sales Center',
        service_center: 'Service Center',
        warehouse: 'Warehouse'
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card">
            <div className="card-header">
                <h3>Branches</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <SearchableSelect className="form-control" value={filter.branchType}
                        onChange={e => setFilter({ ...filter, branchType: e.target.value })} style={{ width: '150px' }}>
                        <option value="">All Types</option>
                        <option value="head_office">Head Office</option>
                        <option value="regional">Regional</option>
                        <option value="sales_center">Sales Center</option>
                        <option value="service_center">Service Center</option>
                        <option value="warehouse">Warehouse</option>
                    </SearchableSelect>
                    {can('create') && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Branch</button>}
                </div>
            </div>

            <div className="desktop-only table-scroll-x">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Branch Name</th>
                            <th>Company</th>
                            <th>Type</th>
                            <th>Manager</th>
                            <th>City</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {branches.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center' }}>No branches found</td></tr>
                        ) : (
                            branches.map(b => (
                                <tr key={b.id}>
                                    <td><strong>{b.branch_code}</strong></td>
                                    <td>{b.branch_name}</td>
                                    <td>{b.company_name}</td>
                                    <td><span className={`badge badge-${b.branch_type === 'head_office' ? 'primary' : 'secondary'}`}>
                                        {branchTypeLabels[b.branch_type] || b.branch_type}
                                    </span></td>
                                    <td>{b.manager_name || '-'}</td>
                                    <td>{b.city}</td>
                                    <td>
                                        <ActionButtons
                                            onEdit={can('edit') ? () => openModal('edit', b) : null}
                                            onDelete={b.branch_type !== 'head_office' ? () => handleDelete(b.id) : null}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mobile-only">
                <div className="mobile-cards-container">
                    {branches.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>No branches found</div>
                    ) : branches.map(b => (
                        <div key={b.id} className="data-card">
                            <div className="data-card-top">
                                <div className="data-card-avatar avatar-cyan">{b.branch_name?.[0] || 'B'}</div>
                                <div className="data-card-info">
                                    <span className="data-card-title">{b.branch_name}</span>
                                    <span className="data-card-subtitle">{b.branch_code}</span>
                                </div>
                                <span className={`badge-pill ${b.branch_type === 'head_office' ? 'status-active' : 'status-pending'}`}>{branchTypeLabels[b.branch_type] || b.branch_type}</span>
                            </div>
                            <div className="data-card-body">
                                <div className="data-card-row"><span className="row-icon">🏢</span><span className="row-label">Company</span><span className="row-value">{b.company_name}</span></div>
                                <div className="data-card-row"><span className="row-icon">👤</span><span className="row-label">Manager</span><span className="row-value">{b.manager_name || '-'}</span></div>
                                <div className="data-card-row"><span className="row-icon">📍</span><span className="row-label">City</span><span className="row-value">{b.city}</span></div>
                            </div>
                            <div className="data-card-footer">
                                <ActionButtons
                                    onEdit={can('edit') ? () => openModal('edit', b) : null}
                                    onDelete={b.branch_type !== 'head_office' ? () => handleDelete(b.id) : null}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showModal && (
                <Modal title={`${modalMode === 'create' ? 'Create' : 'Edit'} Branch`} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Company *</label>
                            <SearchableSelect className="form-control" value={formData.companyId}
                                onChange={e => setFormData({ ...formData, companyId: e.target.value })} required>
                                <option value="">Select Company</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                            </SearchableSelect>
                        </div>
                        <div className="form-group">
                            <label>Branch Name *</label>
                            <input type="text" className="form-control" value={formData.branchName}
                                onChange={e => setFormData({ ...formData, branchName: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Branch Type *</label>
                            <SearchableSelect className="form-control" value={formData.branchType}
                                onChange={e => setFormData({ ...formData, branchType: e.target.value })}>
                                <option value="head_office">Head Office</option>
                                <option value="regional">Regional</option>
                                <option value="sales_center">Sales Center</option>
                                <option value="service_center">Service Center</option>
                                <option value="warehouse">Warehouse</option>
                            </SearchableSelect>
                        </div>
                        <div className="form-group">
                            <label>Manager</label>
                            <SearchableSelect className="form-control" value={formData.managerId}
                                onChange={e => setFormData({ ...formData, managerId: e.target.value })}>
                                <option value="">Select Manager</option>
                                {managers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
                            </SearchableSelect>
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input type="email" className="form-control" value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input type="text" className="form-control" value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Address</label>
                            <textarea className="form-control" rows="2" value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>City</label>
                            <input type="text" className="form-control" value={formData.city}
                                onChange={e => setFormData({ ...formData, city: e.target.value })} />
                        </div>
                        <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary">{modalMode === 'create' ? 'Create' : 'Update'}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCIES TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function CurrenciesTab() {
    const can = useSettingsActions();
    const [currencies, setCurrencies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [formData, setFormData] = useState({ code: '', name: '', symbol: '', exchangeRate: 1, isDefault: false });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await erpSettingsAPI.getCurrencies();
            setCurrencies(res.data.data || []);
        } catch (error) {
            console.error('Error fetching currencies:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        if (item && mode === 'edit') {
            setFormData({
                code: item.code, name: item.name, symbol: item.symbol,
                exchangeRate: item.exchange_rate, isDefault: item.is_default
            });
        } else {
            setFormData({ code: '', name: '', symbol: '', exchangeRate: 1, isDefault: false });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'edit') {
                await erpSettingsAPI.updateCurrency(selectedItem.id, formData);
                toast.success('Currency updated');
            } else {
                await erpSettingsAPI.createCurrency(formData);
                toast.success('Currency created');
            }
            setShowModal(false);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save currency');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to deactivate this currency?')) return;
        try {
            await erpSettingsAPI.deleteCurrency(id);
            toast.success('Currency deactivated');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to deactivate currency');
        }
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card">
            <div className="card-header">
                <h3>Currencies</h3>
                {can('create') && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Currency</button>}
            </div>

            <div className="desktop-only table-scroll-x">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Name</th>
                            <th>Symbol</th>
                            <th>Exchange Rate</th>
                            <th>Default</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currencies.map(c => (
                            <tr key={c.id}>
                                <td><strong>{c.code}</strong></td>
                                <td>{c.name}</td>
                                <td>{c.symbol}</td>
                                <td>{parseFloat(c.exchange_rate).toFixed(4)}</td>
                                <td>{c.is_default ? <span className="badge badge-success">Default</span> : '-'}</td>
                                <td><span className={`badge badge-${c.is_active ? 'success' : 'secondary'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                                <td>
                                    <ActionButtons
                                        onEdit={can('edit') ? () => openModal('edit', c) : null}
                                        onDelete={!c.is_default ? () => handleDelete(c.id) : null}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mobile-only">
                <div className="mobile-cards-container">
                    {currencies.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>No currencies found</div>
                    ) : currencies.map(c => (
                        <div key={c.id} className={`data-card ${!c.is_active ? 'card-inactive' : ''}`}>
                            <div className="data-card-top">
                                <div className="data-card-avatar avatar-green">{c.symbol || c.code?.[0] || '$'}</div>
                                <div className="data-card-info">
                                    <span className="data-card-title">{c.name}</span>
                                    <span className="data-card-subtitle">{c.code}</span>
                                </div>
                                {c.is_default && <span className="badge-pill status-active">Default</span>}
                                <span className={`badge-pill ${c.is_active ? 'status-active' : 'status-inactive'}`}>{c.is_active ? 'Active' : 'Inactive'}</span>
                            </div>
                            <div className="data-card-body">
                                <div className="data-card-row"><span className="row-icon">💱</span><span className="row-label">Symbol</span><span className="row-value">{c.symbol}</span></div>
                                <div className="data-card-row"><span className="row-icon">📊</span><span className="row-label">Rate</span><span className="row-value">{parseFloat(c.exchange_rate).toFixed(4)}</span></div>
                            </div>
                            <div className="data-card-footer">
                                <ActionButtons
                                    onEdit={can('edit') ? () => openModal('edit', c) : null}
                                    onDelete={!c.is_default ? () => handleDelete(c.id) : null}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showModal && (
                <Modal title={`${modalMode === 'create' ? 'Create' : 'Edit'} Currency`} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Currency Code *</label>
                            <input type="text" className="form-control" value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                required maxLength={10} disabled={modalMode === 'edit'} />
                        </div>
                        <div className="form-group">
                            <label>Name *</label>
                            <input type="text" className="form-control" value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Symbol *</label>
                            <input type="text" className="form-control" value={formData.symbol}
                                onChange={e => setFormData({ ...formData, symbol: e.target.value })} required maxLength={10} />
                        </div>
                        <div className="form-group">
                            <label>Exchange Rate (to PKR)</label>
                            <input type="number" step="0.000001" className="form-control" value={formData.exchangeRate}
                                onChange={e => setFormData({ ...formData, exchangeRate: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label><input type="checkbox" checked={formData.isDefault}
                                onChange={e => setFormData({ ...formData, isDefault: e.target.checked })} /> Set as Default Currency</label>
                        </div>
                        <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary">{modalMode === 'create' ? 'Create' : 'Update'}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAXES TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function TaxesTab() {
    const can = useSettingsActions();
    const [taxes, setTaxes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [formData, setFormData] = useState({ taxName: '', taxCode: '', taxRate: 0, taxType: 'sales', description: '', isCompound: false });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await erpSettingsAPI.getTaxes();
            setTaxes(res.data.data || []);
        } catch (error) {
            console.error('Error fetching taxes:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        if (item && mode === 'edit') {
            setFormData({
                taxName: item.tax_name, taxCode: item.tax_code, taxRate: item.tax_rate,
                taxType: item.tax_type, description: item.description || '', isCompound: item.is_compound
            });
        } else {
            setFormData({ taxName: '', taxCode: '', taxRate: 0, taxType: 'sales', description: '', isCompound: false });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'edit') {
                await erpSettingsAPI.updateTax(selectedItem.id, formData);
                toast.success('Tax configuration updated');
            } else {
                await erpSettingsAPI.createTax(formData);
                toast.success('Tax configuration created');
            }
            setShowModal(false);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save tax');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to deactivate this tax?')) return;
        try {
            await erpSettingsAPI.deleteTax(id);
            toast.success('Tax deactivated');
            fetchData();
        } catch (error) {
            toast.error('Failed to deactivate tax');
        }
    };

    const taxTypeLabels = { sales: 'Sales Tax', service: 'Service Tax', vat: 'VAT', gst: 'GST', withholding: 'Withholding', custom: 'Custom' };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card">
            <div className="card-header">
                <h3>Tax Configurations</h3>
                {can('create') && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Tax</button>}
            </div>

            <div className="desktop-only table-scroll-x">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Tax Name</th>
                            <th>Type</th>
                            <th>Rate</th>
                            <th>Compound</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {taxes.map(t => (
                            <tr key={t.id}>
                                <td><strong>{t.tax_code}</strong></td>
                                <td>{t.tax_name}</td>
                                <td><span className="badge badge-info">{taxTypeLabels[t.tax_type] || t.tax_type}</span></td>
                                <td>{parseFloat(t.tax_rate).toFixed(2)}%</td>
                                <td>{t.is_compound ? 'Yes' : 'No'}</td>
                                <td><span className={`badge badge-${t.is_active ? 'success' : 'secondary'}`}>{t.is_active ? 'Active' : 'Inactive'}</span></td>
                                <td><ActionButtons onEdit={can('edit') ? () => openModal('edit', t) : null} onDelete={can('delete') ? () => handleDelete(t.id) : null} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mobile-only">
                <div className="mobile-cards-container">
                    {taxes.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>No taxes found</div>
                    ) : taxes.map(t => (
                        <div key={t.id} className={`data-card ${!t.is_active ? 'card-inactive' : ''}`}>
                            <div className="data-card-top">
                                <div className="data-card-avatar avatar-rose">%</div>
                                <div className="data-card-info">
                                    <span className="data-card-title">{t.tax_name}</span>
                                    <span className="data-card-subtitle">{t.tax_code}</span>
                                </div>
                                <span className={`badge-pill ${t.is_active ? 'status-active' : 'status-inactive'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                            </div>
                            <div className="data-card-body">
                                <div className="data-card-row"><span className="row-icon">🏷️</span><span className="row-label">Type</span><span className="row-value">{taxTypeLabels[t.tax_type] || t.tax_type}</span></div>
                                <div className="data-card-row"><span className="row-icon">📊</span><span className="row-label">Rate</span><span className="row-value">{parseFloat(t.tax_rate).toFixed(2)}%</span></div>
                                <div className="data-card-row"><span className="row-icon">🔄</span><span className="row-label">Compound</span><span className="row-value">{t.is_compound ? 'Yes' : 'No'}</span></div>
                            </div>
                            <div className="data-card-footer">
                                <ActionButtons onEdit={can('edit') ? () => openModal('edit', t) : null} onDelete={can('delete') ? () => handleDelete(t.id) : null} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showModal && (
                <Modal title={`${modalMode === 'create' ? 'Create' : 'Edit'} Tax Configuration`} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Tax Name *</label>
                            <input type="text" className="form-control" value={formData.taxName}
                                onChange={e => setFormData({ ...formData, taxName: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Tax Code *</label>
                            <input type="text" className="form-control" value={formData.taxCode}
                                onChange={e => setFormData({ ...formData, taxCode: e.target.value.toUpperCase() })}
                                required maxLength={20} disabled={modalMode === 'edit'} />
                        </div>
                        <div className="form-group">
                            <label>Tax Rate (%) *</label>
                            <input type="number" step="0.01" className="form-control" value={formData.taxRate}
                                onChange={e => setFormData({ ...formData, taxRate: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Tax Type</label>
                            <SearchableSelect className="form-control" value={formData.taxType}
                                onChange={e => setFormData({ ...formData, taxType: e.target.value })}>
                                <option value="sales">Sales Tax</option>
                                <option value="service">Service Tax</option>
                                <option value="vat">VAT</option>
                                <option value="gst">GST</option>
                                <option value="withholding">Withholding Tax</option>
                                <option value="custom">Custom</option>
                            </SearchableSelect>
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <textarea className="form-control" rows="2" value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label><input type="checkbox" checked={formData.isCompound}
                                onChange={e => setFormData({ ...formData, isCompound: e.target.checked })} /> Compound Tax (apply on tax-inclusive amount)</label>
                        </div>
                        <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary">{modalMode === 'create' ? 'Create' : 'Update'}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// MAIN SETTINGS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function PaymentMethodsTab() {
    const can = useSettingsActions();
    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', code: '', type: 'cash', description: '', sortOrder: 0 });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await paymentMethodsAPI.getAll();
            setMethods(res.data?.data || []);
        } catch (error) { toast.error(error.response?.data?.message || 'Failed to load payment methods'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openModal = (mode, item = null) => {
        setModalMode(mode); setSelectedItem(item);
        setFormData(item ? {
            name: item.name || '', code: item.code || '', type: item.type || 'cash',
            description: item.description || '', sortOrder: item.sort_order || 0,
        } : { name: '', code: '', type: 'cash', description: '', sortOrder: 0 });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'edit') await paymentMethodsAPI.update(selectedItem.id, formData);
            else await paymentMethodsAPI.create(formData);
            toast.success(`Payment method ${modalMode === 'edit' ? 'updated' : 'created'}`);
            setShowModal(false); fetchData();
        } catch (error) { toast.error(error.response?.data?.message || 'Failed to save payment method'); }
    };

    const toggle = async (id) => {
        try { await paymentMethodsAPI.toggleStatus(id); toast.success('Payment method status updated'); fetchData(); }
        catch (error) { toast.error(error.response?.data?.message || 'Failed to update status'); }
    };

    if (loading) return <div className="spinner" />;
    return (
        <div className="card">
            <div className="card-header"><h3>Payment Methods</h3>{can('create') && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Payment Method</button>}</div>
            <div className="desktop-only table-scroll-x">
                <table className="data-table"><thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Description</th><th>Usage</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>{methods.length === 0 ? <tr><td colSpan="7" style={{ textAlign: 'center' }}>No payment methods found</td></tr> : methods.map((m) => (
                        <tr key={m.id}><td><strong>{m.name}</strong></td><td>{m.code || '-'}</td><td><span className="badge badge-info">{m.type}</span></td><td>{m.description || '-'}</td><td>{m.usage_count || 0}</td><td><span className={`badge badge-${m.is_active ? 'success' : 'secondary'}`}>{m.is_active ? 'Active' : 'Inactive'}</span></td><td><ActionButtons onEdit={can('edit') ? () => openModal('edit', m) : null} showDelete={false} showToggle status={m.is_active} onToggle={can('edit') ? () => toggle(m.id) : null} /></td></tr>
                    ))}</tbody>
                </table>
            </div>
            <div className="mobile-only"><div className="mobile-cards-container">{methods.map((m) => (
                <div key={m.id} className="data-card"><div className="data-card-top"><div className="data-card-avatar avatar-blue">₨</div><div className="data-card-info"><span className="data-card-title">{m.name}</span><span className="data-card-subtitle">{m.code || m.type}</span></div><span className={`badge-pill ${m.is_active ? 'status-active' : 'status-inactive'}`}>{m.is_active ? 'Active' : 'Inactive'}</span></div><div className="data-card-body"><div className="data-card-row"><span className="row-label">Type</span><span className="row-value">{m.type}</span></div><div className="data-card-row"><span className="row-label">Usage</span><span className="row-value">{m.usage_count || 0}</span></div></div><div className="data-card-footer"><ActionButtons onEdit={can('edit') ? () => openModal('edit', m) : null} onDelete={can('delete') ? () => toggle(m.id) : null} /></div></div>
            ))}</div></div>
            {showModal && <Modal title={`${modalMode === 'create' ? 'Create' : 'Edit'} Payment Method`} onClose={() => setShowModal(false)}>
                <form onSubmit={handleSubmit}><div className="form-group"><label>Name *</label><input className="form-control" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div><div className="form-row"><div className="form-group"><label>Code</label><input className="form-control" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} /></div><div className="form-group"><label>Type *</label><SearchableSelect className="form-control" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank Transfer</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="online">Online Payment</option></SearchableSelect></div></div><div className="form-group"><label>Description</label><textarea className="form-control" rows="2" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div><div className="form-group"><label>Sort Order</label><input type="number" className="form-control" value={formData.sortOrder} onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })} /></div><div className="form-actions" style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" type="submit">{modalMode === 'create' ? 'Create' : 'Update'}</button></div></form>
            </Modal>}
        </div>
    );
}

const SETTINGS_HASH_TABS = ['company', 'branches', 'currencies', 'taxes', 'payments'];

function Settings() {
    const { user } = useAuth();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState('company');
    const [stats, setStats] = useState({});

    useEffect(() => {
        const hash = (location.hash || '').replace(/^#/, '');
        if (hash && SETTINGS_HASH_TABS.includes(hash)) {
            setActiveTab(hash);
        }
    }, [location.pathname, location.hash]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await erpSettingsAPI.getStats();
                setStats(res.data.data || {});
            } catch (error) {
                console.error('Error fetching stats:', error);
            }
        };
        fetchStats();
    }, []);

    const tabs = [
        { id: 'company', label: 'Companies', icon: 'business' },
        { id: 'branches', label: 'Branches', icon: 'store' },
        { id: 'currencies', label: 'Currencies', icon: 'attach_money' },
        { id: 'taxes', label: 'Tax Config', icon: 'receipt' },
        { id: 'payments', label: 'Payment Methods', icon: 'payments' },
    ];

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>ERP Settings</h1>
                    <p>Manage companies, branches, currencies, and tax configurations</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <StatCard title="Companies" value={stats.active_companies || 0} icon="business" color="primary" />
                <StatCard title="Branches" value={stats.active_branches || 0} icon="store" color="success" />
                <StatCard title="Currencies" value={stats.active_currencies || 0} icon="attach_money" color="warning" />
                <StatCard title="Tax Rules" value={stats.active_taxes || 0} icon="receipt" color="info" />
            </div>

            {/* Tab Navigation */}
            <div className="tab-nav" style={{ display: 'flex', gap: '5px', marginBottom: '20px', borderBottom: '2px solid var(--border-color)', paddingBottom: '0' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            borderRadius: '8px 8px 0 0', padding: '12px 20px',
                            borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : 'none'
                        }}
                    >
                        <span className="material-icons" style={{ fontSize: '18px' }}>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'company' && <CompanyTab />}
            {activeTab === 'branches' && <BranchesTab />}
            {activeTab === 'currencies' && <CurrenciesTab />}
            {activeTab === 'taxes' && <TaxesTab />}
            {activeTab === 'payments' && <PaymentMethodsTab />}

        </div>
    );
}

export default Settings;
