import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { canUseQuickCreate, pageKeyForPath } from '../utils/roleJobs';
import { adminAPI, serviceMasterAPI, warehouseAPI, vehicleMasterAPI, paymentMethodsAPI, expensesAPI, partsAPI, accountsAPI } from '../services/api';
import useModalKeyboard from '../hooks/useModalKeyboard';
import '../styles/userManagement.css';
import ModalPortal from './ModalPortal';

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
 * Two grants can allow it, and either is enough:
 *   1. the owning master-data page's Create right (`spec.page`) — a role that
 *      may manage warehouses raises one from anywhere; or
 *   2. Create on the page hosting the form, with the shortcut itself still
 *      ticked for that form (Role Jobs → Forms).
 *
 * Withholding the shortcut in Role Jobs removes the button *and* closes the
 * endpoint — the server asks the same question again in `authorizeQuickCreate`.
 * A role may be allowed to create leads and still be kept from raising new
 * sources while doing it.
 *
 * Usage:
 *   <MasterQuickCreate type="department" form="edit" onCreated={(dept) => { … }} />
 *
 * `form` is 'create' (default) or 'edit' — which form the button sits in.
 * `pageKey` names the screen when it cannot be told from the URL (a modal
 * shared by several pages); otherwise it is resolved from the route.
 * `onCreated` receives the created record and should refresh the caller's list
 * (and normally select the new value).
 */

const nameFrom = (record = {}) =>
  record.name || record.warehouseName || record.packageName || record.departmentName || record.make_name || record.model_name || record.variant_name || record.color_name || '';

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
 * A field with `fromProps` is filled from the `context` prop instead of typed
 * (a model needs its make; a variant needs its model).
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
  // ── Vehicle master (make → model → variant, colour) ──────────────────────
  make: {
    page: 'vehicle_master',
    label: 'Make',
    fields: [{ key: 'make_name', label: 'Make / brand name', required: true, autoFocus: true }],
    submit: (values) => vehicleMasterAPI.createMake(values),
  },
  model: {
    page: 'vehicle_master',
    label: 'Model',
    fields: [
      { key: 'make_id', label: 'Make', fromProps: 'makeId', required: true },
      { key: 'model_name', label: 'Model name', required: true, autoFocus: true },
    ],
    submit: (values) => vehicleMasterAPI.createModel(values),
  },
  variant: {
    page: 'vehicle_master',
    label: 'Variant',
    fields: [
      { key: 'model_id', label: 'Model', fromProps: 'modelId', required: true },
      { key: 'variant_name', label: 'Variant name', required: true, autoFocus: true },
    ],
    submit: (values) => vehicleMasterAPI.createVariant(values),
  },
  color: {
    page: 'vehicle_master',
    label: 'Colour',
    fields: [
      { key: 'color_name', label: 'Colour name', required: true, autoFocus: true },
      { key: 'color_hex', label: 'Hex code (optional)' },
    ],
    submit: (values) => vehicleMasterAPI.createColor(values),
  },
  // ── Parts master ─────────────────────────────────────────────────────────
  category: {
    page: 'vehicle_master',
    label: 'Category',
    fields: [{ key: 'name', label: 'Category name', required: true, autoFocus: true }],
    submit: (values) => vehicleMasterAPI.createCategory(values),
  },
  supplier: {
    page: 'vehicle_master',
    label: 'Supplier',
    // The endpoint requires a code and a type as well as a name; without both it
    // answers 400, which reads to the operator exactly like a refused
    // permission. The code is proposed from the name and the type defaults to
    // the commonest, so the dialog stays a two-second detour.
    fields: [
      { key: 'name', label: 'Supplier name', required: true, autoFocus: true },
      { key: 'supplierCode', label: 'Code', required: true, deriveFrom: 'name' },
      {
        key: 'type',
        label: 'Type',
        required: true,
        default: 'oem',
        options: [
          { value: 'oem', label: 'OEM (Manufacturer)' },
          { value: 'distributor', label: 'Distributor' },
          { value: 'local_vendor', label: 'Local Vendor' },
        ],
      },
      { key: 'phone', label: 'Phone' },
    ],
    submit: (values) => vehicleMasterAPI.createSupplier(values),
  },
  /**
   * A part raised from inside another form — a delivery arrives carrying
   * something that has never been stocked before, and the gate entry has to be
   * able to name it there and then rather than being abandoned halfway through.
   * The full Parts screen is still where pricing, category and warehouse are
   * set; this only makes the record exist.
   */
  part: {
    page: 'parts',
    label: 'Part',
    fields: [
      { key: 'name', label: 'Part name', required: true, autoFocus: true },
      { key: 'partNumber', label: 'Part number' },
      { key: 'unit', label: 'Unit', placeholder: 'pcs' },
    ],
    submit: (values) => partsAPI.create({ ...values, currentStock: 0 }),
  },
  source_type: {
    page: 'parts',
    label: 'Source Type',
    fields: [{ key: 'name', label: 'Source type name', required: true, autoFocus: true }],
    submit: (values) => partsAPI.createSourceType(values),
  },
  // ── Finance ──────────────────────────────────────────────────────────────
  expense_category: {
    page: 'expenses',
    label: 'Expense Category',
    fields: [
      { key: 'name', label: 'Category name', required: true, autoFocus: true },
      { key: 'code', label: 'Code', required: true, deriveFrom: 'name' },
    ],
    submit: (values) => expensesAPI.createCategory(values),
  },
  payment_method: {
    page: 'payment_methods',
    label: 'Payment Method',
    fields: [
      { key: 'name', label: 'Payment method name', required: true, autoFocus: true },
      { key: 'code', label: 'Code', deriveFrom: 'name' },
    ],
    submit: (values) => paymentMethodsAPI.create(values),
  },
  account: {
    page: 'accounts',
    label: 'Account',
    fields: [
      { key: 'name', label: 'Account name', required: true, autoFocus: true },
      { key: 'code', label: 'Code', deriveFrom: 'name' },
    ],
    submit: (values) => accountsAPI.create({ ...values, type: values.type || 'petty_cash' }),
  },
};

