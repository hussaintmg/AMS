import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLedger } from '../context/LedgerContext';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import LedgerDrawer from './LedgerDrawer';
import { exportReportCsv, exportReportXlsx, exportReportPdf } from '../utils/reportsExport';
import '../styles/userManagement.css';

const Ledger = () => {
  const { user: currentUser } = useAuth();
  const {
    entries, stats,
    loading: ctxLoading,
    loadEntries, loadStats,
    setEntries,
  } = useLedger();
  const [loading, setLoading] = useState(true);
  const [errorPopup, setErrorPopup] = useState(null);

  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  const [search, setSearch] = useState(urlSearch);
  const [referenceType, setReferenceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [drawerEntry, setDrawerEntry] = useState(null);

  const [committedFilters, setCommittedFilters] = useState({ search: '', referenceType: '', from: '', to: '' });

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit, ...(committedFilters.search && { search: committedFilters.search }), ...(committedFilters.referenceType && { referenceType: committedFilters.referenceType }), ...(committedFilters.from && { from: committedFilters.from }), ...(committedFilters.to && { to: committedFilters.to }) };
      const response = await loadEntries(params);
      if (response) {
        const list = response.entries || [];
        setEntries(list);
        setTotalPages(Math.ceil(response.pagination?.total / limit) || 1);
        setTotal(response.pagination?.total || 0);
      }
    } catch (err) {
      toast.error('Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, [page, limit, committedFilters, loadEntries, setEntries]);

  useEffect(() => { if (currentUser) { fetchEntries(); loadStats(); } }, [currentUser, fetchEntries, loadStats]);

  useEffect(() => { if (urlSearch) setSearch(urlSearch); }, [urlSearch]);

  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => { setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [currentUser, committedFilters]);

  const applyFilters = () => {
    setCommittedFilters({ search, referenceType, from, to });
    setPage(1);
  };

  const exportRows = entries.map(r => ({
    transaction_date: r.transactionDate,
    account: r.account, debit: r.debit, credit: r.credit,
    reference_type: r.referenceType, reference_id: r.referenceId,
    description: r.description,
  }));

  const meta = { generatedBy: currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'User' };

  return (
    <div className="user-management-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Ledger</h1>
          <p className="subtitle">Financial transactions summary</p>
        </div>
        <div className="header-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <select className="form-control" value={referenceType} onChange={(e) => setReferenceType(e.target.value)} style={{ width: 120 }}>
            <option value="">All Types</option>
            <option value="expense">Expense</option>
            <option value="salary">Salary</option>
            <option value="manual">Manual</option>
          </select>
          <input className="form-control" placeholder="Search..." value={search}
            onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 160 }} />
          <button className="btn btn-primary" onClick={applyFilters}>Apply</button>
          <button className="btn btn-secondary" onClick={() => { exportReportCsv({ rows: exportRows, reportName: 'Ledger', meta }); toast.success('CSV downloaded'); }}>CSV</button>
          <button className="btn btn-secondary" onClick={() => { exportReportXlsx({ rows: exportRows, reportName: 'Ledger', meta }); toast.success('XLSX downloaded'); }}>XLSX</button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total || 0}</span>
            <span className="stat-label">Total Entries</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="stat-icon">💳</div>
          <div className="stat-content">
            <span className="stat-value">{Number(stats.totalDebit || 0).toLocaleString()}</span>
            <span className="stat-label">Total Debit</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #22c55e' }}>
          <div className="stat-icon">🏦</div>
          <div className="stat-content">
            <span className="stat-value">{Number(stats.totalCredit || 0).toLocaleString()}</span>
            <span className="stat-label">Total Credit</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div className="stat-icon">⚖️</div>
          <div className="stat-content">
            <span className="stat-value">{Number(stats.balance || 0).toLocaleString()}</span>
            <span className="stat-label">Balance</span>
          </div>
        </div>
      </div>

      <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

      <div className="table-container desktop-only">
        {loading ? (
          <div className="loading-state"><div className="spinner"></div><p>Loading ledger...</p></div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📒</div>
            <h3>No Ledger Entries Found</h3>
            <p>No entries match your filter criteria.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Reference</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const id = entry._id || entry.id;
                return (
                  <tr key={id} onClick={() => setDrawerEntry(entry)} style={{ cursor: 'pointer' }}>
                    <td>{entry.transactionDate ? new Date(entry.transactionDate).toLocaleDateString('en-GB') : '-'}</td>
                    <td><code>{entry.account || '-'}</code></td>
                    <td style={{ color: entry.debit ? '#dc2626' : 'inherit' }}>{entry.debit ? Number(entry.debit).toLocaleString() : '-'}</td>
                    <td style={{ color: entry.credit ? '#16a34a' : 'inherit' }}>{entry.credit ? Number(entry.credit).toLocaleString() : '-'}</td>
                    <td>{entry.referenceType ? `${entry.referenceType}#${entry.referenceId || ''}` : '-'}</td>
                    <td>{entry.description || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mobile-cards-container mobile-only">
        {loading ? (
          <div className="loading-state"><div className="spinner"></div><p>Loading ledger...</p></div>
        ) : entries.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📒</div><h3>No Ledger Entries Found</h3></div>
        ) : (
          <div className="users-cards-grid">
            {entries.map(entry => {
              const id = entry._id || entry.id;
              return (
                <div key={id} className="user-card" onClick={() => setDrawerEntry(entry)}>
                  <div className="user-card-header">
                    <div className="user-card-title">
                      <span className="user-card-name">{entry.account || '-'}</span>
                      <span className="user-card-role">{entry.referenceType || '-'}</span>
                    </div>
                  </div>
                  <div className="user-card-body">
                    <div className="user-card-field">
                      <span className="field-label">Date</span>
                      <span className="field-value">{entry.transactionDate ? new Date(entry.transactionDate).toLocaleDateString('en-GB') : '-'}</span>
                    </div>
                    <div className="user-card-field">
                      <span className="field-label">Debit</span>
                      <span className="field-value">{entry.debit ? Number(entry.debit).toLocaleString() : '0'}</span>
                    </div>
                    <div className="user-card-field">
                      <span className="field-label">Credit</span>
                      <span className="field-value">{entry.credit ? Number(entry.credit).toLocaleString() : '0'}</span>
                    </div>
                    <div className="user-card-field">
                      <span className="field-label">Description</span>
                      <span className="field-value">{entry.description || '-'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn-page" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Previous</button>
          <div className="page-numbers">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pn; if (totalPages <= 5) pn = i + 1;
              else if (page <= 3) pn = i + 1;
              else if (page >= totalPages - 2) pn = totalPages - 4 + i;
              else pn = page - 2 + i;
              return <button key={pn} className={`btn-page ${page === pn ? 'active' : ''}`} onClick={() => setPage(pn)}>{pn}</button>;
            })}
          </div>
          <button className="btn-page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
        </div>
      )}

      <LedgerDrawer isOpen={!!drawerEntry} onClose={() => setDrawerEntry(null)} entry={drawerEntry} />
    </div>
  );
};

export default Ledger;
