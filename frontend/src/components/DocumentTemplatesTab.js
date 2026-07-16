import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import SearchableSelect from './SearchableSelect';
import { erpSettingsAPI } from '../services/api';
import { mapCompanyForTemplate, interpolateDocumentTemplate } from '../utils/documentTemplateRender';

const DOC_TYPES = [
    { id: 'quotation', label: 'Quotations (/quotations)' },
    { id: 'booking', label: 'Bookings (/booking)' },
    { id: 'order', label: 'Sales orders (/orders)' },
    { id: 'invoice', label: 'Invoices (/invoices)' }
];

const SAMPLE_COMPANY = mapCompanyForTemplate({
    company_name: 'Sample Motors (Pvt) Ltd',
    company_code: 'COMP-0001',
    legal_name: 'Sample Motors (Pvt) Ltd',
    email: 'info@example.com',
    phone: '+92 300 0000000',
    website: 'https://example.com',
    address: '12 Main Boulevard',
    city: 'Lahore',
    state: 'Punjab',
    country: 'Pakistan',
    postal_code: '54000',
    tax_id: '1234567-8',
    registration_number: 'REG-001'
});

const SAMPLE_DOC_BASE = {
    quotation_number: 'QT-1001',
    booking_number: 'BK-2001',
    order_number: 'SO-3001',
    invoice_number: 'INV-4001',
    issue_date: new Date().toLocaleString(),
    status: 'SENT',
    printed_at: new Date().toLocaleString(),
    customer_name: 'Sample Customer',
    validity: '7 days',
    sale_type_label: 'Vehicle (inventory)',
    base_price: 'PKR 5,000,000.00',
    discount: 'PKR 0.00',
    tax: 'PKR 0.00',
    additional_charges: 'PKR 50,000.00',
    total: 'PKR 5,050,000.00',
    notes: 'Sample notes',
    terms: 'Sample terms',
    items_rows: '<tr><td>1</td><td>Sample vehicle line</td><td>Vehicle (inventory)</td></tr>',
    vehicle_line: 'Sample Make Model Variant',
    booking_amount: 'PKR 500,000.00',
    total_amount: 'PKR 5,000,000.00',
    expected_delivery: 'June 2026',
    priority: 'Normal',
    description: 'Sample VIN · vehicle description',
    payment_mode: 'Bank transfer',
    price_rows: '<tr><td>Vehicle price</td><td style="text-align:right;">PKR 5,000,000.00</td></tr>',
    grand_total: 'PKR 5,000,000.00',
    paid_amount: 'PKR 1,000,000.00',
    balance_due: 'PKR 4,000,000.00',
    letterhead_name: 'Sample Motors (Pvt) Ltd',
    letterhead_address: '12 Main Boulevard · Lahore',
    letterhead_contact: '+92 300 0000000 · info@example.com',
    letterhead_ntn: '1234567-8',
    customer_address: 'Customer address',
    customer_phone: '+92 301 0000000',
    customer_email: 'customer@example.com',
    invoice_date: new Date().toLocaleDateString(),
    due_date: new Date().toLocaleDateString(),
    subtotal: 'PKR 5,000,000.00',
    balance: 'PKR 2,000,000.00',
    payments_rows: `<tr><td>Bank</td><td>${new Date().toLocaleDateString()}</td><td style="text-align:right;">PKR 3,000,000.00</td></tr>`
};

function buildSampleContextForType(documentType) {
    const doc = { ...SAMPLE_DOC_BASE };
    if (documentType === 'invoice') {
        doc.items_rows = '<tr><td>Sample line item</td><td style="text-align:right;">1</td><td style="text-align:right;">PKR 5,000,000.00</td><td style="text-align:right;">PKR 0.00</td><td style="text-align:right;">PKR 5,000,000.00</td></tr>';
    } else if (documentType === 'quotation') {
        doc.items_rows = '<tr><td>1</td><td>Sample vehicle line</td><td>Vehicle (inventory)</td></tr>';
    } else if (documentType === 'order') {
        doc.price_rows = '<tr><td>Vehicle price</td><td style="text-align:right;">PKR 5,000,000.00</td></tr>';
    }
    return { company: SAMPLE_COMPANY, doc };
}

