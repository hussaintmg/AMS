import React, { useState, useEffect } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import useModalKeyboard from '../hooks/useModalKeyboard';

const GROUP_OPTIONS = [
  { value: 'workshop', label: 'Workshop' },
  { value: 'general', label: 'General' },
  { value: 'salary', label: 'Salary' },
];

function CategoryFormModal({ isOpen, mode, initialData, onClose, onSubmit, loading }) {
  const [formData, setFormData] = useState({ name: '', code: '', categoryGroup: 'general' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setFormData({ name: '', code: '', categoryGroup: 'general' });
    } else if (initialData) {
      setFormData({
        name: initialData.name || '',
        code: initialData.code || '',
        categoryGroup: initialData.categoryGroup || 'general',
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (!formData.code.trim()) errs.code = 'Code is required';
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => { if (e) e.preventDefault(); if (!validate()) return; onSubmit(formData); };
  const handleChange = (e) => { const { name, value } = e.target; setFormData(p => ({ ...p, [name]: value })); if (errors[name]) setErrors(p => ({ ...p, [name]: undefined })); };

  useModalKeyboard(isOpen, onClose, handleSubmit, loading);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'New Category' : 'Edit Category'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input className="form-control" name="name" value={formData.name} onChange={handleChange} required autoFocus />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
              <div className="form-group">
                <label>Code *</label>
                <input className="form-control" name="code" value={formData.code} onChange={handleChange}
                  required disabled={mode === 'edit'} />
                {errors.code && <span className="field-error">{errors.code}</span>}
              </div>
            </div>
            <div className="form-group">
              <label>Category Group</label>
              <select className="form-control" name="categoryGroup" value={formData.categoryGroup} onChange={handleChange}>
                {GROUP_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner-mini"></span> {mode === 'create' ? 'Creating...' : 'Saving...'}</>
                : mode === 'create' ? 'Create Category' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CategoryFormModal;
