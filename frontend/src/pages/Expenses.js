/**
 * Expense categories & expense lines
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import SearchableSelect from '../components/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { employeeAPI, expensesAPI, paymentMethodsAPI } from '../services/api';
import '../styles/userManagement.css';

const Expenses = () => {
    const { hasRole } = useAuth();
    const location = useLocation();
    const canPost = hasRole(['super_admin', 'admin', 'accountant']);
    const canManageCat = hasRole(['super_admin', 'admin', 'accountant']);

    const [tab, setTab] = useState('expenses');
    const [categories, setCategories] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [expenseRows, setExpenseRows] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [catModal, setCatModal] = useState(false);
    const [expModal, setExpModal] = useState(false);
    const [catForm, setCatForm] = useState({ name: '', code: '', category_group: 'general', account_id: '' });
    const [expForm, setExpForm] = useState({
        category_id: '',
        amount: '',
        expense_date: new Date().toISOString().slice(0, 10),
        description: '',
        vendor_name: '',
        payment_method_id: '',
        employee_id: '',
        status: 'draft'
    });

    const loadAll = useCallback(async () => {
        try {
            const [c, a, e, pm, em] = await Promise.all([
                expensesAPI.listCategories(),
                expensesAPI.listAccounts(),
                expensesAPI.listExpenses({ limit: 100 }),
                paymentMethodsAPI.getAll({ limit: 100 }),
                employeeAPI.list({ limit: 200 })
            ]);
            setCategories(c.data.data || []);
            setAccounts(a.data.data || []);
            setExpenseRows(e.data.data?.expenses || []);
            setPaymentMethods(Array.isArray(pm.data.data) ? pm.data.data : []);
            setEmployees(em.data.data?.employees || []);
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    useEffect(() => {
        const h = (location.hash || '').replace(/^#/, '');
        if (h === 'categories') setTab('categories');
    }, [location.pathname, location.hash]);

    const catOptions = categories.map((x) => ({ id: String(x.id), name: `${x.name} (${x.category_group})` }));
    const empOptions = employees.map((x) => ({ id: String(x.id), name: x.full_name }));
    const pmOptions = (Array.isArray(paymentMethods) ? paymentMethods : []).map((p) => ({ id: String(p.id), name: p.name }));
    const acctOptions = accounts.map((a) => ({ id: String(a.id), name: `${a.account_code} — ${a.account_name}` }));

    const saveCategory = async (e) => {
        e.preventDefault();
        try {
            await expensesAPI.createCategory({
                name: catForm.name,
                code: catForm.code,
                category_group: catForm.category_group,
                account_id: parseInt(catForm.account_id, 10)
            });
            toast.success('Category created');
            setCatModal(false);
            setCatForm({ name: '', code: '', category_group: 'general', account_id: '' });
            loadAll();
        } catch (err) { /* */ }
    };

    const saveExpense = async (ev) => {
        ev.preventDefault();
        try {
            const payload = {
                category_id: parseInt(expForm.category_id, 10),
                amount: parseFloat(expForm.amount),
                expense_date: expForm.expense_date,
                description: expForm.description,
                vendor_name: expForm.vendor_name,
                status: expForm.status,
                payment_method_id: expForm.payment_method_id ? parseInt(expForm.payment_method_id, 10) : null,
                employee_id: expForm.employee_id ? parseInt(expForm.employee_id, 10) : null
            };
            await expensesAPI.createExpense(payload);
            toast.success('Expense saved');
            setExpModal(false);
            loadAll();
        } catch (err) { /* */ }
    };

    const postOne = async (id) => {
        try {
            await expensesAPI.postExpense(id);
            toast.success('Posted to ledger');
            loadAll();
        } catch (err) { /* */ }
    };

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1>Expenses</h1>
                    <p className="text-muted">Workshop, general, and salary-linked expenses</p>
                </div>
                <div className="header-actions">
                    <button type="button" className={`btn ${tab === 'expenses' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('expenses')}>Expenses</button>
                    <button type="button" className={`btn ${tab === 'categories' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('categories')}>Categories</button>
                    <button type="button" className="btn btn-primary" onClick={() => setExpModal(true)}>New expense</button>
                    {canManageCat && (
                        <button type="button" className="btn btn-secondary" onClick={() => setCatModal(true)}>New category</button>
                    )}
                </div>
            </div>

            {tab === 'categories' && (
                <div className="card">
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Code</th>
                                    <th>Group</th>
                                    <th>GL account</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map((c) => (
                                    <tr key={c.id}>
                                        <td>{c.name}</td>
                                        <td>{c.code}</td>
                                        <td><span className="badge badge-info">{c.category_group}</span></td>
                                        <td>{c.account_code} {c.account_name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'expenses' && (
                <div className="card">
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Payee</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenseRows.map((x) => (
                                    <tr key={x.id}>
                                        <td>{x.expense_number}</td>
                                        <td>{x.expense_date}</td>
                                        <td>{x.category_name} <small className="text-muted">{x.category_group}</small></td>
                                        <td>{Number(x.amount).toLocaleString()}</td>
                                        <td><span className="badge badge-secondary">{x.status}</span></td>
                                        <td>{x.employee_payee_name || '—'}</td>
                                        <td>
                                            {canPost && !x.ledger_transaction_id && ['submitted', 'approved'].includes(x.status) && (
                                                <button type="button" className="btn btn-sm btn-primary" onClick={() => postOne(x.id)}>Post</button>
                                            )}
                                            {x.ledger_transaction_id ? <small>GL #{x.ledger_transaction_id}</small> : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {catModal && (
                <div className="modal-overlay" onClick={() => setCatModal(false)}>
                    <div
                        className="modal-content modal-md"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hr-exp-cat-modal-title"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="hr-exp-cat-modal-title">New category</h2>
                            <button type="button" className="modal-close" onClick={() => setCatModal(false)} aria-label="Close">×</button>
                        </div>
                        <form onSubmit={saveCategory}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Name</label>
                                    <input className="form-control" value={catForm.name} onChange={(ev) => setCatForm({ ...catForm, name: ev.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Code</label>
                                    <input className="form-control" value={catForm.code} onChange={(ev) => setCatForm({ ...catForm, code: ev.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Group</label>
                                    <select className="form-control" value={catForm.category_group} onChange={(ev) => setCatForm({ ...catForm, category_group: ev.target.value })}>
                                        <option value="workshop">workshop</option>
                                        <option value="general">general</option>
                                        <option value="salary">salary</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>GL account</label>
                                    <SearchableSelect
                                        options={acctOptions}
                                        value={catForm.account_id}
                                        onChange={(ev) => setCatForm({ ...catForm, account_id: ev.target.value })}
                                        placeholder="Select account"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setCatModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {expModal && (
                <div className="modal-overlay" onClick={() => setExpModal(false)}>
                    <div
                        className="modal-content modal-lg"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="hr-exp-modal-title"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="hr-exp-modal-title">New expense</h2>
                            <button type="button" className="modal-close" onClick={() => setExpModal(false)} aria-label="Close">×</button>
                        </div>
                        <form onSubmit={saveExpense}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Category</label>
                                        <SearchableSelect options={catOptions} value={expForm.category_id} onChange={(ev) => setExpForm({ ...expForm, category_id: ev.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Amount</label>
                                        <input type="number" step="0.01" className="form-control" value={expForm.amount} onChange={(ev) => setExpForm({ ...expForm, amount: ev.target.value })} required />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Date</label>
                                        <input type="date" className="form-control" value={expForm.expense_date} onChange={(ev) => setExpForm({ ...expForm, expense_date: ev.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Status</label>
                                        <select className="form-control" value={expForm.status} onChange={(ev) => setExpForm({ ...expForm, status: ev.target.value })}>
                                            <option value="draft">draft</option>
                                            <option value="submitted">submitted</option>
                                            <option value="approved">approved</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea className="form-control" rows={3} value={expForm.description} onChange={(ev) => setExpForm({ ...expForm, description: ev.target.value })} />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Vendor</label>
                                        <input className="form-control" value={expForm.vendor_name} onChange={(ev) => setExpForm({ ...expForm, vendor_name: ev.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Payment method</label>
                                        <SearchableSelect options={pmOptions} value={expForm.payment_method_id} onChange={(ev) => setExpForm({ ...expForm, payment_method_id: ev.target.value })} placeholder="Optional" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Employee (for salary-group expenses)</label>
                                    <SearchableSelect options={empOptions} value={expForm.employee_id} onChange={(ev) => setExpForm({ ...expForm, employee_id: ev.target.value })} placeholder="Optional" />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setExpModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Expenses;