function ModalShell({ title, children, onClose, wide }) {
    return (
        <div className="modal-overlay">
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: wide ? 'min(1100px, 96vw)' : '720px', width: '100%' }}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button type="button" className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">{children}</div>
            </div>
        </div>
    );
}

export default function DocumentTemplatesTab() {
    const [rows, setRows] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selected, setSelected] = useState(null);
    const [previewHtml, setPreviewHtml] = useState('');
    const [form, setForm] = useState({
        documentType: 'quotation',
        name: '',
        htmlContent: '',
        companyId: '',
        isDefault: true
    });

    const fetchCompanies = useCallback(async () => {
        try {
            const res = await erpSettingsAPI.getCompanies({ active: true });
            setCompanies(res.data?.data || []);
        } catch (e) {
            console.error(e);
        }
    }, []);

    const fetchRows = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (filterType) params.documentType = filterType;
            const res = await erpSettingsAPI.getDocumentTemplates(params);
            setRows(res.data?.data || []);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load templates');
        } finally {
            setLoading(false);
        }
    }, [filterType]);

    useEffect(() => {
        fetchCompanies();
    }, [fetchCompanies]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const openCreate = async () => {
        setModalMode('create');
        setSelected(null);
        const dt = filterType || 'quotation';
        let starter = '';
        try {
            const res = await erpSettingsAPI.getDocumentTemplateDefault(dt);
            starter = res.data?.data?.html_content || '';
        } catch (e) {
            starter = '';
        }
        setForm({
            documentType: dt,
            name: 'Custom template',
            htmlContent: starter,
            companyId: '',
            isDefault: false
        });
        setPreviewHtml(starter ? interpolateDocumentTemplate(starter, buildSampleContextForType(dt)) : '');
        setShowModal(true);
    };

    const openEdit = async (row) => {
        try {
            const res = await erpSettingsAPI.getDocumentTemplate(row.id);
            const t = res.data?.data;
            if (!t) throw new Error('Not found');
            setModalMode('edit');
            setSelected(t);
            setForm({
                documentType: t.document_type,
                name: t.name,
                htmlContent: t.html_content || '',
                companyId: t.company_id != null ? String(t.company_id) : '',
                isDefault: !!t.is_default
            });
            setPreviewHtml(interpolateDocumentTemplate(t.html_content || '', buildSampleContextForType(t.document_type)));
            setShowModal(true);
        } catch (e) {
            toast.error('Failed to open template');
        }
    };

    const handleSeed = async () => {
        if (!window.confirm('Replace ALL document templates with factory defaults? Custom HTML will be lost.')) return;
        try {
            await erpSettingsAPI.seedDocumentTemplates();
            toast.success('Factory templates installed');
            fetchRows();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Seed failed');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                documentType: form.documentType,
                name: form.name,
                htmlContent: form.htmlContent,
                companyId: form.companyId === '' ? null : form.companyId,
                isDefault: !!form.isDefault
            };
            if (modalMode === 'create') {
                await erpSettingsAPI.createDocumentTemplate(payload);
                toast.success('Template created');
            } else {
                await erpSettingsAPI.updateDocumentTemplate(selected.id, payload);
                toast.success('Template updated');
            }
            setShowModal(false);
            fetchRows();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed');
        }
    };

    const handleDeactivate = async (id) => {
        if (!window.confirm('Deactivate this template?')) return;
        try {
            await erpSettingsAPI.deleteDocumentTemplate(id);
            toast.success('Template deactivated');
            fetchRows();
        } catch (e) {
            toast.error('Failed');
        }
    };

    const updatePreview = () => {
        setPreviewHtml(interpolateDocumentTemplate(form.htmlContent || '', buildSampleContextForType(form.documentType)));
    };

    if (loading && rows.length === 0) return <div className="spinner" />;

    return (
        <div className="card">
            <div className="card-header">
                <h3>Document HTML templates</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={handleSeed}>
                        Restore factory templates
                    </button>
                    <button type="button" className="btn btn-primary" onClick={openCreate}>+ New template</button>
                </div>
            </div>

            <div style={{ padding: '15px', color: '#6c757d' }}>
                <p style={{ margin: '0 0 8px' }}>
                    HTML used when printing from Sales → Quotations, Bookings, Orders, and Invoices. Use placeholders such as
                    <code style={{ margin: '0 4px' }}>{'{{company.company_name}}'}</code>,
                    <code style={{ margin: '0 4px' }}>{'{{doc.invoice_number}}'}</code>,
                    and for line blocks <code>{'{{doc.items_rows}}'}</code> (pre-rendered HTML rows).
                </p>
            </div>

            <div style={{ padding: '0 0 15px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontWeight: 600 }}>Filter type</label>
                <SearchableSelect
                    className="form-control"
                    style={{ maxWidth: '360px' }}
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                >
                    <option value="">All types</option>
                    {DOC_TYPES.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                </SearchableSelect>
                <button type="button" className="btn btn-secondary" onClick={fetchRows}>Refresh</button>
            </div>

            <table className="data-table">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Name</th>
                        <th>Scope</th>
                        <th>Default</th>
                        <th>Active</th>
                        <th>Size</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center' }}>No templates — run migration and open Sales or click Restore factory templates.</td></tr>
                    ) : (
                        rows.map((r) => (
                            <tr key={r.id}>
                                <td><strong>{r.document_type}</strong></td>
                                <td>{r.name}</td>
                                <td>{r.company_id == null ? 'All companies' : `Company #${r.company_id}`}</td>
                                <td>{r.is_default ? <span className="badge badge-primary">Yes</span> : '—'}</td>
                                <td>{r.is_active ? <span className="badge badge-success">Yes</span> : <span className="badge badge-secondary">No</span>}</td>
                                <td>{r.html_length != null ? `${r.html_length} chars` : '—'}</td>
                                <td>
                                    <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
                                        <button type="button" className="btn btn-sm btn-warning" onClick={() => openEdit(r)} title="Edit">
                                            <span className="material-icons" style={{ fontSize: '16px' }}>edit</span>
                                        </button>
                                        {r.is_active ? (
                                            <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDeactivate(r.id)} title="Deactivate">
                                                <span className="material-icons" style={{ fontSize: '16px' }}>block</span>
                                            </button>
                                        ) : null}
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {showModal && (
                <ModalShell
                    title={modalMode === 'create' ? 'Create template' : `Edit template #${selected?.id}`}
                    onClose={() => setShowModal(false)}
                    wide
                >
                    <form onSubmit={handleSubmit}>
                        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-group">
                                <label>Document type *</label>
                                <SearchableSelect
                                    className="form-control"
                                    value={form.documentType}
                                    onChange={(e) => setForm({ ...form, documentType: e.target.value })}
                                    required
                                    disabled={modalMode === 'edit'}
                                >
                                    {DOC_TYPES.map((d) => (
                                        <option key={d.id} value={d.id}>{d.label}</option>
                                    ))}
                                </SearchableSelect>
                            </div>
                            <div className="form-group">
                                <label>Name *</label>
                                <input
                                    className="form-control"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label>Company scope (optional)</label>
                                <SearchableSelect
                                    className="form-control"
                                    value={form.companyId}
                                    onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                                >
                                    <option value="">All companies (default for everyone)</option>
                                    {companies.map((c) => (
                                        <option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>
                                    ))}
                                </SearchableSelect>
                            </div>
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={form.isDefault}
                                        onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                                    />
                                    {' '}Set as default for this type and scope
                                </label>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>HTML *</label>
                            <textarea
                                className="form-control"
                                rows={16}
                                style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                value={form.htmlContent}
                                onChange={(e) => setForm({ ...form, htmlContent: e.target.value })}
                                required
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                            <button type="button" className="btn btn-secondary" onClick={updatePreview}>Refresh preview</button>
                        </div>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#fff', maxHeight: '360px', overflow: 'auto' }}>
                            <div className="muted" style={{ marginBottom: '8px', fontSize: '12px' }}>Preview (sample data)</div>
                            <div dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="muted">Click “Refresh preview”</p>' }} />
                        </div>
                        <div className="form-actions" style={{ marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                    </form>
                </ModalShell>
            )}
        </div>
    );
}
