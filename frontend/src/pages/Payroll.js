/**
 * Payroll periods & posting
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { payrollAPI, salaryAdvanceAPI, employeeAPI, accountsAPI } from '../services/api';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import { fieldAccessor, pageActions } from '../utils/roleJobs';
import '../styles/userManagement.css';
import '../styles/salaryAdvances.css';

const money = (value) => Number(value || 0).toLocaleString('en-PK');

/**
 * Where a salary stands. A month that has not been posted yet is not owed to
 * anyone, so it reads "not posted" rather than alarming the clerk with unpaid.
 */
const PayBadge = ({ line, periodStatus }) => {
    if (periodStatus && periodStatus !== 'posted') {
        return <span className="badge badge-secondary">Not posted</span>;
    }
    const status = line.payment_status;
    if (status === 'paid') return <span className="badge badge-success">Paid</span>;
    if (status === 'partial') return <span className="badge badge-warning">Part paid</span>;
    if (status === 'nothing_due') return <span className="badge badge-secondary">Nothing due</span>;
    return <span className="badge badge-danger">Unpaid</span>;
};

const Payroll = () => {
    const { user, hasRole } = useAuth();
    // Running payroll was decided by the role's *name* alone. The job row is
    // what the server checks, so it decides here too; the names stay as the
    // fallback for a role that has never been through Role Jobs.
    //
    // One flag per action, because the server guards them separately: an
    // account granted only Edit in Role Jobs must still see the Edit and Pay
    // buttons — and nothing else.
    const legacyRun = hasRole(['super_admin', 'admin', 'payroll_clerk', 'accountant']);
    const can = pageActions(user, 'payroll', legacyRun);
    const canCreate = can('create');
    const canEdit = can('edit');
    const canDelete = can('delete');
    // Locking, posting and paying are their own grants (Role Jobs → Payroll);
    // an unconfigured role keeps the legacy behaviour through `can`.
    const canLock = can('lock');
    const canPost = can('postLedger');
    const canPay = can('payout');
    const canRun = canCreate || canEdit || canDelete || canLock || canPost || canPay;
    // Which columns this role may read. The API already strips what it
    // withholds, so this only stops us drawing an always-blank column.
    const showField = fieldAccessor(user, 'payroll');

    const [tab, setTab] = useState('periods');

    const [periods, setPeriods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [linesData, setLinesData] = useState(null);
    const [showNew, setShowNew] = useState(false);
    // A period is one whole calendar month — the picker is the only input, and
    // the first/last day and the label all follow from it on the server.
    const [newForm, setNewForm] = useState({ month: '' });

    // ── salary advances ──
    const [advances, setAdvances] = useState([]);
    const [advanceSummary, setAdvanceSummary] = useState(null);
    const [advancesLoading, setAdvancesLoading] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [showAdvance, setShowAdvance] = useState(false);
    const [savingAdvance, setSavingAdvance] = useState(false);
    // The money accounts an advance or a salary can be paid out of (Accounts &
    // Petty Cash). Petty cash is the default: the client's rule is that
    // advances and expenses come out of it.
    const [accounts, setAccounts] = useState([]);
    useEffect(() => { accountsAPI.getForPayments().then(setAccounts); }, []);
    const defaultAccountId = useMemo(() => {
        const petty = accounts.find((a) => a.type === 'petty_cash') || accounts[0];
        return petty ? String(petty.id || petty._id) : '';
    }, [accounts]);

    const [advanceForm, setAdvanceForm] = useState({ employee_id: '', amount: '', issued_on: '', reason: '', accountId: '' });

    /**
     * Editing one line of a draft period.
     *
     * The endpoint has always existed and nothing ever called it, so a generated
     * line could not be touched at all: this month's salary was whatever the
     * employee record said, and the advance deduction could not be adjusted for
     * the month where somebody wants to take less of it than is owed.
     */
    const [editLine, setEditLine] = useState(null);
    const [editForm, setEditForm] = useState({ gross_amount: '', deductions: '', advance_deduction: '', notes: '' });
    const [savingLine, setSavingLine] = useState(false);

    // ── paying salaries out ──
    const [payLine, setPayLine] = useState(null);
    const [paying, setPaying] = useState(false);
    const [payForm, setPayForm] = useState({ amount: '', paid_on: '', method: 'cash', reference: '', notes: '', accountId: '' });

    // ── one employee's month-by-month record ──
    const [historyId, setHistoryId] = useState('');
    const [history, setHistory] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    /**
     * One in-app confirmation box for every destructive or irreversible action
     * on this page — { title, message, confirmText, type, action }. The browser
     * confirm() it replaces could not be styled and read like a system error.
     */
    const [confirmBox, setConfirmBox] = useState(null);
    const runConfirmed = async () => {
        if (!confirmBox) return;
        try {
            await confirmBox.action();
        } catch (err) {
            /* the interceptor surfaces the message */
        } finally {
            setConfirmBox(null);
        }
    };

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
            toast.success('Period created for the whole month');
            setShowNew(false);
            setNewForm({ month: '' });
            loadPeriods();
        } catch (err) { /* the interceptor surfaces "overlaps" for a duplicate month */ }
    };

    const removePeriod = (p) => {
        setConfirmBox({
            title: 'Delete period',
            message: `Delete the period "${p.label}"? Its ${p.line_count} line(s) go with it.`,
            confirmText: 'Delete period',
            action: async () => {
                await payrollAPI.deletePeriod(p.id);
                toast.success('Period deleted');
                if (selected === p.id) { setSelected(null); setLinesData(null); }
                loadPeriods();
            },
        });
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

    const runPost = () => {
        if (!selected) return;
        setConfirmBox({
            title: 'Post to ledger',
            message: 'Post this payroll to the ledger? This cannot be undone.',
            confirmText: 'Post payroll',
            type: 'primary',
            action: async () => {
                const res = await payrollAPI.postPeriod(selected);
                toast.success(res?.data?.message || 'Payroll posted to ledger');
                loadLines(selected);
                loadPeriods();
                // Posting is what actually recovers the advances, so their
                // balances have just moved.
                loadAdvances();
            },
        });
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

    // Both the advances tab and the employee record tab need the staff list.
    useEffect(() => {
        if (tab === 'periods' || employees.length) return;
        employeeAPI.list({ limit: 500, status: 'active' })
            .then((res) => setEmployees(res.data?.data?.employees || []))
            .catch(() => { /* the picker simply stays empty */ });
    }, [tab, employees.length]);

    useEffect(() => {
        if (tab === 'advances') loadAdvances();
    }, [tab, loadAdvances]);

    const loadHistory = useCallback(async (employeeId) => {
        setHistoryId(employeeId);
        if (!employeeId) { setHistory(null); return; }
        try {
            setHistoryLoading(true);
            const res = await payrollAPI.employeeHistory(employeeId);
            setHistory(res.data.data);
        } catch (e) {
            setHistory(null);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    /** Open the line editor on whatever the line currently says. */
    const openEdit = (line) => {
        setEditLine(line);
        setEditForm({
            gross_amount: String(line.gross_amount ?? ''),
            deductions: String(line.deductions ?? 0),
            advance_deduction: String(line.advance_deduction ?? 0),
            notes: line.notes || '',
        });
    };

    const submitLine = async (e) => {
        e.preventDefault();
        if (savingLine || !editLine) return;
        setSavingLine(true);
        try {
            await payrollAPI.updateLine(editLine.id, {
                gross_amount: Number(editForm.gross_amount),
                deductions: Number(editForm.deductions || 0),
                advance_deduction: Number(editForm.advance_deduction || 0),
                notes: editForm.notes,
            });
            toast.success('Line updated');
            setEditLine(null);
            loadLines(selected);
            loadPeriods();
        } catch (err) { /* the interceptor surfaces the message */ } finally {
            setSavingLine(false);
        }
    };

    /** Open the pay dialog pre-filled with whatever is still owed. */
    const openPay = (line) => {
        setPayLine(line);
        setPayForm({ amount: String(line.remaining_amount), paid_on: '', method: 'cash', reference: '', notes: '' });
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        if (paying || !payLine) return;
        setPaying(true);
        try {
            const res = await payrollAPI.payLine(payLine.id, {
                ...payForm,
                amount: Number(payForm.amount),
                accountId: payForm.accountId || defaultAccountId || undefined,
                paid_on: payForm.paid_on || undefined,
            });
            toast.success(res?.data?.message || 'Payment recorded');
            setPayLine(null);
            loadLines(selected);
            loadPeriods();
            if (historyId) loadHistory(historyId);
        } catch (err) { /* the interceptor surfaces the message */ } finally {
            setPaying(false);
        }
    };

    const payEveryone = () => {
        if (!selected) return;
        const owed = (linesData?.lines || []).reduce((sum, l) => sum + Number(l.remaining_amount || 0), 0);
        setConfirmBox({
            title: 'Pay everyone',
            message: `Pay every unpaid salary in this period? That is ${money(owed)} in total.`,
            confirmText: `Pay ${money(owed)}`,
            type: 'primary',
            action: async () => {
                const res = await payrollAPI.payPeriod(selected, {});
                toast.success(res?.data?.message || 'Salaries paid');
                loadLines(selected);
                loadPeriods();
                if (historyId) loadHistory(historyId);
            },
        });
    };

    const removePayment = (line, payment) => {
        setConfirmBox({
            title: 'Remove payment',
            message: `Remove the payment of ${money(payment.amount)} made on ${payment.paid_on}? The ledger entry is reversed with it.`,
            confirmText: 'Remove payment',
            action: async () => {
                await payrollAPI.deletePayment(line.id, payment.id);
                toast.success('Payment removed');
                loadLines(selected);
                loadPeriods();
                if (historyId) loadHistory(historyId);
            },
        });
    };

    const issueAdvance = async (e) => {
        e.preventDefault();
        if (savingAdvance) return;
        setSavingAdvance(true);
        try {
            await salaryAdvanceAPI.create({
                ...advanceForm,
                amount: Number(advanceForm.amount),
                accountId: advanceForm.accountId || defaultAccountId || undefined,
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

    const cancelAdvance = (advance) => {
        setConfirmBox({
            title: 'Cancel advance',
            message: `Cancel the ${money(advance.amount)} advance for ${advance.employee_name}? It will no longer be deducted from their salary.`,
            confirmText: 'Cancel advance',
            action: async () => {
                await salaryAdvanceAPI.cancel(advance.id);
                toast.success('Advance cancelled');
                loadAdvances();
            },
        });
    };

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1>Payroll</h1>
                    <p className="text-muted">Periods, lines from employee salaries, salary advances, lock, and GL posting</p>
                </div>
                {canCreate && (
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
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'records'}
                    className={`adv-tab ${tab === 'records' ? 'active' : ''}`}
                    onClick={() => setTab('records')}
                >
                    Employee records
                </button>
            </div>

            {tab === 'records' ? (
                <div className="card">
                    <div className="form-group" style={{ maxWidth: 460 }}>
                        <label htmlFor="rec-employee">Employee</label>
                        <SearchableSelect
                            id="rec-employee"
                            name="historyEmployee"
                            value={historyId}
                            onChange={(ev) => loadHistory(ev.target.value)}
                        >
                            <option value="">Select an employee to see their salary record</option>
                            {employees.map((emp) => (
                                <option key={emp._id || emp.id} value={emp._id || emp.id}>
                                    {[emp.firstName, emp.lastName].filter(Boolean).join(' ')}
                                    {emp.employeeCode ? ` — ${emp.employeeCode}` : ''}
                                </option>
                            ))}
                        </SearchableSelect>
                    </div>

                    {historyLoading ? <div className="loading-inline">Loading…</div> : !history ? (
                        <p className="adv-note">Pick an employee above to see every month they have been paid for.</p>
                    ) : (
                        <>
                            <div className="adv-summary">
                                <div className="adv-stat">
                                    <span>Monthly salary</span>
                                    <strong>{money(history.employee.monthly_salary)}</strong>
                                </div>
                                <div className="adv-stat">
                                    <span>Months on record</span>
                                    <strong>{history.totals.months}</strong>
                                </div>
                                <div className="adv-stat">
                                    <span>Total paid</span>
                                    <strong className="adv-good">{money(history.totals.paid)}</strong>
                                </div>
                                <div className="adv-stat adv-stat-main">
                                    <span>Still owed</span>
                                    <strong className="adv-owed">{money(history.totals.remaining)}</strong>
                                </div>
                                <div className="adv-stat">
                                    <span>Advance outstanding</span>
                                    <strong className={history.advance_outstanding > 0 ? 'adv-owed' : 'adv-good'}>
                                        {money(history.advance_outstanding)}
                                    </strong>
                                </div>
                            </div>

                            <div className="table-responsive table-scroll-x">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Month</th>
                                            <th>Gross</th>
                                            <th>Deductions</th>
                                            <th>Advance deducted</th>
                                            <th>Net</th>
                                            <th>Paid</th>
                                            <th>Remaining</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.months.length === 0 ? (
                                            <tr><td colSpan="8" className="text-center p-4">No salary months recorded yet for this employee.</td></tr>
                                        ) : history.months.map((m) => (
                                            <tr key={m.id}>
                                                <td>
                                                    <strong>{m.period_label}</strong>
                                                    <div className="text-muted small">{m.period_start} → {m.period_end}</div>
                                                </td>
                                                <td>{money(m.gross_amount)}</td>
                                                <td>{money(m.deductions)}</td>
                                                <td>{Number(m.advance_deduction) > 0 ? money(m.advance_deduction) : '—'}</td>
                                                <td><strong>{money(m.net_amount)}</strong></td>
                                                <td className="adv-good">{money(m.paid_amount)}</td>
                                                <td className={Number(m.remaining_amount) > 0 ? 'adv-owed' : undefined}>
                                                    {Number(m.remaining_amount) > 0 ? money(m.remaining_amount) : '—'}
                                                </td>
                                                <td><PayBadge line={m} periodStatus={m.period_status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {history.months.length > 0 && (
                                        <tfoot>
                                            <tr className="adv-total-row">
                                                <td><strong>Total</strong></td>
                                                <td><strong>{money(history.totals.gross)}</strong></td>
                                                <td><strong>{money(history.totals.deductions)}</strong></td>
                                                <td><strong>{money(history.totals.advance_recovered)}</strong></td>
                                                <td><strong>{money(history.totals.net)}</strong></td>
                                                <td><strong className="adv-good">{money(history.totals.paid)}</strong></td>
                                                <td><strong className="adv-owed">{money(history.totals.remaining)}</strong></td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </>
                    )}
                </div>
            ) : tab === 'advances' ? (
                <div className="card">
                    {advanceSummary && (
                        <div className="adv-summary">
                            <div className="adv-stat">
                                <span>Total issued</span>
                                <strong>{money(advanceSummary.total_issued)}</strong>
                            </div>
                            <div className="adv-stat">
                                <span>Deducted from salaries</span>
                                <strong className="adv-good">{money(advanceSummary.total_recovered)}</strong>
                            </div>
                            <div className="adv-stat adv-stat-main">
                                <span>Still to deduct</span>
                                <strong className="adv-owed">{money(advanceSummary.total_outstanding)}</strong>
                            </div>
                        </div>
                    )}

                    {advancesLoading ? <div className="loading-inline">Loading…</div> : (
                        // Eight columns: wider than the card on ordinary screens, so it
                        // must scroll inside it (table-scroll-x) instead of spilling out.
                        <div className="table-responsive table-scroll-x">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Advance given</th>
                                        <th>Deducted so far</th>
                                        <th>Still to deduct</th>
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
                                                    {/* Cancelling is a delete on the server, so the same
                                                        permission decides here. */}
                                                    {canDelete && a.status === 'outstanding' && a.recovered === 0 && (
                                                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => cancelAdvance(a)}>Cancel</button>
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
                                            {showField('period') && <><th>Label</th><th>From</th><th>To</th><th>Status</th></>}
                                            <th>Lines</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {periods.map((p) => (
                                            <tr key={p.id} style={{ background: selected === p.id ? 'rgba(59, 130, 246, 0.08)' : undefined }}>
                                                {showField('period') && <>
                                                    <td>{p.label}</td>
                                                    <td>{p.period_start}</td>
                                                    <td>{p.period_end}</td>
                                                    <td><span className="badge badge-info">{p.status}</span></td>
                                                </>}
                                                <td>{p.line_count}</td>
                                                <td>
                                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => loadLines(p.id)}>Open</button>
                                                    {/* Posted periods live in the ledger; only a proposal can go. */}
                                                    {canDelete && p.status !== 'posted' && (
                                                        <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.4rem' }} onClick={() => removePeriod(p)}>Delete</button>
                                                    )}
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
                                            {canDelete && p.status !== 'posted' && (
                                                <button type="button" className="btn btn-sm btn-danger" onClick={() => removePeriod(p)}>Delete</button>
                                            )}
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
                                {canCreate && (
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={runGenerate} disabled={linesData.period.status !== 'draft'}>Generate lines</button>
                                )}
                                {canLock && (
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={runLock} disabled={linesData.period.status !== 'draft'}>Lock</button>
                                )}
                                {canPost && (
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={runPost} disabled={linesData.period.status !== 'locked'}>Post to ledger</button>
                                )}
                                {/* Salaries can only leave once the period is posted. */}
                                {canPay && (
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={payEveryone}
                                        disabled={linesData.period.status !== 'posted' || !(linesData.lines || []).some((l) => Number(l.remaining_amount) > 0)}
                                    >
                                        Pay everyone
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {linesData.period.status === 'posted' && (
                        <div className="adv-summary">
                            <div className="adv-stat">
                                <span>Net payable</span>
                                <strong>{money(linesData.period.net_total)}</strong>
                            </div>
                            <div className="adv-stat">
                                <span>Given so far</span>
                                <strong className="adv-good">{money(linesData.period.given_total ?? linesData.period.paid_total)}</strong>
                            </div>
                            <div className="adv-stat adv-stat-main">
                                <span>Remaining</span>
                                <strong className="adv-owed">{money(linesData.period.remaining_total)}</strong>
                            </div>
                            <div className="adv-stat">
                                <span>Still unpaid</span>
                                <strong>{linesData.period.unpaid_count} employee{linesData.period.unpaid_count === 1 ? '' : 's'}</strong>
                            </div>
                        </div>
                    )}
                    <div className="desktop-only">
                        <div className="table-responsive table-scroll-x">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        {showField('employee') && <th>Employee</th>}
                                        {showField('earnings') && <><th>Gross</th><th>Deductions</th></>}
                                        {showField('advances') && <><th>Advance deducted</th><th>Still to deduct</th></>}
                                        {showField('net_pay') && <><th>Net</th><th>Given</th><th>Remaining</th><th>Status</th></>}
                                        {canRun && <th>Action</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(linesData.lines || []).map((ln) => (
                                        <tr key={ln.id}>
                                            {showField('employee') && (
                                                <td>
                                                    {ln.employee_name} <small className="text-muted">{ln.employee_code}</small>
                                                    {showField('payments') && (ln.payments || []).length > 0 && (
                                                        <div className="pay-history">
                                                            {ln.payments.map((p) => (
                                                                <span key={p.id} className="pay-chip">
                                                                    {money(p.amount)} · {p.paid_on} · {p.method}
                                                                    {canDelete && (
                                                                        <button
                                                                            type="button"
                                                                            title="Remove this payment"
                                                                            onClick={() => removePayment(ln, p)}
                                                                        >×</button>
                                                                    )}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                            {showField('earnings') && <>
                                                <td>{money(ln.gross_amount)}</td>
                                                <td>{money(ln.deductions)}</td>
                                            </>}
                                            {showField('advances') && <>
                                                <td>
                                                    {Number(ln.advance_deduction) > 0 ? money(ln.advance_deduction) : '—'}
                                                </td>
                                                {/* What is still owed once this run is taken off. */}
                                                <td className={Number(ln.advance_balance) > 0 ? 'adv-owed' : undefined}>
                                                    {Number(ln.advance_balance) > 0 ? money(ln.advance_balance) : '—'}
                                                </td>
                                            </>}
                                            {showField('net_pay') && <>
                                                <td><strong>{money(ln.net_amount)}</strong></td>
                                                <td className="adv-good">
                                                    {money(ln.already_given)}
                                                    {Number(ln.advance_deduction) > 0 && (
                                                        <small className="text-muted adv-note">incl. {money(ln.advance_deduction)} advance</small>
                                                    )}
                                                </td>
                                                <td className={Number(ln.remaining_amount) > 0 ? 'adv-owed' : undefined}>
                                                    {Number(ln.remaining_amount) > 0 ? money(ln.remaining_amount) : '—'}
                                                </td>
                                                <td><PayBadge line={ln} periodStatus={linesData.period.status} /></td>
                                            </>}
                                            {canRun && (
                                                <td>
                                                    {/* A draft is still a proposal: this is where the month's
                                                        salary is corrected and an advance deduction is chosen. */}
                                                    {canEdit && linesData.period.status === 'draft' && (
                                                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => openEdit(ln)}>
                                                            Edit
                                                        </button>
                                                    )}
                                                    {canPay && linesData.period.status === 'posted' && Number(ln.remaining_amount) > 0 && (
                                                        <button type="button" className="btn btn-sm btn-primary" onClick={() => openPay(ln)}>
                                                            Pay
                                                        </button>
                                                    )}
                                                </td>
                                            )}
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
                                            <span className="row-icon">💵</span>
                                            <span className="row-label">Given</span>
                                            <span className="row-value adv-good">
                                                {money(ln.already_given)}
                                                {Number(ln.advance_deduction) > 0 && (
                                                    <small className="text-muted"> incl. advance</small>
                                                )}
                                            </span>
                                        </div>
                                        {Number(ln.remaining_amount) > 0 && (
                                            <div className="data-card-row">
                                                <span className="row-icon">⏳</span>
                                                <span className="row-label">Remaining</span>
                                                <span className="row-value adv-owed">{money(ln.remaining_amount)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="data-card-footer">
                                        <PayBadge line={ln} periodStatus={linesData.period.status} />
                                        {canEdit && linesData.period.status === 'draft' && (
                                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => openEdit(ln)}>Edit</button>
                                        )}
                                        {canPay && linesData.period.status === 'posted' && Number(ln.remaining_amount) > 0 && (
                                            <button type="button" className="btn btn-sm btn-primary" onClick={() => openPay(ln)}>Pay</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            </>
            )}

            {editLine && (
                <div className="modal-overlay" onClick={() => setEditLine(null)}>
                    <div
                        className="modal-content modal-md"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hr-line-modal-title"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="hr-line-modal-title">{editLine.employee_name}</h2>
                            <button type="button" className="modal-close" onClick={() => setEditLine(null)} aria-label="Close">×</button>
                        </div>
                        <form onSubmit={submitLine}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">This month's salary</label>
                                    <input
                                        type="number" min="0" step="0.01" className="form-input" required
                                        value={editForm.gross_amount}
                                        onChange={(ev) => setEditForm({ ...editForm, gross_amount: ev.target.value })}
                                    />
                                    <small className="text-muted">Starts from the employee record; change it for this month only.</small>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Other deductions</label>
                                    <input
                                        type="number" min="0" step="0.01" className="form-input"
                                        value={editForm.deductions}
                                        onChange={(ev) => setEditForm({ ...editForm, deductions: ev.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Advance to deduct this month</label>
                                    <input
                                        type="number" min="0" step="0.01" max={editLine.advance_outstanding || 0}
                                        className="form-input"
                                        value={editForm.advance_deduction}
                                        onChange={(ev) => setEditForm({ ...editForm, advance_deduction: ev.target.value })}
                                    />
                                    {/* Nothing comes off unless a figure is typed here — the point of
                                        the whole screen. */}
                                    {Number(editLine.advance_outstanding) > 0 ? (
                                        <>
                                            <small className="text-muted">
                                                {money(editLine.advance_outstanding)} of advance still to come off. Take less
                                                this month and the rest carries to the next one.
                                            </small>
                                            {/* Two shortcuts for the two answers people actually give. They
                                                were inline links inside the hint, which the browser drew as
                                                bare grey buttons mid-sentence. */}
                                            <div className="adv-quick">
                                                <button
                                                    type="button"
                                                    className={`adv-quick-btn ${Number(editForm.advance_deduction) === Number(editLine.advance_outstanding) ? 'is-on' : ''}`}
                                                    onClick={() => setEditForm({ ...editForm, advance_deduction: String(editLine.advance_outstanding) })}
                                                >
                                                    Deduct all {money(editLine.advance_outstanding)}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`adv-quick-btn ${Number(editForm.advance_deduction) === 0 ? 'is-on' : ''}`}
                                                    onClick={() => setEditForm({ ...editForm, advance_deduction: '0' })}
                                                >
                                                    Take none
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <small className="text-muted">No advance outstanding for this employee.</small>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Note</label>
                                    <input
                                        type="text" className="form-input"
                                        value={editForm.notes}
                                        onChange={(ev) => setEditForm({ ...editForm, notes: ev.target.value })}
                                    />
                                </div>
                                <div className="adv-summary">
                                    <div className="adv-stat adv-stat-main">
                                        <span>Net to pay</span>
                                        <strong>
                                            {money(Math.max(0,
                                                Number(editForm.gross_amount || 0)
                                                - Number(editForm.deductions || 0)
                                                - Number(editForm.advance_deduction || 0)))}
                                        </strong>
                                    </div>
                                    <div className="adv-stat">
                                        <span>Advance left after this</span>
                                        <strong className="adv-owed">
                                            {money(Math.max(0, Number(editLine.advance_outstanding || 0) - Number(editForm.advance_deduction || 0)))}
                                        </strong>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setEditLine(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={savingLine}>
                                    {savingLine ? 'Saving…' : 'Save line'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {payLine && (
                <div className="modal-overlay" onClick={() => setPayLine(null)}>
                    <div
                        className="modal-content modal-md"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hr-pay-modal-title"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="hr-pay-modal-title">Pay {payLine.employee_name}</h2>
                            <button type="button" className="modal-close" onClick={() => setPayLine(null)} aria-label="Close">×</button>
                        </div>
                        <form onSubmit={submitPayment}>
                            <div className="modal-body">
                                <div className="adv-summary">
                                    {/* The advance came off before the net was struck — shown so the
                                        payer can see why the figure is less than the salary. */}
                                    {Number(payLine.advance_deduction) > 0 && (
                                        <div className="adv-stat">
                                            <span>Advance already cut</span>
                                            <strong>{money(payLine.advance_deduction)}</strong>
                                        </div>
                                    )}
                                    <div className="adv-stat">
                                        <span>Net for the month</span>
                                        <strong>{money(payLine.net_amount)}</strong>
                                    </div>
                                    <div className="adv-stat">
                                        <span>Already paid</span>
                                        <strong className="adv-good">{money(payLine.paid_amount)}</strong>
                                    </div>
                                    <div className="adv-stat adv-stat-main">
                                        <span>Remaining</span>
                                        <strong className="adv-owed">{money(payLine.remaining_amount)}</strong>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="pay-amount">Amount *</label>
                                        <input
                                            id="pay-amount"
                                            type="number"
                                            min="1"
                                            step="0.01"
                                            max={payLine.remaining_amount}
                                            className="form-control"
                                            value={payForm.amount}
                                            onChange={(ev) => setPayForm({ ...payForm, amount: ev.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="pay-date">Paid on</label>
                                        <input
                                            id="pay-date"
                                            type="date"
                                            className="form-control"
                                            value={payForm.paid_on}
                                            onChange={(ev) => setPayForm({ ...payForm, paid_on: ev.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="pay-method">Method</label>
                                        <select
                                            id="pay-method"
                                            className="form-control"
                                            value={payForm.method}
                                            onChange={(ev) => setPayForm({ ...payForm, method: ev.target.value })}
                                        >
                                            <option value="cash">Cash</option>
                                            <option value="bank">Bank transfer</option>
                                            <option value="cheque">Cheque</option>
                                        </select>
                                    </div>
                                    {accounts.length > 0 && (
                                        <div className="form-group">
                                            <label htmlFor="pay-account">Paid from</label>
                                            <select
                                                id="pay-account"
                                                className="form-control"
                                                value={payForm.accountId || defaultAccountId}
                                                onChange={(ev) => setPayForm({ ...payForm, accountId: ev.target.value })}
                                            >
                                                {accounts.map((a) => <option key={a.id || a._id} value={String(a.id || a._id)}>{a.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label htmlFor="pay-ref">Reference</label>
                                        <input
                                            id="pay-ref"
                                            className="form-control"
                                            value={payForm.reference}
                                            onChange={(ev) => setPayForm({ ...payForm, reference: ev.target.value })}
                                            placeholder="Cheque no., transfer id…"
                                        />
                                    </div>
                                </div>
                                <p className="adv-note">
                                    Pay less than the remaining amount to record a part payment — the rest stays
                                    on this employee&apos;s balance until it is paid.
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setPayLine(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={paying}>
                                    {paying ? 'Recording…' : `Pay ${money(payForm.amount || 0)}`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
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
                                {accounts.length > 0 && (
                                    <div className="form-group">
                                        <label htmlFor="adv-account">Paid from</label>
                                        <select
                                            id="adv-account"
                                            className="form-control"
                                            value={advanceForm.accountId || defaultAccountId}
                                            onChange={(ev) => setAdvanceForm({ ...advanceForm, accountId: ev.target.value })}
                                        >
                                            {accounts.map((a) => <option key={a.id || a._id} value={String(a.id || a._id)}>{a.name}</option>)}
                                        </select>
                                    </div>
                                )}
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
                                {/* One month, one period. The server makes it run from the 1st to
                                    the month's own last day (28/29/30/31) and names it itself, and
                                    refuses a month that already exists. */}
                                <div className="form-group">
                                    <label htmlFor="period-month">Salary month *</label>
                                    <input
                                        id="period-month"
                                        type="month"
                                        className="form-control"
                                        value={newForm.month}
                                        onChange={(ev) => setNewForm({ month: ev.target.value })}
                                        required
                                    />
                                    <small className="text-muted">
                                        The period covers the whole month automatically
                                        {newForm.month ? (() => {
                                            const [y, m] = newForm.month.split('-').map(Number);
                                            const last = new Date(y, m, 0).getDate();
                                            const name = new Date(y, m - 1, 1).toLocaleString('en', { month: 'long' });
                                            return ` — ${name} ${y}: 1 to ${last} (${last} days)`;
                                        })() : ''}.
                                    </small>
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

            <ConfirmModal
                isOpen={!!confirmBox}
                title={confirmBox?.title || ''}
                message={confirmBox?.message || ''}
                confirmText={confirmBox?.confirmText || 'Confirm'}
                type={confirmBox?.type || 'danger'}
                onConfirm={runConfirmed}
                onCancel={() => setConfirmBox(null)}
            />
        </div>
    );
};

export default Payroll;
