import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../../hooks/useModalKeyboard';

const toSlug = (str) =>
  String(str || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

function StatusItemFormModal({
  isOpen, onClose, mode, initialData, onSubmit, loading,
}) {
  const [formData, setFormData] = useState({
    label: '', value: '', color: '#3b82f6', description: '',
    order: 0, isDefault: false, isActive: true,
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setFormData({
        label: '', value: '', color: '#3b82f6', description: '',
        order: 0, isDefault: false, isActive: true,
      });
    } else if (initialData) {
      setFormData({
        label: initialData.label || '',
        value: initialData.value || '',
        color: initialData.color || '#3b82f6',
        description: initialData.description || '',
        order: initialData.order ?? 0,
        isDefault: !!initialData.isDefault,
        isActive: initialData.isActive !== undefined ? !!initialData.isActive : true,
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  const validate = () => {
    const errs = {};
    if (!formData.label.trim()) errs.label = 'Status label is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    const payload = {
      label: formData.label.trim(),
      value: formData.value.trim() || toSlug(formData.label),
      color: formData.color,
      description: formData.description,
      order: formData.order,
      isDefault: formData.isDefault,
      isActive: formData.isActive,
    };

    onSubmit(payload, mode);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleLabelBlur = () => {
    if (mode === 'create' && !formData.value.trim() && formData.label.trim()) {
      setFormData((prev) => ({ ...prev, value: toSlug(prev.label) }));
    }
  };

  useModalKeyboard(isOpen, onClose, handleSubmit);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'Add Status' : 'Edit Status'}</h2>
          <button className="modal-close" onClick={onClose} type="button">&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Label *</label>
                <input
                  type="text" name="label" value={formData.label}
                  onChange={handleChange} onBlur={handleLabelBlur}
                  className={errors.label ? 'form-control error' : 'form-control'}
                  placeholder="e.g. New"
                />
                {errors.label && <small style={{ color: '#dc2626' }}>{errors.label}</small>}
              </div>
              <div className="form-group">
                <label>Value</label>
                <input
                  type="text" name="value" value={formData.value}
                  onChange={handleChange} className="form-control"
                  placeholder="Auto-generated from label"
                />
                <small style={{ color: '#94a3b8' }}>Unique within collection; auto-generated if empty</small>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Order</label>
                <input
                  type="number" name="order" value={formData.order}
                  onChange={handleChange} className="form-control" min="0"
                />
              </div>
              <div className="form-group">
                <label>Color</label>
                <div className="color-picker-wrapper">
                  <input type="color" name="color" value={formData.color} onChange={handleChange} />
                  <span style={{ fontSize: '13px', color: '#64748b' }}>{formData.color}</span>
                </div>
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

            <div className="form-row">
              <div className="form-group checkbox-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" name="isDefault" checked={formData.isDefault} onChange={handleChange} />
                  Default status
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" name="isActive" checked={formData.isActive} onChange={handleChange} />
                  Active
                </label>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner-mini"></span> Saving...</> : mode === 'create' ? 'Add Status' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default StatusItemFormModal;
