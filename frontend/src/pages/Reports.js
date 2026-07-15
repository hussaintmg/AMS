import React, { useState, useEffect, useCallback } from 'react';
import { reportAPI } from '../services/api';
import toast from 'react-hot-toast';
import '../styles/userManagement.css';

function getToday() { return new Date().toISOString().split('T')[0]; }
function getMonthAgo() { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; }

const TABS = [
  { key: 'leads', label: 'Leads Report', icon: '🎯' },
  { key: 'customers', label: 'Customers Report', icon: '👥' },
  { key: 'sales', label: 'Sales Report', icon: '💰' },
  { key: 'inventory', label: 'Inventory Report', icon: '📦' },
  { key: 'service', label: 'Service Report', icon: '🔧' },
  { key: 'expenses', label: 'Expenses Report', icon: '💳' },
  { key: 'payments', label: 'Payments Report', icon: '💵' },
  { key: 'employee', label: 'Employee Report', icon: '👤' },
];

const TAB_CARDS = {
  leads: [
    { key: 'totalLeads', label: 'Total Leads', default: '—' },
    { key: 'converted', label: 'Converted', default: '—' },
    { key: 'lost', label: 'Lost', default: '—' },
    { key: 'conversionRate', label: 'Conversion Rate', default: '—', suffix: '%' },
  ],
  customers: [
    { key: 'totalCustomers', label: 'Total Customers', default: '—' },
    { key: 'activeCustomers', label: 'Active Customers', default: '—' },
    { key: 'totalReceivables', label: 'Total Receivables', default: '—', prefix: 'PKR ' },
    { key: 'overdueAmount', label: 'Overdue Amount', default: '—', prefix: 'PKR ' },
  ],
  sales: [
    { key: 'totalRevenue', label: 'Total Revenue', default: '—', prefix: 'PKR ' },
    { key: 'totalOrders', label: 'Total Orders', default: '—' },
    { key: 'pendingDeliveries', label: 'Pending Deliveries', default: '—' },
    { key: 'avgOrderValue', label: 'Avg Order Value', default: '—', prefix: 'PKR ' },
  ],
  inventory: [
    { key: 'totalParts', label: 'Total Parts', default: '—' },
    { key: 'stockValue', label: 'Stock Value', default: '—', prefix: 'PKR ' },
    { key: 'lowStockItems', label: 'Low Stock Items', default: '—' },
    { key: 'warehouses', label: 'Warehouses', default: '—' },
  ],
  service: [
    { key: 'totalJobCards', label: 'Total Job Cards', default: '—' },
    { key: 'completed', label: 'Completed', default: '—' },
    { key: 'inProgress', label: 'In Progress', default: '—' },
    { key: 'serviceRevenue', label: 'Revenue', default: '—', prefix: 'PKR ' },
  ],
  expenses: [
    { key: 'totalExpenses', label: 'Total Expenses', default: '—', prefix: 'PKR ' },
    { key: 'pendingExpenses', label: 'Pending', default: '—' },
    { key: 'approvedExpenses', label: 'Approved', default: '—' },
    { key: 'monthExpenses', label: 'This Month', default: '—', prefix: 'PKR ' },
  ],
  payments: [
    { key: 'totalReceived', label: 'Total Received', default: '—', prefix: 'PKR ' },
    { key: 'pendingPayments', label: 'Pending', default: '—' },
    { key: 'monthPayments', label: 'This Month', default: '—', prefix: 'PKR ' },
    { key: 'paymentMethods', label: 'Payment Methods', default: '—' },
  ],
  employee: [
    { key: 'totalEmployees', label: 'Total Employees', default: '—' },
    { key: 'activeEmployees', label: 'Active', default: '—' },
    { key: 'onLeave', label: 'On Leave', default: '—' },
    { key: 'departments', label: 'Departments', default: '—' },
  ],
};

