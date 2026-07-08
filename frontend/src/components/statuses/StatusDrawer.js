import React, { useState, useEffect, useRef } from 'react';
import ConfirmModal from '../ConfirmModal';
import StatusItemFormModal from './StatusItemFormModal';

function StatusDrawer({
  isOpen, onClose, collection, statusItems,
  onSaveCollection, onDeleteCollection,
  onCreateItem, onUpdateItem, onDeleteItem, onToggleItem, onSetDefault,
  saving,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', key: '', description: '', isActive: true, usage: [] });
  const [errors, setErrors] = useState({});

  // Item modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemModalMode, setItemModalMode] = useState('create');
  const [editingItem, setEditingItem] = useState(null);

  // Confirm modals
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteItemConfirm, setDeleteItemConfirm] = useState(null);

  // Reset all internal state when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setShowItemModal(false);
      setEditingItem(null);
      setShowDeleteConfirm(false);
      setDeleteItemConfirm(null);
      return;
    }
    if (isEditing && collection) {
      const usage = (collection.usage && collection.usage.length > 0)
        ? collection.usage.map((u) => ({ ...u }))
        : [{ module: '', page: '', field: '', path: '', note: '' }];
      setEditForm({
        name: collection.name || '',
        key: collection.key || '',
        description: collection.description || '',
        isActive: collection.isActive !== undefined ? !!collection.isActive : true,
        usage,
      });
      setErrors({});
    }
  }, [isOpen, isEditing, collection]);

  // Keyboard: ESC close/cancel, Enter save
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (isEditing) { setIsEditing(false); return; }
        onClose();
        return;
      }
      if (e.key === 'Enter' && isEditing && !e.shiftKey) {
        const tag = e.target?.tagName;
        if (tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handleSaveRef.current(e);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isEditing, onClose]);

  const validate = () => {
    const errs = {};
    if (!editForm.name?.trim()) errs.name = 'Name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    await onSaveCollection(collection._id || collection.id, editForm);
    setIsEditing(false);
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const handleFieldChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleUsageChange = (index, field, value) => {
    setEditForm((prev) => {
      const usage = [...prev.usage];
      usage[index] = { ...usage[index], [field]: value };
      return { ...prev, usage };
    });
  };

  const handleDelete = async () => {
    await onDeleteCollection(collection._id || collection.id);
    setShowDeleteConfirm(false);
  };

  const handleAddItem = () => {
    setItemModalMode('create');
    setEditingItem(null);
    setShowItemModal(true);
  };

  const handleEditItem = (item) => {
    setItemModalMode('edit');
    setEditingItem(item);
    setShowItemModal(true);
  };

  const handleItemSubmit = async (data, mode) => {
    const collId = collection._id || collection.id;
    if (mode === 'create') {
      await onCreateItem(collId, data);
    } else if (editingItem) {
      await onUpdateItem(editingItem._id || editingItem.id, data);
    }
    setShowItemModal(false);
    setEditingItem(null);
  };

  const handleDeleteItemConfirm = async () => {
    if (!deleteItemConfirm) return;
    await onDeleteItem(deleteItemConfirm._id || deleteItemConfirm.id);
    setDeleteItemConfirm(null);
  };

  if (!isOpen) return null;

  const itemCount = statusItems?.length || 0;

  return (
    <>
      <div className="dept-drawer-overlay" onClick={onClose}>
        <div className="dept-drawer" onClick={(e) => e.stopPropagation()}>
          {/* ── Header ── */}
          <div className="dept-drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {collection?.name || 'Collection'}
              </h2>
              <span className={`badge ${collection?.isActive ? 'badge-active' : 'badge-inactive'}`}>
                {collection?.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="dept-drawer-actions-bar">
              {!isEditing ? (
                <>
                  <button className="btn btn-sm btn-secondary" onClick={() => setIsEditing(true)} type="button">Edit</button>
                  <button className="btn btn-sm btn-delete" onClick={() => setShowDeleteConfirm(true)} type="button">Delete</button>
                </>
              ) : (
                <>
                  <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving} type="button">
                    {saving ? 'Saving...' : 'Update'}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setIsEditing(false)} type="button">Cancel</button>
                </>
              )}
              <button className="dept-drawer-close" onClick={onClose} type="button">&times;</button>
            </div>
          </div>

          <div className="dept-drawer-body">
            {/* ── Collection Details ── */}
            <div className="dept-drawer-section">
              <h4>Collection Details</h4>
              <div className="dept-detail-grid">
                {isEditing ? (
                  <>
                    <div className="form-group">
                      <label>Name *</label>
                      <input type="text" name="name" value={editForm.name} onChange={handleFieldChange}
                        className={errors.name ? 'form-control error' : 'form-control'} />
                      {errors.name && <small style={{ color: '#dc2626' }}>{errors.name}</small>}
                    </div>
                    <div className="form-group">
                      <label>Key</label>
                      <input type="text" name="key" value={editForm.key} onChange={handleFieldChange} className="form-control" />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Description</label>
                      <textarea name="description" value={editForm.description} onChange={handleFieldChange} className="form-control" rows="2" />
                    </div>
                    <div className="form-group checkbox-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" name="isActive" checked={editForm.isActive} onChange={handleFieldChange} />
                        Active
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="dept-detail-row">
                      <span className="dept-detail-label">Name</span>
                      <span className="dept-detail-value">{collection?.name || '-'}</span>
                    </div>
                    <div className="dept-detail-row">
                      <span className="dept-detail-label">Key</span>
                      <span className="dept-detail-value">{collection?.key || '-'}</span>
                    </div>
                    <div className="dept-detail-row">
                      <span className="dept-detail-label">Description</span>
                      <span className="dept-detail-value">{collection?.description || '-'}</span>
                    </div>
                    <div className="dept-detail-row">
                      <span className="dept-detail-label">Status Items</span>
                      <span className="dept-detail-value">{itemCount}</span>
                    </div>
                    <div className="dept-detail-row">
                      <span className="dept-detail-label">Created</span>
                      <span className="dept-detail-value">{collection?.createdAt ? new Date(collection.createdAt).toLocaleDateString() : '-'}</span>
                    </div>
                    <div className="dept-detail-row">
                      <span className="dept-detail-label">Updated</span>
                      <span className="dept-detail-value">{collection?.updatedAt ? new Date(collection.updatedAt).toLocaleDateString() : '-'}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Usage Section ── */}
            <div className="dept-drawer-section">
              <h4>Usage</h4>
              <small style={{ display: 'block', marginBottom: '12px', color: '#94a3b8' }}>
                Where this status collection is intended to be used.
              </small>
              <div className="dept-detail-grid">
                {isEditing ? (
                  <>
                    <div className="form-group">
                      <label>Module</label>
                      <input type="text" value={editForm.usage[0]?.module || ''}
                        onChange={(e) => handleUsageChange(0, 'module', e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group">
                      <label>Page</label>
                      <input type="text" value={editForm.usage[0]?.page || ''}
                        onChange={(e) => handleUsageChange(0, 'page', e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group">
                      <label>Field</label>
                      <input type="text" value={editForm.usage[0]?.field || ''}
                        onChange={(e) => handleUsageChange(0, 'field', e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group">
                      <label>Path</label>
                      <input type="text" value={editForm.usage[0]?.path || ''}
                        onChange={(e) => handleUsageChange(0, 'path', e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Note</label>
                      <input type="text" value={editForm.usage[0]?.note || ''}
                        onChange={(e) => handleUsageChange(0, 'note', e.target.value)} className="form-control" />
                    </div>
                  </>
                ) : (
                  (collection?.usage && collection.usage.length > 0 && collection.usage[0]?.module) ? (
                    <>
                      <div className="dept-detail-row">
                        <span className="dept-detail-label">Module</span>
                        <span className="dept-detail-value">{collection.usage[0].module || '-'}</span>
                      </div>
                      <div className="dept-detail-row">
                        <span className="dept-detail-label">Page</span>
                        <span className="dept-detail-value">{collection.usage[0].page || '-'}</span>
                      </div>
                      <div className="dept-detail-row">
                        <span className="dept-detail-label">Field</span>
                        <span className="dept-detail-value">{collection.usage[0].field || '-'}</span>
                      </div>
                      <div className="dept-detail-row">
                        <span className="dept-detail-label">Path</span>
                        <span className="dept-detail-value">{collection.usage[0].path || '-'}</span>
                      </div>
                      <div className="dept-detail-row">
                        <span className="dept-detail-label">Note</span>
                        <span className="dept-detail-value">{collection.usage[0].note || '-'}</span>
                      </div>
                    </>
                  ) : (
                    <div className="dept-detail-row">
                      <span className="dept-detail-label" style={{ gridColumn: '1 / -1', color: '#94a3b8' }}>No usage metadata defined</span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* ── Status Items Section ── */}
            <div className="dept-drawer-section">
              <div className="section-header" style={{ marginBottom: '16px', paddingBottom: '12px' }}>
                <h4 style={{ margin: 0 }}>Status Items ({itemCount})</h4>
                <button className="btn btn-primary btn-sm" onClick={handleAddItem} type="button">+ Add Status</button>
              </div>

              {itemCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                  No status items yet. Click "Add Status" to create one.
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="desktop-only" style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}></th>
                          <th>Label</th>
                          <th>Value</th>
                          <th style={{ width: '60px' }}>Order</th>
                          <th style={{ width: '80px' }}>Default</th>
                          <th style={{ width: '80px' }}>Status</th>
                          <th style={{ width: '140px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(statusItems || []).map((item) => (
                          <tr key={item._id || item.id} className={!item.isActive ? 'inactive-row' : ''}>
                            <td>
                              <span style={{
                                display: 'inline-block', width: '20px', height: '20px',
                                borderRadius: '50%', background: item.color || '#3b82f6',
                                verticalAlign: 'middle',
                              }}></span>
                            </td>
                            <td>{item.label}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{item.value}</td>
                            <td>{item.order}</td>
                            <td>{item.isDefault ? <span className="badge badge-active">Default</span> : '-'}</td>
                            <td>
                              <span className={`badge ${item.isActive ? 'badge-active' : 'badge-inactive'}`}>
                                {item.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <div className="action-buttons">
                                <button className="btn-action btn-edit" onClick={() => handleEditItem(item)} title="Edit">&#9998;</button>
                                <button className="btn-action" onClick={() => onToggleItem(item._id || item.id)}
                                  title={item.isActive ? 'Deactivate' : 'Activate'}>
                                  {item.isActive ? '\u{1F4A4}' : '\u{2705}'}
                                </button>
                                {!item.isDefault && (
                                  <button className="btn-action" onClick={() => onSetDefault(item._id || item.id)}
                                    title="Set as default" style={{ fontSize: '14px', color: '#f59e0b' }}>&#9733;</button>
                                )}
                                <button className="btn-action btn-delete" onClick={() => setDeleteItemConfirm(item)} title="Delete">&#128465;</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="mobile-only">
                    <div className="status-items-cards">
                      {(statusItems || []).map((item) => (
                        <div key={item._id || item.id} className={`status-item-card ${!item.isActive ? 'inactive' : ''}`}>
                          <div className="status-item-card-header">
                            <span style={{
                              display: 'inline-block', width: '16px', height: '16px',
                              borderRadius: '50%', background: item.color || '#3b82f6',
                            }}></span>
                            <strong>{item.label}</strong>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}>{item.value}</span>
                            {item.isDefault && <span className="badge badge-active" style={{ fontSize: '10px' }}>Default</span>}
                            <span className={`badge ${item.isActive ? 'badge-active' : 'badge-inactive'}`} style={{ fontSize: '10px' }}>
                              {item.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="status-item-card-actions">
                            <button className="btn btn-sm btn-secondary" onClick={() => handleEditItem(item)}>Edit</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => onToggleItem(item._id || item.id)}>
                              {item.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            {!item.isDefault && (
                              <button className="btn btn-sm btn-secondary" onClick={() => onSetDefault(item._id || item.id)}>
                                Set Default
                              </button>
                            )}
                            <button className="btn btn-sm btn-delete" onClick={() => setDeleteItemConfirm(item)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status Item Modal ── */}
      {showItemModal && (
        <StatusItemFormModal
          isOpen={showItemModal}
          onClose={() => { setShowItemModal(false); setEditingItem(null); }}
          mode={itemModalMode}
          initialData={editingItem}
          onSubmit={handleItemSubmit}
          loading={saving}
        />
      )}

      {/* ── Delete Collection Confirm ── */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Status Collection"
        message={`Are you sure you want to delete "${collection?.name}"? Its statuses will be deactivated.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      {/* ── Delete Item Confirm ── */}
      <ConfirmModal
        isOpen={!!deleteItemConfirm}
        title="Delete Status Item"
        message={`Are you sure you want to delete "${deleteItemConfirm?.label}"?`}
        onConfirm={handleDeleteItemConfirm}
        onCancel={() => setDeleteItemConfirm(null)}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </>
  );
}

export default StatusDrawer;
