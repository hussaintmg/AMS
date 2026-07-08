import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, Pencil, Trash2, User, CalendarDays } from 'lucide-react';
import { leadMasterAPI } from '../../services/api';
import ConfirmModal from '../ConfirmModal';

export default function LeadMasterDrawer({ type, item, onClose, onUpdated }) {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#6b7280', sortOrder: 0, category: 'general', level: 0 });
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const label = { sources: 'Source', types: 'Type', priorities: 'Priority', cities: 'City' }[type] || 'Item';
  const colorVal = item?.color || '#6b7280';

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name || '',
        description: item.description || '',
        color: item.color || '#6b7280',
        sortOrder: item.sortOrder || 0,
        category: item.category || 'general',
        level: item.level ?? 0,
      });
    }
  }, [item]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { if (editMode) setEditMode(false); else onClose(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, editMode]);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const res = await leadMasterAPI.update(type, item._id, form);
      if (res.data?.success) {
        toast.success(res.data.message);
        setEditMode(false);
        if (onUpdated) onUpdated();
      } else {
        toast.error(res.data?.message || 'Update failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await leadMasterAPI.delete(type, item._id);
      if (res.data?.success) {
        toast.success(res.data.message);
        setShowDelete(false);
        if (onUpdated) onUpdated();
        onClose();
      } else {
        toast.error(res.data?.message || 'Delete failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (!item) return null;

  const DetailRow = ({ label: lbl, value }) => (
    <div className="drawer-detail-row">
      <div className="drawer-detail-content">
        <span className="drawer-detail-label">{lbl}</span>
        <span className="drawer-detail-value">{value ?? '-'}</span>
      </div>
    </div>
  );

  return (
    <div className="drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) { if (editMode) setEditMode(false); else onClose(); } }}>
      <div className="drawer-panel">
        <div className="drawer-header">
          <div>
            <h3>{item.name}</h3>
            <span className="lead-no">{label}</span>
          </div>
          <div className="drawer-header-actions">
            {!editMode && (
              <button className="btn-icon edit" title="Edit" onClick={() => setEditMode(true)}><Pencil size={18} /></button>
            )}
            <button className="btn-icon delete" title="Delete" onClick={() => setShowDelete(true)}><Trash2 size={18} /></button>
            <button className="modal-close" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        <div className="drawer-body">
          {editMode ? (
            <div className="drawer-edit-form">
              <div className="form-group">
                <label>Name *</label>
                <input type="text" className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              {type !== 'cities' && (
                <div className="form-group">
                  <label>Description</label>
                  <textarea className="form-input" rows="2" value={form.description} onChange={(e) => set('description', e.target.value)} />
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
              )}
              {type === 'priorities' && (
                <div className="form-group">
                  <label>Level (0-10)</label>
                  <input type="number" className="form-input" value={form.level} onChange={(e) => set('level', Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))} min="0" max="10" />
                </div>
              )}
              <div className="drawer-edit-actions">
                <button className="btn btn-secondary" onClick={() => setEditMode(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          ) : (
            <>
              <DetailRow label="Name" value={item.name} />
              {type !== 'cities' && <DetailRow label="Description" value={item.description} />}
              {type !== 'cities' && (
                <DetailRow label="Sort Order" value={item.sortOrder} />
              )}
              <DetailRow label="Status" value={item.isActive ? 'Active' : 'Inactive'} />
              <DetailRow label="Code" value={item.code} />
              {(type === 'sources' || type === 'priorities' || type === 'types') && (
                <DetailRow label="Color" value={<span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 4, background: colorVal, verticalAlign: 'middle' }} />} />
              )}
              {type === 'types' && <DetailRow label="Category" value={item.category} />}
              {type === 'priorities' && <DetailRow label="Level" value={item.level} />}
              {item.lead_count !== undefined && <DetailRow label="Active Leads" value={item.lead_count} />}

              <div className="drawer-section-group" style={{ marginTop: '1rem' }}>
                <h4 className="drawer-section-title"><CalendarDays size={16} /> Audit</h4>
                <DetailRow label="Created By" value={item.createdBy?.firstName ? `${item.createdBy.firstName} ${item.createdBy.lastName}` : (item.createdByName || '-')} />
                <DetailRow label="Created At" value={item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'} />
                <DetailRow label="Updated By" value={item.updatedBy?.firstName ? `${item.updatedBy.firstName} ${item.updatedBy.lastName}` : (item.updatedByName || '-')} />
                <DetailRow label="Updated At" value={item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'} />
              </div>
            </>
          )}
        </div>

        {showDelete && (
          <ConfirmModal
            isOpen={true}
            title={`Delete ${label}`}
            message={`Are you sure you want to delete "${item.name}"? This cannot be undone if no leads use it.`}
            confirmText={deleting ? 'Deleting...' : 'Delete'}
            cancelText="Cancel"
            type="danger"
            onConfirm={handleDelete}
            onCancel={() => setShowDelete(false)}
          />
        )}
      </div>
    </div>
  );
}
