import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../../hooks/useModalKeyboard';

export default function EmailTemplateFormModal({ isOpen, onClose, mode, initialData, onSubmit, loading }) {
  const [form, setForm] = useState({ templateName: '', subject: '', description: '', status: 'draft', tags: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setForm({ templateName: '', subject: '', description: '', status: 'draft', tags: '' });
    } else if (initialData) {
      setForm({
        templateName: initialData.templateName || initialData.name || '',
        subject: initialData.subject || '',
        description: initialData.description || '',
        status: initialData.status || 'draft',
        tags: Array.isArray(initialData.tags) ? initialData.tags.join(', ') : '',
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  const validate = () => {
    const errs = {};
    if (!form.templateName.trim()) errs.templateName = 'Template name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    const data = { ...form };
    if (data.tags) data.tags = data.tags.split(',').map(s => s.trim()).filter(Boolean);
    onSubmit(data, mode);
  };

  useModalKeyboard(isOpen, onClose, handleSubmit, loading);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>{mode === 'create' ? 'New Template' : 'Edit Template'}</h3>
          <button className="modal-close" onClick={onClose} type="button">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Template Name *</label>
              <input type="text" className={`form-control ${errors.templateName ? 'error' : ''}`} value={form.templateName}
                onChange={e => setForm(p => ({ ...p, templateName: e.target.value }))} placeholder="Enter template name" autoFocus />
              {errors.templateName && <small style={{ color: '#dc2626' }}>{errors.templateName}</small>}
            </div>
            <div className="form-group">
              <label>Subject</label>
              <input type="text" className="form-control" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Email subject line" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Brief description" />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tags (comma-separated)</label>
              <input type="text" className="form-control" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="welcome, onboarding, notification" />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner-mini"></span> Saving...</> : mode === 'create' ? 'Create Template' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
