import React, { useState, useEffect, useCallback } from 'react';
import { reportAPI, partsSalesAPI, partsInvoiceAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import '../styles/userManagement.css';


// Vehicles and parts are separate businesses with separate documents, so each
// side gets its own sales and inventory report rather than one mixed view.
const TABS = [
  { key: 'leads', label: 'Leads Report', icon: '🎯' },
  { key: 'customers', label: 'Customers Report', icon: '👥' },
  { key: 'sales', label: 'Vehicle Sales', icon: '🚗' },
  { key: 'partsSales', label: 'Parts Sales', icon: '🔩' },
  { key: 'inventory', label: 'Vehicle Inventory', icon: '🚙' },
  { key: 'partsInventory', label: 'Parts Inventory', icon: '📦' },
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
    { key: 'customersWithPurchases', label: 'Customers with Purchases', default: '—' },
    { key: 'totalPurchased', label: 'Total Purchased', default: '—', prefix: 'PKR ' },
    { key: 'outstandingBalance', label: 'Outstanding Balance', default: '—', prefix: 'PKR ' },
  ],
  sales: [
    { key: 'totalRevenue', label: 'Total Revenue', default: '—', prefix: 'PKR ' },
    { key: 'totalOrders', label: 'Total Orders', default: '—' },
    { key: 'pendingDeliveries', label: 'Pending Deliveries', default: '—' },
    { key: 'avgOrderValue', label: 'Avg Order Value', default: '—', prefix: 'PKR ' },
    { key: 'receivables', label: 'Receivables', default: '—', prefix: 'PKR ' },
  ],
  partsSales: [
    { key: 'totalRevenue', label: 'Total Revenue', default: '—', prefix: 'PKR ' },
    { key: 'totalInvoices', label: 'Invoices', default: '—' },
    { key: 'totalQuotations', label: 'Quotations', default: '—' },
    { key: 'avgInvoiceValue', label: 'Avg Invoice Value', default: '—', prefix: 'PKR ' },
    { key: 'receivables', label: 'Receivables', default: '—', prefix: 'PKR ' },
  ],
  inventory: [
    { key: 'totalVehicles', label: 'Total Vehicles', default: '—' },
    { key: 'availableVehicles', label: 'Vehicles In Stock', default: '—' },
  ],
  partsInventory: [
    { key: 'totalParts', label: 'Total Parts', default: '—' },
    { key: 'lowStockItems', label: 'Low Stock Items', default: '—' },
    { key: 'stockValue', label: 'Parts Stock Value', default: '—', prefix: 'PKR ' },
  ],
  service: [
    { key: 'totalJobCards', label: 'Total Job Cards', default: '—' },
    { key: 'completed', label: 'Completed', default: '—' },
    { key: 'inProgress', label: 'In Progress', default: '—' },
    { key: 'appointments', label: 'Appointments', default: '—' },
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

const errorMessage = (error) =>
  error?.response?.data?.message || error?.message || 'Request failed';

// Every tab pulls several independent datasets. One failing endpoint must not blank
// the whole tab, so each request is settled on its own and its failure is reported
// by name instead of collapsing into a generic "No Data Available".
const loadAll = async (requests) => {
  const settled = await Promise.allSettled(requests.map((request) => request.load()));
  const data = {};
  const errors = [];
  settled.forEach((result, index) => {
    const { key, label } = requests[index];
    if (result.status === 'fulfilled') {
      data[key] = result.value?.data?.data || [];
    } else {
      data[key] = [];
      errors.push({ label, message: errorMessage(result.reason) });
    }
  });
  return { data, errors };
};

// Datasets name the same figure differently (revenue vs amount), so the first key
// that actually holds a number wins and anything unparseable counts as zero.
const sum = (rows, ...keys) => rows.reduce((total, row) => {
  const key = keys.find((candidate) => Number.isFinite(Number(row[candidate])));
  return total + (key ? Number(row[key]) : 0);
}, 0);

const isThisMonth = (value) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

const TAB_FETCHERS = {
  leads: async (params) => {
    const { data, errors } = await loadAll([
      { key: 'leads', label: 'Leads', load: () => reportAPI.getLeadStatistics(params) },
    ]);
    const rows = data.leads;
    const converted = rows.filter((row) => row.converted || String(row.status).toLowerCase() === 'converted').length;
    const lost = rows.filter((row) => String(row.status).toLowerCase() === 'lost').length;
    return {
      cards: {
        totalLeads: rows.length,
        converted,
        lost,
        conversionRate: rows.length ? Math.round(converted / rows.length * 10000) / 100 : 0,
      },
      sections: [{ key: 'leads', title: 'Leads', rows }],
      errors,
    };
  },
  customers: async (params) => {
    const { data, errors } = await loadAll([
      { key: 'customers', label: 'Customers', load: () => reportAPI.getCustomerPurchases(params) },
      { key: 'receivables', label: 'Receivables', load: () => reportAPI.getCustomerReceivables(params) },
    ]);
    const rows = data.customers;
    return {
      cards: {
        totalCustomers: rows.length,
        activeCustomers: rows.filter((row) => row.status !== 'inactive').length,
        customersWithPurchases: rows.filter((row) => Number(row.purchase_count) > 0).length,
        totalPurchased: sum(rows, 'total_purchased'),
        outstandingBalance: sum(rows, 'outstanding'),
      },
      sections: [
        { key: 'customers', title: 'Customers & Purchases', rows },
        { key: 'receivables', title: 'Outstanding Invoices', rows: data.receivables },
      ],
      errors,
    };
  },
  sales: async (params) => {
    const { data, errors } = await loadAll([
      { key: 'orders', label: 'Sales Orders', load: () => reportAPI.getSalesPerformance(params) },
      { key: 'pending', label: 'Pending Deliveries', load: () => reportAPI.getPendingDeliveries(params) },
      { key: 'receivables', label: 'Receivables', load: () => reportAPI.getCustomerReceivables(params) },
    ]);
    const revenue = sum(data.orders, 'revenue', 'amount');
    return {
      cards: {
        totalRevenue: revenue,
        totalOrders: data.orders.length,
        pendingDeliveries: data.pending.length,
        avgOrderValue: data.orders.length ? Math.round(revenue / data.orders.length) : 0,
        receivables: sum(data.receivables, 'outstanding'),
      },
      sections: [
        { key: 'orders', title: 'Vehicle Sales Orders', rows: data.orders },
        { key: 'pending', title: 'Pending Deliveries', rows: data.pending },
        { key: 'receivables', title: 'Receivables', rows: data.receivables },
      ],
      errors,
    };
  },
  partsSales: async (params) => {
    // The parts documents live in their own collections; their list endpoints
    // filter with dateFrom/dateTo rather than the report endpoints' startDate.
    const listParams = { limit: 1000, dateFrom: params.startDate, dateTo: params.endDate };
    const { data, errors } = await loadAll([
      { key: 'invoices', label: 'Parts Invoices', load: () => partsInvoiceAPI.getAll(listParams) },
      { key: 'quotations', label: 'Parts Quotations', load: () => partsSalesAPI.getQuotations(listParams) },
    ]);
    const live = data.invoices.filter((row) => row.status !== 'cancelled');
    const revenue = sum(live, 'total_amount');
    return {
      cards: {
        totalRevenue: revenue,
        totalInvoices: live.length,
        totalQuotations: data.quotations.length,
        avgInvoiceValue: live.length ? Math.round(revenue / live.length) : 0,
        receivables: sum(live, 'balance_amount'),
      },
      sections: [
        { key: 'invoices', title: 'Parts Invoices', rows: data.invoices },
        { key: 'quotations', title: 'Parts Quotations', rows: data.quotations },
      ],
      errors,
    };
  },
  inventory: async (params) => {
    const { data, errors } = await loadAll([
      { key: 'vehicles', label: 'Vehicle Stock', load: () => reportAPI.getVehicleStock(params) },
    ]);
    return {
      cards: {
        totalVehicles: data.vehicles.length,
        availableVehicles: data.vehicles.filter((row) => !row.stock_out).length,
      },
      sections: [
        { key: 'vehicles', title: 'Vehicle Stock', rows: data.vehicles },
      ],
      errors,
    };
  },
  partsInventory: async (params) => {
    const { data, errors } = await loadAll([
      { key: 'parts', label: 'Parts Stock', load: () => reportAPI.getInventoryHealth(params) },
    ]);
    return {
      cards: {
        totalParts: data.parts.length,
        lowStockItems: data.parts.filter((row) => row.status === 'low').length,
        stockValue: sum(data.parts, 'stockValue'),
      },
      sections: [
        { key: 'parts', title: 'Parts Stock', rows: data.parts },
      ],
      errors,
    };
  },
  service: async (params) => {
    const { data, errors } = await loadAll([
      { key: 'jobCards', label: 'Job Cards', load: () => reportAPI.getServiceAnalytics(params) },
      { key: 'appointments', label: 'Service Appointments', load: () => reportAPI.getServiceAppointments(params) },
    ]);
    return {
      cards: {
        totalJobCards: data.jobCards.length,
        completed: data.jobCards.filter((row) => ['completed', 'delivered'].includes(row.status)).length,
        inProgress: data.jobCards.filter((row) => ['in_progress', 'open', 'pending'].includes(row.status)).length,
        appointments: data.appointments.length,
        serviceRevenue: sum(data.jobCards, 'revenue', 'amount'),
      },
      sections: [
        { key: 'jobCards', title: 'Job Cards', rows: data.jobCards },
        { key: 'appointments', title: 'Service Appointments', rows: data.appointments },
      ],
      errors,
    };
  },
  expenses: async (params) => {
    const { data, errors } = await loadAll([
      { key: 'expenses', label: 'Expenses', load: () => reportAPI.getExpenses(params) },
    ]);
    const rows = data.expenses;
    return {
      cards: {
        totalExpenses: sum(rows, 'amount'),
        pendingExpenses: rows.filter((row) => ['draft', 'submitted'].includes(row.status)).length,
        approvedExpenses: rows.filter((row) => ['approved', 'posted'].includes(row.status)).length,
        monthExpenses: rows.filter((row) => isThisMonth(row.date)).reduce((total, row) => total + Number(row.amount || 0), 0),
      },
      sections: [{ key: 'expenses', title: 'Expenses', rows }],
      errors,
    };
  },
  payments: async (params) => {
    const { data, errors } = await loadAll([
      { key: 'payments', label: 'Payments', load: () => reportAPI.getPayments(params) },
    ]);
    const rows = data.payments;
    return {
      cards: {
        totalReceived: sum(rows, 'amount'),
        pendingPayments: rows.filter((row) => ['pending', 'draft'].includes(row.status)).length,
        monthPayments: rows.filter((row) => isThisMonth(row.date)).reduce((total, row) => total + Number(row.amount || 0), 0),
        paymentMethods: new Set(rows.map((row) => row.method).filter(Boolean)).size,
      },
      sections: [{ key: 'payments', title: 'Payments', rows }],
      errors,
    };
  },
  employee: async (params) => {
    const { data, errors } = await loadAll([
      { key: 'employees', label: 'Employees', load: () => reportAPI.getEmployees(params) },
    ]);
    const rows = data.employees;
    return {
      cards: {
        totalEmployees: rows.length,
        activeEmployees: rows.filter((row) => row.status === 'active').length,
        onLeave: rows.filter((row) => row.onLeave).length,
        departments: rows[0]?.departments ?? new Set(rows.map((row) => row.department).filter(Boolean)).size,
      },
      sections: [{ key: 'employees', title: 'Employees', rows }],
      errors,
    };
  },
};

const HIDDEN_COLUMNS = new Set(['id', '_id', 'customerId', 'onLeave', 'departments', 'invoice_id', 'line_items', 'customer_id', 'quotation_id', 'sales_order_id', 'seller_id']);
const MONEY_COLUMNS = new Set([
  'amount', 'revenue', 'payment', 'balance', 'outstanding', 'stockValue', 'totalAmount', 'paidAmount',
  'balanceAmount', 'total_purchased', 'total_paid', 'overdue_amount', 'paid', 'subtotal', 'discount',
]);
const isMoneyColumn = (key) => MONEY_COLUMNS.has(key) || /(_price|_amount|_total|_value)$/.test(key);
const isDateColumn = (key) => /date/i.test(key) || /_at$/.test(key);

function formatNum(n) {
  if (n === null || n === undefined || n === '—') return '—';
  const num = Number(n);
  return isNaN(num) ? '—' : num.toLocaleString();
}

function EmptyState({ message }) {
  return (
    <div className="report-empty-state">
      <div className="report-empty-icon">📊</div>
      <h3>No Data Available</h3>
      <p>{message || 'No records found for the selected date range. Try adjusting the filters or add some data first.'}</p>
    </div>
  );
}

const columnLabel = (key) => key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const columnsOf = (rows) => (rows.length
  ? Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((key) => !HIDDEN_COLUMNS.has(key))
  : []);

const displayCell = (key, value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== '').join(', ');
  if (typeof value === 'object') {
    if (value.name || value.label || value.title) return value.name || value.label || value.title;
    return JSON.stringify(value).replace(/["{}]/g, '').replace(/,/g, ', ');
  }
  if (isMoneyColumn(key)) return `PKR ${Number(value || 0).toLocaleString()}`;
  if (isDateColumn(key)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  }
  return String(value);
};

function ReportSection({ title, rows }) {
  const columns = columnsOf(rows);
  return (
    <div className="report-section">
      <div className="report-section-header">
        <h3>{title}</h3>
        <span className="report-section-count">{rows.length} {rows.length === 1 ? 'record' : 'records'}</span>
      </div>
      {rows.length ? (
        <div className="report-table-wrap">
          <table className="report-table">
            <thead><tr>{columns.map((key) => <th key={key}>{columnLabel(key)}</th>)}</tr></thead>
            {/* Reports join across tables, so two rows can legitimately carry the
                same row.id (one sale, two invoice lines). Pairing id with the index
                keeps every key unique — a duplicate key silently drops rows. */}
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.id ?? 'row'}-${index}`}>
                  {columns.map((key) => <td key={key}>{displayCell(key, row[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="report-section-empty">No records found for this date range.</div>
      )}
    </div>
  );
}

function Reports() {
  const { isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('leads');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const params = {};
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      const fetcher = TAB_FETCHERS[activeTab];
      if (!fetcher) {
        setReport(null);
        return;
      }
      setReport(await fetcher(params));
    } catch (err) {
      console.error('Report fetch failed:', err);
      setError(errorMessage(err) || 'Failed to load report data');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sections = report?.sections || [];
  const populatedSections = sections.filter((section) => section.rows.length > 0);

  const handleExport = (format) => {
    if (format === 'pdf') { window.print(); return; }
    if (!populatedSections.length) { toast.error('There is no report data to export.'); return; }
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    // Each section keeps its own header row: the datasets have different shapes,
    // so a single flat sheet would leave most cells empty.
    const lines = [];
    populatedSections.forEach((section, index) => {
      if (index > 0) lines.push('');
      const columns = columnsOf(section.rows);
      lines.push(escape(section.title));
      lines.push(columns.map((key) => escape(columnLabel(key))).join(','));
      section.rows.forEach((row) => lines.push(columns.map((key) => escape(row[key])).join(',')));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${activeTab}-report.csv`; link.click(); URL.revokeObjectURL(url);
    toast.success(`${format.toUpperCase()} export downloaded.`);
  };

  // Parts stock value is derived from purchase price, which only a super admin
  // may see — the API withholds the field, so the card would read PKR 0.
  const cards = (TAB_CARDS[activeTab] || []).filter(
    (card) => card.key !== 'stockValue' || isSuperAdmin,
  );
  const cardValues = report?.cards || {};
  const failures = report?.errors || [];

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
        .report-warning { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 0.75rem 1rem; color: #92400e; margin-bottom: 1rem; font-size: 0.85rem; }
        .report-warning ul { margin: 0.35rem 0 0; padding-left: 1.1rem; }
        .report-sections { display: flex; flex-direction: column; gap: 1.5rem; }
        .report-section-header { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.5rem; }
        .report-section-header h3 { margin: 0; font-size: 0.98rem; color: #0f172a; }
        .report-section-count { font-size: 0.78rem; color: #64748b; white-space: nowrap; }
        .report-section-empty { border: 1px dashed #e2e8f0; border-radius: 10px; padding: 1.25rem; text-align: center; color: #94a3b8; font-size: 0.85rem; background: #fff; }
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

        {failures.length > 0 && (
          <div className="report-warning">
            Some data could not be loaded:
            <ul>
              {failures.map((failure) => (
                <li key={failure.label}><strong>{failure.label}</strong> — {failure.message}</li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="report-cards-grid">
            {cards.map((card) => (
              <div key={card.key} className="report-card">
                <div className="report-card-label">{card.label}</div>
                <div className="report-card-value loading">—</div>
              </div>
            ))}
          </div>
        ) : report ? (
          <>
            <div className="report-cards-grid">
              {cards.map((card) => (
                <div key={card.key} className="report-card">
                  <div className="report-card-label">{card.label}</div>
                  <div className="report-card-value">
                    {card.prefix || ''}{formatNum(cardValues[card.key])}{card.suffix || ''}
                  </div>
                </div>
              ))}
            </div>
            {populatedSections.length > 0 ? (
              <div className="report-sections">
                {sections.map((section) => (
                  <ReportSection key={section.key} title={section.title} rows={section.rows} />
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

export default Reports;
