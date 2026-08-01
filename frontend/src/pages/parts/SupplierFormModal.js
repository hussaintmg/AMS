import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import { vehicleMasterAPI } from '../../services/api';
import toast from 'react-hot-toast';

function SupplierFormModal({ isOpen, onClose, onSupplierCreated }) {
  const [formData, setFormData] = useState({
    supplierCode: '', name: '', type: 'oem', contactPerson: '',
    email: '', phone: '', isActive: true,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      supplierCode: '', name: '', type: 'oem', contactPerson: '',
      email: '', phone: '', isActive: true,
    });
    setErrors({});
    setSaving(false);
  }, [isOpen]);

  const validate = () => {
    const errs = {};
    if (!formData.supplierCode.trim()) errs.supplierCode = 'Supplier code is required';
    if (!formData.name.trim()) errs.name = 'Supplier name is required';
    if (!formData.type) errs.type = 'Supplier type is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await vehicleMasterAPI.createSupplier({
        supplierCode: formData.supplierCode.trim(),
        name: formData.name.trim(),
        type: formData.type,
        contactPerson: formData.contactPerson.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        isActive: formData.isActive,
      });
      const newSup = res?.data?.data || {};
      toast.success('Supplier created!');
      if (onSupplierCreated) onSupplierCreated(newSup);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create supplier';
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
          <h2>Create Supplier</h2>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Supplier Code *</label>
                <input
                  type="text"
                  value={formData.supplierCode}
                  onChange={(e) => {
                    setFormData(p => ({ ...p, supplierCode: e.target.value }));
                    if (errors.supplierCode) setErrors(p => ({ ...p, supplierCode: undefined }));
                  }}
                  className={errors.supplierCode ? 'form-control error' : 'form-control'}
                  placeholder="e.g. SUP-001"
                  autoFocus
                />
                {errors.supplierCode && <small style={{ color: '#dc2626' }}>{errors.supplierCode}</small>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Supplier Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData(p => ({ ...p, name: e.target.value }));
                    if (errors.name) setErrors(p => ({ ...p, name: undefined }));
                  }}
                  className={errors.name ? 'form-control error' : 'form-control'}
                  placeholder="e.g. Toyota Pakistan"
                />
                {errors.name && <small style={{ color: '#dc2626' }}>{errors.name}</small>}
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select
                  value={formData.type}
                  onChange={(e) => {
                    setFormData(p => ({ ...p, type: e.target.value }));
                    if (errors.type) setErrors(p => ({ ...p, type: undefined }));
                  }}
                  className={errors.type ? 'form-control error' : 'form-control'}
                >
                  <option value="oem">OEM (Manufacturer)</option>
                  <option value="distributor">Distributor</option>
                  <option value="local_vendor">Local Vendor</option>
                </select>
                {errors.type && <small style={{ color: '#dc2626' }}>{errors.type}</small>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Contact Person</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData(p => ({ ...p, contactPerson: e.target.value }))}
                  className="form-control"
                  placeholder="Person name"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                  className="form-control"
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                  className="form-control"
                  placeholder="+92 300 1234567"
                />
              </div>
              <div className="form-group checkbox-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(p => ({ ...p, isActive: e.target.checked }))}
                  />
                  Active Supplier
                </label>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner-mini"></span> Creating...</> : 'Create Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SupplierFormModal;
