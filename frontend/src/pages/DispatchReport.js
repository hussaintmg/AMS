/**
 * Dispatch Report Page
 * Lists dispatched sales orders with dispatch-specific fields.
 * Maintained by Hussain Developer — AMS ERP
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { salesAPI } from '../services/api';
import ServerPagination from '../components/ServerPagination';
import SalesFilterBar from '../components/sales/SalesFilterBar';
import SalesDrawer from '../components/sales/SalesDrawer';
import ActionButtons from '../components/ActionButtons';
import { useAuth } from '../context/AuthContext';
import { fieldAccessor } from '../utils/roleJobs';
import '../styles/userManagement.css';

function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

export default function DispatchReport() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';
    // Which columns this role may read. The report is masked on its own Dispatch
    // page where that is configured and on Sales Orders otherwise, so ask in the
    // same order the API does.
    const showField = fieldAccessor(user, ['dispatch', 'sales_orders']);

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [stats, setStats] = useState({ totalDispatched: 0, totalValue: 0, delivered: 0, dispatched: 0 });
    const [drawerItem, setDrawerItem] = useState(null);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
    const [filters, setFilters] = useState({
        search: urlSearch, status: '', customerId: '',
        dispatchFrom: '', dispatchTo: '',
        sortBy: 'dispatch_date', sortOrder: 'desc',
    });
    const debouncedSearch = useDebounce(filters.search, 300);

    const statusOptions = [
        { label: 'Dispatched', value: 'dispatched' },
        { label: 'Delivered', value: 'delivered' },
    ];

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError('');
            const params = {
                ...filters,
                search: debouncedSearch,
                page: pagination.page,
                limit: pagination.limit,
            };
            Object.keys(params).forEach((k) => (params[k] === '' || params[k] === null) && delete params[k]);

            const res = await salesAPI.getDispatchedOrders(params);
            if (!res.data?.success) throw new Error(res.data?.message || 'Dispatch report request failed');
            setData(res.data?.data || []);
            setPagination((prev) => ({
                ...prev,
                total: res.data?.pagination?.total || 0,
                totalPages: res.data?.pagination?.totalPages || 0,
            }));
        } catch (error) {
            console.error('Error fetching dispatches:', error);
            setData([]);
            setLoadError(error.response?.data?.message || error.message || 'Dispatch report could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, filters.status, filters.customerId, filters.dispatchFrom, filters.dispatchTo, filters.sortBy, filters.sortOrder, pagination.page, pagination.limit]);

    const fetchStats = useCallback(async () => {
        try {
            const params = {
                search: debouncedSearch,
                status: filters.status,
                customerId: filters.customerId,
                dispatchFrom: filters.dispatchFrom,
                dispatchTo: filters.dispatchTo,
            };
            Object.keys(params).forEach((key) => !params[key] && delete params[key]);
            const res = await salesAPI.getDispatchStats(params);
            if (!res.data?.success) throw new Error(res.data?.message || 'Dispatch statistics request failed');
            if (res.data?.data) setStats(res.data.data);
        } catch (error) {
            console.error('Error fetching dispatch stats:', error);
            setLoadError(error.response?.data?.message || error.message || 'Dispatch statistics could not be loaded.');
        }
    }, [debouncedSearch, filters.status, filters.customerId, filters.dispatchFrom, filters.dispatchTo]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { fetchStats(); }, [fetchStats]);

    const handleFilterChange = (key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        if (key !== 'sortBy' && key !== 'sortOrder') setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const clearFilters = () => {
        setFilters({ search: '', status: '', customerId: '', dispatchFrom: '', dispatchTo: '', sortBy: 'dispatch_date', sortOrder: 'desc' });
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const getStatusBadge = (status) => {
        const colors = { dispatched: 'info', delivered: 'success', in_transit: 'warning', completed: 'success', cancelled: 'danger' };
        return <span className={`badge badge-${colors[status] || 'secondary'}`}>{(status || '').toUpperCase()}</span>;
    };

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '-';
    const formatPKR = (v) => v ? `PKR ${Number(v).toLocaleString()}` : '-';
    const linkedValue = (value, path) => value ? (
        <button type="button" className="btn-link" onClick={() => navigate(path)}>{value}</button>
    ) : '-';

    return (
        <div className="card sales-page">
            <div className="card-header d-flex justify-content-between align-items-center">
                <div>
                    <h3 style={{ margin: 0 }}>Dispatch Report</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                        {stats.totalDispatched || 0} dispatches · Total value {formatPKR(stats.totalValue)}
                    </p>
                </div>
                <div className="sales-header-actions">
                    <button className="btn-secondary" onClick={() => navigate('/data-import')} style={{ marginRight: 8 }}>
                        Upload Dispatch File
                    </button>
                </div>
            </div>

            <SalesFilterBar
                filters={filters}
                onFilterChange={handleFilterChange}
                onClear={clearFilters}
                onRefresh={fetchData}
                loading={loading}
                statusOptions={statusOptions}
                showCustomerFilter={false}
                customFilters={
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Dispatch Date Range</label>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input type="date" value={filters.dispatchFrom} onChange={(e) => handleFilterChange('dispatchFrom', e.target.value)} className="form-control" style={{ fontSize: '0.8rem', padding: '4px 6px' }} />
                            <span style={{ color: '#9ca3af' }}>–</span>
                            <input type="date" value={filters.dispatchTo} onChange={(e) => handleFilterChange('dispatchTo', e.target.value)} className="form-control" style={{ fontSize: '0.8rem', padding: '4px 6px' }} />
                        </div>
                    </div>
                }
            />

            {loadError && (
                <div role="alert" style={{ margin: '0 1rem 1rem', padding: '0.75rem 1rem', border: '1px solid #dc2626', borderRadius: 8, color: '#991b1b', background: '#fef2f2' }}>
                    {loadError}
                </div>
            )}

            <SalesDrawer
                isOpen={Boolean(drawerItem)}
                onClose={() => setDrawerItem(null)}
                title={`Dispatch ${drawerItem?.dispatch_no || ''}`}
                subtitle={drawerItem?.customer_name}
                fields={[
                    { label: 'Sales Order', value: linkedValue(drawerItem?.order_number, `/orders?search=${encodeURIComponent(drawerItem?.order_number || '')}`) },
                    { label: 'External Order', value: drawerItem?.external_order_number },
                    { label: 'Booking', value: linkedValue(drawerItem?.booking_no, `/bookings?search=${encodeURIComponent(drawerItem?.booking_no || '')}`) },
                    { label: 'Source Invoice', value: linkedValue(drawerItem?.source_invoice_no, `/invoices?search=${encodeURIComponent(drawerItem?.source_invoice_no || '')}`) },
                    { label: 'Internal Invoice', value: linkedValue(drawerItem?.invoice_number, `/invoices?search=${encodeURIComponent(drawerItem?.invoice_number || '')}`) },
                    { label: 'Customer', value: linkedValue(drawerItem?.customer_name, `/customers?search=${encodeURIComponent(drawerItem?.customer_name || '')}`) },
                    { label: 'Vehicle', value: linkedValue(drawerItem?.chassis_number || drawerItem?.vehicle_name, `/vehicles?search=${encodeURIComponent(drawerItem?.chassis_number || drawerItem?.vehicle_name || '')}`) },
                    { label: 'Salesman', value: drawerItem?.sale_person },
                    { label: 'Dispatch Date', value: formatDate(drawerItem?.dispatch_date) },
                    { label: 'Transport', value: drawerItem?.transport_company },
                    { label: 'Builty Number', value: drawerItem?.builty_no },
                    { label: 'SAP Order', value: drawerItem?.sap_order_no },
                    { label: 'Route', value: [drawerItem?.ship_from, drawerItem?.ship_to].filter(Boolean).join(' → '), full: true },
                ]}
                status={drawerItem?.status}
                statusOptions={statusOptions}
                canEditStatus={false}
                totals={{
                    total: drawerItem?.total_amount,
                    paid: drawerItem?.paid_amount,
                    balance: Number(drawerItem?.total_amount || 0) - Number(drawerItem?.paid_amount || 0),
                }}
            />

            {loading ? (
                <div className="spinner" />
            ) : (
                <>
                    <div className="desktop-table">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    {showField('document') && <><th>Dispatch #</th><th>Order #</th><th>Booking #</th></>}
                                    {showField('customer') && <th>Customer</th>}
                                    {showField('sales_person') && <th>Salesman</th>}
                                    {showField('identifiers') && <th>Chassis / VIN</th>}
                                    {showField('logistics') && <><th>Dispatch Date</th><th>Transport</th><th>Ship From → To</th></>}
                                    {showField('document') && <><th>Invoice #</th><th>Status</th></>}
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((d) => (
                                    <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setDrawerItem(d)}>
                                        {showField('document') && <>
                                            <td><strong>{d.dispatch_no || '-'}</strong></td>
                                            <td>{d.order_number}</td>
                                            <td>{d.booking_no || '-'}</td>
                                        </>}
                                        {showField('customer') && <td>{d.customer_name}</td>}
                                        {showField('sales_person') && <td style={{ fontSize: '0.8rem' }}>{d.sale_person || '-'}</td>}
                                        {showField('identifiers') && <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.chassis_number || d.vehicle_name || '-'}</td>}
                                        {showField('logistics') && <>
                                            <td>{formatDate(d.dispatch_date)}</td>
                                            <td>{d.transport_company || '-'}</td>
                                            <td style={{ fontSize: '0.8rem' }}>
                                                {d.ship_from && d.ship_to ? `${d.ship_from} → ${d.ship_to}` : d.ship_from || d.ship_to || '-'}
                                            </td>
                                        </>}
                                        {showField('document') && <>
                                            <td style={{ fontSize: '0.8rem' }}>{d.invoice_no || '-'}</td>
                                            <td>{getStatusBadge(d.status)}</td>
                                        </>}
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <ActionButtons
                                                showView={true}
                                                onView={() => setDrawerItem(d)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {data.length === 0 && (
                                    <tr><td colSpan="12" className="text-center p-4">No dispatched orders found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mobile-cards-view">
                        <div className="mobile-cards-container">
                            {data.map((d) => (
                                <div key={d.id} className="data-card" onClick={() => setDrawerItem(d)} style={{ cursor: 'pointer' }}>
                                    <div className="data-card-top">
                                        <div className="data-card-avatar avatar-green">D</div>
                                        <div className="data-card-info">
                                            {showField('document') && <span className="data-card-title">Dispatch #{d.dispatch_no || 'N/A'}</span>}
                                            <span className="data-card-subtitle">{showField('document') && d.order_number}{showField('document') && showField('customer') ? ' · ' : ''}{showField('customer') && d.customer_name}</span>
                                        </div>
                                        {showField('document') && getStatusBadge(d.status)}
                                    </div>
                                    <div className="data-card-body">
                                        {showField('document') && <div className="data-card-row"><span className="row-icon">📋</span><span className="row-label">Booking</span><span className="row-value">{d.booking_no || '-'}</span></div>}
                                        {showField('sales_person') && <div className="data-card-row"><span className="row-icon">👤</span><span className="row-label">Salesman</span><span className="row-value">{d.sale_person || '-'}</span></div>}
                                        {showField('identifiers') && <div className="data-card-row"><span className="row-icon">🚗</span><span className="row-label">Chassis</span><span className="row-value">{d.chassis_number || '-'}</span></div>}
                                        {showField('logistics') && <>
                                            <div className="data-card-row"><span className="row-icon">📅</span><span className="row-label">Date</span><span className="row-value">{formatDate(d.dispatch_date)}</span></div>
                                            <div className="data-card-row"><span className="row-icon">🚚</span><span className="row-label">Transport</span><span className="row-value">{d.transport_company || '-'}</span></div>
                                            <div className="data-card-row"><span className="row-icon">📦</span><span className="row-label">Route</span><span className="row-value">{d.ship_from && d.ship_to ? `${d.ship_from} → ${d.ship_to}` : '-'}</span></div>
                                        </>}
                                        {showField('document') && <div className="data-card-row"><span className="row-icon">🧾</span><span className="row-label">Invoice</span><span className="row-value">{d.invoice_no || '-'}</span></div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <ServerPagination
                        page={pagination.page}
                        totalPages={pagination.totalPages || 1}
                        total={pagination.total}
                        limit={pagination.limit}
                        onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
                        onPageSizeChange={(limit) => setPagination((prev) => ({ ...prev, page: 1, limit }))}
                        loading={loading}
                    />
                </>
            )}
        </div>
    );
}
