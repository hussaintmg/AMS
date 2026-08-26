import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, Car, Trash2 } from 'lucide-react';
import { useCustomers } from '../../context/CustomersContext';
import { useAuth } from '../../context/AuthContext';
import { canUseQuickCreate, canSeeDropdown } from '../../utils/roleJobs';
import SearchableSelect from '../SearchableSelect';
import LeadMasterModal from '../leads/LeadMasterModal';
import LeadStatusItemModal from '../leads/LeadStatusItemModal';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import modalSubmit from '../../utils/modalForm';
import ModalPortal from '../ModalPortal';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// `quick` names the Role Jobs → Customers → Forms grant a tab needs, when it
// needs one. Recording a customer's cars is a write of its own — the gate pass
// and the service desk read them — so it can be withheld from a role that may
// otherwise fill in this form.
const TABS = [
  { key: 'basic', label: 'Basic Info' },
  { key: 'contact', label: 'Contact' },
  { key: 'vehicles', label: 'Vehicles', quick: 'vehicle' },
  { key: 'details', label: 'Details' },
];

/** A blank row of the customer's vehicle table. */
const emptyVehicle = () => ({
  registrationNumber: '', make: '', model: '', year: '', color: '',
  engineNumber: '', chassisNumber: '', pboNumber: '', notes: '',
});

// Layout for a label carrying a quick-add control lives in index.css.

