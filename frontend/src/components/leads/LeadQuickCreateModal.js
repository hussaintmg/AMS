import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { leadMasterAPI } from '../../services/api';

const LABEL_MAP = { sources: 'Source', types: 'Type', priorities: 'Priority', cities: 'City' };

export default function LeadQuickCreateModal({ type, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const { data } = await leadMasterAPI.create(type, { name: name.trim() });
      if (data?.success) {
        toast.success(data.message);
        if (onCreated) onCreated(data.data);
        onClose();
      } else {
        toast.error(data?.message || 'Failed to create');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const label = LABEL_MAP[type] || type?.slice(0, -1) || 'Item';

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3>Create {label}</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Name *</label>
              <input
                ref={inputRef}
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Enter ${label.toLowerCase()} name`}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
