import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Plus, Search, RotateCcw, Download, ArrowDownLeft, ArrowUpRight, Scale, WalletCards } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useLedger } from '../context/LedgerContext';
import { ledgerAPI } from '../services/api';
import ErrorPopup from '../components/ErrorPopup';
import LedgerDrawer from './LedgerDrawer';
import ServerPagination from '../components/ServerPagination';
import { exportReportCsv, exportReportXlsx, exportReportPdf } from '../utils/reportsExport';
import { fieldAccessor, pageActions } from '../utils/roleJobs';
import '../styles/userManagement.css';
import '../styles/ledger.css';

const emptyEntry = () => ({ transactionDate: new Date().toISOString().slice(0, 10), debitAccount: '', creditAccount: '', amount: '', description: '' });
const money = (value) => `PKR ${Number(value || 0).toLocaleString()}`;

export default function Ledger() {
  const { user } = useAuth();
  // The ledger is an append-only journal: posting an entry is the only write it
  // has, and the Journal Entry button never asked whether this role may.
  const can = pageActions(user, 'ledger');
  const { entries, loadEntries, loadStats, setEntries } = useLedger();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [errorPopup, setErrorPopup] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 20 });
  const [summary, setSummary] = useState({ openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0 });
  const [accounts, setAccounts] = useState([]);
  const [drawerEntry, setDrawerEntry] = useState(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [filters, setFilters] = useState({ search: searchParams.get('search') || '', account: '', referenceType: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  // Which columns this role may read. The API already strips what it withholds,
  // so this only stops us drawing a column that would always be blank.
  const showField = fieldAccessor(user, 'ledger');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await loadEntries({ page, limit: pagination.limit, ...Object.fromEntries(Object.entries(applied).filter(([, value]) => value)) });
      setEntries(response.entries || []);
      setSummary(response.summary || {});
      const total = response.pagination?.total || 0;
      setPagination((prev) => ({ ...prev, total, pages: Math.max(1, Math.ceil(total / prev.limit)) }));
    } catch { toast.error('Failed to load ledger'); }
    finally { setLoading(false); }
  }, [page, pagination.limit, applied, loadEntries, setEntries]);

  useEffect(() => { if (user) fetchEntries(); }, [user, fetchEntries]);
  useEffect(() => { if (!user) return; ledgerAPI.getAccounts().then((res) => setAccounts(res.data?.data?.accounts || [])).catch(() => {}); }, [user]);

  useEffect(() => {
    if (!showEntryModal) return;
    const handler = (e) => { if (e.key === 'Escape') setShowEntryModal(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showEntryModal]);

  const applyFilters = (e) => { e?.preventDefault(); setPage(1); setApplied(filters); };
  const resetFilters = () => { const next = { search: '', account: '', referenceType: '', from: '', to: '' }; setFilters(next); setApplied(next); setPage(1); };
  const postEntry = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await ledgerAPI.create(entryForm);
      toast.success('Journal entry posted'); setShowEntryModal(false); setEntryForm(emptyEntry());
      await Promise.all([fetchEntries(), loadStats()]);
      const res = await ledgerAPI.getAccounts(); setAccounts(res.data?.data?.accounts || []);
    } catch (err) { setErrorPopup(err.response?.data || { message: 'Failed to post journal entry' }); }
    finally { setSaving(false); }
  };

  const exportRows = useMemo(() => entries.map((row) => ({ date: row.transactionDate ? new Date(row.transactionDate).toLocaleDateString('en-GB') : '', account: row.account, reference: `${row.referenceType || ''} ${row.referenceId || ''}`.trim(), description: row.description, debit: row.debit || 0, credit: row.credit || 0, running_balance: row.runningBalance || 0 })), [entries]);
  const exportMeta = { generatedBy: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'User', filters: applied };
  const doExport = (type) => { const args = { rows: exportRows, reportName: 'General Ledger', meta: exportMeta }; if (type === 'csv') exportReportCsv(args); else if (type === 'xlsx') exportReportXlsx(args); else exportReportPdf(args); toast.success(`${type.toUpperCase()} downloaded`); };

  return <div className="ledger-page">
    <header className="ledger-header"><div><h1>General Ledger</h1><p>Review account movements and post manual journal entries.</p></div><div className="ledger-header-actions"><div className="ledger-export-menu"><button className="btn btn-secondary"><Download size={17}/> Export</button><div><button onClick={() => doExport('csv')}>CSV</button><button onClick={() => doExport('xlsx')}>XLSX</button><button onClick={() => doExport('pdf')}>PDF</button></div></div>{can('create') && <button className="btn btn-primary" onClick={() => setShowEntryModal(true)}><Plus size={17}/> Journal Entry</button>}</div></header>

    <form className="ledger-filters" onSubmit={applyFilters}>
      <div className="ledger-search"><Search size={17}/><input value={filters.search} onChange={(e) => setFilters({...filters, search:e.target.value})} placeholder="Search reference, account or description"/></div>
      <select value={filters.account} onChange={(e) => setFilters({...filters,account:e.target.value})}><option value="">All accounts</option>{accounts.map((account) => <option key={account}>{account}</option>)}</select>
      <select value={filters.referenceType} onChange={(e) => setFilters({...filters,referenceType:e.target.value})}><option value="">All sources</option><option value="expense">Expense</option><option value="salary">Salary</option><option value="leave">Leave</option><option value="manual">Manual journal</option></select>
      <input type="date" value={filters.from} aria-label="From date" onChange={(e) => setFilters({...filters,from:e.target.value})}/><input type="date" value={filters.to} aria-label="To date" onChange={(e) => setFilters({...filters,to:e.target.value})}/>
      <button className="btn btn-primary" type="submit">Apply</button><button className="ledger-reset" type="button" title="Reset filters" onClick={resetFilters}><RotateCcw size={17}/></button>
    </form>

    <section className="ledger-summary">
      <article><span className="ledger-summary-icon opening"><WalletCards size={19}/></span><div><small>Opening Balance</small><strong>{money(summary.openingBalance)}</strong></div></article>
      <article><span className="ledger-summary-icon debit"><ArrowDownLeft size={19}/></span><div><small>Period Debit</small><strong>{money(summary.totalDebit)}</strong></div></article>
      <article><span className="ledger-summary-icon credit"><ArrowUpRight size={19}/></span><div><small>Period Credit</small><strong>{money(summary.totalCredit)}</strong></div></article>
      <article><span className="ledger-summary-icon balance"><Scale size={19}/></span><div><small>Closing Balance</small><strong>{money(summary.closingBalance)}</strong></div></article>
    </section>

    <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)}/>
    <section className="ledger-table-shell">
      <div className="ledger-table-title"><div><BookOpen size={18}/><strong>Transactions</strong></div><span>{pagination.total} entries</span></div>
      {loading ? <div className="ledger-state"><div className="spinner"/>Loading transactions...</div> : entries.length === 0 ? <div className="ledger-state"><BookOpen size={36}/><strong>No ledger entries</strong><span>Adjust the filters or post a journal entry.</span></div> : <>
        <div className="desktop-only ledger-table-scroll"><table className="data-table ledger-table"><thead><tr>{showField('entry') && <th>Date</th>}{showField('reference') && <th>Reference</th>}{showField('entry') && <th>Account</th>}{showField('notes') && <th>Description</th>}{showField('amounts') && <><th className="amount">Debit</th><th className="amount">Credit</th><th className="amount">Balance</th></>}</tr></thead><tbody>{entries.map((entry) => <tr key={entry._id || entry.id} onClick={() => setDrawerEntry(entry)}>{showField('entry') && <td>{entry.transactionDate ? new Date(entry.transactionDate).toLocaleDateString('en-GB') : '-'}</td>}{showField('reference') && <td><span className={`ledger-source ${entry.referenceType || 'manual'}`}>{entry.referenceType || 'manual'}</span><small>{entry.referenceId || '-'}</small></td>}{showField('entry') && <td><strong>{entry.account || '-'}</strong></td>}{showField('notes') && <td>{entry.description || '-'}</td>}{showField('amounts') && <><td className="amount debit-text">{entry.debit ? money(entry.debit) : '-'}</td><td className="amount credit-text">{entry.credit ? money(entry.credit) : '-'}</td><td className="amount"><strong>{money(entry.runningBalance)}</strong></td></>}</tr>)}</tbody></table></div>
        <div className="mobile-only ledger-mobile-list">{entries.map((entry) => <article key={entry._id || entry.id} onClick={() => setDrawerEntry(entry)}><header>{showField('entry') && <><strong>{entry.account}</strong><span>{entry.transactionDate ? new Date(entry.transactionDate).toLocaleDateString('en-GB') : '-'}</span></>}</header>{showField('notes') && <p>{entry.description}</p>}{showField('amounts') && <div><span>Debit <b className="debit-text">{money(entry.debit)}</b></span><span>Credit <b className="credit-text">{money(entry.credit)}</b></span><span>Balance <b>{money(entry.runningBalance)}</b></span></div>}</article>)}</div>
      </>}
    </section>
    <ServerPagination page={page} totalPages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} onPageSizeChange={(limit) => { setPage(1); setPagination((prev) => ({ ...prev, limit })); }} loading={loading}/>
    <LedgerDrawer isOpen={Boolean(drawerEntry)} onClose={() => setDrawerEntry(null)} entry={drawerEntry}/>

    {showEntryModal && <div className="modal-overlay" onClick={() => setShowEntryModal(false)}>
      <form className="modal-content ledger-entry-modal" onSubmit={postEntry} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><div><h3>Post Journal Entry</h3><p>Post an equal debit and credit under one journal reference.</p></div><button type="button" className="modal-close" onClick={() => setShowEntryModal(false)}>x</button></div>
        <div className="modal-body">
          <div className="form-row"><div className="form-group"><label>Transaction Date *</label><input type="date" required value={entryForm.transactionDate} onChange={(e) => setEntryForm({...entryForm,transactionDate:e.target.value})}/></div><div className="form-group"><label>Amount (PKR) *</label><input type="number" required min="0.01" step="0.01" value={entryForm.amount} onChange={(e) => setEntryForm({...entryForm,amount:e.target.value})} placeholder="0.00"/></div></div>
          <datalist id="ledger-accounts">{accounts.map((account) => <option key={account} value={account}/>)}</datalist>
          <div className="form-row"><div className="form-group"><label>Debit Account *</label><input required list="ledger-accounts" value={entryForm.debitAccount} onChange={(e) => setEntryForm({...entryForm,debitAccount:e.target.value})} placeholder="e.g. Expense"/></div><div className="form-group"><label>Credit Account *</label><input required list="ledger-accounts" value={entryForm.creditAccount} onChange={(e) => setEntryForm({...entryForm,creditAccount:e.target.value})} placeholder="e.g. Cash"/></div></div>
          <div className="ledger-journal-check"><span>Debit {money(entryForm.amount)}</span><span>Credit {money(entryForm.amount)}</span><strong>Balanced</strong></div>
          <div className="form-group"><label>Description *</label><textarea required rows="3" value={entryForm.description} onChange={(e) => setEntryForm({...entryForm,description:e.target.value})} placeholder="Purpose of this journal entry"/></div>
        </div>
        <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowEntryModal(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving?'Posting...':'Post Entry'}</button></div>
      </form>
    </div>}
  </div>;
}