export default function MasterQuickCreate({ type, label, onCreated, form = 'create', pageKey, context = {} }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const spec = SPECS[type];
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const close = () => { if (!saving) { setOpen(false); setValues({}); } };

  const submit = async () => {
    if (!spec || saving) return;
    const payload = { ...values };
    spec.fields.forEach((field) => {
      if (field.fromProps) payload[field.key] = context[field.fromProps];
      if (field.default !== undefined && !payload[field.key]) payload[field.key] = field.default;
    });
    const missing = spec.fields.find((field) => field.required && !String(payload[field.key] ?? '').trim());
    if (missing) { toast.error(`${missing.label} is required`); return; }
    setSaving(true);
    try {
      const res = await spec.submit(payload);
      const created = res?.data?.data || res?.data || {};
      toast.success(`${spec.label} created`);
      setOpen(false);
      setValues({});
      onCreated?.({ ...created, id: idFrom(created), name: nameFrom(created) || payload[spec.fields.find((f) => !f.fromProps).key] });
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
  // Either the owning master-data page's Create right, or this shortcut ticked
  // on a form of the page it sits in — see utils/roleJobs.js canUseQuickCreate.
  const screen = pageKey || pageKeyForPath(user, pathname);
  if (!canUseQuickCreate(user, { host: screen, form, key: type, owner: spec.page })) return null;

  const setValue = (field, raw) => setValues((prev) => {
    const next = { ...prev, [field.key]: raw };
    // Fill a derived code as the name is typed, until the person edits it.
    const derived = spec.fields.find((f) => f.deriveFrom === field.key);
    if (derived && !prev[`${derived.key}__touched`]) next[derived.key] = codeFromName(raw);
    return next;
  });

  const typedFields = spec.fields.filter((field) => !field.fromProps);

  return (
    <>
      <button type="button" className="label-add-link" data-quick-create={type} onClick={() => setOpen(true)}>
        + Create {label || spec.label}
      </button>

      {open && (
        <ModalPortal>
        <div className="modal-overlay" onClick={close}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New {spec.label}</h3>
              <button className="modal-close" onClick={close} disabled={saving}>×</button>
            </div>
            <div className="modal-body">
              {typedFields.map((field) => (
                <div className="form-group" key={field.key}>
                  <label>{field.label}{field.required ? ' *' : ''}</label>
                  {field.options ? (
                    <select
                      className="form-input"
                      value={values[field.key] ?? field.default ?? ''}
                      onChange={(e) => setValue(field, e.target.value)}
                    >
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="form-input"
                      type={field.type || 'text'}
                      autoFocus={field.autoFocus}
                      placeholder={field.placeholder || ''}
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValue(field, e.target.value)}
                      onBlur={() => field.deriveFrom && setValues((prev) => ({ ...prev, [`${field.key}__touched`]: true }))}
                    />
                  )}
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
        </ModalPortal>
      )}
    </>
  );
}
