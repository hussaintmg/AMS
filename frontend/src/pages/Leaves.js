/**
 * Leave requests & balances
 */

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import SearchableSelect from '../components/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { employeeAPI, leavesAPI } from '../services/api';
import '../styles/userManagement.css';

const Leaves = () => {
    const { hasRole } = useAuth();
    const canApprove = hasRole(['super_admin', 'admin', 'hr_admin']);

    const [types, setTypes] = useState([]);
    const [requests, setRequests] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [balances, setBalances] = useState([]);
    const [empFilter, setEmpFilter] = useState('');
    const [modal, setModal] = useState(false);
    const [form, setForm] = useState({
        employee_id: '',
        leave_type_id: '',
        start_date: '',
        end_date: '',
        days_requested: '',
        reason: ''
    });

    const load = useCallback(async () => {
        try {
            const [tRes, rRes, eRes] = await Promise.all([
                leavesAPI.listTypes(),
                leavesAPI.listRequests({}),
                employeeAPI.list({ limit: 200 })
            ]);
            setTypes(tRes.data.data || []);
            setRequests(rRes.data.data || []);
            setEmployees(eRes.data.data?.employees || []);
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const loadBalances = async (employeeId) => {
        if (!employeeId) {
            setBalances([]);
            return;
        }
        try {
            const res = await leavesAPI.listBalances({ employee_id: employeeId });
            setBalances(res.data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (empFilter) loadBalances(empFilter);
        else setBalances([]);
    }, [empFilter]);

    const empOptions = employees.map((e) => ({ id: String(e.id), name: `${e.full_name} (${e.employee_code})` }));
    const typeOptions = types.map((t) => ({ id: String(t.id), name: t.name }));

    const submit = async (e) => {
        e.preventDefault();
        try {
            await leavesAPI.submitRequest({
                employee_id: parseInt(form.employee_id, 10),
                leave_type_id: parseInt(form.leave_type_id, 10),
                start_date: form.start_date,
                end_date: form.end_date,
                days_requested: parseFloat(form.days_requested),
                reason: form.reason
            });
            toast.success('Leave request submitted');
            setModal(false);
            setForm({ employee_id: '', leave_type_id: '', start_date: '', end_date: '', days_requested: '', reason: '' });
            load();
        } catch (err) { /* */ }
    };

    const setStatus = async (id, status) => {
        try {
            await leavesAPI.setRequestStatus(id, { status });
            toast.success(`Request ${status}`);
            load();
        } catch (err) { /* */ }
    };

    const filteredReq = empFilter
        ? requests.filter((r) => String(r.employee_id) === String(empFilter))
        : requests;

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1>Leaves</h1>
                    <p className="text-muted">Requests, approvals, and balances by employee</p>
                </div>
                <div className="header-actions">
                    <div style={{ minWidth: 220 }}>
                        <SearchableSelect
                            options={empOptions}
                            value={empFilter}
                            onChange={(ev) => setEmpFilter(ev.target.value)}
                            placeholder="Filter by employee"
                        />
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => setModal(true)}>New request</button>
                </div>
            </div>

            {!!balances.length && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Balances (selected year)</h3>
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Allocated</th>
                                    <th>Used</th>
                                    <th>Remaining</th>
                                </tr>
                            </thead>
                            <tbody>
                                {balances.map((b) => (
                                    <tr key={b.id}>
                                        <td>{b.leave_type_name}</td>
                                        <td>{b.days_allocated}</td>
                                        <td>{b.days_used}</td>
                                        <td>{(parseFloat(b.days_allocated) - parseFloat(b.days_used)).toFixed(1)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Type</th>
                                <th>Dates</th>
                                <th>Days</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredReq.map((r) => (
                                <tr key={r.id}>
                                    <td>{r.employee_name} <small>{r.employee_code}</small></td>
                                    <td>{r.leave_type_name}</td>
                                    <td>{r.start_date} → {r.end_date}</td>
                                    <td>{r.days_requested}</td>
                                    <td><span className="badge badge-secondary">{r.status}</span></td>
                                    <td>
                                        {canApprove && r.status === 'pending' ? (
                                            <>
                                                <button type="button" className="btn btn-sm btn-success" style={{ marginRight: 6 }} onClick={() => setStatus(r.id, 'approved')}>Approve</button>
                                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setStatus(r.id, 'rejected')}>Reject</button>
                                            </>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {modal && (
                <div className="modal-overlay" onClick={() => setModal(false)}>
                    <div
                        className="modal-content modal-md"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hr-leave-modal-title"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="hr-leave-modal-title">New leave request</h2>
                            <button type="button" className="modal-close" onClick={() => setModal(false)} aria-label="Close">×</button>
                        </div>
                        <form onSubmit={submit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Employee</label>
                                    <SearchableSelect
                                        options={empOptions}
                                        value={form.employee_id}
                                        onChange={(ev) => setForm({ ...form, employee_id: ev.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Leave type</label>
                                    <SearchableSelect
                                        options={typeOptions}
                                        value={form.leave_type_id}
                                        onChange={(ev) => setForm({ ...form, leave_type_id: ev.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Start</label>
                                        <input type="date" className="form-control" value={form.start_date} onChange={(ev) => setForm({ ...form, start_date: ev.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>End</label>
                                        <input type="date" className="form-control" value={form.end_date} onChange={(ev) => setForm({ ...form, end_date: ev.target.value })} required />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Days requested</label>
                                    <input type="number" step="0.5" className="form-control" value={form.days_requested} onChange={(ev) => setForm({ ...form, days_requested: ev.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Reason</label>
                                    <textarea className="form-control" rows={3} value={form.reason} onChange={(ev) => setForm({ ...form, reason: ev.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Submit</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Leaves;
