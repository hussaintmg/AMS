import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import SearchableSelect from '../../components/SearchableSelect';
import { useEmailTemplatesContext } from '../../context/EmailTemplatesContext';
import { emailAPI } from '../../services/api';

export default function EmailUsageFormModal({ isOpen, onClose, mode, initialData, onSubmit, loading }) {
  const { templates, loadTemplates } = useEmailTemplatesContext();
  const [form, setForm] = useState({ key: '', name: '', description: '', template: '', variableMappings: [], isActive: true });
  const [errors, setErrors] = useState({});
  const [quickCreateTemplate, setQuickCreateTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  useEffect(() => {
    if (isOpen) loadTemplates();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setForm({ key: '', name: '', description: '', template: '', variableMappings: [], isActive: true });
    } else if (initialData) {
      setForm({
        key: initialData.key || '',
        name: initialData.name || '',
        description: initialData.description || '',
        template: initialData.template?._id || initialData.template || '',
        variableMappings: initialData.variableMappings || [],
        isActive: initialData.isActive !== false,
      });
    }
    setErrors({});
    setQuickCreateTemplate(false);
    setNewTemplateName('');
  }, [isOpen, mode, initialData]);

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.key.trim()) errs.key = 'Key is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    const data = { ...form, template: form.template || null };
    onSubmit(data, mode);
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) { toast.error('Template name is required'); return; }
    try {
      const r = await emailAPI.createTemplate({ templateName: newTemplateName.trim(), status: 'draft' });
      const newTpl = r.data?.data?.template || r.data?.data;
      if (newTpl?._id) {
        setForm(p => ({ ...p, template: newTpl._id }));
        toast.success('Template created');
      }
      setQuickCreateTemplate(false);
      setNewTemplateName('');
      loadTemplates();
    } catch (e) {
      toast.error('Failed to create template');
    }
  };

  useModalKeyboard(isOpen, onClose, handleSubmit, loading);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>{mode === 'create' ? 'New Usage' : 'Edit Usage'}</h3>
          <button className="modal-close" onClick={onClose} type="button">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Name *</label>
              <input type="text" className={`form-control ${errors.name ? 'error' : ''}`} value={form.name}
                onChange={e => { const v = e.target.value; setForm(p => ({ ...p, name: v, key: p.key || v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') })); }}
                placeholder="Usage name" autoFocus />
              {errors.name && <small style={{ color: '#dc2626' }}>{errors.name}</small>}
            </div>
            <div className="form-group">
              <label>Key *</label>
              <input type="text" className={`form-control ${errors.key ? 'error' : ''}`} value={form.key}
                onChange={e => setForm(p => ({ ...p, key: e.target.value }))} placeholder="auto-generated from name" />
              {errors.key && <small style={{ color: '#dc2626' }}>{errors.key}</small>}
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="form-group">
              <label>Template</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <SearchableSelect
                    name="template"
                    value={form.template}
                    onChange={e => setForm(p => ({ ...p, template: e.target.value }))}
                    placeholder="Select template (optional)"
                  >
                    <option value="">No Template</option>
                    {(Array.isArray(templates) ? templates : []).filter(t => t.isActive).map(t => (
                      <option key={t._id} value={t._id}>{t.templateName || t.name}</option>
                    ))}
                  </SearchableSelect>
                </div>
                {!quickCreateTemplate ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQuickCreateTemplate(true)} style={{ whiteSpace: 'nowrap' }}>+ New</button>
                ) : (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="text" className="form-control" style={{ width: 120, fontSize: '0.8rem' }}
                      value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)}
                      placeholder="Template name" autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTemplate(); } if (e.key === 'Escape') { setQuickCreateTemplate(false); setNewTemplateName(''); } }} />
                    <button type="button" className="btn btn-sm btn-primary" onClick={handleCreateTemplate}>Add</button>
                  </div>
                )}
              </div>
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
              {loading ? <><span className="spinner-mini"></span> Saving...</> : mode === 'create' ? 'Create Usage' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
