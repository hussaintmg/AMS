import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { leadMasterAPI } from '../../services/api';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import modalSubmit from '../../utils/modalForm';
import ModalPortal from '../ModalPortal';

const LEAD_TYPE_MAPPING_OPTIONS = [
  { value: 'parts', label: 'Parts' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'services', label: 'Services' },
];

const LABEL_MAP = { sources: 'Source', types: 'Type', priorities: 'Priority', cities: 'City' };

export default function LeadMasterModal({ type, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', description: '', color: '#6b7280', sortOrder: 0, category: 'general', level: 0, portalModules: [] });
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);

  useModalKeyboard(true, onClose, () => formRef.current?.requestSubmit());

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const togglePortalModule = (value) => {
    setForm((prev) => ({
      ...prev,
      portalModules: prev.portalModules.includes(value)
        ? prev.portalModules.filter((m) => m !== value)
        : [...prev.portalModules, value],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (type === 'cities' || type === 'sources') delete payload.category;
      if (type !== 'priorities') delete payload.level;
      if (type !== 'types') delete payload.portalModules;
      if (type === 'cities') delete payload.color;
      const res = await leadMasterAPI.create(type, payload);
      if (res.data?.success) {
        toast.success(res.data.message);
        if (onSaved) onSaved(res.data.data);
        onClose();
      } else {
        toast.error(res.data?.message || 'Operation failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const label = LABEL_MAP[type] || 'Item';

  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal-content">
          <div className="modal-header">
            <h3>Create {label}</h3>
            <button className="modal-close" onClick={onClose}><X size={24} /></button>
          </div>
          <form ref={formRef} onSubmit={modalSubmit(handleSubmit)}>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input type="text" className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Enter name" />
              </div>
              {type !== 'cities' && (
                <div className="form-group">
                  <label>Description</label>
                  <textarea className="form-input" rows="2" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional description" />
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>Sort Order</label>
                  <input type="number" className="form-input" value={form.sortOrder} onChange={(e) => set('sortOrder', parseInt(e.target.value) || 0)} />
                </div>
                {(type === 'sources' || type === 'priorities' || type === 'types') && (
                  <div className="form-group">
                    <label>Color</label>
                    <input type="color" className="form-input" value={form.color} onChange={(e) => set('color', e.target.value)} style={{ height: '42px', padding: '4px' }} />
                  </div>
                )}
              </div>
              {type === 'types' && (
                <>
                  <div className="form-group">
                    <label>Category</label>
                    <select className="form-input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                      <option value="vehicle">Vehicle</option>
                      <option value="service">Service</option>
                      <option value="parts">Parts</option>
                      <option value="general">General</option>
                      <option value="corporate">Corporate</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Lead Type Mapping</label>
                    <div className="mapping-checkbox-grid">
                      {LEAD_TYPE_MAPPING_OPTIONS.map((option) => (
                        <label key={option.value} className="mapping-checkbox">
                          <input
                            type="checkbox"
                            checked={form.portalModules.includes(option.value)}
                            onChange={() => togglePortalModule(option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {type === 'priorities' && (
                <div className="form-group">
                  <label>Level (0-10)</label>
                  <input type="number" className="form-input" value={form.level} onChange={(e) => set('level', Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))} min="0" max="10" />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <><span className="spinner-mini"></span> Saving...</> : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
