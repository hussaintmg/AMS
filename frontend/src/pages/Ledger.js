/**
 * Unified ledger (expenses + payroll postings)
 */

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { ledgerAPI } from '../services/api';
import { exportReportCsv, exportReportXlsx, exportReportPdf } from '../utils/reportsExport';
import '../styles/userManagement.css';

const Ledger = () => {
    const { user } = useAuth();
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState({});
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        from: '',
        to: '',
        reference_type: '',
        search: ''
    });

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                limit: 500,
                from: filters.from || undefined,
                to: filters.to || undefined,
                reference_type: filters.reference_type || undefined,
                search: filters.search || undefined
            };
            const res = await ledgerAPI.list(params);
            const d = res.data.data;
            setRows(d?.rows || []);
            setSummary(d?.summary || {});
            setTotal(d?.total || 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [filters.from, filters.to, filters.reference_type, filters.search]);

    useEffect(() => {
        load();
    }, [load]);

    const exportRows = rows.map((r) => ({
        transaction_date: r.transaction_date,
        account_code: r.account_code,
        account_name: r.account_name,
        debit: r.debit,
        credit: r.credit,
        reference_type: r.reference_type,
        reference_id: r.reference_id,
        description: r.line_description,
        expense_ref: r.expense_ref,
        payroll_period: r.payroll_period_label,
        category_group: r.expense_category_group
    }));

    const meta = { generatedBy: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'User' };

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1>Ledger</h1>
                    <p className="text-muted">Financial transactions including salary payroll and posted expenses</p>
                </div>
                <div className="header-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <input type="date" className="form-control" value={filters.from} onChange={(ev) => setFilters({ ...filters, from: ev.target.value })} />
                    <input type="date" className="form-control" value={filters.to} onChange={(ev) => setFilters({ ...filters, to: ev.target.value })} />
                    <select className="form-control" value={filters.reference_type} onChange={(ev) => setFilters({ ...filters, reference_type: ev.target.value })}>
                        <option value="">All sources</option>
                        <option value="expense">expense</option>
                        <option value="payroll_line">payroll_line</option>
                    </select>
                    <input className="form-control" placeholder="Search description" value={filters.search} onChange={(ev) => setFilters({ ...filters, search: ev.target.value })} style={{ minWidth: 180 }} />
                    <button type="button" className="btn btn-secondary" onClick={load}>Apply</button>
                    <button type="button" className="btn btn-secondary" onClick={() => { exportReportCsv({ rows: exportRows, reportName: 'Unified Ledger', meta }); toast.success('CSV downloaded'); }}>CSV</button>
                    <button type="button" className="btn btn-secondary" onClick={() => { exportReportXlsx({ rows: exportRows, reportName: 'Unified Ledger', meta }); toast.success('XLSX downloaded'); }}>XLSX</button>
                    <button type="button" className="btn btn-secondary" onClick={() => { exportReportPdf({ rows: exportRows, reportName: 'Unified Ledger', meta }); toast.success('PDF opened'); }}>PDF</button>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div><strong>Total debit</strong><div>{Number(summary.total_debit || 0).toLocaleString()}</div></div>
                <div><strong>Total credit</strong><div>{Number(summary.total_credit || 0).toLocaleString()}</div></div>
                <div><strong>Rows</strong><div>{total}</div></div>
            </div>

            <div className="card">
                {loading ? <div className="loading-inline">Loading…</div> : (
                    <div className="table-responsive" style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Account</th>
                                    <th>Debit</th>
                                    <th>Credit</th>
                                    <th>Ref</th>
                                    <th>Description</th>
                                    <th>Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.ledger_row_id}>
                                        <td>{r.transaction_date}</td>
                                        <td><small>{r.account_code}</small><br />{r.account_name}</td>
                                        <td>{Number(r.debit).toLocaleString()}</td>
                                        <td>{Number(r.credit).toLocaleString()}</td>
                                        <td>{r.reference_type} #{r.reference_id}</td>
                                        <td>{r.line_description}</td>
                                        <td>
                                            {r.expense_ref && <div>Expense {r.expense_ref}</div>}
                                            {r.payroll_period_label && <div>Payroll {r.payroll_period_label}</div>}
                                            {!r.expense_ref && !r.payroll_period_label && '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Ledger;
