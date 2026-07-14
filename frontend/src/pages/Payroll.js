/**
 * Payroll periods & posting
 */

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { payrollAPI } from '../services/api';
import '../styles/userManagement.css';

const Payroll = () => {
    const { hasRole } = useAuth();
    const canRun = hasRole(['super_admin', 'admin', 'payroll_clerk', 'accountant']);

    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [linesData, setLinesData] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [newForm, setNewForm] = useState({ label: '', period_start: '', period_end: '' });

    const loadPeriods = useCallback(async () => {
        try {
            setLoading(true);
            const res = await payrollAPI.listPeriods();
            setPeriods(res.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPeriods();
    }, [loadPeriods]);

    const loadLines = async (id) => {
        try {
            const res = await payrollAPI.getPeriodLines(id);
            setLinesData(res.data.data);
            setSelected(id);
        } catch (e) {
            console.error(e);
        }
    };

    const createPeriod = async (e) => {
        e.preventDefault();
        try {
            await payrollAPI.createPeriod(newForm);
            toast.success('Period created');
            setShowNew(false);
            setNewForm({ label: '', period_start: '', period_end: '' });
            loadPeriods();
        } catch (err) { /* */ }
    };

    const runGenerate = async () => {
        if (!selected) return;
        try {
            await payrollAPI.generateLines(selected);
            toast.success('Lines generated from active employees');
            loadLines(selected);
            loadPeriods();
        } catch (err) { /* */ }
    };

    const runLock = async () => {
        if (!selected) return;
        try {
            await payrollAPI.lockPeriod(selected);
            toast.success('Period locked');
            loadLines(selected);
            loadPeriods();
        } catch (err) { /* */ }
    };

    const runPost = async () => {
        if (!selected) return;
        if (!window.confirm('Post this payroll to the ledger? This cannot be undone.')) return;
        try {
            await payrollAPI.postPeriod(selected);
            toast.success('Payroll posted to ledger');
            loadLines(selected);
            loadPeriods();
        } catch (err) { /* */ }
    };

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1>Payroll</h1>
                    <p className="text-muted">Periods, lines from employee salaries, lock, and GL posting</p>
                </div>
                {canRun && (
                    <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>New period</button>
                )}
            </div>

            <div className="card" style={{ marginBottom: '1rem' }}>
                {loading ? <div className="loading-inline">Loading…</div> : (
                    <>
                        <div className="desktop-only">
                            <div className="table-responsive">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Label</th>
                                            <th>From</th>
                                            <th>To</th>
                                            <th>Status</th>
                                            <th>Lines</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {periods.map((p) => (
                                            <tr key={p.id} style={{ background: selected === p.id ? 'rgba(59, 130, 246, 0.08)' : undefined }}>
                                                <td>{p.label}</td>
                                                <td>{p.period_start}</td>
                                                <td>{p.period_end}</td>
                                                <td><span className="badge badge-info">{p.status}</span></td>
                                                <td>{p.line_count}</td>
                                                <td>
                                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => loadLines(p.id)}>Open</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="mobile-only">
                            <div className="mobile-cards-container">
                                {periods.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>No periods found</div>
                                ) : periods.map((p) => (
                                    <div key={p.id} className={`data-card ${selected === p.id ? 'card-inactive' : ''}`} style={{ background: selected === p.id ? 'rgba(59, 130, 246, 0.08)' : undefined }} onClick={() => loadLines(p.id)}>
                                        <div className="data-card-top">
                                            <div className="data-card-avatar avatar-amber">{p.label?.[0] || 'P'}</div>
                                            <div className="data-card-info">
                                                <span className="data-card-title">{p.label}</span>
                                                <span className="data-card-subtitle">{p.line_count} lines</span>
                                            </div>
                                            <span className={`badge-pill status-${p.status === 'locked' || p.status === 'posted' ? 'active' : p.status === 'draft' ? 'pending' : 'inactive'}`}>{p.status}</span>
                                        </div>
                                        <div className="data-card-body">
                                            <div className="data-card-row">
                                                <span className="row-icon">📅</span>
                                                <span className="row-label">From</span>
                                                <span className="row-value">{p.period_start}</span>
                                            </div>
                                            <div className="data-card-row">
                                                <span className="row-icon">📅</span>
                                                <span className="row-label">To</span>
                                                <span className="row-value">{p.period_end}</span>
                                            </div>
                                        </div>
                                        <div className="data-card-footer" onClick={e => e.stopPropagation()}>
                                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => loadLines(p.id)}>Open</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {linesData && (
                <div className="card">
                    <div className="page-header" style={{ padding: '0 0 1rem 0', border: 'none' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>{linesData.period.label}</h2>
                        {canRun && (
                            <div className="header-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={runGenerate} disabled={linesData.period.status !== 'draft'}>Generate lines</button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={runLock} disabled={linesData.period.status !== 'draft'}>Lock</button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={runPost} disabled={linesData.period.status !== 'locked'}>Post to ledger</button>
                            </div>
                        )}
                    </div>
                    <div className="desktop-only">
                        <div className="table-responsive">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Gross</th>
                                        <th>Deductions</th>
                                        <th>Net</th>
                                        <th>GL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(linesData.lines || []).map((ln) => (
                                        <tr key={ln.id}>
                                            <td>{ln.employee_name} <small className="text-muted">{ln.employee_code}</small></td>
                                            <td>{Number(ln.gross_amount).toLocaleString()}</td>
                                            <td>{Number(ln.deductions).toLocaleString()}</td>
                                            <td>{Number(ln.net_amount).toLocaleString()}</td>
                                            <td>{ln.ledger_transaction_id ? `#${ln.ledger_transaction_id}` : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="mobile-only">
                        <div className="mobile-cards-container">
                            {(linesData.lines || []).length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>No lines found</div>
                            ) : (linesData.lines || []).map((ln) => (
                                <div key={ln.id} className="data-card">
                                    <div className="data-card-top">
                                        <div className="data-card-avatar avatar-green">{ln.employee_name?.[0] || 'E'}</div>
                                        <div className="data-card-info">
                                            <span className="data-card-title">{ln.employee_name}</span>
                                            <span className="data-card-subtitle">{ln.employee_code}</span>
                                        </div>
                                    </div>
                                    <div className="data-card-body">
                                        <div className="data-card-row">
                                            <span className="row-icon">💰</span>
                                            <span className="row-label">Gross</span>
                                            <span className="row-value">{Number(ln.gross_amount).toLocaleString()}</span>
                                        </div>
                                        <div className="data-card-row">
                                            <span className="row-icon">📉</span>
                                            <span className="row-label">Deduct</span>
                                            <span className="row-value">{Number(ln.deductions).toLocaleString()}</span>
                                        </div>
                                        <div className="data-card-row">
                                            <span className="row-icon">✅</span>
                                            <span className="row-label">Net</span>
                                            <span className="row-value">{Number(ln.net_amount).toLocaleString()}</span>
                                        </div>
                                        <div className="data-card-row">
                                            <span className="row-icon">📋</span>
                                            <span className="row-label">GL</span>
                                            <span className="row-value">{ln.ledger_transaction_id ? `#${ln.ledger_transaction_id}` : '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {showNew && (
                <div className="modal-overlay" onClick={() => setShowNew(false)}>
                    <div
                        className="modal-content modal-md"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hr-payroll-modal-title"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="hr-payroll-modal-title">New payroll period</h2>
                            <button type="button" className="modal-close" onClick={() => setShowNew(false)} aria-label="Close">×</button>
                        </div>
                        <form onSubmit={createPeriod}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Label</label>
                                    <input className="form-control" value={newForm.label} onChange={(ev) => setNewForm({ ...newForm, label: ev.target.value })} required />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Start</label>
                                        <input type="date" className="form-control" value={newForm.period_start} onChange={(ev) => setNewForm({ ...newForm, period_start: ev.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>End</label>
                                        <input type="date" className="form-control" value={newForm.period_end} onChange={(ev) => setNewForm({ ...newForm, period_end: ev.target.value })} required />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Payroll;
