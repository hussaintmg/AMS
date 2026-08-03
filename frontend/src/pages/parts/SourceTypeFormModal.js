import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import { partsAPI } from '../../services/api';
import toast from 'react-hot-toast';

// Lets the dealer manage their own part sources (beyond Manufacturer / 3rd Party)
// straight from the parts list or the Add Part form; new types show up as tabs.
// Passing `sourceType` switches the modal to edit mode for that type.
function SourceTypeFormModal({ isOpen, onClose, onSourceTypeCreated, sourceType = null, onSourceTypeUpdated }) {
  const isEdit = Boolean(sourceType?.id);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      name: sourceType?.name || '',
      description: sourceType?.description || '',
    });
    setErrors({});
    setSaving(false);
  }, [isOpen, sourceType]);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Source type name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
      };
      if (isEdit) {
        const res = await partsAPI.updateSourceType(sourceType.id, payload);
        toast.success('Source type updated!');
        if (onSourceTypeUpdated) onSourceTypeUpdated(res?.data?.data || {});
      } else {
        const res = await partsAPI.createSourceType({
          ...payload,
          description: payload.description || undefined,
        });
        toast.success('Source type created!');
        if (onSourceTypeCreated) onSourceTypeCreated(res?.data?.data || {});
      }
      onClose();
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          `Failed to ${isEdit ? 'update' : 'create'} source type`,
      );
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
          <h2>{isEdit ? 'Edit Source Type' : 'Create Source Type'}</h2>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Source Type Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, name: e.target.value }));
                    if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                  }}
                  className={errors.name ? 'form-control error' : 'form-control'}
                  placeholder="e.g. Local Vendor, Imported, Refurbished"
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
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  className="form-control"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
            </div>
            <small style={{ color: '#64748b' }}>
              {isEdit
                ? 'Renaming only changes the label — parts already on this source type stay where they are.'
                : 'New source types appear as a tab on the parts list and as an option on every part.'}
            </small>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? <><span className="spinner-mini"></span> {isEdit ? 'Saving...' : 'Creating...'}</>
                : (isEdit ? 'Save Changes' : 'Create Source Type')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SourceTypeFormModal;
