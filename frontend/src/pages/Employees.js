/**
 * Employees (HR directory)
 */

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import SearchableSelect from '../components/SearchableSelect';
import ActionButtons from '../components/ActionButtons';
import { useAuth } from '../context/AuthContext';
import { adminAPI, employeeAPI } from '../services/api';
import '../styles/userManagement.css';

const emptyForm = {
    employee_code: '',
    user_id: '',
    department_id: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    national_id: '',
    date_of_birth: '',
    gender: 'unspecified',
    address: '',
    city: '',
    country: 'Pakistan',
    hire_date: '',
    termination_date: '',
    employment_status: 'active',
    job_title: '',
    base_salary: '',
    bank_name: '',
    bank_account: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    notes: '',
    is_active: true
};

const Employees = () => {
    const { hasRole } = useAuth();
    const canWrite = hasRole(['super_admin', 'admin', 'hr_admin']);

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [departments, setDepartments] = useState([]);
    const [users, setUsers] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const [empRes, deptRes, usersRes] = await Promise.all([
                employeeAPI.list({ search: search || undefined, limit: 100 }),
                adminAPI.getDepartments(),
                adminAPI.getUsers({ limit: 200 })
            ]);
            setRows(empRes.data.data?.employees || []);
            setTotal(empRes.data.data?.total || 0);
            const flat = deptRes.data.data?.flat || [];
            setDepartments(flat);
            setUsers(usersRes.data.data?.users || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setModalOpen(true);
    };

    const openEdit = async (r) => {
        try {
            const res = await employeeAPI.get(r.id);
            const e = res.data.data;
            setEditingId(e.id);
            setForm({
                ...emptyForm,
                employee_code: e.employee_code || '',
                user_id: e.user_id ? String(e.user_id) : '',
                department_id: e.department_id ? String(e.department_id) : '',
                first_name: e.first_name || '',
                last_name: e.last_name || '',
                email: e.email || '',
                phone: e.phone || '',
                job_title: e.job_title || '',
                hire_date: e.hire_date ? e.hire_date.slice(0, 10) : '',
                employment_status: e.employment_status || 'active',
                base_salary: e.base_salary != null ? String(e.base_salary) : '',
                is_active: !!e.is_active
            });
            setModalOpen(true);
        } catch (err) {
            toast.error('Could not load employee');
        }
    };

    const save = async (e) => {
        e.preventDefault();
        if (!form.first_name || !form.last_name || !form.department_id || !form.hire_date) {
            toast.error('First name, last name, department, and hire date are required');
            return;
        }
        const payload = {
            ...form,
            department_id: parseInt(form.department_id, 10),
            user_id: form.user_id ? parseInt(form.user_id, 10) : null,
            base_salary: form.base_salary === '' ? 0 : parseFloat(form.base_salary)
        };
        try {
            if (editingId) await employeeAPI.update(editingId, payload);
            else await employeeAPI.create(payload);
            toast.success('Employee saved');
            setModalOpen(false);
            load();
        } catch (err) {
            /* toast via interceptor */
        }
    };

    const deactivate = async (r) => {
        if (!window.confirm(`Deactivate ${r.full_name}?`)) return;
        try {
            await employeeAPI.remove(r.id);
            toast.success('Employee deactivated');
            load();
        } catch (err) { /* */ }
    };

    const deptOptions = departments.map((d) => ({ id: String(d.id), name: `${d.name} (${d.code})` }));
    const userOptions = users.map((u) => ({
        id: String(u.id),
        name: `${u.first_name} ${u.last_name} (${u.email})`
    }));

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1>Employees</h1>
                    <p className="text-muted">HR directory, departments, and compensation summary</p>
                </div>
                <div className="header-actions">
                    <input
                        type="search"
                        className="form-control"
                        placeholder="Search name, code, email…"
                        value={search}
                        onChange={(ev) => setSearch(ev.target.value)}
                        style={{ minWidth: '220px' }}
                    />
                    {canWrite && (
                        <button type="button" className="btn btn-primary" onClick={openCreate}>
                            Add employee
                        </button>
                    )}
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div className="loading-inline">Loading…</div>
                ) : (
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Name</th>
                                    <th>Department</th>
                                    <th>Job title</th>
                                    <th>Status</th>
                                    <th>Base salary</th>
                                    {canWrite && <th style={{ width: 100 }}>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id}>
                                        <td>{r.employee_code}</td>
                                        <td>{r.full_name}</td>
                                        <td>{r.department_name || '—'}</td>
                                        <td>{r.job_title}</td>
                                        <td>
                                            <span className={`badge ${r.is_active ? 'badge-success' : 'badge-secondary'}`}>
                                                {r.employment_status}
                                            </span>
                                        </td>
                                        <td>{Number(r.base_salary).toLocaleString()}</td>
                                        {canWrite && (
                                            <td>
                                                <ActionButtons onEdit={() => openEdit(r)} onDelete={() => deactivate(r)} showEdit showDelete title={r.full_name} />
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!rows.length && <p className="empty-hint">No employees yet.</p>}
                        <div className="table-footer">Showing {rows.length} of {total}</div>
                    </div>
                )}
            </div>

            {modalOpen && (
                <div className="modal-overlay" onClick={() => setModalOpen(false)}>
                    <div
                        className="modal-content modal-lg"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hr-employee-modal-title"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="hr-employee-modal-title">{editingId ? 'Edit employee' : 'New employee'}</h2>
                            <button type="button" className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">×</button>
                        </div>
                        <form onSubmit={save}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Department *</label>
                                        <SearchableSelect
                                            value={form.department_id}
                                            onChange={(ev) => setForm((f) => ({ ...f, department_id: ev.target.value || '' }))}
                                            options={deptOptions}
                                            placeholder="Select department"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Link user (optional)</label>
                                        <SearchableSelect
                                            value={form.user_id}
                                            onChange={(ev) => setForm((f) => ({ ...f, user_id: ev.target.value || '' }))}
                                            options={userOptions}
                                            placeholder="None"
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>First name *</label>
                                        <input className="form-control" value={form.first_name} onChange={(ev) => setForm({ ...form, first_name: ev.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Last name *</label>
                                        <input className="form-control" value={form.last_name} onChange={(ev) => setForm({ ...form, last_name: ev.target.value })} required />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Hire date *</label>
                                        <input type="date" className="form-control" value={form.hire_date} onChange={(ev) => setForm({ ...form, hire_date: ev.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Job title</label>
                                        <input className="form-control" value={form.job_title} onChange={(ev) => setForm({ ...form, job_title: ev.target.value })} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Base salary</label>
                                        <input type="number" step="0.01" className="form-control" value={form.base_salary} onChange={(ev) => setForm({ ...form, base_salary: ev.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Employment status</label>
                                        <select className="form-control" value={form.employment_status} onChange={(ev) => setForm({ ...form, employment_status: ev.target.value })}>
                                            <option value="active">active</option>
                                            <option value="probation">probation</option>
                                            <option value="on_leave">on_leave</option>
                                            <option value="terminated">terminated</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input type="email" className="form-control" value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Phone</label>
                                        <input className="form-control" value={form.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Employees;
