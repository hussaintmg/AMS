import React, { useMemo } from 'react';
import { Trash2, Plus } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import MasterQuickCreate from '../MasterQuickCreate';

/**
 * The optional service-charges block on a quotation, booking, order or invoice.
 *
 * A tick box ("Add service charges") reveals rows of: Service Type (from
 * Service Master Data — its base price prefills the amount) · description ·
 * quantity · amount · tax %. Tax is per line, as the client asked. The rows are
 * kept separate from the product lines because a service moves no stock; the
 * server adds their total on top of the products (models/serviceCharges.fields.js).
 *
 *   <ServiceChargesEditor
 *     enabled={hasServiceCharges} onToggle={setHasServiceCharges}
 *     rows={serviceCharges} onChange={setServiceCharges}
 *     serviceTypes={serviceTypes} onServiceTypeCreated={reloadServiceTypes}
 *     currencyCode="PKR" defaultTaxPercent={salesTaxRate} form="create" />
 *
 * `rows` are plain objects: { serviceTypeId, name, description, quantity, amount, taxPercent }.
 * The label uses the same `.form-label-add` row as every other picker, with
 * "+ Create Service Type" on the right — the pattern the rest of the app uses.
 */

export const emptyServiceCharge = (defaultTaxPercent = 0) => ({
  serviceTypeId: '', name: '', description: '', quantity: 1, amount: '', taxPercent: defaultTaxPercent,
});

export const serviceChargesTotals = (rows = []) => {
  const list = Array.isArray(rows) ? rows : [];
  const net = list.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.amount) || 0), 0);
  const tax = list.reduce((sum, row) => sum + ((Number(row.quantity) || 0) * (Number(row.amount) || 0)) * (Number(row.taxPercent) || 0) / 100, 0);
  return { net, tax, grand: net + tax };
};

