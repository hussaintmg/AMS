import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { useCustomers } from '../../context/CustomersContext';
import SearchableSelect from '../SearchableSelect';
import LeadMasterModal from '../leads/LeadMasterModal';
import LeadStatusItemModal from '../leads/LeadStatusItemModal';
import useModalKeyboard from '../../hooks/useModalKeyboard';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TABS = [
  { key: 'basic', label: 'Basic Info' },
  { key: 'contact', label: 'Contact' },
  { key: 'details', label: 'Details' },
];

// Layout for a label carrying a quick-add control lives in index.css.

export default function CustomerFormModal({ customer, onClose, onSaved }) {
  const { createCustomer, updateCustomer, meta, loadMeta } = useCustomers();
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', alternatePhone: '',
    customerType: 'individual', companyName: '',
    source: '', type: '', status: '', description: '',
    assignedTo: '', department: '',
    address: '', city: '', state: '', country: 'Pakistan', zipCode: '',
  });
  const [errors, setErrors] = useState({});
  const [quickCreate, setQuickCreate] = useState(null);

  const isEdit = Boolean(customer);

  useEffect(() => {
    if (customer) {
      setForm({
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        email: customer.email || '',
        phone: customer.phone || '',
        alternatePhone: customer.alternatePhone || '',
        customerType: customer.customerType || 'individual',
        companyName: customer.companyName || '',
        source: customer.source?._id || customer.source || '',
        type: customer.type?._id || customer.type || '',
        status: customer.status || '',
        description: customer.description || '',
        assignedTo: customer.assignedTo?._id || customer.assignedTo || '',
        department: customer.department?._id || customer.department || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        country: customer.country || 'Pakistan',
        zipCode: customer.zipCode || '',
      });
    }
  }, [customer]);

  const set = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!EMAIL_REGEX.test(form.email.trim().toLowerCase())) errs.email = 'Invalid email format';
    if (!form.phone.trim()) errs.phone = 'Phone is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { ...form, email: form.email.trim().toLowerCase() || undefined };
      Object.keys(payload).forEach((k) => { if (payload[k] === '' || payload[k] === null) payload[k] = undefined; });
      const res = isEdit ? await updateCustomer(customer._id, payload) : await createCustomer(payload);
      if (res?.success) {
        toast.success(res.message);
        if (onSaved) onSaved(res.data?.customer || res.data || null);
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

  const renderLabel = (text, field, quickType) => (
    <label className="form-label-add">
      <span>{text}</span>
      <button type="button" className="label-add-link" onClick={() => setQuickCreate(quickType || field)}>+ Create {text}</button>
    </label>
  );

  const renderForm = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <>
            <div className="form-row">
              <div className="form-group">
                <label>First Name *</label>
                <input type="text" className={`form-input ${errors.firstName ? 'input-error' : ''}`} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="First name" autoFocus />
                {errors.firstName && <small className="field-error">{errors.firstName}</small>}
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input type="text" className="form-input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Last name" />
              </div>
            </div>
            <div className="form-group">
              <label>Customer Type</label>
              <select className="form-input" value={form.customerType} onChange={(e) => set('customerType', e.target.value)}>
                <option value="individual">Individual</option>
                <option value="corporate">Corporate</option>
              </select>
            </div>
            {form.customerType === 'corporate' && (
              <div className="form-group">
                <label>Company Name</label>
                <input type="text" className="form-input" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Company name" />
              </div>
            )}
            <div className="form-group">
              {renderLabel('Source', 'source')}
              <SearchableSelect
                options={(meta.sources || []).map((s) => ({ _id: s._id, name: s.name }))}
                value={form.source}
                onChange={(val) => set('source', val.target.value)}
                placeholder="Select source"
                valueField="_id"
                labelField="name"
              />
            </div>
            <div className="form-group">
              {renderLabel('Type', 'type')}
              <SearchableSelect
                options={(meta.types || []).map((t) => ({ _id: t._id, name: t.name }))}
                value={form.type}
                onChange={(val) => set('type', val.target.value)}
                placeholder="Select type"
                valueField="_id"
                labelField="name"
              />
            </div>
            <div className="form-group">
              {renderLabel('Status', 'status')}
              <SearchableSelect
                options={(meta.statuses || []).map((s) => ({ _id: s.value || s._id, name: s.label || s.value }))}
                value={form.status}
                onChange={(val) => set('status', val.target.value)}
                placeholder="Select status"
                valueField="_id"
                labelField="name"
              />
            </div>
          </>
        );
      case 'contact':
        return (
          <>
            <div className="form-group">
              <label>Email *</label>
              <input type="email" className={`form-input ${errors.email ? 'input-error' : ''}`} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@example.com" />
              {errors.email && <small className="field-error">{errors.email}</small>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone *</label>
                <input type="tel" className={`form-input ${errors.phone ? 'input-error' : ''}`} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="03XX-XXXXXXX" />
                {errors.phone && <small className="field-error">{errors.phone}</small>}
              </div>
              <div className="form-group">
                <label>Alternate Phone</label>
                <input type="tel" className="form-input" value={form.alternatePhone} onChange={(e) => set('alternatePhone', e.target.value)} placeholder="Alternate phone" />
              </div>
            </div>
            <div className="form-group">
              <label>Address</label>
              <textarea className="form-input" rows="2" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street address" />
            </div>
            <div className="form-row">
              <div className="form-group">
                {renderLabel('City', 'city', 'cities')}
                <SearchableSelect
                  options={(meta.cities || []).map((city) => ({ _id: city.name, name: city.name }))}
                  value={form.city}
                  onChange={(val) => set('city', val.target.value)}
                  placeholder="Select city"
                  valueField="_id"
                  labelField="name"
                />
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
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-input" rows="3" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Notes or description" />
            </div>
            <div className="form-group">
              <label>Assign To</label>
              <SearchableSelect
                options={(meta.users || []).map((u) => ({ _id: u._id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email }))}
                value={form.assignedTo}
                onChange={(val) => set('assignedTo', val.target.value)}
                placeholder="Select user"
                valueField="_id"
                labelField="name"
              />
            </div>
            <div className="form-group">
              <label>Department</label>
              <SearchableSelect
                options={(meta.departments || []).map((d) => ({ _id: d._id, name: d.name }))}
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
      <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 1000 }}>
        <div className="modal-content customer-form-modal" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
          <div className="modal-header">
            <h3>{isEdit ? 'Edit Customer' : 'New Customer'}</h3>
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
              {renderForm()}
            </div>

            <div className="modal-footer" style={{ flexShrink: 0 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : (isEdit ? 'Update Customer' : 'Create Customer')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {quickCreate === 'source' && (
        <LeadMasterModal type="sources" onClose={() => setQuickCreate(null)} onSaved={(item) => { loadMeta(); if (item?._id) set('source', item._id); }} />
      )}
      {quickCreate === 'type' && (
        <LeadMasterModal type="types" onClose={() => setQuickCreate(null)} onSaved={(item) => { loadMeta(); if (item?._id) set('type', item._id); }} />
      )}
      {quickCreate === 'status' && meta.statusCollectionId && (
        <LeadStatusItemModal collectionId={meta.statusCollectionId} collectionName={meta.statusCollectionName} onClose={() => setQuickCreate(null)} onCreated={(item) => { loadMeta(); if (item?.value || item?.label) set('status', item.value || item.label); }} />
      )}
      {quickCreate === 'cities' && (
        <LeadMasterModal type="cities" onClose={() => setQuickCreate(null)} onSaved={(item) => { loadMeta(); if (item?.name) set('city', item.name); }} />
      )}
    </>
  );
}
