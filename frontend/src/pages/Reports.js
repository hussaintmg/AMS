import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    ArrowsPointingOutIcon,
    BanknotesIcon,
    ChartBarIcon,
    ChevronRightIcon,
    CubeIcon,
    MagnifyingGlassIcon,
    PrinterIcon,
    TableCellsIcon,
    UserGroupIcon,
    WrenchIcon
} from '@heroicons/react/24/outline';
import { reportAPI } from '../services/api';
import { exportReportCsv, exportReportPdf, exportReportXlsx } from '../utils/reportsExport';

const initialFilters = {
    startDate: '',
    endDate: '',
    status: '',
    warehouseId: '',
    salesExecutiveId: '',
    customerId: '',
    limit: 200
};

const Reports = () => {
    const reportsConfig = [
        {
            category: 'Sales & Revenue',
            icon: <ChartBarIcon className="nav-icon" />,
            reports: [
                { id: 'sales_performance', title: 'Sales Performance', icon: <UserGroupIcon />, fetcher: reportAPI.getSalesPerformance, description: 'Revenue and order value by sales executive.' },
                { id: 'sales_by_model', title: 'Sales by Model', icon: <TableCellsIcon />, fetcher: reportAPI.getSalesByModel, description: 'Model-wise sales contribution and collections.' },
                { id: 'pending_deliveries', title: 'Pending Deliveries', icon: <CubeIcon />, fetcher: reportAPI.getPendingDeliveries, description: 'Orders awaiting delivery by due date.' },
                { id: 'lead_statistics', title: 'Lead Statistics', icon: <ChartBarIcon />, fetcher: reportAPI.getLeadStatistics, description: 'Lead mix and conversion funnel status.' }
            ]
        },
        {
            category: 'Inventory',
            icon: <CubeIcon className="nav-icon" />,
            reports: [
                { id: 'inventory_health', title: 'Inventory Health', icon: <TableCellsIcon />, fetcher: reportAPI.getInventoryHealth, description: 'Current part stock health and replenishment urgency.' },
                { id: 'inventory_stock_snapshot', title: 'Stock Snapshot', icon: <TableCellsIcon />, fetcher: reportAPI.getInventoryStockSnapshot, description: 'Warehouse-wise stock units and value snapshot.' },
                { id: 'inventory_stock_movement', title: 'Stock Movement', icon: <ArrowPathIcon />, fetcher: reportAPI.getInventoryStockMovement, description: 'Inbound, outbound, transfer, and adjustment activity.' },
                { id: 'low_stock_parts', title: 'Low Stock Alerts', icon: <CubeIcon />, fetcher: reportAPI.getLowStockParts, description: 'Items below reorder threshold.' }
            ]
        },
        {
            category: 'Financials',
            icon: <BanknotesIcon className="nav-icon" />,
            reports: [
                { id: 'customer_receivables', title: 'Customer Receivables', icon: <BanknotesIcon />, fetcher: reportAPI.getCustomerReceivables, description: 'Outstanding balances by customer.' },
                { id: 'receivables_aging', title: 'Receivables Aging', icon: <TableCellsIcon />, fetcher: reportAPI.getReceivablesAging, description: 'Aging buckets and overdue analysis.' }
            ]
        },
        {
            category: 'Service',
            icon: <WrenchIcon className="nav-icon" />,
            reports: [
                { id: 'service_analytics', title: 'Service Analytics', icon: <WrenchIcon />, fetcher: reportAPI.getServiceAnalytics, description: 'Job card volume and revenue by status.' },
                { id: 'service_kpi_detail', title: 'Service KPI Detail', icon: <TableCellsIcon />, fetcher: reportAPI.getServiceKpiDetail, description: 'Turnaround and ticket value detail per job card.' }
            ]
        }
    ];

    const [selectedReport, setSelectedReport] = useState(reportsConfig[0].reports[0]);
    const [reportData, setReportData] = useState([]);
    const [meta, setMeta] = useState({});
    const [summary, setSummary] = useState({});
    const [filters, setFilters] = useState(initialFilters);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const normalizedApiFilters = useMemo(() => {
        const mapped = { ...filters };
        Object.keys(mapped).forEach((key) => {
            if (mapped[key] === '' || mapped[key] === null || mapped[key] === undefined) {
                delete mapped[key];
            }
        });
        return mapped;
    }, [filters]);

    const loadData = async (report = selectedReport) => {
        setIsLoading(true);
        setReportData([]);
        setMeta({});
        setSummary({});
        try {
            const res = await report.fetcher(normalizedApiFilters);
            if (res.data?.success) {
                setReportData(Array.isArray(res.data.data) ? res.data.data : []);
                setMeta(res.data.meta || {});
                setSummary(res.data.summary || {});
            } else {
                setReportData([]);
                setMeta({});
                setSummary({});
            }
        } catch (error) {
            console.error('Report execution failed:', error);
            toast.error('Could not fetch report data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData(selectedReport);
    }, [selectedReport, normalizedApiFilters]);

    const formatCell = (key, value) => {
        if (value === null || value === undefined || value === '') return '-';
        if (typeof value === 'number') {
            if (/(revenue|amount|price|due|total|value|balance|collected)/i.test(key)) {
                return <span className="money-cell">PKR {value.toLocaleString()}</span>;
            }
            return value.toLocaleString();
        }
        if (/(date|created_at|completed_at)/i.test(key) && !Number.isNaN(Date.parse(value))) {
            return new Date(value).toLocaleDateString();
        }
        return String(value);
    };

    const displayData = useMemo(() => {
        if (!searchQuery) return reportData;
        const needle = searchQuery.toLowerCase();
        return reportData.filter((row) => Object.values(row).some((item) => String(item).toLowerCase().includes(needle)));
    }, [reportData, searchQuery]);

    const kpiItems = useMemo(() => {
        const totalRows = displayData.length;
        const moneyColumns = Object.keys(displayData[0] || {}).filter((key) => /(revenue|amount|price|due|total|value|balance|collected)/i.test(key));
        const totalValue = displayData.reduce((sum, row) => sum + moneyColumns.reduce((inner, key) => inner + Number(row[key] || 0), 0), 0);
        return [
            { label: 'Rows', value: totalRows.toLocaleString() },
            { label: 'Money Columns', value: moneyColumns.length.toLocaleString() },
            { label: 'Aggregate Value', value: `PKR ${totalValue.toLocaleString()}` }
        ];
    }, [displayData]);

    const handleFilterInput = (event) => {
        const { name, value } = event.target;
        setFilters((prev) => ({ ...prev, [name]: value }));
    };

    const handleExport = (type) => {
        if (!displayData.length) {
            toast.error('No rows to export');
            return;
        }
        const payload = { rows: displayData, reportName: selectedReport.title, meta };
        if (type === 'csv') exportReportCsv(payload);
        if (type === 'xlsx') exportReportXlsx(payload);
        if (type === 'pdf') exportReportPdf(payload);
    };

    const openFullViewPopup = () => {
        if (!displayData.length) {
            toast.error('No rows to open');
            return;
        }
        const columns = Object.keys(displayData[0] || {});
        const head = columns.map((key) => `<th>${key.replace(/_/g, ' ')}</th>`).join('');
        const rows = displayData.map((row) => (
            `<tr>${columns.map((key) => `<td>${String(row[key] ?? '-').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`
        )).join('');
        const popup = window.open('', '_blank');
        if (!popup) {
            toast.error('Popup blocked by browser');
            return;
        }
        popup.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8"/>
                <title>${selectedReport.title} - Full View</title>
                <style>
                    body { font-family: Inter, Arial, sans-serif; margin: 16px; color: #0f172a; }
                    h1 { margin: 0 0 8px 0; font-size: 22px; color: #1e3a8a; }
                    p { margin: 0 0 14px 0; color: #475569; font-size: 13px; }
                    .wrap { overflow: auto; border: 1px solid #cbd5e1; border-radius: 8px; max-height: 82vh; }
                    table { border-collapse: collapse; min-width: max-content; width: max-content; }
                    th, td { border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 8px 10px; white-space: nowrap; font-size: 12px; }
                    th { position: sticky; top: 0; background: #f1f5f9; text-transform: uppercase; font-size: 10px; letter-spacing: .02em; }
                    tr:nth-child(even) td { background: #f8fafc; }
                </style>
            </head>
            <body>
                <h1>${selectedReport.title}</h1>
                <p>Full-width table view for large reports.</p>
                <div class="wrap">
                    <table>
                        <thead><tr>${head}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </body>
            </html>
        `);
        popup.document.close();
    };

    return (
        <div className="reports-v2">
            <header className="reports-v2-header">
                <h1>Enterprise Analytics</h1>
                <p>Broad, detailed, and corporate-formatted reporting for operations and finance.</p>
            </header>

            <div className="reports-v2-shell">
                <aside className="reports-v2-nav">
                    {reportsConfig.map((category) => (
                        <div className="reports-v2-group" key={category.category}>
                            <div className="group-label">{category.icon}<span>{category.category}</span></div>
                            {category.reports.map((report) => (
                                <button
                                    key={report.id}
                                    className={`group-item ${report.id === selectedReport.id ? 'active' : ''}`}
                                    onClick={() => setSelectedReport(report)}
                                >
                                    <span>{report.title}</span>
                                    {report.id === selectedReport.id && <ChevronRightIcon className="item-arrow" />}
                                </button>
                            ))}
                        </div>
                    ))}
                </aside>

                <main className="reports-v2-main">
                    <section className="main-card">
                        <div className="main-card-head">
                            <div>
                                <h2>{selectedReport.title}</h2>
                                <p>{selectedReport.description}</p>
                            </div>
                            <div className="head-actions">
                                <button className="tool-btn" onClick={() => handleExport('csv')} title="Export CSV"><ArrowDownTrayIcon /></button>
                                <button className="tool-btn" onClick={() => handleExport('xlsx')} title="Export XLSX"><TableCellsIcon /></button>
                                <button className="tool-btn" onClick={() => handleExport('pdf')} title="Export PDF"><PrinterIcon /></button>
                                <button className="tool-btn full-view-btn" onClick={openFullViewPopup} title="Open Full View">
                                    <ArrowsPointingOutIcon />
                                    <span>Full View</span>
                                </button>
                                <button className="refresh-btn" onClick={() => loadData(selectedReport)} disabled={isLoading}>
                                    <ArrowPathIcon className={isLoading ? 'spin' : ''} />
                                    Refresh
                                </button>
                            </div>
                        </div>

                        <div className="filters-row">
                            <div className="search-box">
                                <MagnifyingGlassIcon />
                                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Quick filter..." />
                            </div>
                            <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterInput} />
                            <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterInput} />
                            <input name="status" value={filters.status} onChange={handleFilterInput} placeholder="Status" />
                            <input name="warehouseId" value={filters.warehouseId} onChange={handleFilterInput} placeholder="Warehouse ID" />
                            <input name="salesExecutiveId" value={filters.salesExecutiveId} onChange={handleFilterInput} placeholder="Sales Executive ID" />
                            <input name="customerId" value={filters.customerId} onChange={handleFilterInput} placeholder="Customer ID" />
                            <select name="limit" value={filters.limit} onChange={handleFilterInput}>
                                <option value="100">100 rows</option>
                                <option value="200">200 rows</option>
                                <option value="500">500 rows</option>
                                <option value="1000">1000 rows</option>
                            </select>
                        </div>

                        <div className="kpi-row">
                            {kpiItems.map((item) => (
                                <div className="kpi-card" key={item.label}>
                                    <span>{item.label}</span>
                                    <strong>{item.value}</strong>
                                </div>
                            ))}
                        </div>

                        <div className="table-wrap">
                            {isLoading ? (
                                <div className="loading-state">Loading report data...</div>
                            ) : displayData.length > 0 ? (
                                <table>
                                    <thead>
                                        <tr>
                                            {Object.keys(displayData[0]).map((key) => <th key={key}>{key.replace(/_/g, ' ')}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayData.map((row, rowIndex) => (
                                            <tr key={`${selectedReport.id}-${rowIndex}`}>
                                                {Object.entries(row).map(([key, value]) => (
                                                    <td key={`${rowIndex}-${key}`}>{formatCell(key, value)}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="empty-state">No records found for current filters.</div>
                            )}
                        </div>
                        {displayData.length > 0 && (
                            <div className="scroll-hint">Tip: Shift + mouse wheel (or trackpad horizontal swipe) to move across wide columns.</div>
                        )}

                        <div className="card-footer">
                            <span>Rows: {displayData.length}</span>
                            <span>Generated: {meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : new Date().toLocaleString()}</span>
                            {Object.keys(summary || {}).length > 0 && <span>Summary fields: {Object.keys(summary).length}</span>}
                        </div>
                    </section>
                </main>
            </div>

            <style>{`
                .reports-v2 {
                    --accent: var(--primary-600, #1a73ba);
                    --border: #e2e8f0;
                    --muted: #64748b;
                }
                .reports-v2-header h1 { margin: 0; font-size: 1.8rem; }
                .reports-v2-header p { margin: 0.25rem 0 1rem 0; color: var(--muted); }
                .reports-v2-shell { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 1rem; }
                .reports-v2-nav {
                    background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 0.75rem;
                    position: sticky; top: 90px; max-height: calc(100vh - 120px); overflow: auto;
                }
                .reports-v2-group { margin-bottom: 0.75rem; }
                .group-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.72rem; text-transform: uppercase; color: var(--muted); margin-bottom: 0.25rem; }
                .nav-icon { width: 1rem; height: 1rem; }
                .group-item {
                    width: 100%; display: flex; align-items: center; justify-content: space-between;
                    border: none; background: transparent; border-radius: 8px; padding: 0.65rem 0.75rem; cursor: pointer; text-align: left;
                }
                .group-item:hover { background: #f8fafc; }
                .group-item.active { background: var(--accent); color: #fff; }
                .item-arrow { width: 1rem; height: 1rem; }
                .reports-v2-main { min-width: 0; overflow-x: auto; }
                .main-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; min-width: 0; width: 100%; }
                .main-card-head { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
                .main-card-head h2 { margin: 0; }
                .main-card-head p { margin: 0.2rem 0 0 0; color: var(--muted); font-size: 0.9rem; }
                .head-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
                .tool-btn, .refresh-btn {
                    border: 1px solid var(--border); background: #fff; border-radius: 8px; cursor: pointer;
                    display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 0.75rem;
                }
                .tool-btn svg, .refresh-btn svg { width: 1rem; height: 1rem; }
                .full-view-btn { gap: 0.35rem; padding: 0 0.65rem; }
                .full-view-btn span { font-size: 0.78rem; font-weight: 600; }
                .refresh-btn { background: var(--accent); color: #fff; border-color: var(--accent); gap: 0.4rem; }
                .spin { animation: spin 1s linear infinite; }
                .filters-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    padding: 0.8rem 1.25rem;
                    border-bottom: 1px solid var(--border);
                    background: #f8fafc;
                }
                .filters-row input, .filters-row select {
                    border: 1px solid var(--border); border-radius: 8px; height: 36px; padding: 0 0.6rem; background: #fff;
                    min-width: 130px;
                }
                .search-box { display: flex; align-items: center; gap: 0.45rem; border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 0 0.6rem; min-width: 220px; flex: 1; }
                .search-box input { border: none; outline: none; width: 100%; }
                .search-box svg { width: 1rem; height: 1rem; color: var(--muted); }
                .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; padding: 0.8rem 1.25rem; border-bottom: 1px solid var(--border); }
                .kpi-card { border: 1px solid var(--border); border-radius: 10px; padding: 0.65rem 0.8rem; background: #fff; }
                .kpi-card span { color: var(--muted); font-size: 0.8rem; display: block; }
                .kpi-card strong { font-size: 1rem; }
                .table-wrap {
                    max-height: 58vh;
                    overflow-y: auto;
                    overflow-x: auto;
                    border-top: 1px solid var(--border);
                    border-bottom: 1px solid var(--border);
                    width: 100%;
                    scrollbar-gutter: stable both-edges;
                }
                table {
                    border-collapse: collapse;
                    min-width: max-content;
                    width: max-content;
                }
                th { position: sticky; top: 0; background: #f8fafc; text-align: left; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.02em; color: var(--muted); padding: 0.75rem; border-bottom: 1px solid var(--border); }
                td { padding: 0.75rem; border-bottom: 1px solid #f1f5f9; font-size: 0.86rem; }
                th, td { white-space: nowrap; }
                tr:hover td { background: #fcfdff; }
                .money-cell { color: #0369a1; font-weight: 600; }
                .loading-state, .empty-state { padding: 3rem; text-align: center; color: var(--muted); }
                .scroll-hint { padding: 0.45rem 1.25rem; font-size: 0.78rem; color: var(--muted); background: #f8fafc; border-bottom: 1px solid var(--border); }
                .card-footer { display: flex; gap: 1rem; justify-content: space-between; padding: 0.8rem 1.25rem; border-top: 1px solid var(--border); background: #f8fafc; font-size: 0.8rem; color: var(--muted); }
                @keyframes spin { to { transform: rotate(360deg); } }
                @media (max-width: 1280px) {
                    .reports-v2-shell { grid-template-columns: 1fr; }
                    .reports-v2-nav { position: static; max-height: none; }
                    .filters-row { flex-direction: row; }
                    .kpi-row { grid-template-columns: 1fr; }
                }
                @media print {
                    .reports-v2-nav, .head-actions, .filters-row { display: none !important; }
                    .reports-v2-shell { grid-template-columns: 1fr; }
                    .main-card { border: none; box-shadow: none; }
                    .table-wrap { max-height: none; overflow: visible; }
                }
            `}</style>
        </div>
    );
};

export default Reports;