const TAB_FETCHERS = {
  leads: async (params) => {
    const res = await reportAPI.getLeadStatistics(params);
    const rows = res.data?.data || [];
    return {
      totalLeads: rows.length || 0,
      converted: rows.filter((r) => r.status === 'converted').length,
      lost: rows.filter((r) => r.status === 'lost').length,
      conversionRate: rows.length ? Math.round(rows.filter((r) => r.status === 'converted').length / rows.length * 10000) / 100 : 0,
      _rows: rows,
    };
  },
  customers: async (params) => {
    const res = await reportAPI.getCustomerReceivables(params);
    const rows = res.data?.data || [];
    const totalRec = rows.reduce((s, r) => s + Number(r.outstanding || r.balance || 0), 0);
    return {
      totalCustomers: new Set(rows.map((r) => r.customerId || r.customer)).size || 0,
      activeCustomers: new Set(rows.filter((r) => r.active !== false).map((r) => r.customerId || r.customer)).size,
      totalReceivables: totalRec,
      overdueAmount: rows.reduce((s, r) => {
        const d = r.due_date || r.dueDate;
        return d && new Date(d) < new Date() ? s + Number(r.outstanding || r.balance || 0) : s;
      }, 0),
      _rows: rows,
    };
  },
  sales: async (params) => {
    const [perfRes, pendRes] = await Promise.allSettled([
      reportAPI.getSalesPerformance(params),
      reportAPI.getPendingDeliveries(params),
    ]);
    const perfRows = perfRes.status === 'fulfilled' ? perfRes.value.data?.data || [] : [];
    const pendRows = pendRes.status === 'fulfilled' ? pendRes.value.data?.data || [] : [];
    const rev = perfRows.reduce((s, r) => s + Number(r.revenue || r.total || r.amount || 0), 0);
    return {
      totalRevenue: rev,
      totalOrders: perfRows.length || 0,
      pendingDeliveries: pendRows.length || 0,
      avgOrderValue: perfRows.length ? Math.round(rev / perfRows.length) : 0,
      _rows: [...perfRows, ...pendRows],
    };
  },
  inventory: async (params) => {
    const [healthRes, lowStockRes] = await Promise.allSettled([
      reportAPI.getInventoryHealth(params),
      reportAPI.getLowStockParts(params),
    ]);
    const healthRows = healthRes.status === 'fulfilled' ? healthRes.value.data?.data || [] : [];
    const lowRows = lowStockRes.status === 'fulfilled' ? lowStockRes.value.data?.data || [] : [];
    const val = healthRows.reduce((s, r) => s + Number(r.stockValue || r.total_value || r.value || 0), 0);
    const wh = new Set(healthRows.map((r) => r.warehouse || r.warehouse_name).filter(Boolean));
    return {
      totalParts: healthRows.length || 0,
      stockValue: val,
      lowStockItems: lowRows.length || 0,
      warehouses: wh.size || 0,
      _rows: [...healthRows, ...lowRows],
    };
  },
  service: async (params) => {
    const res = await reportAPI.getServiceAnalytics(params);
    const rows = res.data?.data || [];
    const completed = rows.filter((r) => r.status === 'completed').length;
    const inProgress = rows.filter((r) => r.status === 'in_progress').length;
    const rev = rows.reduce((s, r) => s + Number(r.revenue || r.total || r.amount || 0), 0);
    return {
      totalJobCards: rows.length || 0,
      completed,
      inProgress,
      serviceRevenue: rev,
      _rows: rows,
    };
  },
  expenses: async (params) => {
    const res = await reportAPI.getExpenses(params); const rows = res.data?.data || [];
    const month = new Date().getMonth();
    return { totalExpenses: rows.reduce((s, r) => s + Number(r.amount || 0), 0), pendingExpenses: rows.filter((r) => ['draft', 'submitted'].includes(r.status)).length, approvedExpenses: rows.filter((r) => ['approved', 'posted'].includes(r.status)).length, monthExpenses: rows.filter((r) => r.date && new Date(r.date).getMonth() === month).reduce((s, r) => s + Number(r.amount || 0), 0), _rows: rows };
  },
  payments: async (params) => {
    const res = await reportAPI.getPayments(params); const rows = res.data?.data || [];
    const month = new Date().getMonth();
    return { totalReceived: rows.reduce((s, r) => s + Number(r.amount || 0), 0), pendingPayments: rows.filter((r) => r.status === 'pending').length, monthPayments: rows.filter((r) => r.date && new Date(r.date).getMonth() === month).reduce((s, r) => s + Number(r.amount || 0), 0), paymentMethods: new Set(rows.map((r) => r.method).filter(Boolean)).size, _rows: rows };
  },
  employee: async (params) => {
    const res = await reportAPI.getEmployees(params); const rows = res.data?.data || [];
    return { totalEmployees: rows.length, activeEmployees: rows.filter((r) => r.status === 'active').length, onLeave: rows.filter((r) => r.onLeave).length, departments: new Set(rows.map((r) => r.department).filter(Boolean)).size, _rows: rows };
  },
};

