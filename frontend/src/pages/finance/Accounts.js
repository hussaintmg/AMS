/**
 * Accounts & Petty Cash — /finance/accounts (page `accounts`).
 *
 * Five tabs: Accounts (the money accounts, their balances and limits, with the
 * petty-cash sweep), Transfers, Receivables (credit invoices, what we are
 * owed), Payables (what we owe), and the Balance Sheet (opening / in / out /
 * closing per account for a period, from the ledger).
 */
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Landmark, ArrowLeftRight, HandCoins, Receipt, AlertTriangle, Plus, Download, Pencil, Trash2, Wallet } from 'lucide-react';
import { accountsAPI, vehicleMasterAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { pageActions } from '../../utils/roleJobs';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import SearchableSelect from '../../components/SearchableSelect';
import StatCards from '../../components/StatCards';
import ActionButtons from '../../components/ActionButtons';
import ConfirmModal from '../../components/ConfirmModal';
import ServerPagination from '../../components/ServerPagination';
import ErrorBoundary from '../../components/ErrorBoundary';
import { formatPKR } from '../../components/sales/CorporateDocumentView';
import '../../styles/userManagement.css';
import '../../styles/sales-print.css';

const TABS = [
  { key: 'accounts', label: 'Accounts', icon: <Landmark size={15} /> },
  { key: 'transfers', label: 'Transfers', icon: <ArrowLeftRight size={15} /> },
  { key: 'receivables', label: 'Receivables', icon: <HandCoins size={15} /> },
  { key: 'payables', label: 'Payables', icon: <Receipt size={15} /> },
  { key: 'sheet', label: 'Balance Sheet', icon: <Wallet size={15} /> },
];
const TYPES = [['petty_cash', 'Petty cash'], ['ibft', 'IBFT / bank transfer'], ['card_machine', 'Card machine'], ['online_payment', 'Online payment'], ['internal_company', 'Internal company account'], ['bank', 'Bank'], ['other', 'Other']];
const STATUSES = [['active', 'Active'], ['in_process', 'In process'], ['completed', 'Completed'], ['closed', 'Closed']];
const money = (value) => formatPKR(Number(value) || 0);
const asDate = (value) => (value ? new Date(value).toLocaleDateString('en-GB') : '-');
/**
 * Anything a table cell is asked to print, as text it can actually print.
 *
 * A payable whose supplier was not resolved by name arrived as an object, and
 * React refuses to render one — which unmounted the page and left the operator
 * looking at a blank screen with nothing to go on. Every cell here goes through
 * this, so the worst case is an odd-looking cell rather than a dead tab.
 */
const text = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') return String(value.name || value.label || value._id || '');
  return String(value);
};
const label = (value) => text(value).replace(/_/g, ' ').toUpperCase();

