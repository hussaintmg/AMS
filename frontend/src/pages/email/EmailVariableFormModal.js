import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import { emailAPI } from '../../services/api';

export default function EmailVariableFormModal({ isOpen, onClose, mode, initialData, onSubmit, loading }) {
  const [form, setForm] = useState({ name: '', reference: '', defaultValue: '', description: '', category: 'General', isActive: true });
  const [errors, setErrors] = useState({});
  const [referenceOptions, setReferenceOptions] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setForm({ name: '', reference: '', defaultValue: '', description: '', category: 'General', isActive: true });
    } else if (initialData) {
      setForm({
        name: initialData.name || '',
        reference: initialData.reference || '',
        defaultValue: initialData.defaultValue || '',
        description: initialData.description || '',
        category: initialData.category || 'General',
        isActive: initialData.isActive !== false,
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  useEffect(() => {
    if (!isOpen) return;
    emailAPI.searchVariables('')
      .then(r => setReferenceOptions(r.data?.data?.variables || []))
      .catch(() => setReferenceOptions([]));
  }, [isOpen]);

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.reference.trim()) errs.reference = 'Reference is required';
    if (!form.category.trim()) errs.category = 'Category is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const normalizeReference = (value) => String(value || '')
    .trim()
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '')
    .trim()
    .replace(/\s+/g, '');

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    const data = { ...form, name: form.name.trim(), reference: normalizeReference(form.reference) };
    onSubmit(data, mode);
  };

  useModalKeyboard(isOpen, onClose, handleSubmit, loading);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>{mode === 'create' ? 'New Variable' : 'Edit Variable'}</h3>
          <button className="modal-close" onClick={onClose} type="button">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input type="text" className={`form-control ${errors.name ? 'error' : ''}`} value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Company Name" autoFocus />
                {errors.name && <small style={{ color: '#dc2626' }}>{errors.name}</small>}
              </div>
              <div className="form-group">
                <label>Category</label>
                <input type="text" className={`form-control ${errors.category ? 'error' : ''}`} value={form.category}
                  onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Customer" />
                {errors.category && <small style={{ color: '#dc2626' }}>{errors.category}</small>}
              </div>
            </div>
            <div className="form-group">
              <label>Reference *</label>
              <input type="text" className={`form-control ${errors.reference ? 'error' : ''}`} value={form.reference}
                onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} placeholder="e.g. user.email" list="email-variable-reference-options" />
              <datalist id="email-variable-reference-options">
                {referenceOptions.map((item, i) => (
                  <option key={`${item.key || item.name}-${i}`} value={item.key || item.name}>{item.label || item.description || item.key}</option>
                ))}
              </datalist>
              <small style={{ color: '#666' }}>Used as {'{{company.name}}'} in templates</small>
              {errors.reference && <small style={{ color: '#dc2626' }}>{errors.reference}</small>}
            </div>
            <div className="form-group">
              <label>Default Value</label>
              <input type="text" className="form-control" value={form.defaultValue}
                onChange={e => setForm(p => ({ ...p, defaultValue: e.target.value }))} placeholder="Shown in preview when real data is missing" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional description" />
            </div>
            <div className="form-group checkbox-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} />
                Active
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner-mini"></span> Saving...</> : mode === 'create' ? 'Create Variable' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
