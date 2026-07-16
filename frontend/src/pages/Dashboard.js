/**
 * Dashboard — corporate overview, role-aware, lightweight (minimal motion, batched fetches).
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../services/api';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import '../styles/dashboard.css';
import { Link } from 'react-router-dom';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

/**
 * Main Dashboard Component
 * Renders different views based on user role
 */
const chartAnim = { duration: 650, easing: 'easeOutQuart' };

function Dashboard() {
    const { user, hasRole } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({});
    const [salesTrend, setSalesTrend] = useState({ labels: [], datasets: { revenue: [], orders: [] } });
    const [inventoryDist, setInventoryDist] = useState(null);
    const [topPerformers, setTopPerformers] = useState({ sales: [], service: [] });
    const [activities, setActivities] = useState([]);
    const [kpis, setKpis] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [performerPeriod, setPerformerPeriod] = useState('month');
    const [performerTab, setPerformerTab] = useState('sales');
    const [recentLeads, setRecentLeads] = useState([]);
    const [recentSales, setRecentSales] = useState([]);
    const performerSkipRef = useRef(false);

    const displayName = useMemo(() => {
        return user?.first_name || user?.firstName || user?.email?.split('@')[0] || 'User';
    }, [user]);

    const isAdmin = useMemo(() => {
        const role = (user?.role || user?.role_name || '').toLowerCase();
        return ['super_admin', 'admin', 'manager'].includes(role);
    }, [user]);

    const showHrStrip = useMemo(
        () => hasRole(['super_admin', 'admin', 'hr_admin', 'payroll_clerk', 'accountant', 'manager']),
        [hasRole]
    );

    /**
     * Format currency with abbreviated values
     * @param {number} value - Amount to format
     * @returns {string} Formatted currency string
     */
    const formatCurrency = useCallback((value) => {
        if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
        if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        return value?.toLocaleString() || '0';
    }, []);

    /**
     * Format time as relative string
     * @param {string} dateString - ISO date string
     * @returns {string} Relative time
     */
    const formatTimeAgo = useCallback((dateString) => {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return date.toLocaleDateString();
        } catch (error) {
            return 'Unknown';
        }
    }, []);

    const fetchPerformers = useCallback(async () => {
        try {
            const res = await dashboardAPI.getTopPerformers(performerPeriod, 5);
            setTopPerformers(res.data.data || { sales: [], service: [] });
        } catch (e) {
            console.error(e);
        }
    }, [performerPeriod]);

    const loadCore = useCallback(
        async (isRefresh) => {
            try {
                if (isRefresh) setRefreshing(true);
                else setLoading(true);

                const requests = [
                    dashboardAPI.getStats(),
                    dashboardAPI.getSalesTrend(12),
                    dashboardAPI.getInventoryDistribution(),
                    dashboardAPI.getActivities(8),
                    dashboardAPI.getRecentLeads(),
                    dashboardAPI.getRecentSales(),
                    isAdmin ? dashboardAPI.getKPIs().catch(() => null) : Promise.resolve(null),
                    isAdmin ? dashboardAPI.getAlerts().catch(() => null) : Promise.resolve(null)
                ];

                const results = await Promise.allSettled(requests);

                const getData = (result, defaultValue = null) => {
                    if (result.status === 'fulfilled' && result.value?.data?.data !== undefined) {
                        return result.value.data.data;
                    }
                    return defaultValue;
                };

                setStats(getData(results[0], {}));
                setSalesTrend(getData(results[1], { labels: [], datasets: { revenue: [], orders: [] } }));
                setInventoryDist(getData(results[2], null));
                setActivities(getData(results[3], []));
                setRecentLeads(getData(results[4], []));
                setRecentSales(getData(results[5], []));
                if (isAdmin) {
                    setKpis(getData(results[6], null));
                    setAlerts(getData(results[7], []));
                } else {
                    setKpis(null);
                    setAlerts([]);
                }
            } catch (error) {
                console.error('Dashboard load error:', error);
            } finally {
                if (!isRefresh) setLoading(false);
                setRefreshing(false);
            }
        },
        [isAdmin]
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await loadCore(false);
            if (cancelled) return;
            await fetchPerformers();
        })();
        return () => {
            cancelled = true;
        };
    }, [isAdmin, loadCore, fetchPerformers]);

    useEffect(() => {
        if (!performerSkipRef.current) {
            performerSkipRef.current = true;
            return;
        }
        fetchPerformers();
    }, [performerPeriod, fetchPerformers]);

    useEffect(() => {
        const t = setInterval(() => {
            loadCore(true).then(() => fetchPerformers());
        }, 600000);
        return () => clearInterval(t);
    }, [loadCore, fetchPerformers]);

    // Chart configurations with professional styling
    const salesChartData = useMemo(() => ({
        labels: salesTrend.labels,
        datasets: [
            {
                label: 'Revenue (PKR)',
                data: salesTrend.datasets.revenue,
                borderColor: '#1e8de6',
                backgroundColor: 'rgba(30, 141, 230, 0.08)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#1e8de6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            },
            {
                label: 'Orders',
                data: salesTrend.datasets.orders || [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.08)',
                fill: false,
                tension: 0.35,
                yAxisID: 'orders'
            }
        ]
    }), [salesTrend]);

    const salesChartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(15,23,42,0.92)',
                padding: 12,
                titleFont: { size: 13, weight: '600' },
                bodyFont: { size: 12 },
                callbacks: {
                    label: (ctx) => `PKR ${ctx.raw?.toLocaleString() || 0}`
                }
            }
        },
        animation: chartAnim,
        scales: {
            x: {
                grid: { display: false },
                ticks: { font: { size: 10 }, color: '#6b7280' }
            },
            y: {
                grid: { color: 'rgba(0,0,0,0.04)' },
                ticks: {
                    font: { size: 10 },
                    color: '#6b7280',
                    callback: (val) => formatCurrency(val)
                }
            },
            orders: {
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { color: '#6b7280' }
            }
        }
    }), [formatCurrency]);

    const inventoryChartData = useMemo(() => {
        if (!inventoryDist?.vehicleStatus) return null;
        return {
            labels: inventoryDist.vehicleStatus.labels.map(l =>
                l.replace(/_/g, ' ').toUpperCase()
            ),
            datasets: [{
                data: inventoryDist.vehicleStatus.data,
                backgroundColor: ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280'],
                borderWidth: 0,
                hoverOffset: 6
            }]
        };
    }, [inventoryDist]);

    const inventoryChartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    padding: 12,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    font: { size: 11 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15,23,42,0.92)',
                padding: 10,
                callbacks: {
                    label: (ctx) => `${ctx.label}: ${ctx.raw} vehicles`
                }
            }
        },
        animation: chartAnim,
        cutout: '60%'
    }), []);

    const pipelineChartData = useMemo(() => ({
        labels: ['Leads', 'Quotations', 'Bookings', 'Sales orders', 'Invoices'],
        datasets: [{ data: [stats.activeLeads || 0, stats.totalQuotations || 0, stats.totalBookings || 0, stats.monthlySalesCount || 0, stats.totalInvoices || 0], backgroundColor: ['#2563eb', '#7c3aed', '#f59e0b', '#10b981', '#06b6d4'], borderWidth: 0, borderRadius: 5 }]
    }), [stats]);

    const financeChartData = useMemo(() => ({
        labels: ['Revenue', 'Outstanding A/R', 'Service revenue'],
        datasets: [{ data: [stats.monthlyRevenue || 0, stats.outstandingReceivables || 0, stats.serviceRevenue || 0], backgroundColor: ['#10b981', '#ef4444', '#8b5cf6'], borderWidth: 0, hoverOffset: 7 }]
    }), [stats]);

    // Current date formatting
    const currentDate = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

    // Loading skeleton
    if (loading) {
        return (
            <div className="dashboard">
                <div className="dashboard-header">
                    <div>
                        <div className="skeleton" style={{ width: 200, height: 28, marginBottom: 8 }} />
                        <div className="skeleton" style={{ width: 150, height: 16 }} />
                    </div>
                </div>
                <div className="stats-grid">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="skeleton skeleton-stat" />
                    ))}
                </div>
                <div className="dashboard-grid">
                    <div className="skeleton skeleton-chart" />
                    <div className="skeleton skeleton-chart" />
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard">
            {/* Welcome Banner */}
            <header className="welcome-message">
                <div className="welcome-content">
                    <h2>Welcome back, {displayName}</h2>
                    <p>Operational snapshot and shortcuts for your day.</p>
                </div>
                <div className="welcome-date">
                    <span>{currentDate.toLocaleDateString('en-US', dateOptions)}</span>
                </div>
            </header>

            <div className="dashboard-header">
                <div>
                    <h1>
                        <span className="material-icons dashboard-title-mi" aria-hidden>space_dashboard</span>
                        Executive dashboard
                    </h1>
                    <p className="dashboard-subtitle">
                        {isAdmin ? 'Organization-wide KPIs and pipeline health' : 'Your pipeline and tasks'}
                    </p>
                </div>
                <div className="dashboard-actions">
                    <button
                        type="button"
                        className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
                        onClick={async () => {
                            await loadCore(true);
                            await fetchPerformers();
                        }}
                        disabled={refreshing}
                    >
                        <span className="material-icons refresh-btn-mi">sync</span>
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* KPI Cards (Admin Only) */}
            {isAdmin && kpis && (
                <div className="kpi-grid">
                    <KPICard
                        label="Monthly Revenue"
                        value={`PKR ${formatCurrency(kpis.revenue?.current || 0)}`}
                        change={kpis.revenue?.change}
                        trend={kpis.revenue?.trend}
                    />
                    <KPICard
                        label="Lead intake (MTD)"
                        value={kpis.leads?.current || 0}
                        change={kpis.leads?.change}
                        trend={kpis.leads?.trend}
                    />
                    <KPICard
                        label="Conversion Rate"
                        value={`${kpis.conversionRate || 0}%`}
                        showChange={false}
                    />
                </div>
            )}

            <div className="stats-grid stats-grid-extended">
                <StatCard
                    materialIcon="hub"
                    label="Active pipeline"
                    value={stats.activeLeads || 0}
                    color="blue"
                />
                <StatCard
                    materialIcon="groups"
                    label="Customers"
                    value={stats.totalCustomers || 0}
                    color="cyan"
                />
                <StatCard
                    materialIcon="directions_car"
                    label="Vehicles in stock"
                    value={stats.vehiclesInStock || 0}
                    color="green"
                />
                <StatCard
                    materialIcon="local_shipping"
                    label="Pending deliveries"
                    value={stats.pendingDeliveries || 0}
                    color="orange"
                />
                <StatCard
                    materialIcon="build"
                    label="Open job cards"
                    value={stats.openJobCards || 0}
                    color="purple"
                />
                <StatCard
                    materialIcon="payments"
                    label="MTD revenue"
                    value={stats.monthlyRevenue || 0}
                    isCurrency
                    color="green"
                />
                <StatCard
                    materialIcon="receipt_long"
                    label="MTD sales orders"
                    value={stats.monthlySalesCount || 0}
                    color="blue"
                />
                <StatCard materialIcon="request_quote" label="Quotations" value={stats.totalQuotations || 0} color="cyan" />
                <StatCard materialIcon="event_note" label="Bookings" value={stats.totalBookings || 0} color="purple" />
                <StatCard materialIcon="description" label="Invoices" value={stats.totalInvoices || 0} color="blue" />
                <StatCard
                    materialIcon="event"
                    label={"Today's appointments"}
                    value={stats.todayAppointments || 0}
                    color="orange"
                />
                <StatCard
                    materialIcon="account_balance"
                    label="Outstanding A/R"
                    value={stats.outstandingReceivables || 0}
                    isCurrency
                    color="red"
                />
                <StatCard materialIcon="build_circle" label="Service revenue" value={stats.serviceRevenue || 0} isCurrency color="green" />
                {isAdmin && (
                    <StatCard
                        materialIcon="inventory_2"
                        label="Low-stock parts"
                        value={stats.lowStockParts || 0}
                        color="orange"
                    />
                )}
            </div>

            <h2 className="section-heading">Business overview</h2>
            <div className="dashboard-grid three-col">
                <div className="chart-card">
                    <div className="chart-card-header"><h3 className="chart-card-title"><span className="material-icons chart-title-mi" aria-hidden>account_tree</span>Pipeline volume</h3></div>
                    <div className="chart-container"><Bar data={pipelineChartData} options={{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0}}}}} /></div>
                </div>
                <div className="chart-card">
                    <div className="chart-card-header"><h3 className="chart-card-title"><span className="material-icons chart-title-mi" aria-hidden>account_balance_wallet</span>Finance mix</h3></div>
                    <div className="chart-container"><Doughnut data={financeChartData} options={{responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom',labels:{usePointStyle:true,padding:12}}}}} /></div>
                </div>
                <div className="chart-card">
                    <div className="chart-card-header"><h3 className="chart-card-title"><span className="material-icons chart-title-mi" aria-hidden>insights</span>Revenue and orders</h3></div>
                    <div className="chart-container"><Line data={salesChartData} options={salesChartOptions} /></div>
                </div>
            </div>

            {showHrStrip && stats.hr && (
                <section className="hr-stats-strip" aria-label="HR and finance snapshot">
                    <h2 className="section-heading">HR &amp; finance</h2>
                    <div className="stats-grid stats-grid-hr">
                        <StatCard
                            materialIcon="badge"
                            label="Active employees"
                            value={stats.hr.activeEmployees || 0}
                            color="blue"
                        />
                        <StatCard
                            materialIcon="event_available"
                            label="Leave approvals pending"
                            value={stats.hr.pendingLeaveRequests || 0}
                            color="orange"
                        />
                        <StatCard
                            materialIcon="calculate"
                            label="Draft payroll periods"
                            value={stats.hr.draftPayrollPeriods || 0}
                            color="purple"
                        />
                        <StatCard
                            materialIcon="request_quote"
                            label="Expenses awaiting action"
                            value={stats.hr.pendingExpenseLines || 0}
                            color="green"
                        />
                    </div>
                    <div className="hr-quick-links">
                        {hasRole(['super_admin', 'admin', 'hr_admin']) && (
                            <Link to="/hr/employees" className="text-link">Employees</Link>
                        )}
                        {hasRole(['super_admin', 'admin', 'payroll_clerk', 'accountant']) && (
                            <Link to="/hr/payroll" className="text-link">Payroll</Link>
                        )}
                        {hasRole(['super_admin', 'admin', 'hr_admin', 'manager']) && (
                            <Link to="/hr/leaves" className="text-link">Leaves</Link>
                        )}
                        {hasRole(['super_admin', 'admin', 'accountant', 'hr_admin']) && (
                            <>
                                <Link to="/hr/expenses" className="text-link">Expenses</Link>
                                <Link to="/hr/ledger" className="text-link">Ledger</Link>
                            </>
                        )}
                    </div>
                </section>
            )}

            <h2 className="section-heading">Pipeline &amp; inventory</h2>
            <div className="dashboard-grid">
                <div className="chart-card">
                    <div className="chart-card-header">
                        <h3 className="chart-card-title">
                            <span className="material-icons chart-title-mi" aria-hidden>show_chart</span>
                            Revenue trend
                        </h3>
                    </div>
                    <div className="chart-container">
                        {salesTrend.labels.length > 0 ? (
                            <Line data={salesChartData} options={salesChartOptions} />
                        ) : (
                            <div className="no-data">
                                <span className="material-icons no-data-mi">insights</span>
                                <span className="no-data-text">No sales data for this range</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="chart-card">
                    <div className="chart-card-header">
                        <h3 className="chart-card-title">
                            <span className="material-icons chart-title-mi" aria-hidden>donut_large</span>
                            Vehicle inventory mix
                        </h3>
                    </div>
                    <div className="chart-container">
                        {inventoryChartData ? (
                            <Doughnut data={inventoryChartData} options={inventoryChartOptions} />
                        ) : (
                            <div className="no-data">
                                <span className="material-icons no-data-mi">pie_chart</span>
                                <span className="no-data-text">No inventory breakdown</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="chart-card">
                    <div className="chart-card-header"><h3 className="chart-card-title"><span className="material-icons chart-title-mi" aria-hidden>bar_chart</span>Order volume</h3></div>
                    <div className="chart-container">
                        {salesTrend.labels.length > 0 ? <Bar data={{labels: salesTrend.labels, datasets: [{label: 'Orders', data: salesTrend.datasets.orders || [], backgroundColor: '#10b981', borderRadius: 5, maxBarThickness: 26}]}} options={{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}},y:{beginAtZero:true, ticks:{precision:0}}}}} /> : <div className="no-data"><span className="no-data-text">No order data for this range</span></div>}
                    </div>
                </div>
            </div>

            <h2 className="section-heading">Latest records</h2>
            <div className="dashboard-grid dashboard-grid-recents">
                <div className="chart-card recent-card">
                    <div className="chart-card-header">
                        <h3 className="chart-card-title">
                            <span className="material-icons chart-title-mi" aria-hidden>person_search</span>
                            Recent leads
                        </h3>
                        <Link to="/leads" className="card-link">View all</Link>
                    </div>
                    <div className="recent-table-wrap">
                        {recentLeads.length > 0 ? (
                            <table className="recent-table">
                                <thead>
                                    <tr>
                                        <th>Lead</th>
                                        <th>Status</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentLeads.slice(0, 6).map((row) => (
                                        <tr key={row.id}>
                                            <td data-label="Lead">
                                                <span className="recent-name">{row.name || row.lead_number}</span>
                                                <span className="recent-sub">{row.phone || '—'}</span>
                                            </td>
                                            <td data-label="Status"><span className="recent-pill">{row.status}</span></td>
                                            <td data-label="Date" className="recent-date">
                                                {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="no-data no-data-compact">
                                <span className="material-icons no-data-mi">inbox</span>
                                <span className="no-data-text">No leads yet</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="chart-card recent-card">
                    <div className="chart-card-header">
                        <h3 className="chart-card-title">
                            <span className="material-icons chart-title-mi" aria-hidden>shopping_cart</span>
                            Recent sales orders
                        </h3>
                        <Link to="/orders" className="card-link">View all</Link>
                    </div>
                    <div className="recent-table-wrap">
                        {recentSales.length > 0 ? (
                            <table className="recent-table">
                                <thead>
                                    <tr>
                                        <th>Order</th>
                                        <th>Customer</th>
                                        <th>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentSales.slice(0, 6).map((row) => (
                                        <tr key={row.id}>
                                            <td data-label="Order"><span className="recent-name">{row.order_number}</span></td>
                                            <td data-label="Customer">{row.customer || '—'}</td>
                                            <td data-label="Amount" className="recent-amount">
                                                PKR {Number(row.grand_total || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="no-data no-data-compact">
                                <span className="material-icons no-data-mi">inbox</span>
                                <span className="no-data-text">No sales orders yet</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <h2 className="section-heading">Activity &amp; performance</h2>
            <div className={`dashboard-grid ${isAdmin ? 'three-col' : ''}`}>
                {/* Activity Feed */}
                <div className="activity-feed">
                    <div className="chart-card-header">
                        <h3 className="chart-card-title">
                            <span className="material-icons chart-title-mi" aria-hidden>notifications</span>
                            Activity
                        </h3>
                    </div>
                    <div className="activity-list">
                        {activities.length > 0 ? (
                            activities.map((activity, idx) => (
                                <div key={idx} className="activity-item">
                                    <div className={`activity-avatar ${activity.type}`}>
                                        {activity.user_initial || '?'}
                                    </div>
                                    <div className="activity-content">
                                        <p className="activity-description">{activity.description}</p>
                                        <div className="activity-meta">
                                            <span className="activity-user">{activity.user_name}</span>
                                            <span aria-hidden>·</span>
                                            <span>{formatTimeAgo(activity.time)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="dashboard-empty-state">
                                <span className="material-icons dashboard-empty-icon">forum</span>
                                <strong>No recent activity</strong>
                                <span>New records, updates and assignments will appear here.</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="chart-card">
                    <div className="chart-card-header">
                        <h3 className="chart-card-title">
                            <span className="material-icons chart-title-mi" aria-hidden>military_tech</span>
                            Top performers
                        </h3>
                        <div className="chart-controls chart-controls-split">
                            <div className="performer-tab-group" role="tablist" aria-label="Leaderboard">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={performerTab === 'sales'}
                                    className={`chart-control-btn ${performerTab === 'sales' ? 'active' : ''}`}
                                    onClick={() => setPerformerTab('sales')}
                                >
                                    Sales
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={performerTab === 'service'}
                                    className={`chart-control-btn ${performerTab === 'service' ? 'active' : ''}`}
                                    onClick={() => setPerformerTab('service')}
                                >
                                    Service
                                </button>
                            </div>
                            <div className="performer-period-group">
                                {['week', 'month', 'quarter'].map((period) => (
                                    <button
                                        type="button"
                                        key={period}
                                        className={`chart-control-btn ${performerPeriod === period ? 'active' : ''}`}
                                        onClick={() => setPerformerPeriod(period)}
                                    >
                                        {period.charAt(0).toUpperCase() + period.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="performers-list">
                        {performerTab === 'sales' && topPerformers.sales?.length > 0 ? (
                            topPerformers.sales.map((performer, idx) => (
                                <div key={performer.id} className="performer-item">
                                    <div className={`performer-rank ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'default'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="performer-avatar">
                                        {performer.initials || performer.name?.charAt(0) || '?'}
                                    </div>
                                    <div className="performer-info">
                                        <div className="performer-name">{performer.name}</div>
                                        <div className="performer-stats">{performer.deals} orders</div>
                                    </div>
                                    <div className="performer-value">
                                        PKR {formatCurrency(performer.revenue)}
                                    </div>
                                </div>
                            ))
                        ) : performerTab === 'service' && topPerformers.service?.length > 0 ? (
                            topPerformers.service.map((performer, idx) => (
                                <div key={performer.id} className="performer-item">
                                    <div className={`performer-rank ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'default'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="performer-avatar">
                                        {performer.initials || performer.name?.charAt(0) || '?'}
                                    </div>
                                    <div className="performer-info">
                                        <div className="performer-name">{performer.name}</div>
                                        <div className="performer-stats">{performer.jobs} jobs completed</div>
                                    </div>
                                    <div className="performer-value">
                                        PKR {formatCurrency(performer.revenue)}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="dashboard-empty-state">
                                <span className="material-icons dashboard-empty-icon">groups</span>
                                <strong>No performer data yet</strong>
                                <span>Completed sales and service work will be ranked here.</span>
                            </div>
                        )}
                    </div>
                </div>

                {isAdmin && (
                    <div className="chart-card">
                        <div className="chart-card-header">
                            <h3 className="chart-card-title">
                                <span className="material-icons chart-title-mi" aria-hidden>warning_amber</span>
                                Operational alerts
                            </h3>
                        </div>
                        <div className="alerts-list">
                            {alerts.length > 0 ? (
                                alerts.map((alert, idx) => (
                                    <div key={idx} className={`alert-item ${alert.type}`}>
                                        <span className="material-icons alert-mi" aria-hidden>
                                            {alert.type === 'danger' ? 'gpp_bad' : alert.type === 'warning' ? 'report_problem' : 'info'}
                                        </span>
                                        <span className="alert-message">{alert.message}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="no-data no-data-compact">
                                    <span className="material-icons no-data-mi">task_alt</span>
                                    <span className="no-data-text">No open alerts</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Stat Card Component - Enhanced design
 */
function StatCard({ materialIcon, label, value, color, isCurrency = false, trend = null }) {
    const formatValue = (val) => {
        if (isCurrency) {
            if (val >= 10000000) return { prefix: 'PKR ', value: (val / 10000000).toFixed(1), suffix: ' Cr' };
            if (val >= 100000) return { prefix: 'PKR ', value: (val / 100000).toFixed(1), suffix: ' Lacs' };
            if (val >= 1000) return { prefix: 'PKR ', value: (val / 1000).toFixed(0), suffix: 'K' };
            return { prefix: 'PKR ', value: val?.toLocaleString() || '0', suffix: '' };
        }
        return { prefix: '', value: val?.toLocaleString() || '0', suffix: '' };
    };

    const formatted = formatValue(value);

    return (
        <div className="stat-card-enhanced" style={{ '--stat-color': getColorValue(color) }}>
            <div className="stat-content">
                <p className="stat-label">{label}</p>
                <div className="stat-value">
                    {isCurrency && <span className="currency">{formatted.prefix}</span>}
                    {formatted.value}{formatted.suffix}
                </div>
                {trend && (
                    <span className={`stat-trend ${trend > 0 ? 'up' : 'down'}`}>
                        {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
                    </span>
                )}
            </div>
            <div className={`stat-icon-wrapper ${color}`} aria-hidden>
                <span className="material-icons stat-mi">{materialIcon}</span>
            </div>
        </div>
    );
}

/**
 * KPI Card Component - Glassmorphism design
 */
function KPICard({ label, value, change, trend, showChange = true }) {
    return (
        <div className="kpi-card">
            <div className="kpi-value">
                {value}
                {showChange && change !== undefined && (
                    <span className={`kpi-change ${trend || (change >= 0 ? 'up' : 'down')}`}>
                        {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
                    </span>
                )}
            </div>
            <p className="kpi-label">{label}</p>
        </div>
    );
}

/**
 * Helper function to get color value
 */
function getColorValue(color) {
    const colors = {
        blue: '#3B82F6',
        green: '#10B981',
        orange: '#F59E0B',
        purple: '#8B5CF6',
        red: '#EF4444',
        cyan: '#06B6D4'
    };
    return colors[color] || colors.blue;
}

export default Dashboard;
