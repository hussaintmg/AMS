/**
 * Payroll periods & posting
 */

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { payrollAPI, salaryAdvanceAPI, employeeAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import '../styles/userManagement.css';
import '../styles/salaryAdvances.css';

const money = (value) => Number(value || 0).toLocaleString('en-PK');

const Payroll = () => {
    const { hasRole } = useAuth();
    const canRun = hasRole(['super_admin', 'admin', 'payroll_clerk', 'accountant']);

    const [tab, setTab] = useState('periods');

    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [linesData, setLinesData] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [newForm, setNewForm] = useState({ label: '', period_start: '', period_end: '' });

    // ── salary advances ──
    const [advances, setAdvances] = useState([]);
    const [advanceSummary, setAdvanceSummary] = useState(null);
    const [advancesLoading, setAdvancesLoading] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [showAdvance, setShowAdvance] = useState(false);
    const [savingAdvance, setSavingAdvance] = useState(false);
    const [advanceForm, setAdvanceForm] = useState({ employee_id: '', amount: '', issued_on: '', reason: '' });

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
            const res = await payrollAPI.postPeriod(selected);
            toast.success(res?.data?.message || 'Payroll posted to ledger');
            loadLines(selected);
            loadPeriods();
            // Posting is what actually recovers the advances, so their balances
            // have just moved.
            loadAdvances();
        } catch (err) { /* */ }
    };

    const loadAdvances = useCallback(async () => {
        try {
            setAdvancesLoading(true);
            const res = await salaryAdvanceAPI.list();
            setAdvances(res.data.data || []);
            setAdvanceSummary(res.data.summary || null);
        } catch (e) {
            console.error(e);
        } finally {
            setAdvancesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (tab !== 'advances') return;
        loadAdvances();
        if (!employees.length) {
            employeeAPI.list({ limit: 500, status: 'active' })
                .then((res) => setEmployees(res.data?.data?.employees || []))
                .catch(() => { /* the picker simply stays empty */ });
        }
    }, [tab, loadAdvances, employees.length]);

    const issueAdvance = async (e) => {
        e.preventDefault();
        if (savingAdvance) return;
        setSavingAdvance(true);
        try {
            await salaryAdvanceAPI.create({
                ...advanceForm,
                amount: Number(advanceForm.amount),
                issued_on: advanceForm.issued_on || undefined,
            });
            toast.success('Advance issued');
            setShowAdvance(false);
            setAdvanceForm({ employee_id: '', amount: '', issued_on: '', reason: '' });
            loadAdvances();
        } catch (err) { /* the interceptor surfaces the message */ } finally {
            setSavingAdvance(false);
        }
    };

    const repayAdvance = async (advance) => {
        const entered = window.prompt(
            `How much is ${advance.employee_name} paying back? Outstanding: ${money(advance.balance)}`,
            String(advance.balance),
        );
        if (entered == null) return;
        const amount = Number(entered);
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error('Enter an amount greater than zero');
            return;
        }
        try {
            await salaryAdvanceAPI.repay(advance.id, amount);
            toast.success('Repayment recorded');
            loadAdvances();
        } catch (err) { /* */ }
    };

    const cancelAdvance = async (advance) => {
        if (!window.confirm(`Cancel the ${money(advance.amount)} advance for ${advance.employee_name}?`)) return;
        try {
            await salaryAdvanceAPI.cancel(advance.id);
            toast.success('Advance cancelled');
            loadAdvances();
        } catch (err) { /* */ }
    };

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1>Payroll</h1>
                    <p className="text-muted">Periods, lines from employee salaries, salary advances, lock, and GL posting</p>
                </div>
                {canRun && (
                    tab === 'periods'
                        ? <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>New period</button>
                        : <button type="button" className="btn btn-primary" onClick={() => setShowAdvance(true)}>New advance</button>
                )}
            </div>

            <div className="adv-tabs" role="tablist">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'periods'}
                    className={`adv-tab ${tab === 'periods' ? 'active' : ''}`}
                    onClick={() => setTab('periods')}
                >
                    Periods
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'advances'}
                    className={`adv-tab ${tab === 'advances' ? 'active' : ''}`}
                    onClick={() => setTab('advances')}
                >
                    Salary advances
                </button>
            </div>

            {tab === 'advances' ? (
                <div className="card">
                    {advanceSummary && (
                        <div className="adv-summary">
                            <div className="adv-stat">
                                <span>Total issued</span>
                                <strong>{money(advanceSummary.total_issued)}</strong>
                            </div>
                            <div className="adv-stat">
                                <span>Recovered</span>
                                <strong className="adv-good">{money(advanceSummary.total_recovered)}</strong>
                            </div>
                            <div className="adv-stat adv-stat-main">
                                <span>Balance outstanding</span>
                                <strong className="adv-owed">{money(advanceSummary.total_outstanding)}</strong>
                            </div>
                        </div>
                    )}

                    {advancesLoading ? <div className="loading-inline">Loading…</div> : (
                        <div className="table-responsive">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Advance</th>
                                        <th>Recovered</th>
                                        <th>Balance</th>
                                        <th>Issued</th>
                                        <th>Reason</th>
                                        <th>Status</th>
                                        {canRun && <th>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {advances.length === 0 ? (
                                        <tr>
                                            <td colSpan={canRun ? 8 : 7} className="text-center p-4">
                                                No advances yet. Issue one and payroll will recover it from the next salary.
                                            </td>
                                        </tr>
                                    ) : advances.map((a) => (
                                        <tr key={a.id}>
                                            <td>{a.employee_name} <small className="text-muted">{a.employee_code}</small></td>
                                            <td>{money(a.amount)}</td>
                                            <td>{money(a.recovered)}</td>
                                            <td className={a.balance > 0 ? 'adv-owed' : 'adv-good'}>{money(a.balance)}</td>
                                            <td>{a.issued_on}</td>
                                            <td>{a.reason || '—'}</td>
                                            <td><span className={`badge badge-${a.status === 'settled' ? 'success' : a.status === 'cancelled' ? 'secondary' : 'warning'}`}>{a.status}</span></td>
                                            {canRun && (
                                                <td className="adv-actions">
                                                    {a.status === 'outstanding' && (
                                                        <>
                                                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => repayAdvance(a)}>Repay</button>
                                                            {a.recovered === 0 && (
                                                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => cancelAdvance(a)}>Cancel</button>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
            <>
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
                                        <th>Advance recovered</th>
                                        <th>Advance balance</th>
                                        <th>Net</th>
                                        <th>GL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(linesData.lines || []).map((ln) => (
                                        <tr key={ln.id}>
                                            <td>{ln.employee_name} <small className="text-muted">{ln.employee_code}</small></td>
                                            <td>{money(ln.gross_amount)}</td>
                                            <td>{money(ln.deductions)}</td>
                                            <td>{Number(ln.advance_deduction) > 0 ? money(ln.advance_deduction) : '—'}</td>
                                            {/* What is still owed once this run is taken off. */}
                                            <td className={Number(ln.advance_balance) > 0 ? 'adv-owed' : undefined}>
                                                {Number(ln.advance_balance) > 0 ? money(ln.advance_balance) : '—'}
                                            </td>
                                            <td><strong>{money(ln.net_amount)}</strong></td>
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
                                        {Number(ln.advance_deduction) > 0 && (
                                            <div className="data-card-row">
                                                <span className="row-icon">💸</span>
                                                <span className="row-label">Advance</span>
                                                <span className="row-value">{money(ln.advance_deduction)}</span>
                                            </div>
                                        )}
                                        {Number(ln.advance_balance) > 0 && (
                                            <div className="data-card-row">
                                                <span className="row-icon">🧾</span>
                                                <span className="row-label">Adv. balance</span>
                                                <span className="row-value adv-owed">{money(ln.advance_balance)}</span>
                                            </div>
                                        )}
                                        <div className="data-card-row">
                                            <span className="row-icon">✅</span>
                                            <span className="row-label">Net</span>
                                            <span className="row-value">{money(ln.net_amount)}</span>
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
            </>
            )}

            {showAdvance && (
                <div className="modal-overlay" onClick={() => setShowAdvance(false)}>
                    <div
                        className="modal-content modal-md"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hr-advance-modal-title"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="hr-advance-modal-title">Issue a salary advance</h2>
                            <button type="button" className="modal-close" onClick={() => setShowAdvance(false)} aria-label="Close">×</button>
                        </div>
                        <form onSubmit={issueAdvance}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label htmlFor="adv-employee">Employee *</label>
                                    <SearchableSelect
                                        id="adv-employee"
                                        name="employee_id"
                                        value={advanceForm.employee_id}
                                        onChange={(ev) => setAdvanceForm({ ...advanceForm, employee_id: ev.target.value })}
                                        required
                                    >
                                        <option value="">Select employee</option>
                                        {employees.map((emp) => (
                                            <option key={emp._id || emp.id} value={emp._id || emp.id}>
                                                {[emp.firstName, emp.lastName].filter(Boolean).join(' ')}
                                                {emp.employeeCode ? ` — ${emp.employeeCode}` : ''}
                                                {emp.salary ? ` (salary ${money(emp.salary)})` : ''}
                                            </option>
                                        ))}
                                    </SearchableSelect>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="adv-amount">Amount *</label>
                                        <input
                                            id="adv-amount"
                                            type="number"
                                            min="1"
                                            step="0.01"
                                            className="form-control"
                                            value={advanceForm.amount}
                                            onChange={(ev) => setAdvanceForm({ ...advanceForm, amount: ev.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="adv-date">Issued on</label>
                                        <input
                                            id="adv-date"
                                            type="date"
                                            className="form-control"
                                            value={advanceForm.issued_on}
                                            onChange={(ev) => setAdvanceForm({ ...advanceForm, issued_on: ev.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="adv-reason">Reason</label>
                                    <input
                                        id="adv-reason"
                                        className="form-control"
                                        value={advanceForm.reason}
                                        onChange={(ev) => setAdvanceForm({ ...advanceForm, reason: ev.target.value })}
                                        placeholder="Medical, festival, emergency…"
                                    />
                                </div>
                                <p className="adv-note">
                                    The next payroll run holds this back from the employee&apos;s salary. Anything it
                                    cannot cover stays on their balance for the run after.
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAdvance(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={savingAdvance}>
                                    {savingAdvance ? 'Issuing…' : 'Issue advance'}
                                </button>
                            </div>
                        </form>
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