export default function Accounts() {
  const { user } = useAuth();
  const can = pageActions(user, 'accounts');
  const [tab, setTab] = useState('accounts');
  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [range, setRange] = useState({ dateFrom: '', dateTo: '' });
  const [sheet, setSheet] = useState(null);
  const [modal, setModal] = useState(null); // { kind: 'account'|'transfer'|'payable'|'pay'|'adjust', item }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ isOpen: false });
  const [vendors, setVendors] = useState([]);

  const loadSummary = useCallback(async () => {
    try { const res = await accountsAPI.getSummary(); setSummary(res.data?.data || null); setAccounts(res.data?.data?.accounts || []); } catch (error) { toast.error(error.response?.data?.message || 'Failed to load accounts'); }
  }, []);

  const loadTab = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit, ...(range.dateFrom ? { dateFrom: range.dateFrom } : {}), ...(range.dateTo ? { dateTo: range.dateTo } : {}) };
      if (tab === 'transfers') { const res = await accountsAPI.getTransfers(params); setRows(res.data?.data || []); setPagination((p) => ({ ...p, total: res.data?.pagination?.total || 0, totalPages: res.data?.pagination?.totalPages || 0 })); }
      else if (tab === 'payables') { const res = await accountsAPI.getPayables(params); setRows(res.data?.data || []); setPagination((p) => ({ ...p, total: res.data?.pagination?.total || 0, totalPages: res.data?.pagination?.totalPages || 0 })); }
      else if (tab === 'receivables') { const res = await accountsAPI.getReceivables(); setRows(res.data?.data || []); setPagination((p) => ({ ...p, total: (res.data?.data || []).length, totalPages: 1 })); }
      else if (tab === 'sheet') { const res = await accountsAPI.getBalanceSheet(params); setSheet(res.data?.data || null); }
      else setRows([]);
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to load'); setRows([]); }
    finally { setLoading(false); }
  }, [tab, pagination.page, pagination.limit, range]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadTab(); }, [loadTab]);
  useEffect(() => { vehicleMasterAPI.getSuppliers({ limit: 500 }).then((res) => setVendors(res.data?.data?.suppliers || res.data?.data || [])).catch(() => {}); }, []);

  const refresh = () => { loadSummary(); loadTab(); };
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const open = (kind, item = null) => {
    const defaults = {
      account: { name: '', code: '', type: 'other', description: '', openingBalance: '', limit: '', status: 'active', sweepTo: '' },
      transfer: { fromAccountId: '', toAccountId: '', amount: '', transferDate: new Date().toISOString().slice(0, 10), reference: '', notes: '' },
      payable: { vendorId: '', vendorName: '', description: '', category: '', amount: '', dueDate: '', notes: '' },
      pay: { amount: item ? item.balance : '', accountId: accounts.find((a) => a.type === 'petty_cash')?.id || '', reference: '', notes: '' },
      adjust: { amount: '', direction: 'in', notes: '' },
    }[kind];
    const seeded = item && kind === 'account' ? { name: item.name, code: item.code, type: item.type, description: item.description, openingBalance: item.opening_balance, limit: item.limit, status: item.status, sweepTo: item.sweep_to || '' } : item && kind === 'payable' ? { vendorId: text(item.vendor_id), vendorName: text(item.vendor), description: item.description, category: item.category, amount: item.amount, dueDate: item.due_date ? String(item.due_date).slice(0, 10) : '', notes: item.notes } : {};
    setForm({ ...defaults, ...seeded });
    setModal({ kind, item });
  };
  const close = () => { if (!saving) setModal(null); };

  const submit = async () => {
    if (!modal || saving) return;
    setSaving(true);
    try {
      let res;
      if (modal.kind === 'account') res = modal.item ? await accountsAPI.update(modal.item.id, form) : await accountsAPI.create(form);
      else if (modal.kind === 'transfer') res = await accountsAPI.createTransfer(form);
      else if (modal.kind === 'payable') res = modal.item ? await accountsAPI.updatePayable(modal.item.id, form) : await accountsAPI.createPayable(form);
      else if (modal.kind === 'pay') res = await accountsAPI.payPayable(modal.item.id, form);
      else if (modal.kind === 'adjust') res = await accountsAPI.adjust(modal.item.id, form);
      toast.success(res?.data?.message || 'Saved');
      setModal(null);
      refresh();
    } catch (error) { toast.error(error.response?.data?.message || 'Operation failed'); }
    finally { setSaving(false); }
  };
  useModalKeyboard(Boolean(modal), close, submit, saving);

  const sweep = () => setConfirm({
    isOpen: true, title: 'Transfer to internal company account', type: 'primary',
    message: `Petty cash holds ${money(summary?.limit?.balance)} against a limit of ${money(summary?.limit?.limit)}. Move the excess of ${money(summary?.limit?.excess)} to ${summary?.limit?.sweepTo?.name || 'the internal company account'}?`,
    onConfirm: async () => { try { const res = await accountsAPI.sweep({}); toast.success(res?.data?.message || 'Transferred'); refresh(); } catch (error) { toast.error(error.response?.data?.message || 'Transfer failed'); } setConfirm({ isOpen: false }); },
  });
  const removeAccount = (item) => setConfirm({ isOpen: true, title: 'Delete account', message: `Delete ${item.name}? Accounts with ledger entries are closed instead.`, onConfirm: async () => { try { const res = await accountsAPI.delete(item.id); toast.success(res.data?.message); refresh(); } catch (error) { toast.error(error.response?.data?.message || 'Failed'); } setConfirm({ isOpen: false }); } });
  const removePayable = (item) => setConfirm({ isOpen: true, title: 'Delete payable', message: `Delete ${item.payable_number}?`, onConfirm: async () => { try { const res = await accountsAPI.deletePayable(item.id); toast.success(res.data?.message); refresh(); } catch (error) { toast.error(error.response?.data?.message || 'Failed'); } setConfirm({ isOpen: false }); } });

  const exportCsv = (title, list, columns) => {
    if (!list.length) { toast.error('Nothing to export'); return; }
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [columns.map(([, label]) => esc(label)).join(','), ...list.map((row) => columns.map(([key]) => esc(typeof key === 'function' ? key(row) : row[key])).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${title}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const limit = summary?.limit;
  const cards = summary ? [
    { key: 'total', label: 'All accounts', value: money(summary.total_balance), icon: <Landmark size={18} />, color: '#3b82f6', bg: '#dbeafe', onClick: () => setTab('accounts'), active: tab === 'accounts' },
    ...(limit ? [{ key: 'petty', label: limit.account.name, value: money(limit.balance), sub: `Limit ${money(limit.limit)} · ${limit.over ? `over by ${money(limit.excess)}` : 'within limit'}`, icon: <Wallet size={18} />, color: limit.over ? '#dc2626' : '#16a34a', bg: limit.over ? '#fee2e2' : '#dcfce7' }] : []),
    { key: 'receivables', label: 'Receivables', value: money(summary.receivables?.outstanding), sub: `${summary.receivables?.count || 0} credit invoice(s)`, icon: <HandCoins size={18} />, color: '#f59e0b', bg: '#fef3c7', onClick: () => setTab('receivables'), active: tab === 'receivables' },
    { key: 'payables', label: 'Payables', value: money(summary.payables?.outstanding), sub: `${summary.payables?.count || 0} open`, icon: <Receipt size={18} />, color: '#7c3aed', bg: '#ede9fe', onClick: () => setTab('payables'), active: tab === 'payables' },
  ] : [];

  return (
    <div className="card sales-page">
      <div className="card-header d-flex justify-content-between align-items-center">
        <div><h3>Accounts &amp; Petty Cash</h3></div>
        <div className="sales-header-actions">
          {can('transfer') && <button className="btn btn-secondary" onClick={() => open('transfer')}><ArrowLeftRight size={16} /> Transfer</button>}
          {can('create') && tab === 'payables' && <button className="btn btn-primary" onClick={() => open('payable')}><Plus size={16} /> New payable</button>}
          {can('create') && tab !== 'payables' && <button className="btn btn-primary" onClick={() => open('account')}><Plus size={16} /> New account</button>}
        </div>
      </div>

      {/* Wider tracks than the default: every figure here is money, so the
          cards carry longer values than a "12 leads" card does. */}
      {cards.length > 0 && <StatCards items={cards} className="acct-stats" />}

      {limit?.over && (
        <div className="acct-limit-banner">
          <AlertTriangle size={18} />
          <span><strong>{limit.account.name}</strong> is over its limit of {money(limit.limit)} by {money(limit.excess)}. Send the excess to {limit.sweepTo?.name || 'the internal company account'} so the balance and reports reflect it.</span>
          {can('transfer') && <button className="btn btn-primary btn-sm" onClick={sweep}>Transfer {money(limit.excess)}</button>}
        </div>
      )}

      <div className="sales-term-tabs" role="tablist">
        {TABS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`sales-term-tab${tab === item.key ? ' active' : ''}`} onClick={() => { setTab(item.key); setPagination((p) => ({ ...p, page: 1 })); }}>{item.icon} {item.label}</button>)}
        {(tab === 'transfers' || tab === 'sheet' || tab === 'payables') && (
          <span className="acct-range">
            <input type="date" value={range.dateFrom} onChange={(e) => setRange((r) => ({ ...r, dateFrom: e.target.value }))} />
            <span>to</span>
            <input type="date" value={range.dateTo} onChange={(e) => setRange((r) => ({ ...r, dateTo: e.target.value }))} />
          </span>
        )}
      </div>

      <ErrorBoundary where={`the ${TABS.find((t) => t.key === tab)?.label || tab} tab`} resetKey={tab}>
      <div className="desktop-table">
        {tab === 'accounts' && (
          <table className="data-table">
            <thead><tr><th>Account</th><th>Type</th><th>Balance</th><th>Limit</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {accounts.map((row) => (
                <tr key={row.id}>
                  <td><strong>{text(row.name)}</strong>{row.code && <div className="text-muted small">{text(row.code)}</div>}{row.description && <div className="text-muted small">{text(row.description)}</div>}</td>
                  <td>{TYPES.find(([k]) => k === row.type)?.[1] || text(row.type)}</td>
                  <td style={{ color: row.current_balance < 0 ? '#dc2626' : '#0f172a', fontWeight: 600 }}>{money(row.current_balance)}</td>
                  <td>{row.limit > 0 ? <span className={row.over_limit ? 'badge badge-danger' : 'badge badge-secondary'}>{money(row.limit)}</span> : '—'}</td>
                  <td><span className={`badge ${row.status === 'active' ? 'badge-success' : row.status === 'closed' ? 'badge-danger' : 'badge-warning'}`}>{label(row.status)}</span></td>
                  <td>
                    <ActionButtons title={row.name} showEdit={can('edit')} showDelete={can('delete')} onEdit={() => open('account', row)} onDelete={() => removeAccount(row)}
                      customActions={[
                        ...(can('transfer') ? [{ icon: <ArrowLeftRight size={16} />, title: 'Transfer from this account', onClick: () => { open('transfer'); setForm((f) => ({ ...f, fromAccountId: row.id })); } }] : []),
                        ...(can('edit') ? [{ icon: <Pencil size={16} />, title: 'Adjust balance (cash count / correction)', className: 'btn-info', onClick: () => open('adjust', row) }] : []),
                      ]} />
                  </td>
                </tr>
              ))}
              {!accounts.length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>No accounts yet — run the seed or add one.</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'transfers' && (
          <table className="data-table">
            <thead><tr><th>Transfer #</th><th>Date</th><th>From</th><th>To</th><th>Amount</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.id}><td><strong>{text(row.transfer_number)}</strong>{row.reference && <div className="text-muted small">{text(row.reference)}</div>}</td><td>{asDate(row.transfer_date)}</td><td>{text(row.from_account)}</td><td>{text(row.to_account)}</td><td>{money(row.amount)}</td><td>{text(row.reason).replace(/_/g, ' ')}{row.notes && <div className="text-muted small">{text(row.notes)}</div>}</td><td><span className={`badge ${row.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{label(row.status)}</span></td></tr>)}
              {!rows.length && !loading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>No transfers yet</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'receivables' && (<>
          <div className="acct-table-tools"><span>{rows.length} credit invoice(s) outstanding</span>{can('export') && <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('receivables', rows, [['invoice_number', 'Invoice #'], ['kind', 'Type'], ['customer', 'Customer'], ['phone', 'Phone'], [(r) => asDate(r.invoice_date), 'Invoice date'], [(r) => asDate(r.due_date), 'Due date'], ['total_amount', 'Total'], ['paid_amount', 'Paid'], ['outstanding', 'Outstanding'], ['days_overdue', 'Days overdue'], ['credit_status', 'Status']])}><Download size={14} /> CSV</button>}</div>
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Type</th><th>Customer</th><th>Invoice Date</th><th>Due Date</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Days Overdue</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.id}><td><strong>{text(row.invoice_number)}</strong></td><td>{text(row.kind)}</td><td>{text(row.customer)}{row.phone && <div className="text-muted small">{text(row.phone)}</div>}</td><td>{asDate(row.invoice_date)}</td><td>{asDate(row.due_date)}</td><td>{money(row.total_amount)}</td><td>{money(row.paid_amount)}</td><td style={{ color: '#dc2626', fontWeight: 600 }}>{money(row.outstanding)}</td><td>{row.days_overdue || '—'}</td><td><span className={`badge ${row.days_overdue > 0 ? 'badge-danger' : 'badge-warning'}`}>{label(row.credit_status)}</span></td></tr>)}
              {!rows.length && !loading && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Nothing outstanding on credit</td></tr>}
            </tbody>
          </table>
        </>)}

        {tab === 'payables' && (<>
          <div className="acct-table-tools"><span>{pagination.total} payable(s)</span>{can('export') && <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('payables', rows, [['payable_number', 'Payable #'], ['vendor', 'Vendor'], ['description', 'Description'], [(r) => asDate(r.issued_on), 'Issued'], [(r) => asDate(r.due_date), 'Due'], ['amount', 'Amount'], ['paid_amount', 'Paid'], ['balance', 'Outstanding'], ['status', 'Status']])}><Download size={14} /> CSV</button>}</div>
          <table className="data-table">
            <thead><tr><th>Payable #</th><th>Vendor</th><th>Description</th><th>Issued</th><th>Due Date</th><th>Amount</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.id}><td><strong>{text(row.payable_number)}</strong></td><td>{text(row.vendor)}</td><td>{text(row.description)}{row.category && <div className="text-muted small">{text(row.category)}</div>}</td><td>{asDate(row.issued_on)}</td><td>{asDate(row.due_date)}</td><td>{money(row.amount)}</td><td>{money(row.paid_amount)}</td><td style={{ color: row.balance > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{money(row.balance)}</td><td><span className={`badge ${row.status === 'settled' ? 'badge-success' : row.status === 'overdue' ? 'badge-danger' : row.status === 'cancelled' ? 'badge-secondary' : 'badge-warning'}`}>{label(row.status)}</span></td>
                <td><ActionButtons title={text(row.payable_number)} showEdit={can('edit') && row.status !== 'settled'} showDelete={can('delete') && !row.paid_amount} onEdit={() => open('payable', row)} onDelete={() => removePayable(row)} customActions={can('recordPayment') && row.balance > 0 && row.status !== 'cancelled' ? [{ icon: <HandCoins size={16} />, title: 'Record payment', className: 'btn-success', onClick: () => open('pay', row) }] : []} /></td></tr>)}
              {!rows.length && !loading && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>No payables recorded</td></tr>}
            </tbody>
          </table>
        </>)}

        {tab === 'sheet' && (<>
          <div className="acct-table-tools"><span>{range.dateFrom || range.dateTo ? `Period ${range.dateFrom || '…'} → ${range.dateTo || 'today'}` : 'All time'}</span><span style={{ display: 'flex', gap: 6 }}>{can('export') && <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('balance-sheet', sheet?.rows || [], [['account', 'Account'], ['type', 'Type'], ['opening', 'Opening'], ['money_in', 'In'], ['money_out', 'Out'], ['closing', 'Closing'], ['limit', 'Limit']])}><Download size={14} /> CSV</button>}<button className="btn btn-secondary btn-sm" onClick={() => window.print()}><Download size={14} /> PDF</button></span></div>
          <table className="data-table">
            <thead><tr><th>Account</th><th>Type</th><th>Opening</th><th>In</th><th>Out</th><th>Closing</th><th>Limit</th></tr></thead>
            <tbody>
              {(sheet?.rows || []).map((row) => <tr key={row.id}><td><strong>{text(row.account)}</strong></td><td>{TYPES.find(([k]) => k === row.type)?.[1] || text(row.type)}</td><td>{money(row.opening)}</td><td style={{ color: '#16a34a' }}>{money(row.money_in)}</td><td style={{ color: '#dc2626' }}>{money(row.money_out)}</td><td style={{ fontWeight: 700 }}>{money(row.closing)}</td><td>{row.limit > 0 ? <span className={row.over_limit ? 'badge badge-danger' : 'badge badge-secondary'}>{money(row.limit)}</span> : '—'}</td></tr>)}
              {sheet?.summary && <tr style={{ background: '#f8fafc', fontWeight: 700 }}><td colSpan={2}>Company total</td><td>{money(sheet.summary.opening)}</td><td style={{ color: '#16a34a' }}>{money(sheet.summary.total_in)}</td><td style={{ color: '#dc2626' }}>{money(sheet.summary.total_out)}</td><td>{money(sheet.summary.closing)}</td><td>{sheet.summary.over_limit ? `${sheet.summary.over_limit} over limit` : ''}</td></tr>}
            </tbody>
          </table>
        </>)}
      </div>

      {/* The same rows as cards, for anything narrower than a desktop. These
          tables are wide — Payables alone has ten columns — so below 1025px
          the table is put away and each row is read down instead of across. */}
      <div className="mobile-cards-view">
        <div className="mobile-cards-container">
          {tab === 'accounts' && accounts.map((row) => (
            <div key={row.id} className="data-card">
              <div className="data-card-top">
                <div className="data-card-avatar avatar-cyan">{text(row.name).slice(0, 1).toUpperCase()}</div>
                <div className="data-card-info">
                  <span className="data-card-title">{text(row.name)}</span>
                  <span className="data-card-subtitle">{TYPES.find(([k]) => k === row.type)?.[1] || text(row.type)}</span>
                </div>
                <span className={`badge ${row.status === 'active' ? 'badge-success' : row.status === 'closed' ? 'badge-danger' : 'badge-warning'}`}>{label(row.status)}</span>
              </div>
              <div className="data-card-body">
                <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Balance</span><span className="row-value" style={{ color: row.current_balance < 0 ? '#dc2626' : '#0f172a', fontWeight: 700 }}>{money(row.current_balance)}</span></div>
                <div className="data-card-row"><span className="row-icon">🚧</span><span className="row-label">Limit</span><span className="row-value">{row.limit > 0 ? <span className={row.over_limit ? 'badge badge-danger' : 'badge badge-secondary'}>{money(row.limit)}</span> : '—'}</span></div>
                {row.description && <div className="data-card-row"><span className="row-icon">📝</span><span className="row-label">Note</span><span className="row-value">{text(row.description)}</span></div>}
              </div>
              <div className="data-card-footer">
                <ActionButtons title={text(row.name)} showEdit={can('edit')} showDelete={can('delete')} onEdit={() => open('account', row)} onDelete={() => removeAccount(row)}
                  customActions={[
                    ...(can('transfer') ? [{ icon: <ArrowLeftRight size={16} />, title: 'Transfer from this account', onClick: () => { open('transfer'); setForm((f) => ({ ...f, fromAccountId: row.id })); } }] : []),
                    ...(can('edit') ? [{ icon: <Pencil size={16} />, title: 'Adjust balance', className: 'btn-info', onClick: () => open('adjust', row) }] : []),
                  ]} />
              </div>
            </div>
          ))}

          {tab === 'transfers' && rows.map((row) => (
            <div key={row.id} className="data-card">
              <div className="data-card-top">
                <div className="data-card-avatar avatar-purple">T</div>
                <div className="data-card-info">
                  <span className="data-card-title">{text(row.transfer_number)}</span>
                  <span className="data-card-subtitle">{text(row.from_account)} → {text(row.to_account)}</span>
                </div>
                <span className={`badge ${row.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{label(row.status)}</span>
              </div>
              <div className="data-card-body">
                <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Amount</span><span className="row-value">{money(row.amount)}</span></div>
                <div className="data-card-row"><span className="row-icon">📅</span><span className="row-label">Date</span><span className="row-value">{asDate(row.transfer_date)}</span></div>
                <div className="data-card-row"><span className="row-icon">🔁</span><span className="row-label">Reason</span><span className="row-value">{text(row.reason).replace(/_/g, ' ')}</span></div>
              </div>
            </div>
          ))}

          {tab === 'receivables' && rows.map((row) => (
            <div key={row.id} className="data-card">
              <div className="data-card-top">
                <div className="data-card-avatar avatar-amber">R</div>
                <div className="data-card-info">
                  <span className="data-card-title">{text(row.invoice_number)}</span>
                  <span className="data-card-subtitle">{text(row.customer)}</span>
                </div>
                <span className={`badge ${row.days_overdue > 0 ? 'badge-danger' : 'badge-warning'}`}>{label(row.credit_status)}</span>
              </div>
              <div className="data-card-body">
                <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Total</span><span className="row-value">{money(row.total_amount)}</span></div>
                <div className="data-card-row"><span className="row-icon">✅</span><span className="row-label">Paid</span><span className="row-value">{money(row.paid_amount)}</span></div>
                <div className="data-card-row"><span className="row-icon">⚖️</span><span className="row-label">Outstanding</span><span className="row-value" style={{ color: '#dc2626', fontWeight: 700 }}>{money(row.outstanding)}</span></div>
                <div className="data-card-row"><span className="row-icon">⏰</span><span className="row-label">Due</span><span className="row-value">{asDate(row.due_date)}{row.days_overdue > 0 ? ` · ${row.days_overdue}d late` : ''}</span></div>
              </div>
            </div>
          ))}

          {tab === 'payables' && rows.map((row) => (
            <div key={row.id} className="data-card">
              <div className="data-card-top">
                <div className="data-card-avatar avatar-rose">P</div>
                <div className="data-card-info">
                  <span className="data-card-title">{text(row.payable_number)}</span>
                  <span className="data-card-subtitle">{text(row.vendor)}</span>
                </div>
                <span className={`badge ${row.status === 'settled' ? 'badge-success' : row.status === 'overdue' ? 'badge-danger' : row.status === 'cancelled' ? 'badge-secondary' : 'badge-warning'}`}>{label(row.status)}</span>
              </div>
              <div className="data-card-body">
                {row.description && <div className="data-card-row"><span className="row-icon">📝</span><span className="row-label">For</span><span className="row-value">{text(row.description)}</span></div>}
                <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Amount</span><span className="row-value">{money(row.amount)}</span></div>
                <div className="data-card-row"><span className="row-icon">✅</span><span className="row-label">Paid</span><span className="row-value">{money(row.paid_amount)}</span></div>
                <div className="data-card-row"><span className="row-icon">⚖️</span><span className="row-label">Outstanding</span><span className="row-value" style={{ color: row.balance > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{money(row.balance)}</span></div>
                <div className="data-card-row"><span className="row-icon">⏰</span><span className="row-label">Due</span><span className="row-value">{asDate(row.due_date)}</span></div>
              </div>
              <div className="data-card-footer">
                <ActionButtons title={text(row.payable_number)} showEdit={can('edit') && row.status !== 'settled'} showDelete={can('delete') && !row.paid_amount} onEdit={() => open('payable', row)} onDelete={() => removePayable(row)}
                  customActions={can('recordPayment') && row.balance > 0 && row.status !== 'cancelled' ? [{ icon: <HandCoins size={16} />, title: 'Record payment', className: 'btn-success', onClick: () => open('pay', row) }] : []} />
              </div>
            </div>
          ))}

          {tab === 'sheet' && (sheet?.rows || []).map((row) => (
            <div key={row.id} className="data-card">
              <div className="data-card-top">
                <div className="data-card-avatar avatar-green">{text(row.account).slice(0, 1).toUpperCase()}</div>
                <div className="data-card-info">
                  <span className="data-card-title">{text(row.account)}</span>
                  <span className="data-card-subtitle">{TYPES.find(([k]) => k === row.type)?.[1] || text(row.type)}</span>
                </div>
              </div>
              <div className="data-card-body">
                <div className="data-card-row"><span className="row-icon">🏁</span><span className="row-label">Opening</span><span className="row-value">{money(row.opening)}</span></div>
                <div className="data-card-row"><span className="row-icon">⬆️</span><span className="row-label">In</span><span className="row-value" style={{ color: '#16a34a' }}>{money(row.money_in)}</span></div>
                <div className="data-card-row"><span className="row-icon">⬇️</span><span className="row-label">Out</span><span className="row-value" style={{ color: '#dc2626' }}>{money(row.money_out)}</span></div>
                <div className="data-card-row"><span className="row-icon">💰</span><span className="row-label">Closing</span><span className="row-value" style={{ fontWeight: 700 }}>{money(row.closing)}</span></div>
              </div>
            </div>
          ))}

          {!loading && ((tab === 'accounts' && !accounts.length)
            || (['transfers', 'receivables', 'payables'].includes(tab) && !rows.length)
            || (tab === 'sheet' && !(sheet?.rows || []).length)) && (
            <div className="data-card" style={{ textAlign: 'center', color: '#94a3b8' }}>Nothing to show here yet</div>
          )}
        </div>
      </div>
      </ErrorBoundary>
      {['transfers', 'payables'].includes(tab) && <ServerPagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} loading={loading} onPageChange={(page) => setPagination((p) => ({ ...p, page }))} onPageSizeChange={(l) => setPagination((p) => ({ ...p, limit: l, page: 1 }))} />}

      {modal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{{ account: modal.item ? 'Edit account' : 'New account', transfer: 'Transfer between accounts', payable: modal.item ? 'Edit payable' : 'New payable', pay: `Pay ${modal.item?.payable_number || ''}`, adjust: `Adjust ${modal.item?.name || ''}` }[modal.kind]}</h3>
              <button className="modal-close" onClick={close}>×</button>
            </div>
            <div className="modal-body">
              {modal.kind === 'account' && (<>
                <div className="form-row">
                  <div className="form-group"><label>Name *</label><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></div>
                  <div className="form-group"><label>Code</label><input type="text" value={form.code} onChange={(e) => set('code', e.target.value)} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Type</label><select className="form-input" value={form.type} onChange={(e) => set('type', e.target.value)}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                  <div className="form-group"><label>Status</label><select className="form-input" value={form.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Opening balance</label><input type="number" step="0.01" value={form.openingBalance ?? ''} onChange={(e) => set('openingBalance', e.target.value)} disabled={Boolean(modal.item)} title={modal.item ? 'Post an adjustment to change a live account' : ''} /></div>
                  <div className="form-group"><label>Limit (0 = none)</label><input type="number" min="0" step="1" value={form.limit ?? ''} onChange={(e) => set('limit', e.target.value)} placeholder="e.g. 50000" /></div>
                </div>
                <div className="form-group"><label>Sweep excess into</label><SearchableSelect value={form.sweepTo || ''} onChange={(e) => set('sweepTo', e.target.value)} options={[{ value: '', label: '— none —' }, ...accounts.filter((a) => a.id !== modal.item?.id).map((a) => ({ value: a.id, label: a.name }))]} labelField="label" valueField="value" /></div>
                <div className="form-group"><label>Description</label><input type="text" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
              </>)}
              {modal.kind === 'transfer' && (<>
                <div className="form-row">
                  <div className="form-group"><label>From *</label><SearchableSelect value={form.fromAccountId} onChange={(e) => set('fromAccountId', e.target.value)} options={accounts.map((a) => ({ value: a.id, label: `${a.name} — ${money(a.current_balance)}` }))} labelField="label" valueField="value" placeholder="Select account" /></div>
                  <div className="form-group"><label>To *</label><SearchableSelect value={form.toAccountId} onChange={(e) => set('toAccountId', e.target.value)} options={accounts.filter((a) => a.id !== form.fromAccountId).map((a) => ({ value: a.id, label: a.name }))} labelField="label" valueField="value" placeholder="Select account" /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Amount *</label><input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} autoFocus /></div>
                  <div className="form-group"><label>Date</label><input type="date" value={form.transferDate} onChange={(e) => set('transferDate', e.target.value)} /></div>
                </div>
                <div className="form-group"><label>Reference</label><input type="text" value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Slip / cheque #" /></div>
                <div className="form-group"><label>Notes</label><input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
              </>)}
              {modal.kind === 'payable' && (<>
                <div className="form-row">
                  <div className="form-group"><label>Vendor (supplier)</label><SearchableSelect value={form.vendorId || ''} onChange={(e) => { const v = vendors.find((x) => String(x._id || x.id) === e.target.value); set('vendorId', e.target.value); if (v) set('vendorName', v.name); }} options={[{ value: '', label: '— type a name below —' }, ...vendors.map((v) => ({ value: String(v._id || v.id), label: v.name }))]} labelField="label" valueField="value" /></div>
                  <div className="form-group"><label>Vendor name *</label><input type="text" value={form.vendorName} onChange={(e) => set('vendorName', e.target.value)} placeholder="Who we owe" /></div>
                </div>
                <div className="form-group"><label>Description *</label><input type="text" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Generator purchased on credit" autoFocus /></div>
                <div className="form-row">
                  <div className="form-group"><label>Amount *</label><input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></div>
                  <div className="form-group"><label>Due date</label><input type="date" value={form.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} /></div>
                  <div className="form-group"><label>Category</label><input type="text" value={form.category || ''} onChange={(e) => set('category', e.target.value)} placeholder="Equipment, rent…" /></div>
                </div>
                <div className="form-group"><label>Notes</label><input type="text" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></div>
              </>)}
              {modal.kind === 'pay' && (<>
                <p className="sm-role-job-note">Outstanding on {modal.item?.payable_number}: <strong>{money(modal.item?.balance)}</strong> to {modal.item?.vendor}</p>
                <div className="form-row">
                  <div className="form-group"><label>Amount *</label><input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} autoFocus /></div>
                  <div className="form-group"><label>Paid from *</label><SearchableSelect value={form.accountId} onChange={(e) => set('accountId', e.target.value)} options={accounts.map((a) => ({ value: a.id, label: `${a.name} — ${money(a.current_balance)}` }))} labelField="label" valueField="value" /></div>
                </div>
                <div className="form-group"><label>Reference</label><input type="text" value={form.reference} onChange={(e) => set('reference', e.target.value)} /></div>
                <div className="form-group"><label>Notes</label><input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
              </>)}
              {modal.kind === 'adjust' && (<>
                <p className="sm-role-job-note">Post a correction on <strong>{modal.item?.name}</strong> (balance {money(modal.item?.current_balance)}) — a cash count that differs, an opening float, a mistake. It goes through the ledger against Suspense.</p>
                <div className="form-row">
                  <div className="form-group"><label>Direction</label><select className="form-input" value={form.direction} onChange={(e) => set('direction', e.target.value)}><option value="in">Money in (+)</option><option value="out">Money out (−)</option></select></div>
                  <div className="form-group"><label>Amount *</label><input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} autoFocus /></div>
                </div>
                <div className="form-group"><label>Reason</label><input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Why the balance is being corrected" /></div>
              </>)}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={confirm.isOpen} title={confirm.title} message={confirm.message} type={confirm.type || 'danger'} onConfirm={confirm.onConfirm} onCancel={() => setConfirm({ isOpen: false })} />
    </div>
  );
}
