/**
 * Shared pieces of the gate-pass screens: the printable pass (opened in a new
 * window and printed to PDF from the browser, barcode included), the details
 * block the drawer and the guard's screen both show, and small formatters.
 */
import React from 'react';
import { formatPKR } from '../../components/sales/CorporateDocumentView';

export const asDate = (value) => (value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
export const asDay = (value) => (value ? new Date(value).toLocaleDateString('en-GB') : '-');
export const money = (value) => formatPKR(Number(value) || 0);
export const STATUS_BADGE = { draft: 'badge-secondary', issued: 'badge-info', verified: 'badge-success', closed: 'badge-success', cancelled: 'badge-danger' };
export const statusBadge = (status) => <span className={`badge ${STATUS_BADGE[status] || 'badge-secondary'}`}>{String(status || '').toUpperCase()}</span>;

const esc = (value) => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Print a gate pass, entry acknowledgement or GRN. Renders a clean sheet in a
 * new window with the barcode fetched from the API and calls print(); the
 * browser's "Save as PDF" is the PDF.
 */
export async function printGatePass(pass, { title, company = {}, grn = null, token } = {}) {
  const heading = title || (pass.direction === 'in'
    ? (pass.entry_type === 'customer' ? 'Customer Entry Acknowledgement' : 'Gate Pass — IN (Logistic Entry)')
    : (pass.entry_type === 'customer' ? 'Gate Pass — OUT (Customer Exit)' : 'Gate Pass — OUT (Logistic Exit)'));
  let barcodeSvg = '';
  try {
    const res = await fetch(`/api/gatepasses/${pass.id}/barcode.svg`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) barcodeSvg = await res.text();
  } catch { /* the number prints even without the barcode */ }

  const rows = [];
  const add = (label, value) => { if (value != null && String(value).trim() !== '' && value !== '-') rows.push(`<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`); };
  add('Gate pass #', pass.gate_pass_number);
  add('Date', asDate(pass.date));
  add('Type', `${pass.entry_type === 'customer' ? 'Customer' : 'Logistic'} — ${pass.direction === 'in' ? 'IN' : 'OUT'}`);
  add('Status', String(pass.status || '').toUpperCase());
  if (pass.entry_type === 'logistic') {
    add('R/O number', pass.ro_number); add('C/O number', pass.co_number); add('Invoice number', pass.invoice_number);
    add('Transporter', pass.transporter); add('Truck number', pass.truck_number); add('Driver', [pass.driver_name, pass.driver_phone].filter(Boolean).join(' · '));
  } else {
    add('Customer', pass.customer_name); add('Phone', pass.customer_phone);
    add('Vehicle number', pass.customer_vehicle_number || pass.vehicle_number); add('Engine number', pass.engine_number); add('Chassis number', pass.chassis_number); add('PBO number', pass.pbo_number); add('Purpose', pass.purpose);
  }
  add('Against entry', pass.linked_gate_pass_number);
  add('Invoice', pass.linked_invoice_number);
  add('Estimate', pass.linked_estimate_number);
  add('GRN', pass.grn_number || grn?.grn_number);
  add('Verified by', pass.verified_by?.name ? `${pass.verified_by.name} at ${asDate(pass.verified_at)}` : '');
  add('Notes', pass.notes);

  const items = grn ? (grn.items || []) : (pass.items || []);
  const itemsHtml = items.length ? `
    <h3>${grn ? 'Goods received' : 'Items'}</h3>
    <table class="items"><thead><tr><th>#</th><th>Description</th><th>Part #</th><th>Qty${grn ? ' expected' : ''}</th>${grn ? '<th>Received</th><th>Rejected</th>' : '<th>Unit</th><th>Inventory</th>'}</tr></thead><tbody>
    ${items.map((item, i) => `<tr><td>${i + 1}</td><td>${esc(item.description)}</td><td>${esc(item.part_number || '')}</td><td>${esc(grn ? item.quantity_expected : item.quantity)}</td>${grn ? `<td>${esc(item.quantity_received)}</td><td>${esc(item.quantity_rejected)}</td>` : `<td>${esc(item.unit || '')}</td><td>${item.add_to_inventory ? 'Yes' : '—'}</td>`}</tr>`).join('')}
    </tbody></table>` : '';
  const invoiceHtml = pass.linked_invoice ? `
    <h3>Invoice ${esc(pass.linked_invoice.number)} — ${esc(String(pass.linked_invoice.payment_term || 'paid').toUpperCase())}</h3>
    <table class="items"><thead><tr><th>#</th><th>Item</th><th>Qty</th></tr></thead><tbody>
    ${(pass.linked_invoice.lines || []).map((line, i) => `<tr><td>${i + 1}</td><td>${esc(line.description)}</td><td>${esc(line.quantity)}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted">Total ${esc(money(pass.linked_invoice.total))} · Paid ${esc(money(pass.linked_invoice.paid))} · Balance ${esc(money(pass.linked_invoice.balance))}</p>` : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(grn ? grn.grn_number : pass.gate_pass_number)}</title>
  <style>
    body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;padding:28px 34px;font-size:13px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px}
    .head h1{margin:0;font-size:20px} .head .co{font-size:12px;color:#475569} .head .num{text-align:right}
    .num strong{font-size:18px;display:block} .num svg{height:54px;width:auto;margin-top:6px}
    table.kv{border-collapse:collapse;width:100%;margin-bottom:14px} table.kv th{text-align:left;width:180px;color:#475569;font-weight:600;padding:5px 8px;border-bottom:1px solid #e2e8f0} table.kv td{padding:5px 8px;border-bottom:1px solid #e2e8f0}
    h3{font-size:13px;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#334155}
    table.items{border-collapse:collapse;width:100%} table.items th{text-align:left;background:#f1f5f9;padding:6px 8px;font-size:12px;border-bottom:2px solid #0f172a} table.items td{padding:6px 8px;border-bottom:1px solid #e2e8f0}
    .muted{color:#64748b;font-size:12px}
    .sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:40px} .sign div{border-top:1px solid #0f172a;padding-top:6px;font-size:12px;color:#475569;text-align:center}
    @media print{body{padding:10mm}}
  </style></head><body>
  <div class="head"><div><h1>${esc(grn ? 'Goods Receiving Note' : heading)}</h1><div class="co">${esc(company.name || '')}${company.phone ? ' · ' + esc(company.phone) : ''}${company.address ? '<br>' + esc(company.address) : ''}</div></div>
  <div class="num"><strong>${esc(grn ? grn.grn_number : pass.gate_pass_number)}</strong>${barcodeSvg}<div class="muted">${esc(pass.barcode || '')}</div></div></div>
  <table class="kv">${rows.join('')}</table>
  ${itemsHtml}${invoiceHtml}
  <div class="sign"><div>Issued by</div><div>${pass.entry_type === 'customer' ? 'Customer' : 'Driver'}</div><div>Gate / Guard</div></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
  </body></html>`;
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return false;
  win.document.open(); win.document.write(html); win.document.close();
  return true;
}

/** The details block used by the drawer and the guard's screen. */
export function GatePassDetails({ pass }) {
  if (!pass) return null;
  const Row = ({ label, value }) => (value != null && value !== '' && value !== '-' ? (
    <div className="email-drawer-row"><span className="email-drawer-label">{label}</span><span className="email-drawer-value">{value}</span></div>
  ) : null);
  return (
    <>
      <div className="email-drawer-section">
        <h4>Details</h4>
        <div className="email-drawer-grid">
          <Row label="Gate Pass #" value={pass.gate_pass_number} />
          <Row label="Type" value={`${pass.entry_type === 'customer' ? 'Customer' : 'Logistic'} — ${pass.direction === 'in' ? 'IN' : 'OUT'}`} />
          <Row label="Status" value={statusBadge(pass.status)} />
          <Row label="Date" value={asDate(pass.date)} />
          {pass.entry_type === 'logistic' ? (<>
            <Row label="R/O #" value={pass.ro_number} /><Row label="C/O #" value={pass.co_number} /><Row label="Invoice #" value={pass.invoice_number} />
            <Row label="Transporter" value={pass.transporter} /><Row label="Truck" value={pass.truck_number} /><Row label="Driver" value={[pass.driver_name, pass.driver_phone].filter(Boolean).join(' · ')} />
          </>) : (<>
            <Row label="Customer" value={pass.customer_name} /><Row label="Phone" value={pass.customer_phone} />
            <Row label="Vehicle No" value={pass.customer_vehicle_number} /><Row label="Engine No" value={pass.engine_number} /><Row label="Chassis No" value={pass.chassis_number} /><Row label="PBO" value={pass.pbo_number} /><Row label="Purpose" value={pass.purpose} />
          </>)}
          <Row label="Barcode" value={pass.barcode} />
          <Row label="Verified" value={pass.verified_by?.name ? `${pass.verified_by.name} · ${asDate(pass.verified_at)}` : ''} />
          <Row label="Notes" value={pass.notes} />
        </div>
      </div>
      {(pass.items || []).length > 0 && (
        <div className="email-drawer-section">
          <h4>Items</h4>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Description</th><th>Part #</th><th style={{ textAlign: 'right' }}>Qty</th><th>Inventory</th></tr></thead>
            <tbody>{pass.items.map((item) => <tr key={item.id}><td>{item.description}</td><td>{item.part_number || '—'}</td><td style={{ textAlign: 'right' }}>{item.quantity} {item.unit}</td><td>{item.add_to_inventory ? (item.stock_applied ? <span className="badge badge-success">RECEIVED</span> : <span className="badge badge-warning">ON ISSUE</span>) : '—'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {(pass.linked_gate_pass_number || pass.linked_invoice_number || pass.linked_estimate_number || pass.grn_number) && (
        <div className="email-drawer-section">
          <h4>Linked Documents</h4>
          <div className="email-drawer-grid">
            <Row label="Against entry" value={pass.linked_gate_pass_number} />
            <Row label="Invoice" value={pass.linked_invoice_number} />
            <Row label="Estimate" value={pass.linked_estimate_number} />
            <Row label="GRN" value={pass.grn_number} />
          </div>
          {pass.linked_invoice && (
            <table className="data-table" style={{ width: '100%', marginTop: 8 }}>
              <thead><tr><th>Invoice line</th><th style={{ textAlign: 'right' }}>Qty</th></tr></thead>
              <tbody>{(pass.linked_invoice.lines || []).map((line, i) => <tr key={i}><td>{line.description}</td><td style={{ textAlign: 'right' }}>{line.quantity}</td></tr>)}</tbody>
            </table>
          )}
          {pass.linked_invoice && <p className="text-muted small" style={{ marginTop: 6 }}>Total {money(pass.linked_invoice.total)} · Paid {money(pass.linked_invoice.paid)} · Balance {money(pass.linked_invoice.balance)} · {String(pass.linked_invoice.payment_term || 'paid').toUpperCase()}</p>}
        </div>
      )}
      {(pass.attachments || []).length > 0 && (
        <div className="email-drawer-section">
          <h4>Attachments</h4>
          <div className="gp-attachments">{pass.attachments.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="gp-attachment">{file.mime?.startsWith('image/') ? <img src={file.url} alt={file.name} /> : <span>{file.name}</span>}</a>)}</div>
        </div>
      )}
    </>
  );
}
