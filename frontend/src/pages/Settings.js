/**
 * ERP Settings Page
 * Comprehensive settings management with tabs for Companies, Branches, Settings, Currencies, and Taxes
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import SearchableSelect from '../components/SearchableSelect';
import DocumentTemplatesTab from '../components/DocumentTemplatesTab';
import { erpSettingsAPI, paymentMethodsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ═══════════════════════════════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function Modal({ title, children, onClose, maxWidth = '600px' }) {
    return (
        <div className="modal-overlay">
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
                <button className="btn btn-primary" onClick={() => openModal('create')}>
                    + New Company
                </button>
            </div>

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
                                    <ActionButtons onEdit={() => openModal('edit', c)} onDelete={() => handleDelete(c.id)} />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

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
                    <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Branch</button>
                </div>
            </div>

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
                                        onEdit={() => openModal('edit', b)}
                                        onDelete={b.branch_type !== 'head_office' ? () => handleDelete(b.id) : null}
                                    />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

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
// SYSTEM SETTINGS TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SystemSettingsTab() {
    const [settings, setSettings] = useState({});
    const [grouped, setGrouped] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [changes, setChanges] = useState({});

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await erpSettingsAPI.getSettings();
            setSettings(res.data.data || []);
            setGrouped(res.data.grouped || {});
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleChange = (key, value) => {
        setChanges(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const settingsArray = Object.entries(changes).map(([key, value]) => ({ key, value }));
            await erpSettingsAPI.updateSettings(settingsArray);
            toast.success('Settings saved successfully');
            setChanges({});
            fetchData();
        } catch (error) {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const categoryLabels = {
        general: 'General Settings',
        company: 'Company Information',
        invoice: 'Invoice Settings',
        quotation: 'Quotation Settings',
        booking: 'Booking Settings',
        sales: 'Sales Settings',
        notification: 'Notification Settings'
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card">
            <div className="card-header">
                <h3>System Settings</h3>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || Object.keys(changes).length === 0}>
                    {saving ? 'Saving...' : 'Save Changes'} ({Object.keys(changes).length})
                </button>
            </div>

            <div style={{ padding: '20px' }}>
                {Object.entries(grouped).map(([category, settingsList]) => (
                    <div key={category} style={{ marginBottom: '30px' }}>
                        <h4 style={{ borderBottom: '2px solid var(--primary)', paddingBottom: '10px', marginBottom: '15px' }}>
                            {categoryLabels[category] || category}
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                            {settingsList.map(s => {
                                const currentValue = changes[s.setting_key] !== undefined ? changes[s.setting_key] : s.setting_value;
                                return (
                                    <div key={s.setting_key} className="form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontWeight: 500 }}>{s.display_name || s.setting_key}</label>
                                        {s.description && <small style={{ display: 'block', opacity: 0.7, marginBottom: '5px' }}>{s.description}</small>}
                                        {s.setting_type === 'boolean' ? (
                                            <SearchableSelect className="form-control" value={currentValue}
                                                onChange={e => handleChange(s.setting_key, e.target.value)}>
                                                <option value="true">Enabled</option>
                                                <option value="false">Disabled</option>
                                            </SearchableSelect>
                                        ) : s.setting_type === 'number' ? (
                                            <input type="number" className="form-control" value={currentValue}
                                                onChange={e => handleChange(s.setting_key, e.target.value)} />
                                        ) : (
                                            <input type="text" className="form-control" value={currentValue}
                                                onChange={e => handleChange(s.setting_key, e.target.value)} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCIES TAB COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function CurrenciesTab() {
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
                <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Currency</button>
            </div>

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
                                    onEdit={() => openModal('edit', c)}
                                    onDelete={!c.is_default ? () => handleDelete(c.id) : null}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

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
                <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Tax</button>
            </div>

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
                            <td><ActionButtons onEdit={() => openModal('edit', t)} onDelete={() => handleDelete(t.id)} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>

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

function PaymentMethodsTab() {
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', type: 'cash' });

    const typeLabels = {
        cash: '💵 Cash',
        bank: '🏦 Bank Transfer',
        card: '💳 Card',
        cheque: '📄 Cheque',
        online: '🌐 Online'
    };

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await paymentMethodsAPI.getAll();
            setPaymentMethods(res.data.data || []);
        } catch (error) {
            console.error('Error fetching payment methods:', error);
            toast.error('Failed to load payment methods');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        if (item && mode === 'edit') {
            setFormData({ name: item.name, type: item.type });
        } else {
            setFormData({ name: '', type: 'cash' });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'edit') {
                await paymentMethodsAPI.update(selectedItem.id, formData);
                toast.success('Payment method updated');
            } else {
                await paymentMethodsAPI.create(formData);
                toast.success('Payment method created');
            }
            setShowModal(false);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save payment method');
        }
    };

    const handleToggleStatus = async (item) => {
        try {
            await paymentMethodsAPI.toggleStatus(item.id);
            toast.success(`Payment method ${item.is_active ? 'deactivated' : 'activated'}`);
            fetchData();
        } catch (error) {
            toast.error('Failed to toggle status');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this payment method?')) return;
        try {
            await paymentMethodsAPI.delete(id);
            toast.success('Payment method deleted');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete payment method');
        }
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card">
            <div className="card-header">
                <h3>Payment Methods</h3>
                <button className="btn btn-primary" onClick={() => openModal('create')}>
                    <span className="material-icons" style={{ fontSize: '16px', marginRight: '5px', verticalAlign: 'middle' }}>add</span>
                    New Payment Method
                </button>
            </div>

            <div style={{ padding: '15px' }}>
                <p style={{ color: '#6c757d', marginBottom: '15px' }}>
                    <span className="material-icons" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '5px' }}>info</span>
                    Payment methods configured here appear in invoice payment dropdowns. Toggle status to show/hide in invoices.
                </p>
            </div>

            <table className="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Usage Count</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {paymentMethods.length === 0 ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center' }}>No payment methods found</td></tr>
                    ) : (
                        paymentMethods.map(pm => (
                            <tr key={pm.id}>
                                <td><strong>{pm.name}</strong></td>
                                <td>
                                    <span style={{
                                        padding: '4px 12px',
                                        borderRadius: '4px',
                                        fontSize: '0.85rem',
                                        backgroundColor: pm.type === 'cash' ? '#e8f5e9' :
                                            pm.type === 'bank' ? '#e3f2fd' :
                                                pm.type === 'card' ? '#fff3e0' :
                                                    pm.type === 'cheque' ? '#f3e5f5' : '#e0f7fa'
                                    }}>
                                        {typeLabels[pm.type] || pm.type}
                                    </span>
                                </td>
                                <td>
                                    <button
                                        className={`badge ${pm.is_active ? 'badge-success' : 'badge-secondary'}`}
                                        onClick={() => handleToggleStatus(pm)}
                                        style={{ cursor: 'pointer', border: 'none', padding: '6px 12px' }}
                                        title={`Click to ${pm.is_active ? 'deactivate' : 'activate'}`}
                                    >
                                        <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px', verticalAlign: 'middle' }}>
                                            {pm.is_active ? 'check_circle' : 'cancel'}
                                        </span>
                                        {pm.is_active ? 'Active' : 'Inactive'}
                                    </button>
                                </td>
                                <td>
                                    <span className="badge badge-info">{pm.usage_count || 0} payments</span>
                                </td>
                                <td>
                                    <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-sm btn-warning" onClick={() => openModal('edit', pm)} title="Edit">
                                            <span className="material-icons" style={{ fontSize: '16px' }}>edit</span>
                                        </button>
                                        {(pm.usage_count || 0) === 0 && (
                                            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(pm.id)} title="Delete">
                                                <span className="material-icons" style={{ fontSize: '16px' }}>delete</span>
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {showModal && (
                <Modal title={`${modalMode === 'create' ? 'Create' : 'Edit'} Payment Method`} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Method Name *</label>
                            <input
                                type="text"
                                className="form-control"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                                placeholder="e.g., Cash, Bank Transfer, Credit Card"
                            />
                        </div>
                        <div className="form-group">
                            <label>Type *</label>
                            <SearchableSelect
                                className="form-control"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                            >
                                <option value="cash">💵 Cash</option>
                                <option value="bank">🏦 Bank Transfer</option>
                                <option value="card">💳 Card (Credit/Debit)</option>
                                <option value="cheque">📄 Cheque</option>
                                <option value="online">🌐 Online Payment</option>
                            </SearchableSelect>
                        </div>
                        <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary">
                                {modalMode === 'create' ? 'Create' : 'Update'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SETTINGS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const SETTINGS_HASH_TABS = ['company', 'branches', 'settings', 'currencies', 'taxes', 'doc-templates', 'payment-methods'];

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
        { id: 'settings', label: 'System Settings', icon: 'settings' },
        { id: 'currencies', label: 'Currencies', icon: 'attach_money' },
        { id: 'taxes', label: 'Tax Config', icon: 'receipt' },
        { id: 'doc-templates', label: 'Print Templates', icon: 'description' },
        { id: 'payment-methods', label: 'Payment Methods', icon: 'payments' }
    ];

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>ERP Settings</h1>
                    <p>Manage companies, branches, system settings, currencies, and tax configurations</p>
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
            {activeTab === 'settings' && <SystemSettingsTab />}
            {activeTab === 'currencies' && <CurrenciesTab />}
            {activeTab === 'taxes' && <TaxesTab />}
            {activeTab === 'doc-templates' && <DocumentTemplatesTab />}
            {activeTab === 'payment-methods' && <PaymentMethodsTab />}
        </div>
    );
}

export default Settings;