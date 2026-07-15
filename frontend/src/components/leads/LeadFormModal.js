import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { useLeads } from '../../context/LeadsContext';
import SearchableSelect from '../SearchableSelect';
import LeadMasterModal from './LeadMasterModal';
import LeadStatusItemModal from './LeadStatusItemModal';
import useModalKeyboard from '../../hooks/useModalKeyboard';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  return EMAIL_REGEX.test(email);
}

function normalizePhone(val) {
  if (!val) return '';
  let cleaned = val.replace(/[\s\-\(\)\.]+/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.startsWith('0')) return '+92' + cleaned.slice(1);
  return '+92' + cleaned;
}

const TABS = [
  { key: 'basic', label: 'Basic Info' },
  { key: 'contact', label: 'Contact' },
  { key: 'details', label: 'Lead Details' },
  { key: 'assignment', label: 'Assignment' },
];

const LABEL_STYLE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };

export default function LeadFormModal({ lead, onClose, onSaved }) {
  const { createLead, updateLead, meta, loadMeta } = useLeads();
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerName: '', email: '', phone: '', alternatePhone: '',
    address: '', city: '', state: '', country: '', zipCode: '',
    source: '', type: '', priority: '', status: '', customerType: 'individual',
    leadValue: '', probability: '', expectedCloseDate: '', nextFollowUpAt: '',
    description: '',
    assignedTo: '', department: '',
  });
  const [errors, setErrors] = useState({});
  const [quickCreate, setQuickCreate] = useState({ show: false, type: null });
  const [showStatusItemModal, setShowStatusItemModal] = useState(false);

  const isEdit = Boolean(lead);

  useEffect(() => {
    if (lead) {
      setForm({
        customerName: lead.customerName || '',
        email: lead.email || '',
        phone: lead.phone || '',
        alternatePhone: lead.alternatePhone || '',
        address: lead.address || '',
        city: lead.city || '',
        state: lead.state || '',
        country: lead.country || '',
        zipCode: lead.zipCode || '',
        source: lead.source?._id || lead.source || '',
        type: lead.type?._id || lead.type || '',
        priority: lead.priority?._id || lead.priority || '',
        status: lead.status || '',
        customerType: lead.customerType || 'individual',
        leadValue: lead.leadValue || '',
        probability: lead.probability || '',
        expectedCloseDate: lead.expectedCloseDate ? lead.expectedCloseDate.split('T')[0] : '',
        nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.split('T')[0] : '',
        description: lead.description || '',
        assignedTo: lead.assignedTo?._id || lead.assignedTo || '',
        department: lead.department?._id || lead.department || '',
      });
    }
  }, [lead]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const set = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.customerName.trim()) errs.customerName = 'Customer name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!validateEmail(form.email.trim().toLowerCase())) errs.email = 'Invalid email format';
    if (!form.phone.trim()) errs.phone = 'Phone is required';
    else {
      const normalized = normalizePhone(form.phone);
      if (!normalized) errs.phone = 'Invalid phone number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) {
      const firstErr = Object.keys(errors)[0] || 'customerName';
      const tabMap = { customerName: 'basic', email: 'basic', phone: 'basic' };
      setActiveTab(tabMap[firstErr] || 'basic');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        email: form.email.trim().toLowerCase(),
        phone: normalizePhone(form.phone),
        alternatePhone: form.alternatePhone ? normalizePhone(form.alternatePhone) : '',
      };
      Object.keys(payload).forEach((k) => {
        if (payload[k] === '' || payload[k] === null) payload[k] = undefined;
      });

      const res = isEdit ? await updateLead(lead._id, payload) : await createLead(payload);

      if (res?.success) {
        toast.success(res.message);
        if (onSaved) onSaved();
        onClose();
      } else {
        toast.error(res?.message || 'Operation failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  useModalKeyboard(true, onClose, handleSubmit, saving);

  const getAssignedOptions = () => {
    if (!meta.leadAssignmentRolesConfigured && meta.users.length === 0) {
      return { users: [], empty: true };
    }
    return { users: meta.users, empty: false };
  };

  const buildOptionsWithInactive = (items, inactiveItems, idField = '_id') => {
    const activeItems = items.map((i) => ({ ...i, _isInactive: false }));
    if (!isEdit) return activeItems;
    const activeIds = new Set(items.map((i) => i[idField]?.toString()));
    let extraInactive = (inactiveItems || []).filter((i) => {
      const id = i[idField]?.toString();
      return !activeIds.has(id) && lead && (
        (idField === '_id' && (lead.source?._id?.toString() === id || lead.type?._id?.toString() === id || lead.priority?._id?.toString() === id))
      );
    });
    extraInactive = extraInactive.map((i) => ({ ...i, _isInactive: true }));
    return [...activeItems, ...extraInactive];
  };

  const assignOptions = getAssignedOptions();

  const renderLabel = (text, field, onCreate) => (
    <label style={LABEL_STYLE}>
      <span>{text}</span>
      {onCreate && (
        <button type="button" className="label-add-link" onClick={onCreate}>+ Create {text}</button>
      )}
    </label>
  );

  const handleStatusItemCreated = (newItem) => {
    loadMeta();
    if (newItem?._id) {
      set('status', newItem.value || newItem.label);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <>
            <div className="form-group">
              <label>Customer Name *</label>
              <input type="text" className={`form-input ${errors.customerName ? 'input-error' : ''}`} value={form.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Enter customer name" />
              {errors.customerName && <small className="field-error">{errors.customerName}</small>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email *</label>
                <input type="email" className={`form-input ${errors.email ? 'input-error' : ''}`} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@example.com" />
                {errors.email && <small className="field-error">{errors.email}</small>}
              </div>
              <div className="form-group">
                <label>Phone *</label>
                <input type="tel" className={`form-input ${errors.phone ? 'input-error' : ''}`} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="03XX-XXXXXXX" />
                {errors.phone && <small className="field-error">{errors.phone}</small>}
              </div>
            </div>
            <div className="form-group">
              <label>Alternate Phone</label>
              <input type="tel" className="form-input" value={form.alternatePhone} onChange={(e) => set('alternatePhone', e.target.value)} placeholder="Alternate phone number" />
            </div>
          </>
        );
      case 'contact':
        return (
          <>
            <div className="form-group">
              <label>Address</label>
              <textarea className="form-input" rows="2" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street address" />
            </div>
            <div className="form-row">
              <div className="form-group">
                {renderLabel('City', 'city', () => setQuickCreate({ show: true, type: 'cities' }))}
                <SearchableSelect
                  options={(meta.cities || []).map((city) => ({ _id: city.name, name: city.name }))}
                  value={form.city}
                  onChange={(val) => set('city', val.target.value)}
                  placeholder="Select city"
                  valueField="_id"
                  labelField="name"
                />
                {errors.city && <small className="field-error">{errors.city}</small>}
              </div>
              <div className="form-group">
                <label>State</label>
                <input type="text" className="form-input" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="State / Province" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Country</label>
                <input type="text" className="form-input" value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="Country" />
              </div>
              <div className="form-group">
                <label>Zip Code</label>
                <input type="text" className="form-input" value={form.zipCode} onChange={(e) => set('zipCode', e.target.value)} placeholder="Postal code" />
              </div>
            </div>
          </>
        );
      case 'details':
        return (
          <>
            <div className="form-row">
              <div className="form-group">
                {renderLabel('Source', 'source', () => setQuickCreate({ show: true, type: 'sources' }))}
                <SearchableSelect
                  options={buildOptionsWithInactive(meta.sources, meta.inactiveItems?.sources)}
                  value={form.source}
                  onChange={(val) => set('source', val.target.value)}
                  placeholder="Select source"
                  valueField="_id"
                  labelField="name"
                />
              </div>
              <div className="form-group">
                {renderLabel('Type', 'type', () => setQuickCreate({ show: true, type: 'types' }))}
                <SearchableSelect
                  options={buildOptionsWithInactive(meta.types, meta.inactiveItems?.types)}
                  value={form.type}
                  onChange={(val) => set('type', val.target.value)}
                  placeholder="Select type"
                  valueField="_id"
                  labelField="name"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                {renderLabel('Priority', 'priority', () => setQuickCreate({ show: true, type: 'priorities' }))}
                <SearchableSelect
                  options={buildOptionsWithInactive(meta.priorities, meta.inactiveItems?.priorities)}
                  value={form.priority}
                  onChange={(val) => set('priority', val.target.value)}
                  placeholder="Select priority"
                  valueField="_id"
                  labelField="name"
                />
              </div>
              <div className="form-group">
                {renderLabel('Status', 'status', () => {
                  if (!meta.leadStatusCollectionId) {
                    toast.error('Please configure a Lead Status Collection in Server Management first.');
                    return;
                  }
                  setShowStatusItemModal(true);
                })}
                <select className="form-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="">Select status</option>
                  {meta.statuses.map((s) => (
                    <option key={s._id} value={s.value || s.label}>{s.label}</option>
                  ))}
                </select>
                {meta.statuses.length === 0 && (
                  <small style={{ color: 'var(--warning-color, #f59e0b)', display: 'block', marginTop: '0.25rem' }}>
                    No statuses configured for leads.
                  </small>
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Customer Type</label>
                <select className="form-input" value={form.customerType} onChange={(e) => set('customerType', e.target.value)}>
                  <option value="individual">Individual</option>
                  <option value="corporate">Corporate</option>
                </select>
              </div>
              <div className="form-group">
                <label>Lead Value</label>
                <input type="number" className="form-input" value={form.leadValue} onChange={(e) => set('leadValue', e.target.value)} min="0" step="0.01" />
              </div>
              <div className="form-group">
                <label>Probability (%)</label>
                <input type="number" className="form-input" value={form.probability} onChange={(e) => set('probability', e.target.value)} min="0" max="100" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Expected Close Date</label>
                <input type="date" className="form-input" value={form.expectedCloseDate} onChange={(e) => set('expectedCloseDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Next Follow-Up</label>
                <input type="date" className="form-input" value={form.nextFollowUpAt} onChange={(e) => set('nextFollowUpAt', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-input" rows="3" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Notes or description" />
            </div>
          </>
        );
      case 'assignment':
        return (
          <>
            <div className="form-group">
              <label>Assign To</label>
              {assignOptions.empty ? (
                <div className="empty-assignees">
                  <p>No lead assignment roles configured.</p>
                  <small>Ask an admin to configure lead assignment roles in Server Management.</small>
                </div>
              ) : (
                <SearchableSelect
                  options={assignOptions.users.map((u) => ({ ...u, name: `${u.firstName} ${u.lastName}` }))}
                  value={form.assignedTo}
                  onChange={(val) => set('assignedTo', val.target.value)}
                  placeholder="Select user"
                  valueField="_id"
                  labelField="name"
                />
              )}
            </div>
            <div className="form-group">
              <label>Department</label>
              <SearchableSelect
                options={meta.departments}
                value={form.department}
                onChange={(val) => set('department', val.target.value)}
                placeholder="Select department"
                valueField="_id"
                labelField="name"
              />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal-content lead-form-modal" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
          <div className="modal-header">
            <h3>{isEdit ? 'Edit Lead' : 'New Lead'}</h3>
            <button className="modal-close" onClick={onClose}><X size={20} /></button>
          </div>

          <div className="form-tabs">
            {TABS.map((t) => (
              <button key={t.key} className={`form-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
              {renderTab()}
            </div>

            <div className="modal-footer" style={{ flexShrink: 0 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : (isEdit ? 'Update Lead' : 'Create Lead')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {quickCreate.show && (
        <LeadMasterModal
          type={quickCreate.type}
          onClose={() => setQuickCreate({ show: false, type: null })}
          onSaved={(item) => {
            const field = quickCreate.type === 'sources' ? 'source'
              : quickCreate.type === 'types' ? 'type'
                : quickCreate.type === 'cities' ? 'city'
                  : 'priority';
            loadMeta();
            if (field === 'city' && item?.name) {
              set('city', item.name);
            } else if (item?._id) {
              set(field, item._id);
            }
          }}
        />
      )}

      {showStatusItemModal && meta.leadStatusCollectionId && (
        <LeadStatusItemModal
          collectionId={meta.leadStatusCollectionId}
          collectionName={meta.statuses.length > 0 ? 'Lead Status' : undefined}
          onClose={() => setShowStatusItemModal(false)}
          onCreated={handleStatusItemCreated}
        />
      )}
    </>
  );
}
