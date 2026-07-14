import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import { vehicleMasterAPI } from '../../services/api';
import toast from 'react-hot-toast';

function CategoryFormModal({ isOpen, onClose, onCategoryCreated }) {
  const [formData, setFormData] = useState({ name: '', description: '', isActive: true });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormData({ name: '', description: '', isActive: true });
    setErrors({});
    setSaving(false);
  }, [isOpen]);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Category name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await vehicleMasterAPI.createCategory({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isActive: formData.isActive,
      });
      const newCat = res?.data?.data || {};
      toast.success('Category created!');
      if (onCategoryCreated) onCategoryCreated(newCat);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create category';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  useModalKeyboard(isOpen, onClose, handleSubmit, saving);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Create Category</h2>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Category Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData(p => ({ ...p, name: e.target.value }));
                    if (errors.name) setErrors(p => ({ ...p, name: undefined }));
                  }}
                  className={errors.name ? 'form-control error' : 'form-control'}
                  placeholder="e.g. Engine Parts"
                  autoFocus
                />
                {errors.name && <small style={{ color: '#dc2626' }}>{errors.name}</small>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                  className="form-control"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
            </div>
            <div className="form-group checkbox-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(p => ({ ...p, isActive: e.target.checked }))}
                />
                Active Category
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner-mini"></span> Creating...</> : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CategoryFormModal;