function formatNum(n) {
  if (n === null || n === undefined || n === '—') return '—';
  const num = Number(n);
  return isNaN(num) ? '—' : num.toLocaleString();
}

function EmptyState({ tabKey }) {
  return (
    <div className="report-empty-state">
      <div className="report-empty-icon">📊</div>
      <h3>No Data Available</h3>
      <p>
        No records found for the selected date range. Try adjusting the filters or add some data first.
      </p>
    </div>
  );
}

function Reports() {
  const [activeTab, setActiveTab] = useState('leads');
  const [dateFrom, setDateFrom] = useState(getMonthAgo);
  const [dateTo, setDateTo] = useState(getToday);
  const [loading, setLoading] = useState(false);
  const [cardData, setCardData] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCardData(null);
    try {
      const params = {};
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      const fetcher = TAB_FETCHERS[activeTab];
      if (!fetcher) {
        setCardData(null);
        return;
      }
      const result = await fetcher(params);
      setCardData(result);
    } catch (err) {
      console.error('Report fetch failed:', err);
      setError(err.message || 'Failed to load report data');
      setCardData(null);
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = (format) => {
    const data = cardData?._rows || [];
    if (!data.length) { toast.error('There is no report data to export.'); return; }
    if (format === 'pdf') { window.print(); return; }
    const columns = Object.keys(data[0]).filter((key) => key !== 'id');
    const csv = [columns.join(','), ...data.map((row) => columns.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${activeTab}-report.${format === 'xlsx' ? 'csv' : 'csv'}`; link.click(); URL.revokeObjectURL(url);
    toast.success(`${format.toUpperCase()} export downloaded.`);
  };

  const reportRows = cardData?._rows || [];
  const reportColumns = reportRows.length ? Object.keys(reportRows[0]).filter((key) => key !== 'id' && key !== 'onLeave') : [];
  const columnLabel = (key) => key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  const displayCell = (key, value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (['amount', 'revenue', 'payment', 'balance', 'outstanding', 'stockValue'].includes(key)) return `PKR ${Number(value || 0).toLocaleString()}`;
    if (['date', 'dueDate'].includes(key)) return new Date(value).toLocaleDateString();
    return String(value);
  };

  const cards = TAB_CARDS[activeTab] || [];

  return (
    <div className="user-management-page">
      <style>{`
        .reports-page { display: flex; flex-direction: column; gap: 1.25rem; }
        .reports-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        .reports-header h1 { margin: 0; font-size: 1.5rem; }
        .reports-filters { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
        .reports-filters label { font-size: 0.85rem; color: #475569; white-space: nowrap; }
        .reports-filters input[type="date"] { border: 1px solid #d1d5db; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.85rem; background: #fff; }
        .reports-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0; padding-bottom: 0; margin-bottom: 0; }
        .reports-tab { padding: 0.6rem 1rem; border: 1px solid transparent; border-radius: 8px 8px 0 0; cursor: pointer; font-size: 0.85rem; background: transparent; color: #64748b; transition: all 0.15s; white-space: nowrap; }
        .reports-tab:hover { background: #f8fafc; color: #1e293b; }
        .reports-tab.active { background: #fff; color: #1a73ba; border-color: #e2e8f0 #e2e8f0 #fff; font-weight: 600; }
        .reports-tab-icon { margin-right: 0.4rem; }
        .reports-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.5rem; }
        .reports-toolbar-left { display: flex; align-items: center; gap: 0.75rem; }
        .reports-toolbar-right { display: flex; gap: 0.5rem; }
        .reports-toolbar h2 { margin: 0; font-size: 1.1rem; }
        .report-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
        .report-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: box-shadow 0.15s; }
        .report-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
        .report-card-label { font-size: 0.78rem; color: #64748b; margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.02em; }
        .report-card-value { font-size: 1.6rem; font-weight: 700; color: #0f172a; }
        .report-card-value.loading { color: #94a3b8; animation: pulse 1.5s infinite; }
        .report-empty-state { text-align: center; padding: 3rem 1.5rem; color: #64748b; }
        .report-empty-icon { font-size: 3rem; margin-bottom: 1rem; }
        .report-empty-state h3 { margin: 0 0 0.5rem; font-size: 1.1rem; color: #334155; }
        .report-empty-state p { max-width: 440px; margin: 0 auto; font-size: 0.9rem; line-height: 1.5; }
        .btn-outline { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; color: #374151; transition: all 0.15s; }
        .btn-outline:hover { background: #f8fafc; border-color: #9ca3af; }
        .btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary-sm { background: #1a73ba; color: #fff; border: none; border-radius: 8px; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; transition: background 0.15s; }
        .btn-primary-sm:hover { background: #155d9a; }
        .btn-primary-sm:disabled { opacity: 0.6; cursor: not-allowed; }
        .spinner-sm { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; }
        .spinner-dark { border-color: rgba(0,0,0,0.1); border-top-color: #1a73ba; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        .report-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 1rem; color: #991b1b; text-align: center; margin-bottom: 1rem; }
        .report-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
        .report-table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 0.82rem; }
        .report-table th { padding: 0.75rem; text-align: left; background: #f8fafc; color: #475569; font-weight: 700; white-space: nowrap; }
        .report-table td { padding: 0.75rem; border-top: 1px solid #eef2f7; color: #334155; white-space: nowrap; }
        .report-table tr:hover td { background: #f8fbff; }
        @media (max-width: 768px) {
          .reports-tabs { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }
          .reports-tab { font-size: 0.8rem; padding: 0.5rem 0.75rem; }
          .reports-tab-icon { margin-right: 0.2rem; }
          .report-cards-grid { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
          .report-card { padding: 1rem; }
          .report-card-value { font-size: 1.25rem; }
          .reports-toolbar { flex-direction: column; align-items: flex-start; }
        }
        @media (max-width: 480px) {
          .report-cards-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="card reports-page">
        <div className="reports-header">
          <h1>Reports</h1>
          <div className="reports-filters">
            <label>From:</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <label>To:</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <button className="btn-primary-sm" onClick={fetchData} disabled={loading}>
              {loading ? <span className="spinner-sm" /> : '↻'} Refresh
            </button>
          </div>
        </div>

        <div className="reports-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`reports-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="reports-tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="reports-toolbar">
          <div className="reports-toolbar-left">
            <h2>{TABS.find((t) => t.key === activeTab)?.label || 'Report'}</h2>
          </div>
          <div className="reports-toolbar-right">
            <button className="btn-outline" onClick={() => handleExport('csv')}>
              📄 CSV
            </button>
            <button className="btn-outline" onClick={() => handleExport('xlsx')}>
              📊 XLSX
            </button>
            <button className="btn-outline" onClick={() => handleExport('pdf')}>
              🖨️ PDF
            </button>
          </div>
        </div>

        {error && <div className="report-error">{error}</div>}

        {loading ? (
          <div className="report-cards-grid">
            {cards.map((card) => (
              <div key={card.key} className="report-card">
                <div className="report-card-label">{card.label}</div>
                <div className="report-card-value loading">—</div>
              </div>
            ))}
          </div>
        ) : cardData ? (
          <>
            <div className="report-cards-grid">
              {cards.map((card) => (
                <div key={card.key} className="report-card">
                  <div className="report-card-label">{card.label}</div>
                  <div className="report-card-value">
                    {card.prefix || ''}{formatNum(cardData[card.key])}{card.suffix || ''}
                  </div>
                </div>
              ))}
            </div>
            {reportRows.length > 0 ? (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead><tr>{reportColumns.map((key) => <th key={key}>{columnLabel(key)}</th>)}</tr></thead>
                  <tbody>{reportRows.map((row, index) => <tr key={row.id || index}>{reportColumns.map((key) => <td key={key}>{displayCell(key, row[key])}</td>)}</tr>)}</tbody>
                </table>
              </div>
            ) : (
              <EmptyState tabKey={activeTab} />
            )}
          </>
        ) : (
          <EmptyState tabKey={activeTab} />
        )}
      </div>
    </div>
  );
}

export default Reports;
