/**
 * The gate-pass list + form, shared by Gate Pass In and Gate Pass Out.
 *
 *   direction 'in'  — logistic entries (truck, R/O, C/O, invoice #, items,
 *                     photos; parts flagged for inventory are received on
 *                     issue) and customer entries (name, vehicle, engine, PBO
 *                     → entry acknowledgement).
 *   direction 'out' — logistic exits against an entry, with a GRN; customer
 *                     exits against the entry + the invoice / estimate, which
 *                     the guard then verifies on the Gate Verify screen.
 *
 * Nothing here moves stock except the logistic entry receipt (client decision).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LogIn, LogOut, Truck, UserRound, ShieldCheck, Printer, Plus, Trash2, Paperclip, ClipboardCheck, PackageCheck } from 'lucide-react';
import { gatePassAPI, customerAPI, partsAPI, invoiceAPI, partsInvoiceAPI, customInvoicesAPI } from '../../services/api';
import MasterQuickCreate from '../../components/MasterQuickCreate';
import { useAuth } from '../../context/AuthContext';
import { pageActions, dropdownHint } from '../../utils/roleJobs';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import SearchableSelect from '../../components/SearchableSelect';
import StatCards from '../../components/StatCards';
import ActionButtons from '../../components/ActionButtons';
import ConfirmModal from '../../components/ConfirmModal';
import ServerPagination from '../../components/ServerPagination';
import EmailDrawer from '../../components/EmailDrawer';
import CustomerQuickCreate from '../../components/customers/CustomerQuickCreate';
import { GatePassDetails, printGatePass, statusBadge, asDay } from './GatePassShared';
import '../../styles/userManagement.css';
import '../../styles/sales-print.css';

const customerLabel = (c) => [c.customer_number || c.customerCode, [c.first_name || c.firstName, c.last_name || c.lastName].filter(Boolean).join(' ') || c.companyName || c.name, c.phone].filter(Boolean).join(' - ');
const emptyItem = () => ({ partId: '', description: '', itemType: 'other', quantity: 1, unit: '', addToInventory: false, notes: '' });

export default function GatePassList({ direction }) {
  const isIn = direction === 'in';
  const pageKey = isIn ? 'gatepass_in' : 'gatepass_out';
  const { user } = useAuth();
  const can = pageActions(user, pageKey);
  const canVerify = pageActions(user, 'gatepass_verify')('verify') || can('verify');
  const token = localStorage.getItem('token');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', entryType: '', status: '', dateFrom: '', dateTo: '' });
  const [drawer, setDrawer] = useState(null);
  const [confirm, setConfirm] = useState({ isOpen: false });

  const [modal, setModal] = useState(null); // { item }
  const [form, setForm] = useState({});
  const [items, setItems] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [parts, setParts] = useState([]);
  const [openEntries, setOpenEntries] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { direction, ...filters, page: pagination.page, limit: pagination.limit };
      Object.keys(params).forEach((k) => (params[k] === '' || params[k] == null) && delete params[k]);
      const res = await gatePassAPI.getAll(params);
      setRows(res.data?.data || []);
      const p = res.data?.pagination; if (p) setPagination((prev) => ({ ...prev, total: p.total || 0, totalPages: p.totalPages || 0 }));
      gatePassAPI.getSummary().then((s) => setSummary(s.data?.data || null)).catch(() => {});
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to load gate passes'); setRows([]); }
    finally { setLoading(false); }
  }, [direction, filters, pagination.page, pagination.limit]);
  useEffect(() => { fetchData(); }, [fetchData]);

  /** Re-read the parts list — after one has just been created from this form. */
  const reloadParts = useCallback(async () => {
    try {
      const res = await partsAPI.getAll({ limit: 500, ...dropdownHint(pageKey, 'create', 'part') });
      setParts(res.data?.data?.parts || res.data?.data || []);
    } catch { /* the picker keeps whatever it had */ }
  }, [pageKey]);

  const loadDropdowns = useCallback(async (entryType) => {
    try {
      const [c, p, o] = await Promise.allSettled([
        customerAPI.getAllForDropdown(dropdownHint(pageKey, 'create', 'customer')),
        isIn && entryType === 'logistic' ? partsAPI.getAll({ limit: 500, ...dropdownHint(pageKey, 'create', 'part') }) : Promise.resolve(null),
        !isIn ? gatePassAPI.openEntries({ entryType }) : Promise.resolve(null),
      ]);
      setCustomers(c.status === 'fulfilled' ? c.value?.data?.data || [] : []);
      if (p.status === 'fulfilled' && p.value) setParts(p.value.data?.data?.parts || p.value.data?.data || []);
      if (o.status === 'fulfilled' && o.value) setOpenEntries(o.value.data?.data || []);
      if (!isIn && entryType === 'customer') {
        const lists = await Promise.allSettled([invoiceAPI.getAll({ limit: 100 }), partsInvoiceAPI.getAll({ limit: 100 }), customInvoicesAPI.getAll({ limit: 100 }).catch(() => ({ data: { data: [] } }))]);
        const all = [];
        lists.forEach((res, i) => { if (res.status === 'fulfilled') (res.value?.data?.data || []).forEach((inv) => all.push({ id: inv.id, label: `${inv.invoice_number} — ${inv.customer_name || ''} — PKR ${Number(inv.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, customer_id: inv.customer_id, model: ['Invoice', 'PartInvoice', 'CustomInvoice'][i] })); });
        setInvoices(all);
      }
    } catch { /* pickers simply stay empty */ }
  }, [pageKey, isIn]);

  /**
   * Choosing a customer also brings their vehicle forward, when the form has
   * nothing typed in those boxes yet. Never overwrites what the guard has
   * already entered.
   */
  const pickCustomer = (customerId) => {
    const customer = customers.find((c) => String(c.id || c._id) === String(customerId));
    const vehicle = (customer?.vehicles || []).find((v) => v.isPrimary) || customer?.vehicles?.[0];
    setForm((prev) => ({
      ...prev,
      customerId,
      vehicleNumber: prev.vehicleNumber || vehicle?.registrationNumber || '',
      engineNumber: prev.engineNumber || vehicle?.engineNumber || '',
      chassisNumber: prev.chassisNumber || vehicle?.chassisNumber || '',
      pboNumber: prev.pboNumber || vehicle?.pboNumber || '',
    }));
  };

  const openCreate = (entryType = 'logistic') => {
    setForm({ entryType, customerId: '', walkIn: false, walkInName: '', walkInPhone: '', roNumber: '', coNumber: '', invoiceNumber: '', transporter: '', truckNumber: '', driverName: '', driverPhone: '', vehicleNumber: '', engineNumber: '', chassisNumber: '', pboNumber: '', purpose: '', notes: '', linkedGatePassId: '', invoiceId: '', invoiceModel: '', estimateId: '' });
    setItems(entryType === 'logistic' && isIn ? [emptyItem()] : []);
    setFiles([]);
    setModal({ item: null });
    loadDropdowns(entryType);
  };
  const openEdit = (item) => {
    setForm({ entryType: item.entry_type, customerId: item.customer_id || '', walkIn: false, walkInName: item.walk_in_name || '', walkInPhone: item.walk_in_phone || '', roNumber: item.ro_number, coNumber: item.co_number, invoiceNumber: item.invoice_number, transporter: item.transporter, truckNumber: item.truck_number, driverName: item.driver_name, driverPhone: item.driver_phone, vehicleNumber: item.customer_vehicle_number, engineNumber: item.engine_number, chassisNumber: item.chassis_number, pboNumber: item.pbo_number, purpose: item.purpose, notes: item.notes, linkedGatePassId: item.linked_gate_pass_id || '', invoiceId: item.linked_invoice_id || '', invoiceModel: item.linked_invoice_model || '', estimateId: item.linked_estimate_id || '' });
    setItems((item.items || []).map((it) => ({ partId: it.part_id || '', description: it.description, itemType: it.item_type, quantity: it.quantity, unit: it.unit, addToInventory: it.add_to_inventory, notes: it.notes })));
    setFiles([]);
    setModal({ item });
    loadDropdowns(item.entry_type);
  };
  const close = () => { if (!saving) setModal(null); };
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setItem = (index, patch) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const switchEntryType = (entryType) => { set('entryType', entryType); if (isIn && entryType === 'logistic' && !items.length) setItems([emptyItem()]); loadDropdowns(entryType); };

  const pickEntry = (id) => {
    set('linkedGatePassId', id);
    const entry = openEntries.find((e) => e.id === id);
    if (!entry) return;
    // The OUT pass inherits the entry's identity; the form shows it read-only-ish.
    if (entry.entry_type === 'customer') setForm((prev) => ({ ...prev, customerId: entry.customer_id || '', vehicleNumber: entry.customer_vehicle_number, engineNumber: entry.engine_number, pboNumber: entry.pbo_number, purpose: entry.purpose }));
    else setForm((prev) => ({ ...prev, roNumber: entry.ro_number, coNumber: entry.co_number, invoiceNumber: entry.invoice_number, transporter: entry.transporter, truckNumber: entry.truck_number, driverName: entry.driver_name }));
  };

  const submit = async () => {
    if (saving || !modal) return;
    if (form.entryType === 'customer' && isIn && !form.walkIn && !form.customerId) { toast.error('Select the customer'); return; }
    if (!isIn && !form.linkedGatePassId && form.entryType === 'logistic') { toast.error('Select the entry this exit goes against'); return; }
    if (!isIn && form.entryType === 'customer' && !form.invoiceId && !form.estimateId && !form.linkedGatePassId) { toast.error('A customer exit needs the entry and its invoice or estimate'); return; }
    setSaving(true);
    try {
      const payload = { direction, ...form, items: items.filter((it) => it.partId || String(it.description || '').trim()).map((it) => ({ ...it, quantity: Number(it.quantity) || 1 })) };
      const res = modal.item ? await gatePassAPI.update(modal.item.id, payload) : await gatePassAPI.create(payload);
      const saved = res.data?.data;
      if (files.length && saved?.id) {
        const fd = new FormData(); files.forEach((file) => fd.append('files', file));
        try { await gatePassAPI.uploadAttachment(saved.id, fd); } catch (error) { toast.error(error.response?.data?.message || 'Photos could not be attached'); }
      }
      toast.success(res.data?.message || 'Saved');
      setModal(null);
      fetchData();
    } catch (error) { toast.error(error.response?.data?.message || 'Operation failed'); }
    finally { setSaving(false); }
  };
  useModalKeyboard(Boolean(modal), close, submit, saving);

  const doIssue = (item) => setConfirm({
    isOpen: true, type: 'primary', title: 'Issue gate pass',
    message: item.direction === 'in' && item.entry_type === 'logistic' && (item.items || []).some((it) => it.add_to_inventory && !it.stock_applied)
      ? `Issue ${item.gate_pass_number}? The part lines flagged for inventory will be received into stock now.`
      : `Issue ${item.gate_pass_number}? It becomes the printable ${item.entry_type === 'customer' && item.direction === 'in' ? 'entry acknowledgement' : 'gate pass'}.`,
    onConfirm: async () => { try { const res = await gatePassAPI.issue(item.id); toast.success(res.data?.message); fetchData(); } catch (error) { toast.error(error.response?.data?.message || 'Failed'); } setConfirm({ isOpen: false }); },
  });
  const doGrn = (item) => setConfirm({
    isOpen: true, type: 'primary', title: 'Issue Goods Receiving Note',
    message: `Issue a GRN against ${item.linked_gate_pass_number || item.gate_pass_number} for the truck to take?`,
    onConfirm: async () => { try { const res = await gatePassAPI.createGrn(item.id, {}); toast.success(res.data?.message); fetchData(); } catch (error) { toast.error(error.response?.data?.message || 'Failed'); } setConfirm({ isOpen: false }); },
  });
  const doVerify = (item) => setConfirm({
    isOpen: true, type: 'primary', title: 'Verify at gate',
    message: `Confirm ${item.gate_pass_number} has been checked at the gate?`,
    onConfirm: async () => { try { const res = await gatePassAPI.verify(item.id, {}); toast.success(res.data?.message); fetchData(); } catch (error) { toast.error(error.response?.data?.message || 'Failed'); } setConfirm({ isOpen: false }); },
  });
  const doDelete = (item) => setConfirm({
    isOpen: true, title: 'Delete gate pass', message: `Delete ${item.gate_pass_number}? An issued pass is cancelled and kept for the record.`,
    onConfirm: async () => { try { const res = await gatePassAPI.delete(item.id); toast.success(res.data?.message); fetchData(); } catch (error) { toast.error(error.response?.data?.message || 'Failed'); } setConfirm({ isOpen: false }); },
  });
  const doPrint = async (item, grn = false) => {
    try {
      const res = await gatePassAPI.getById(item.id);
      const pass = res.data?.data;
      await printGatePass(pass, { token, grn: grn ? pass.grn : null });
    } catch (error) { toast.error(error.response?.data?.message || 'Could not open the print view'); }
  };
  const openDrawer = async (item) => { setDrawer({ id: item.id }); try { const res = await gatePassAPI.getById(item.id); setDrawer(res.data?.data || null); } catch { setDrawer(null); } };

  const cards = useMemo(() => summary ? (isIn ? [
    { key: 'today', label: 'In today', value: summary.in_today, icon: <LogIn size={18} />, color: '#3b82f6', bg: '#dbeafe' },
    { key: 'logistic', label: 'Logistic entries', value: summary.logistic_in, icon: <Truck size={18} />, color: '#0ea5e9', bg: '#e0f2fe', onClick: () => setFilters((f) => ({ ...f, entryType: f.entryType === 'logistic' ? '' : 'logistic' })), active: filters.entryType === 'logistic' },
    { key: 'customer', label: 'Customer entries', value: summary.customer_in, icon: <UserRound size={18} />, color: '#7c3aed', bg: '#ede9fe', onClick: () => setFilters((f) => ({ ...f, entryType: f.entryType === 'customer' ? '' : 'customer' })), active: filters.entryType === 'customer' },
    { key: 'open', label: 'Still inside (no exit yet)', value: summary.open, icon: <ShieldCheck size={18} />, color: '#f59e0b', bg: '#fef3c7' },
  ] : [
    { key: 'today', label: 'Out today', value: summary.out_today, icon: <LogOut size={18} />, color: '#3b82f6', bg: '#dbeafe' },
    { key: 'awaiting', label: 'Awaiting guard verification', value: summary.awaiting_verify, icon: <ShieldCheck size={18} />, color: '#f59e0b', bg: '#fef3c7', onClick: () => setFilters((f) => ({ ...f, status: f.status === 'issued' ? '' : 'issued' })), active: filters.status === 'issued' },
    { key: 'verified', label: 'Verified / closed', value: summary.verified, icon: <ClipboardCheck size={18} />, color: '#16a34a', bg: '#dcfce7' },
    { key: 'open', label: 'Entries still inside', value: summary.open, icon: <LogIn size={18} />, color: '#7c3aed', bg: '#ede9fe' },
  ]) : [], [summary, isIn, filters.entryType, filters.status]);

  /**
   * A row's buttons, defined once — the table and the cards both draw them,
   * and two copies would drift the first time a condition changed.
   */
  const rowActions = (row) => (
    <ActionButtons title={row.gate_pass_number} showEdit={can('edit') && ['draft', 'issued'].includes(row.status)} showDelete={can('delete') && row.status !== 'cancelled'} onEdit={() => openEdit(row)} onDelete={() => doDelete(row)}
      customActions={[
        ...(can('edit') && row.status === 'draft' ? [{ icon: <ClipboardCheck size={16} />, title: 'Issue', className: 'btn-success', onClick: () => doIssue(row) }] : []),
        ...(!isIn && row.entry_type === 'logistic' && can('generateGrn') && !row.grn_number && row.status !== 'cancelled' ? [{ icon: <PackageCheck size={16} />, title: 'Issue GRN', className: 'btn-info', onClick: () => doGrn(row) }] : []),
        ...(!isIn && canVerify && row.status === 'issued' ? [{ icon: <ShieldCheck size={16} />, title: 'Verify at gate', className: 'btn-success', onClick: () => doVerify(row) }] : []),
        ...(can('downloadPdf') ? [{ icon: <Printer size={16} />, title: row.entry_type === 'customer' && isIn ? 'Print entry acknowledgement (PDF)' : 'Print gate pass (PDF)', onClick: () => doPrint(row) }] : []),
        ...(can('downloadPdf') && row.grn_number ? [{ icon: <Printer size={16} />, title: 'Print GRN (PDF)', className: 'btn-info', onClick: () => doPrint(row, true) }] : []),
      ]} />
  );

  return (
    <div className="card sales-page">
      <div className="card-header d-flex justify-content-between align-items-center">
        <div><h3>{isIn ? 'Gate Pass — In' : 'Gate Pass — Out'}</h3></div>
        {can('create') && (
          <div className="sales-header-actions">
            <button className="btn btn-secondary" onClick={() => openCreate('logistic')}><Truck size={16} /> {isIn ? 'Logistic entry' : 'Logistic exit'}</button>
            <button className="btn btn-primary" onClick={() => openCreate('customer')}><UserRound size={16} /> {isIn ? 'Customer entry' : 'Customer exit'}</button>
          </div>
        )}
      </div>

      {cards.length > 0 && <StatCards items={cards} />}

      <div className="gp-filters">
        <input type="text" placeholder="Search number, R/O, C/O, truck, customer, vehicle, barcode…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        <select value={filters.entryType} onChange={(e) => setFilters((f) => ({ ...f, entryType: e.target.value }))}><option value="">All types</option><option value="logistic">Logistic</option><option value="customer">Customer</option></select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}><option value="">All statuses</option>{['draft', 'issued', 'verified', 'closed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
        <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ search: '', entryType: '', status: '', dateFrom: '', dateTo: '' })}>Reset</button>
      </div>

      <div className="desktop-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Gate Pass #</th><th>Type</th><th>Date</th>
              {isIn ? <><th>R/O #</th><th>C/O #</th><th>Invoice #</th></> : <><th>Against Entry</th><th>Invoice #</th><th>GRN #</th></>}
              <th>Transporter / Customer</th><th>Vehicle No</th>{isIn && <><th>Engine No</th><th>PBO</th></>}<th>Items</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? <tr><td colSpan={14} style={{ textAlign: 'center', padding: 30 }}><div className="spinner" /></td></tr>
              : rows.length === 0 ? <tr><td colSpan={14} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>No gate passes yet</td></tr>
              : rows.map((row) => (
                <tr key={row.id} onClick={() => openDrawer(row)} style={{ cursor: 'pointer' }}>
                  <td><strong>{row.gate_pass_number}</strong><div className="text-muted small">{row.barcode}</div></td>
                  <td>{row.entry_type === 'customer' ? <span className="badge badge-info">CUSTOMER</span> : <span className="badge badge-secondary">LOGISTIC</span>}</td>
                  <td>{asDay(row.date)}</td>
                  {isIn ? <><td>{row.ro_number || '—'}</td><td>{row.co_number || '—'}</td><td>{row.invoice_number || '—'}</td></> : <><td>{row.linked_gate_pass_number || '—'}</td><td>{row.linked_invoice_number || row.linked_estimate_number || '—'}</td><td>{row.grn_number || '—'}</td></>}
                  <td>{row.party || '—'}{row.entry_type === 'logistic' && row.driver_name && <div className="text-muted small">{row.driver_name}</div>}</td>
                  <td>{row.vehicle_number || '—'}</td>
                  {isIn && <><td>{row.engine_number || '—'}</td><td>{row.pbo_number || '—'}</td></>}
                  <td>{row.item_count || 0}</td>
                  <td>{statusBadge(row.status)}</td>
                  <td onClick={(e) => e.stopPropagation()}>{rowActions(row)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {/* The same rows as cards below 1025px. This table is the widest on the
          site — thirteen columns — so it is put away rather than squeezed. */}
      <div className="mobile-cards-view">
        <div className="mobile-cards-container">
          {loading && !rows.length ? <div className="data-card"><div className="spinner" /></div>
            : rows.length === 0 ? <div className="data-card" style={{ textAlign: 'center', color: '#94a3b8' }}>No gate passes yet</div>
            : rows.map((row) => (
              <div key={row.id} className="data-card" onClick={() => openDrawer(row)}>
                <div className="data-card-top">
                  <div className={`data-card-avatar ${row.entry_type === 'customer' ? 'avatar-cyan' : 'avatar-purple'}`}>
                    {row.entry_type === 'customer' ? 'C' : 'L'}
                  </div>
                  <div className="data-card-info">
                    <span className="data-card-title">{row.gate_pass_number}</span>
                    <span className="data-card-subtitle">{row.party || (row.entry_type === 'customer' ? 'Customer entry' : 'Logistic entry')}</span>
                  </div>
                  {statusBadge(row.status)}
                </div>
                <div className="data-card-body">
                  <div className="data-card-row"><span className="row-icon">📅</span><span className="row-label">Date</span><span className="row-value">{asDay(row.date)}</span></div>
                  {isIn ? (<>
                    {row.ro_number && <div className="data-card-row"><span className="row-icon">📄</span><span className="row-label">R/O #</span><span className="row-value">{row.ro_number}</span></div>}
                    {row.co_number && <div className="data-card-row"><span className="row-icon">📄</span><span className="row-label">C/O #</span><span className="row-value">{row.co_number}</span></div>}
                    {row.invoice_number && <div className="data-card-row"><span className="row-icon">🧾</span><span className="row-label">Invoice #</span><span className="row-value">{row.invoice_number}</span></div>}
                  </>) : (<>
                    {row.linked_gate_pass_number && <div className="data-card-row"><span className="row-icon">🔗</span><span className="row-label">Against</span><span className="row-value">{row.linked_gate_pass_number}</span></div>}
                    {(row.linked_invoice_number || row.linked_estimate_number) && <div className="data-card-row"><span className="row-icon">🧾</span><span className="row-label">Invoice</span><span className="row-value">{row.linked_invoice_number || row.linked_estimate_number}</span></div>}
                    {row.grn_number && <div className="data-card-row"><span className="row-icon">📦</span><span className="row-label">GRN #</span><span className="row-value">{row.grn_number}</span></div>}
                  </>)}
                  {row.vehicle_number && <div className="data-card-row"><span className="row-icon">🚗</span><span className="row-label">Vehicle</span><span className="row-value">{row.vehicle_number}</span></div>}
                  {isIn && row.engine_number && <div className="data-card-row"><span className="row-icon">⚙️</span><span className="row-label">Engine</span><span className="row-value">{row.engine_number}</span></div>}
                  {isIn && row.pbo_number && <div className="data-card-row"><span className="row-icon">🔖</span><span className="row-label">PBO</span><span className="row-value">{row.pbo_number}</span></div>}
                  {row.entry_type === 'logistic' && row.driver_name && <div className="data-card-row"><span className="row-icon">👤</span><span className="row-label">Driver</span><span className="row-value">{row.driver_name}</span></div>}
                  <div className="data-card-row"><span className="row-icon">📦</span><span className="row-label">Items</span><span className="row-value">{row.item_count || 0}</span></div>
                </div>
                <div className="data-card-footer" onClick={(e) => e.stopPropagation()}>{rowActions(row)}</div>
              </div>
            ))}
        </div>
      </div>

      <ServerPagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} loading={loading} onPageChange={(page) => setPagination((p) => ({ ...p, page }))} onPageSizeChange={(l) => setPagination((p) => ({ ...p, limit: l, page: 1 }))} />

      {modal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-content" style={{ maxWidth: 900, width: '96%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.item ? 'Edit' : 'New'} {form.entryType === 'customer' ? 'customer' : 'logistic'} {isIn ? 'entry' : 'exit'}</h3>
              <button className="modal-close" onClick={close}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              {!modal.item && (
                <div className="sales-term-tabs" style={{ padding: '0 0 10px' }} role="tablist">
                  {[['logistic', <><Truck size={14} /> Logistic</>], ['customer', <><UserRound size={14} /> Customer</>]].map(([value, label]) => <button key={value} type="button" role="tab" className={`sales-term-tab${form.entryType === value ? ' active' : ''}`} onClick={() => switchEntryType(value)}>{label}</button>)}
                </div>
              )}

              {!isIn && (
                <div className="form-group">
                  <label>Against entry (gate pass in) {form.entryType === 'logistic' ? '*' : ''}</label>
                  <SearchableSelect value={form.linkedGatePassId} onChange={(e) => pickEntry(e.target.value)} options={openEntries.map((e) => ({ value: e.id, label: `${e.gate_pass_number} — ${e.party || ''} — ${e.vehicle_number || ''} (${asDay(e.date)})` }))} labelField="label" valueField="value" placeholder="Select the entry still inside…" />
                </div>
              )}

              {form.entryType === 'logistic' ? (<>
                <div className="form-row">
                  <div className="form-group"><label>R/O number</label><input type="text" value={form.roNumber} onChange={(e) => set('roNumber', e.target.value)} /></div>
                  <div className="form-group"><label>C/O number</label><input type="text" value={form.coNumber} onChange={(e) => set('coNumber', e.target.value)} /></div>
                  <div className="form-group"><label>Invoice number</label><input type="text" value={form.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} placeholder="Supplier / dispatch invoice" /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Transporter</label><input type="text" value={form.transporter} onChange={(e) => set('transporter', e.target.value)} /></div>
                  <div className="form-group"><label>Truck number</label><input type="text" value={form.truckNumber} onChange={(e) => set('truckNumber', e.target.value)} /></div>
                  <div className="form-group"><label>Driver</label><input type="text" value={form.driverName} onChange={(e) => set('driverName', e.target.value)} /></div>
                  <div className="form-group"><label>Driver phone</label><input type="text" value={form.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} /></div>
                </div>
              </>) : (<>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <div className="form-label-add">
                      <span>{form.walkIn ? 'Walk-in customer' : 'Customer *'}</span>
                      <span className="walkin-toggle">
                        <label><input type="checkbox" checked={form.walkIn === true} onChange={(e) => set('walkIn', e.target.checked)} /> Walk-in</label>
                        {!form.walkIn && <CustomerQuickCreate form={modal.item ? 'edit' : 'create'} pageKey={pageKey} onCreated={async (created) => { await loadDropdowns('customer'); if (created?._id || created?.id) set('customerId', String(created._id || created.id)); }} />}
                      </span>
                    </div>
                    {form.walkIn ? (
                      <div className="form-row walkin-fields"><input type="text" value={form.walkInName} onChange={(e) => set('walkInName', e.target.value)} placeholder="Name" /><input type="text" value={form.walkInPhone} onChange={(e) => set('walkInPhone', e.target.value)} placeholder="Phone" /></div>
                    ) : (
                      // Picking the customer fills in the car they are known to
                      // drive — registration, engine, chassis and PBO from their
                      // record — so the gate stops asking on every visit. Still
                      // editable: they may have brought a different car.
                      <SearchableSelect value={form.customerId} onChange={(e) => pickCustomer(e.target.value)} placeholder="Select customer"><option value="">Select Customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{customerLabel(c)}</option>)}</SearchableSelect>
                    )}
                  </div>
                  <div className="form-group"><label>Purpose</label><input type="text" value={form.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="Routine maintenance, purchase…" /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Vehicle number</label><input type="text" value={form.vehicleNumber} onChange={(e) => set('vehicleNumber', e.target.value)} /></div>
                  <div className="form-group"><label>Engine number</label><input type="text" value={form.engineNumber} onChange={(e) => set('engineNumber', e.target.value)} /></div>
                  <div className="form-group"><label>Chassis number</label><input type="text" value={form.chassisNumber} onChange={(e) => set('chassisNumber', e.target.value)} /></div>
                  <div className="form-group"><label>PBO (if applicable)</label><input type="text" value={form.pboNumber} onChange={(e) => set('pboNumber', e.target.value)} /></div>
                </div>
                {!isIn && (
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 2 }}>
                      <label>Against invoice *</label>
                      <SearchableSelect value={form.invoiceId} onChange={(e) => { const inv = invoices.find((i) => i.id === e.target.value); set('invoiceId', e.target.value); set('invoiceModel', inv?.model || ''); }} options={invoices.filter((i) => !form.customerId || String(i.customer_id) === String(form.customerId) || !i.customer_id).map((i) => ({ value: i.id, label: i.label }))} labelField="label" valueField="value" placeholder="What the customer bought…" />
                      <small className="text-muted">The guard sees the invoice lines when verifying. No stock moves — the invoice already did that.</small>
                    </div>
                  </div>
                )}
              </>)}

              {(isIn || form.entryType === 'logistic') && (
                <div className="card" style={{ padding: '1rem', border: '1px solid #e5e7eb', boxShadow: 'none', marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h5 style={{ margin: 0 }}>{isIn ? 'What came in' : 'What is leaving'}</h5>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItems((prev) => [...prev, emptyItem()])}><Plus size={14} /> Add item</button>
                  </div>
                  {isIn && form.entryType === 'logistic' && <p className="text-muted small" style={{ marginTop: 0 }}>Pick a part and tick “Add to inventory” to receive it into stock when the entry is issued. Anything else (water, packaging) is recorded only.</p>}
                  <div className="gp-items">
                    {items.map((it, index) => (
                      <div className="gp-item" key={index}>
                        <div className="form-group gp-item-part">
                          {/* A delivery can carry something that has never been
                              stocked before; raising the part here means the entry
                              does not have to be abandoned to go and create it. */}
                          <div className="form-label-add">
                            <span>Part (optional)</span>
                            <MasterQuickCreate
                              type="part"
                              pageKey={pageKey}
                              onCreated={async (created) => {
                                await reloadParts();
                                if (created?.id) setItem(index, { partId: String(created.id), description: created.name || '', itemType: 'part', addToInventory: true });
                              }}
                            />
                          </div>
                          <SearchableSelect value={it.partId} onChange={(e) => { const part = parts.find((p) => String(p.id || p._id) === e.target.value); setItem(index, { partId: e.target.value, description: part ? (part.name || part.part_name) : it.description, itemType: part ? 'part' : it.itemType }); }} options={[{ value: '', label: '— not a stocked part —' }, ...parts.map((p) => ({ value: String(p.id || p._id), label: `${p.part_number || p.sku || ''} ${p.name || p.part_name || ''}`.trim() }))]} labelField="label" valueField="value" />
                        </div>
                        <div className="form-group gp-item-desc"><label>Description *</label><input type="text" value={it.description} onChange={(e) => setItem(index, { description: e.target.value })} placeholder="e.g. Brake pads / Water bottles" /></div>
                        <div className="form-group"><label>Qty</label><input type="number" step="any" min="0" value={it.quantity} onChange={(e) => setItem(index, { quantity: e.target.value })} /></div>
                        <div className="form-group"><label>Unit</label><input type="text" value={it.unit} onChange={(e) => setItem(index, { unit: e.target.value })} placeholder="pcs" /></div>
                        <div className="form-group gp-item-inv"><label>&nbsp;</label><label className="gp-check"><input type="checkbox" disabled={!it.partId || !isIn} checked={it.addToInventory === true} onChange={(e) => setItem(index, { addToInventory: e.target.checked })} /> Add to inventory</label></div>
                        <button type="button" className="btn-action btn-delete" title="Remove" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
                      </div>
                    ))}
                    {!items.length && <p className="text-muted small">No items listed.</p>}
                  </div>
                </div>
              )}

              {isIn && (
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label><Paperclip size={14} /> Photos of the goods / vehicle</label>
                  <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles([...e.target.files])} />
                  {files.length > 0 && <small className="text-muted">{files.length} file(s) will be attached after saving.</small>}
                </div>
              )}
              <div className="form-group"><label>Notes</label><textarea rows="2" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : modal.item ? 'Save changes' : `Create ${isIn ? 'entry' : 'exit'}`}</button>
            </div>
          </div>
        </div>
      )}

      <EmailDrawer isOpen={Boolean(drawer)} onClose={() => setDrawer(null)} title={drawer?.gate_pass_number ? `Gate pass ${drawer.gate_pass_number}` : 'Gate pass'} width="52%">
        {drawer && !drawer.gate_pass_number ? <div className="spinner" /> : (<>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {can('downloadPdf') && drawer?.id && <button className="btn btn-secondary btn-sm" onClick={() => printGatePass(drawer, { token })}><Printer size={14} /> Print / PDF</button>}
            {can('downloadPdf') && drawer?.grn && <button className="btn btn-secondary btn-sm" onClick={() => printGatePass(drawer, { token, grn: drawer.grn })}><Printer size={14} /> Print GRN</button>}
            {!isIn && canVerify && drawer?.status === 'issued' && <button className="btn btn-success btn-sm" onClick={() => { doVerify(drawer); setDrawer(null); }}><ShieldCheck size={14} /> Verify at gate</button>}
          </div>
          <GatePassDetails pass={drawer} />
        </>)}
      </EmailDrawer>

      <ConfirmModal isOpen={confirm.isOpen} title={confirm.title} message={confirm.message} type={confirm.type || 'danger'} onConfirm={confirm.onConfirm} onCancel={() => setConfirm({ isOpen: false })} />
    </div>
  );
}
