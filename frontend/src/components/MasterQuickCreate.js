import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { pageActions } from '../utils/roleJobs';
import { adminAPI, serviceMasterAPI, warehouseAPI } from '../services/api';
import useModalKeyboard from '../hooks/useModalKeyboard';
import '../styles/userManagement.css';

/**
 * "+ Create X" beside a master-data dropdown.
 *
 * The affordance and the permission that governs it live in one place on
 * purpose. Every hand-rolled version of this button was drawn for anyone who
 * could open the form, so a role without the master-data page's Create right
 * was offered a button whose only outcome was a 403 — and the operator had no
 * way to tell that from a broken screen. Here the button simply is not there
 * unless the role may create that record, and the same page key is what the
 * endpoint behind it guards on.
 *
 * A role that has never been through Role Jobs keeps the old behaviour (the
 * button shows), so nothing in use today stops working.
 *
 * Usage:
 *   <MasterQuickCreate type="department" onCreated={(dept) => { … }} />
 *
 * `onCreated` receives the created record and should refresh the caller's list
 * (and normally select the new value).
 */

const nameFrom = (record = {}) =>
  record.name || record.warehouseName || record.packageName || record.departmentName || '';

const idFrom = (record = {}) => record.id || record._id || '';

// Code fields are required by the model but are housekeeping, not a decision
// the person filling a form has an opinion about — so they are proposed from
// the name and stay editable.
const codeFromName = (name) => String(name || '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 12);

/**
 * page   — the Role Jobs page key whose Create right governs this record, and
 *          the same key the POST endpoint is guarded on.
 * fields — what the model actually requires; anything optional belongs on the
 *          full master-data screen, not in a quick create.
 */
const SPECS = {
  department: {
    page: 'department_management',
    label: 'Department',
    fields: [
      { key: 'name', label: 'Department name', required: true, autoFocus: true },
      { key: 'code', label: 'Code', required: true, deriveFrom: 'name' },
    ],
    submit: (values) => adminAPI.createDepartment(values),
  },
  warehouse: {
    page: 'warehouses',
    label: 'Warehouse',
    fields: [
      { key: 'warehouseName', label: 'Warehouse name', required: true, autoFocus: true },
      { key: 'code', label: 'Code', required: true, deriveFrom: 'warehouseName' },
    ],
    submit: (values) => warehouseAPI.create(values),
  },
  service_type: {
    page: 'service_master',
    label: 'Service Type',
    fields: [
      { key: 'name', label: 'Service type name', required: true, autoFocus: true },
      { key: 'basePrice', label: 'Base price', type: 'number' },
    ],
    submit: (values) => serviceMasterAPI.createType(values),
  },
  labor_rate: {
    page: 'service_master',
    label: 'Labor Rate',
    fields: [
      { key: 'name', label: 'Labor rate name', required: true, autoFocus: true },
      { key: 'rate', label: 'Rate', type: 'number', required: true },
    ],
    submit: (values) => serviceMasterAPI.createLaborRate(values),
  },
  warranty_type: {
    page: 'service_master',
    label: 'Warranty Type',
    fields: [
      { key: 'name', label: 'Warranty name', required: true, autoFocus: true },
      { key: 'durationMonths', label: 'Duration (months)', type: 'number' },
    ],
    submit: (values) => serviceMasterAPI.createWarranty(values),
  },
  service_package: {
    page: 'service_master',
    label: 'Service Package',
    fields: [
      { key: 'packageName', label: 'Package name', required: true, autoFocus: true },
      { key: 'price', label: 'Price', type: 'number' },
    ],
    submit: (values) => serviceMasterAPI.createPackage(values),
  },
};

export default function MasterQuickCreate({ type, label, onCreated }) {
  const { user } = useAuth();
  const spec = SPECS[type];
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const close = () => { if (!saving) { setOpen(false); setValues({}); } };

  const submit = async () => {
    if (!spec || saving) return;
    const missing = spec.fields.find((field) => field.required && !String(values[field.key] ?? '').trim());
    if (missing) { toast.error(`${missing.label} is required`); return; }
    setSaving(true);
    try {
      const res = await spec.submit(values);
      const created = res?.data?.data || res?.data || {};
      toast.success(`${spec.label} created`);
      setOpen(false);
      setValues({});
      onCreated?.({ ...created, id: idFrom(created), name: nameFrom(created) || values[spec.fields[0].key] });
    } catch (err) {
      // The interceptor already reports the server's message; keep the dialog
      // open so the typed values are not lost to a duplicate-name rejection.
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  useModalKeyboard(open, close, submit);

  if (!spec) return null;
  // Legacy default (true) matches every other screen: a role nobody has
  // configured in Role Jobs keeps the button it has always had.
  if (!pageActions(user, spec.page)('create')) return null;

  const setValue = (field, raw) => setValues((prev) => {
    const next = { ...prev, [field.key]: raw };
    // Fill a derived code as the name is typed, until the person edits it.
    const derived = spec.fields.find((f) => f.deriveFrom === field.key);
    if (derived && !prev[`${derived.key}__touched`]) next[derived.key] = codeFromName(raw);
    return next;
  });

  return (
    <>
      <button type="button" className="label-add-link" onClick={() => setOpen(true)}>
        + Create {label || spec.label}
      </button>

      {open && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New {spec.label}</h3>
              <button className="modal-close" onClick={close} disabled={saving}>×</button>
            </div>
            <div className="modal-body">
              {spec.fields.map((field) => (
                <div className="form-group" key={field.key}>
                  <label>{field.label}{field.required ? ' *' : ''}</label>
                  <input
                    className="form-input"
                    type={field.type || 'text'}
                    autoFocus={field.autoFocus}
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValue(field, e.target.value)}
                    onBlur={() => field.deriveFrom && setValues((prev) => ({ ...prev, [`${field.key}__touched`]: true }))}
                  />
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
                {saving ? 'Saving…' : `Create ${spec.label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