export default function CustomerFormModal({ customer, onClose, onSaved }) {
  const { createCustomer, updateCustomer, meta, loadMeta } = useCustomers();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', alternatePhone: '',
    customerType: 'individual', companyName: '',
    source: '', type: '', status: '', description: '',
    assignedTo: '', department: '',
    address: '', city: '', state: '', country: 'Pakistan', zipCode: '',
  });
  // The customer's own cars — registration, engine, chassis and PBO, the same
  // details the gate asks for on every visit.
  const [vehicles, setVehicles] = useState([]);
  const [errors, setErrors] = useState({});
  const [quickCreate, setQuickCreate] = useState(null);

  const isEdit = Boolean(customer);

  // The pickers on *this* form, not the widest of the three. The list page loads
  // meta without naming a form, so a rule set on the create form alone would
  // otherwise never be applied to the create form.
  useEffect(() => { loadMeta(isEdit ? 'edit' : 'create'); }, [isEdit, loadMeta]);
  // …and put it back the way the list page wants it when the form closes.
  useEffect(() => () => { loadMeta(); }, [loadMeta]);

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
      setVehicles((customer.vehicles || []).map((v) => ({
        registrationNumber: v.registrationNumber || '',
        make: v.make || '',
        model: v.model || '',
        year: v.year || '',
        color: v.color || '',
        engineNumber: v.engineNumber || '',
        chassisNumber: v.chassisNumber || '',
        pboNumber: v.pboNumber || '',
        notes: v.notes || '',
      })));
    }
  }, [customer]);

  const setVehicle = (index, field, value) => setVehicles((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

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
      // Always sent, even when emptied — that is how a vehicle gets removed.
      payload.vehicles = vehicles.filter((v) => Object.values(v).some((value) => String(value || '').trim()));
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

  // These pickers are filled from Lead Master Data, and the shortcut is allowed
  // either by that page's own Create right or by "+ Create Source" being ticked
  // for a role that may create customers (Role Jobs → Customers → Forms). The
  // form it sits in — create or edit — is part of the grant.
  const formKind = isEdit ? 'edit' : 'create';
  // A dropdown Role Jobs has set to "Hidden" for this form is not drawn at all.
  const showDropdown = (key) => canSeeDropdown(user, 'customers', formKind, key);
  const mayQuickCreate = (field, owner) => canUseQuickCreate(user, { host: 'customers', form: formKind, key: field, owner });
  // A withheld tab is not drawn, but whatever it holds still rides along on
  // save — hiding the cars must not be a way to lose them.
  const tabs = TABS.filter((tab) => !tab.quick || mayQuickCreate(tab.quick, 'customers'));

  /**
   * An empty picker with no explanation reads as a broken screen. There are only
   * two reasons either of these lists comes back empty, and both are somewhere
   * an administrator can go and change.
   */
  const emptyPickerNote = (what) => (
    <small className="field-error" style={{ color: 'var(--gray-500)', fontWeight: 400 }}>
      No {what} to choose from. Either this role's “{what === 'users' ? 'Assign To' : 'Department'}”
      rule narrows the list (Server Management → Role Jobs → Customers → Forms), or nothing
      matches it yet.
    </small>
  );
  const renderLabel = (text, field, quickType, page = 'lead_master') => (
    <div className="form-label-add">
      <span>{text}</span>
      {mayQuickCreate(field, page) && (
        <button type="button" className="label-add-link" data-quick-create={field} onClick={() => setQuickCreate(quickType || field)}>+ Create {text}</button>
      )}
    </div>
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
            {showDropdown('source') && (
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
            )}
            {showDropdown('type') && (
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
            )}
            {showDropdown('status') && (
            <div className="form-group">
              {renderLabel('Status', 'status', undefined, 'status_management')}
              <SearchableSelect
                options={(meta.statuses || []).map((s) => ({ _id: s.value || s._id, name: s.label || s.value }))}
                value={form.status}
                onChange={(val) => set('status', val.target.value)}
                placeholder="Select status"
                valueField="_id"
                labelField="name"
              />
            </div>
            )}
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
      case 'vehicles':
        return (
          <>
            <p className="sm-role-job-note" style={{ marginTop: 0 }}>
              Cars this customer brings in. The gate pass and the service desk read these, so a
              registration, engine, chassis or PBO number entered once does not have to be asked again —
              and any of them will find the customer in search.
            </p>
            {vehicles.length === 0 && (
              <p style={{ color: '#94a3b8', margin: '12px 0' }}>No vehicle recorded for this customer yet.</p>
            )}
            {vehicles.map((vehicle, index) => (
              <div key={index} className="card" style={{ padding: '0.9rem', border: '1px solid #e5e7eb', boxShadow: 'none', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13, color: '#334155' }}>
                    <Car size={15} style={{ verticalAlign: '-3px', marginRight: 6 }} />
                    Vehicle {index + 1}
                  </strong>
                  <button type="button" className="btn-action btn-delete" title="Remove this vehicle" onClick={() => setVehicles((prev) => prev.filter((_, i) => i !== index))}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Registration / Vehicle No.</label>
                    <input type="text" className="form-input" value={vehicle.registrationNumber} onChange={(e) => setVehicle(index, 'registrationNumber', e.target.value)} placeholder="e.g. LEA-1234" />
                  </div>
                  <div className="form-group">
                    <label>PBO No.</label>
                    <input type="text" className="form-input" value={vehicle.pboNumber} onChange={(e) => setVehicle(index, 'pboNumber', e.target.value)} placeholder="PBO, if any" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Engine No.</label>
                    <input type="text" className="form-input" value={vehicle.engineNumber} onChange={(e) => setVehicle(index, 'engineNumber', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Chassis No.</label>
                    <input type="text" className="form-input" value={vehicle.chassisNumber} onChange={(e) => setVehicle(index, 'chassisNumber', e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Make</label>
                    <input type="text" className="form-input" value={vehicle.make} onChange={(e) => setVehicle(index, 'make', e.target.value)} placeholder="Toyota" />
                  </div>
                  <div className="form-group">
                    <label>Model</label>
                    <input type="text" className="form-input" value={vehicle.model} onChange={(e) => setVehicle(index, 'model', e.target.value)} placeholder="Corolla" />
                  </div>
                  <div className="form-group">
                    <label>Year</label>
                    <input type="text" className="form-input" value={vehicle.year} onChange={(e) => setVehicle(index, 'year', e.target.value)} placeholder="2021" />
                  </div>
                  <div className="form-group">
                    <label>Colour</label>
                    <input type="text" className="form-input" value={vehicle.color} onChange={(e) => setVehicle(index, 'color', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input type="text" className="form-input" value={vehicle.notes} onChange={(e) => setVehicle(index, 'notes', e.target.value)} placeholder="Anything the workshop should know" />
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVehicles((prev) => [...prev, emptyVehicle()])}>
              + Add vehicle
            </button>
          </>
        );
      case 'details':
        return (
          <>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-input" rows="3" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Notes or description" />
            </div>
            {showDropdown('assignedTo') && (
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
              {!(meta.users || []).length && emptyPickerNote('users')}
            </div>
            )}
            {showDropdown('department') && (
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
              {!(meta.departments || []).length && emptyPickerNote('departments')}
            </div>
            )}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <ModalPortal>
      <>
        {/* No inline z-index: this modal is opened from drawers and from other
            modals, so it has to follow the shared stacking scale in index.css. */}
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <div className="modal-content customer-form-modal" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3>{isEdit ? 'Edit Customer' : 'New Customer'}</h3>
              <button className="modal-close" onClick={onClose}><X size={20} /></button>
            </div>

            <div className="form-tabs">
              {tabs.map((t) => (
                <button key={t.key} className={`form-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            <form onSubmit={modalSubmit(handleSubmit)} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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
    </ModalPortal>
  );
}
