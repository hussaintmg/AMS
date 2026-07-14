import React, { useState, useEffect } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import useModalKeyboard from '../hooks/useModalKeyboard';

function ExpenseFormModal({ isOpen, mode, initialData, categories, employees, onClose, onSubmit, loading }) {
  const [formData, setFormData] = useState({
    category: '', amount: '', expenseDate: new Date().toISOString().slice(0, 10),
    description: '', vendor: '', employee: '', status: 'draft',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setFormData({ category: '', amount: '', expenseDate: new Date().toISOString().slice(0, 10),
        description: '', vendor: '', employee: '', status: 'draft' });
    } else if (initialData) {
      setFormData({
        category: initialData.category || '',
        amount: initialData.amount != null ? String(initialData.amount) : '',
        expenseDate: initialData.expenseDate ? initialData.expenseDate.slice(0, 10) : '',
        description: initialData.description || '',
        vendor: initialData.vendor || '',
        employee: initialData.employee?._id || initialData.employee || '',
        status: initialData.status || 'draft',
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  const validate = () => {
    const errs = {};
    if (!formData.category) errs.category = 'Category is required';
    if (!formData.amount || Number(formData.amount) <= 0) errs.amount = 'Valid amount is required';
    if (!formData.expenseDate) errs.expenseDate = 'Expense date is required';
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => { if (e) e.preventDefault(); if (!validate()) return; onSubmit(formData); };
  const handleChange = (e) => { const { name, value } = e.target; setFormData(p => ({ ...p, [name]: value })); if (errors[name]) setErrors(p => ({ ...p, [name]: undefined })); };

  useModalKeyboard(isOpen, onClose, handleSubmit, loading);

  if (!isOpen) return null;

  const catOptions = (categories || []).map(c => ({ id: c.name || c._id, name: `${c.name || c}${c.categoryGroup ? ` (${c.categoryGroup})` : ''}` }));
  const empOptions = employees.map(e => ({ id: e._id || e.id, name: `${e.firstName || e.first_name || ''} ${e.lastName || e.last_name || ''}`.trim() || '-' }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'New Expense' : 'Edit Expense'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Category *</label>
                <SearchableSelect options={catOptions} value={formData.category}
                  onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} required />
                {errors.category && <span className="field-error">{errors.category}</span>}
              </div>
              <div className="form-group">
                <label>Amount *</label>
                <input type="number" step="0.01" className="form-control" name="amount" value={formData.amount} onChange={handleChange} required />
                {errors.amount && <span className="field-error">{errors.amount}</span>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Expense Date *</label>
                <input type="date" className="form-control" name="expenseDate" value={formData.expenseDate} onChange={handleChange} required />
                {errors.expenseDate && <span className="field-error">{errors.expenseDate}</span>}
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-control" name="status" value={formData.status} onChange={handleChange}>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" rows={2} name="description" value={formData.description} onChange={handleChange} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Vendor</label>
                <input className="form-control" name="vendor" value={formData.vendor} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Employee</label>
                <SearchableSelect options={empOptions} value={formData.employee}
                  onChange={e => setFormData(p => ({ ...p, employee: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner-mini"></span> {mode === 'create' ? 'Creating...' : 'Saving...'}</>
                : mode === 'create' ? 'Create Expense' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ExpenseFormModal;
