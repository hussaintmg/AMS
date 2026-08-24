import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import useModalKeyboard from '../../hooks/useModalKeyboard';
import { adminAPI } from '../../services/api';
import modalSubmit from '../../utils/modalForm';
import ModalPortal from '../ModalPortal';

const toSlug = (str) =>
  String(str || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

export default function LeadStatusItemModal({ collectionId, collectionName, onClose, onCreated }) {
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [autoValue, setAutoValue] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const inputRef = useRef();

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleLabelChange = (e) => {
    const newLabel = e.target.value;
    setLabel(newLabel);
    if (autoValue) {
      setValue(toSlug(newLabel));
    }
    if (errors.label) setErrors((p) => ({ ...p, label: undefined }));
  };

  const handleValueChange = (e) => {
    setAutoValue(false);
    setValue(e.target.value);
    if (errors.value) setErrors((p) => ({ ...p, value: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!label.trim()) errs.label = 'Status label is required';
    if (!value.trim()) errs.value = 'Status value is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const { data } = await adminAPI.createStatusCollectionItem(collectionId, {
        label: label.trim(),
        value: value.trim(),
        color: color || undefined,
      });
      if (data?.success) {
        toast.success('Status created');
        if (onCreated) onCreated(data.data);
        onClose();
      } else {
        toast.error(data?.message || 'Failed to create status');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create status');
    } finally {
      setSaving(false);
    }
  };

  useModalKeyboard(true, onClose, handleSubmit, saving);

  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal-content" style={{ maxWidth: '420px' }}>
          <div className="modal-header">
            <h3>Create Status Item</h3>
            <button className="modal-close" onClick={onClose}><X size={20} /></button>
          </div>
          <form onSubmit={modalSubmit(handleSubmit)}>
            <div className="modal-body">
              {collectionName && (
                <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '12px' }}>
                  Collection: <strong>{collectionName}</strong>
                </p>
              )}
              <div className="form-group">
                <label>Label *</label>
                <input
                  ref={inputRef}
                  type="text"
                  className={`form-input${errors.label ? ' error' : ''}`}
                  value={label}
                  onChange={handleLabelChange}
                  placeholder="e.g. New, Waiting, Qualified"
                />
                {errors.label && <small className="field-error">{errors.label}</small>}
              </div>
              <div className="form-group">
                <label>Value</label>
                <input
                  type="text"
                  className={`form-input${errors.value ? ' error' : ''}`}
                  value={value}
                  onChange={handleValueChange}
                  placeholder="Auto-generated from label"
                />
                {errors.value && <small className="field-error">{errors.value}</small>}
                <small style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                  Leave blank to auto-generate from label
                </small>
              </div>
              <div className="form-group">
                <label>Color</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ width: '40px', height: '36px', padding: '2px', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{color}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !label.trim()}>
                {saving ? 'Creating...' : 'Create Status'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
