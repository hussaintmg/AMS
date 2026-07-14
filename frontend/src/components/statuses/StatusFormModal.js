import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import ToggleSwitch from '../../components/ToggleSwitch';

const toSlug = (str) =>
  String(str || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const emptyUsage = { module: '', page: '', field: '', path: '', note: '' };

function StatusFormModal({
  isOpen, onClose, mode, initialData, onSubmit, loading,
}) {
  const [formData, setFormData] = useState({
    name: '', key: '', description: '', isActive: true,
    usage: [{ ...emptyUsage }],
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setFormData({ name: '', key: '', description: '', isActive: true, usage: [{ ...emptyUsage }] });
    } else if (initialData) {
      const usage = (initialData.usage && initialData.usage.length > 0)
        ? initialData.usage.map((u) => ({ ...emptyUsage, ...u }))
        : [{ ...emptyUsage }];
      setFormData({
        name: initialData.name || '',
        key: initialData.key || '',
        description: initialData.description || '',
        isActive: initialData.isActive !== undefined ? !!initialData.isActive : true,
        usage,
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Collection name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    const payload = {
      name: formData.name.trim(),
      key: formData.key.trim() || toSlug(formData.name),
      description: formData.description,
      isActive: formData.isActive,
      usage: formData.usage.filter((u) => u.module || u.page || u.field),
    };

    if (mode === 'edit') {
      payload.key = formData.key.trim();
    }

    onSubmit(payload, mode);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleUsageChange = (index, field, value) => {
    setFormData((prev) => {
      const usage = [...prev.usage];
      usage[index] = { ...usage[index], [field]: value };
      return { ...prev, usage };
    });
  };

  const handleNameBlur = () => {
    if (mode === 'create' && !formData.key.trim() && formData.name.trim()) {
      setFormData((prev) => ({ ...prev, key: toSlug(prev.name) }));
    }
  };

  useModalKeyboard(isOpen, onClose, handleSubmit);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'New Option Collection' : 'Edit Option Collection'}</h2>
          <button className="modal-close" onClick={onClose} type="button">&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text" name="name" value={formData.name}
                  onChange={handleChange} onBlur={handleNameBlur}
                  className={errors.name ? 'form-control error' : 'form-control'}
                  placeholder="e.g. Leads"
                />
                {errors.name && <small style={{ color: '#dc2626' }}>{errors.name}</small>}
              </div>
              <div className="form-group">
                <label>Key</label>
                <input
                  type="text" name="key" value={formData.key}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="Auto-generated from name"
                />
                <small style={{ color: '#94a3b8' }}>Unique identifier; auto-generated if empty</small>
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                name="description" value={formData.description}
                onChange={handleChange} className="form-control" rows="2"
                placeholder="Optional description"
              />
            </div>

            <div className="form-group checkbox-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ToggleSwitch checked={formData.isActive} onChange={(v) => setFormData((prev) => ({ ...prev, isActive: v }))} />
                Active
              </label>
            </div>

            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#475569' }}>Usage Metadata (optional)</h4>
              <small style={{ display: 'block', marginBottom: '12px', color: '#94a3b8' }}>
                Define where this option collection is intended to be used.
              </small>
              <div className="form-row">
                <div className="form-group">
                  <label>Module</label>
                  <input
                    type="text" value={formData.usage[0]?.module || ''}
                    onChange={(e) => handleUsageChange(0, 'module', e.target.value)}
                    className="form-control" placeholder="e.g. CRM"
                  />
                </div>
                <div className="form-group">
                  <label>Page</label>
                  <input
                    type="text" value={formData.usage[0]?.page || ''}
                    onChange={(e) => handleUsageChange(0, 'page', e.target.value)}
                    className="form-control" placeholder="e.g. Leads"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Field</label>
                  <input
                    type="text" value={formData.usage[0]?.field || ''}
                    onChange={(e) => handleUsageChange(0, 'field', e.target.value)}
                    className="form-control" placeholder="e.g. status"
                  />
                </div>
                <div className="form-group">
                  <label>Path</label>
                  <input
                    type="text" value={formData.usage[0]?.path || ''}
                    onChange={(e) => handleUsageChange(0, 'path', e.target.value)}
                    className="form-control" placeholder="e.g. /leads"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Note</label>
                <input
                  type="text" value={formData.usage[0]?.note || ''}
                  onChange={(e) => handleUsageChange(0, 'note', e.target.value)}
                  className="form-control" placeholder="Optional note"
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner-mini"></span> Saving...</> : mode === 'create' ? 'Create Collection' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default StatusFormModal;
