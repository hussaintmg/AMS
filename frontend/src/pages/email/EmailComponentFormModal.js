import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../../hooks/useModalKeyboard';

const categories = ['header', 'footer', 'layout', 'content', 'media', 'cta', 'legal', 'custom'];
const PARAMETER_TYPES = ['text', 'textarea', 'number', 'color', 'url', 'image', 'boolean', 'date', 'email', 'phone', 'richtext', 'select'];

export default function EmailComponentFormModal({ isOpen, onClose, mode, initialData, onSubmit, loading }) {
  const [form, setForm] = useState({
    name: '', key: '', category: 'content', description: '',
    html: '<div></div>', css: '', parameters: [], variablesUsed: [], isActive: true,
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setForm({ name: '', key: '', category: 'content', description: '', html: '<div></div>', css: '', parameters: [], variablesUsed: [], isActive: true });
    } else if (initialData) {
      setForm({
        name: initialData.name || '',
        key: initialData.key || '',
        category: initialData.category || 'content',
        description: initialData.description || '',
        html: initialData.html || '',
        css: initialData.css || '',
        parameters: initialData.parameters || [],
        variablesUsed: initialData.variablesUsed || [],
        isActive: initialData.isActive !== false,
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.html.trim()) errs.html = 'HTML is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    const data = {
      ...form,
      parameters: (form.parameters || []).map((param, index) => ({
        ...param,
        key: (param.key || `param_${index + 1}`).trim(),
        name: (param.name || param.label || param.key || `Parameter ${index + 1}`).trim(),
        label: param.label || param.name || param.key || `Parameter ${index + 1}`,
        order: param.order ?? index,
      })),
    };
    if (!data.key && data.name) {
      data.key = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now();
    }
    onSubmit(data, mode);
  };

  const addParameter = () => {
    setForm(p => ({ ...p, parameters: [...p.parameters, { name: '', key: `p_${Date.now()}`, type: 'text', label: '', defaultValue: '', required: false, options: [], placeholder: '', order: p.parameters.length }] }));
  };

  const updateParam = (idx, data) => {
    setForm(p => {
      const params = [...p.parameters];
      params[idx] = { ...params[idx], ...data };
      return { ...p, parameters: params };
    });
  };

  const removeParam = (idx) => {
    setForm(p => ({ ...p, parameters: p.parameters.filter((_, i) => i !== idx) }));
  };

  useModalKeyboard(isOpen, onClose, handleSubmit, loading);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3>{mode === 'create' ? 'New Component' : 'Edit Component'}</h3>
          <button className="modal-close" onClick={onClose} type="button">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input type="text" className={`form-control ${errors.name ? 'error' : ''}`} value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Component name" autoFocus />
                {errors.name && <small style={{ color: '#dc2626' }}>{errors.name}</small>}
              </div>
              <div className="form-group">
                <label>Category</label>
                <select className="form-control" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="form-group">
              <label>HTML *</label>
              <textarea className={`form-control ${errors.html ? 'error' : ''}`} value={form.html}
                onChange={e => setForm(p => ({ ...p, html: e.target.value }))} rows={6} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
              {errors.html && <small style={{ color: '#dc2626' }}>{errors.html}</small>}
            </div>
            <div className="form-group">
              <label>CSS</label>
              <textarea className="form-control" value={form.css} onChange={e => setForm(p => ({ ...p, css: e.target.value }))} rows={3} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </div>

            {/* Parameters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Parameters</label>
              <button type="button" className="btn btn-sm btn-primary" onClick={addParameter}>+ Add</button>
            </div>
            {form.parameters.map((p, i) => (
              <div key={i} style={{ border: '1px solid var(--gray-200)', borderRadius: 6, padding: 8, marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <input className="form-control" style={{ flex: 1, fontSize: '0.75rem' }} placeholder="Key" value={p.key}
                    onChange={e => updateParam(i, { key: e.target.value })} />
                  <select className="form-control" style={{ width: 100, fontSize: '0.75rem' }} value={p.type}
                    onChange={e => updateParam(i, { type: e.target.value })}>
                    {PARAMETER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" className="btn btn-sm btn-danger" style={{ padding: '2px 6px' }} onClick={() => removeParam(i)}>&times;</button>
                </div>
                <input className="form-control" style={{ fontSize: '0.75rem' }} placeholder="Name/Label" value={p.name}
                  onChange={e => updateParam(i, { name: e.target.value })} />
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <input className="form-control" style={{ flex: 1, fontSize: '0.75rem' }} placeholder="Default value"
                    value={p.defaultValue || ''} onChange={e => updateParam(i, { defaultValue: e.target.value })} />
                  <label style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <input type="checkbox" checked={p.required} onChange={e => updateParam(i, { required: e.target.checked })} /> Req
                  </label>
                </div>
                {p.type === 'select' && (
                  <input className="form-control" style={{ fontSize: '0.75rem', marginTop: 4 }} placeholder="Option1, Option2"
                    value={(p.options || []).join(', ')} onChange={e => updateParam(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                )}
              </div>
            ))}

            <div className="form-group" style={{ marginTop: 8 }}>
              <label>Variables Used (comma-separated)</label>
              <input type="text" className="form-control" value={form.variablesUsed.join(', ')}
                onChange={e => setForm(p => ({ ...p, variablesUsed: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} />
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
              {loading ? <><span className="spinner-mini"></span> Saving...</> : mode === 'create' ? 'Create Component' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