export default function ServiceChargesEditor({
  enabled, onToggle, rows = [], onChange, serviceTypes = [], onServiceTypeCreated,
  currencyCode = 'PKR', defaultTaxPercent = 0, form = 'create', pageKey, disabled = false,
}) {
  const typeOptions = useMemo(() => (serviceTypes || []).map((type) => ({
    value: String(type.id || type._id),
    label: type.basePrice ? `${type.name} — ${currencyCode} ${Number(type.basePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : type.name,
  })), [serviceTypes, currencyCode]);

  const update = (index, patch) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, emptyServiceCharge(defaultTaxPercent)]);

  const pickType = (index, typeId) => {
    const type = (serviceTypes || []).find((item) => String(item.id || item._id) === String(typeId));
    update(index, {
      serviceTypeId: typeId,
      name: type?.name || rows[index].name,
      // The base price prefills; the person can still change it.
      amount: rows[index].amount === '' || rows[index].amount == null ? (type?.basePrice ?? '') : rows[index].amount,
      description: rows[index].description || type?.description || '',
    });
  };

  const totals = serviceChargesTotals(rows);

  return (
    <div className="service-charges-block">
      <label className="service-charges-toggle">
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={disabled}
          onChange={(e) => {
            onToggle(e.target.checked);
            if (e.target.checked && !rows.length) onChange([emptyServiceCharge(defaultTaxPercent)]);
          }}
        />
        <span>Add service charges</span>
        {enabled && totals.grand > 0 && (
          <span className="service-charges-pill">{currencyCode} {totals.grand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        )}
      </label>

      {enabled && (
        <div className="service-charges-rows">
          {rows.map((row, index) => (
            <div className="service-charge-row" key={index}>
              <div className="form-group service-charge-type">
                <div className="form-label-add">
                  <span>Service Type</span>
                  <MasterQuickCreate
                    type="service_type"
                    label="Service Type"
                    form={form}
                    pageKey={pageKey}
                    onCreated={async (created) => {
                      await onServiceTypeCreated?.();
                      if (created?.id) pickType(index, String(created.id));
                    }}
                  />
                </div>
                <SearchableSelect
                  options={typeOptions}
                  labelField="label"
                  valueField="value"
                  value={row.serviceTypeId || ''}
                  onChange={(e) => pickType(index, e.target.value)}
                  placeholder="Select service…"
                  disabled={disabled}
                />
              </div>
              <div className="form-group service-charge-desc">
                <label>Custom description</label>
                <input
                  type="text"
                  value={row.description || ''}
                  onChange={(e) => update(index, { description: e.target.value })}
                  placeholder="e.g. Oil change labour"
                  disabled={disabled}
                />
              </div>
              <div className="form-group service-charge-qty">
                <label>Qty</label>
                <input type="number" min="0" step="1" value={row.quantity ?? 1} onChange={(e) => update(index, { quantity: e.target.value })} disabled={disabled} />
              </div>
              <div className="form-group service-charge-amount">
                <label>Amount ({currencyCode})</label>
                <input type="number" min="0" step="0.01" value={row.amount ?? ''} onChange={(e) => update(index, { amount: e.target.value })} placeholder="0.00" disabled={disabled} />
              </div>
              <div className="form-group service-charge-tax">
                <label>Tax %</label>
                <input type="number" min="0" max="100" step="0.01" value={row.taxPercent ?? 0} onChange={(e) => update(index, { taxPercent: e.target.value })} disabled={disabled} />
              </div>
              <div className="service-charge-line-total">
                <label>Line total</label>
                <strong>{currencyCode} {(((Number(row.quantity) || 0) * (Number(row.amount) || 0)) * (1 + (Number(row.taxPercent) || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              {!disabled && (
                <button type="button" className="btn-action btn-delete service-charge-remove" title="Remove service charge" onClick={() => remove(index)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          <div className="service-charges-footer">
            {!disabled && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={add}><Plus size={14} /> Add another service</button>
            )}
            <span className="service-charges-summary">
              Services {currencyCode} {totals.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Tax {currencyCode} {totals.tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · <strong>Total {currencyCode} {totals.grand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hook: the state and plumbing a document form needs ───────────────────────

/**
 * Everything a document form needs to carry a service-charges block:
 *
 *   const svc = useServiceCharges();
 *   <ServiceChargesEditor {...svc.editorProps} form={modalMode} />
 *   payload = { ...formData, ...svc.payload() }
 *   svc.loadFrom(item)   // when opening an existing document
 *   svc.reset()          // when opening a blank one
 *
 * Service types are loaded once from Service Master Data and refreshed after a
 * quick create.
 */
export function useServiceCharges({ defaultTaxPercent = 0 } = {}) {
  const [enabled, setEnabled] = React.useState(false);
  const [rows, setRows] = React.useState([]);
  const [serviceTypes, setServiceTypes] = React.useState([]);

  const reload = React.useCallback(async () => {
    try {
      const { serviceMasterAPI } = await import('../../services/api');
      const res = await serviceMasterAPI.getTypes({ is_active: true, limit: 200 });
      const list = res?.data?.data?.types || res?.data?.data || [];
      setServiceTypes(Array.isArray(list) ? list : []);
    } catch (error) { /* the picker simply stays empty */ }
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  const loadFrom = React.useCallback((doc) => {
    const list = doc?.service_charges || doc?.serviceCharges || [];
    const mapped = list.map((row) => ({
      serviceTypeId: row.service_type_id || row.serviceType || '',
      name: row.name || '',
      description: row.description || '',
      quantity: row.quantity ?? 1,
      amount: row.amount ?? '',
      taxPercent: row.tax_percent ?? row.taxPercent ?? 0,
    }));
    setRows(mapped);
    setEnabled(mapped.length > 0 || doc?.has_service_charges === true);
  }, []);

  const reset = React.useCallback(() => { setRows([]); setEnabled(false); }, []);

  const payload = React.useCallback(() => ({
    hasServiceCharges: enabled && rows.length > 0,
    serviceCharges: enabled ? rows.map((row) => ({
      serviceTypeId: row.serviceTypeId || undefined,
      name: row.name || '',
      description: row.description || '',
      quantity: Number(row.quantity) || 1,
      amount: Number(row.amount) || 0,
      taxPercent: Number(row.taxPercent) || 0,
    })) : [],
  }), [enabled, rows]);

  const totals = serviceChargesTotals(enabled ? rows : []);

  return {
    enabled, setEnabled, rows, setRows, serviceTypes, reload, loadFrom, reset, payload, totals,
    editorProps: {
      enabled, onToggle: setEnabled, rows, onChange: setRows, serviceTypes,
      onServiceTypeCreated: reload, defaultTaxPercent,
    },
  };
}
