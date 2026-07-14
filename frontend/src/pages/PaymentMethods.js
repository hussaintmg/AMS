import React, { useState, useEffect, useCallback } from 'react';
import { paymentMethodsAPI } from '../services/api';
import toast from 'react-hot-toast';
import { Search, Plus, Package } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import useModalKeyboard from '../hooks/useModalKeyboard';
import '../styles/userManagement.css';

const TYPE_LABELS = {
  cash: 'Cash',
  bank: 'Bank Transfer',
  card: 'Card',
  cheque: 'Cheque',
  online: 'Online Payment',
};

const TYPE_COLORS = {
  cash: '#e8f5e9',
  bank: '#e3f2fd',
  card: '#fff3e0',
  cheque: '#f3e5f5',
  online: '#e0f7fa',
};

function PaymentMethods() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '', code: '', type: 'cash', description: '', sortOrder: 0, isActive: true,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (typeFilter) params.type = typeFilter;
      const res = await paymentMethodsAPI.getAll(params);
      setData(res?.data?.data || []);
    } catch (err) {
      console.error('Error fetching payment methods:', err);
      toast.error('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = data.filter((pm) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (pm.name || '').toLowerCase().includes(q)
      || (pm.code || '').toLowerCase().includes(q)
      || (pm.type || '').toLowerCase().includes(q);
  });

  const openModal = (mode, item = null) => {
    setModalMode(mode);
    setSelectedItem(item);
    if (item && mode === 'edit') {
      setFormData({
        name: item.name || '',
        code: item.code || '',
        type: item.type || 'cash',
        description: item.description || '',
        sortOrder: item.sort_order ?? 0,
        isActive: item.is_active !== undefined ? !!item.is_active : true,
      });
    } else {
      setFormData({ name: '', code: '', type: 'cash', description: '', sortOrder: 0, isActive: true });
    }
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setSelectedItem(null); };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (modalMode === 'edit') {
        await paymentMethodsAPI.update(selectedItem.id, formData);
        toast.success('Payment method updated');
      } else {
        await paymentMethodsAPI.create(formData);
        toast.success('Payment method created');
      }
      closeModal();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save payment method');
    } finally {
      setSaving(false);
    }
  };

  useModalKeyboard(showModal, closeModal, handleSubmit, saving);

  const handleToggleStatus = async (item) => {
    try {
      await paymentMethodsAPI.toggleStatus(item.id);
      toast.success(`Payment method ${item.is_active ? 'deactivated' : 'activated'}`);
      fetchData();
    } catch (err) {
      toast.error('Failed to toggle status');
    }
  };

  const openDeleteConfirm = (item) => {
    setDeleteTarget(item);
    setShowConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await paymentMethodsAPI.delete(deleteTarget.id);
      toast.success('Payment method deleted');
      setShowConfirmDelete(false);
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete payment method');
      setShowConfirmDelete(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="user-management-page">
      <div className="page-header">
        <div>
          <h1>Payment Methods</h1>
          <p className="text-muted">Manage cash, bank, card, cheque, and online payment channels</p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal('create')}>
          <Plus size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          New Payment Method
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 250 }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: 40 }}
            placeholder="Search by name, code, or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-control"
          style={{ width: 180 }}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <span style={{ color: '#64748b', fontSize: 14 }}>{filtered.length} methods</span>
      </div>

      {/* Desktop Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          <div className="table-container desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Sort Order</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No payment methods found</td></tr>
                ) : (
                  filtered.map((pm) => (
                    <tr key={pm.id}>
                      <td><strong>{pm.name}</strong></td>
                      <td style={{ fontFamily: 'monospace', color: '#475569' }}>{pm.code || '-'}</td>
                      <td>
                        <span style={{
                          padding: '4px 12px', borderRadius: 4, fontSize: '0.85rem',
                          backgroundColor: TYPE_COLORS[pm.type] || '#f1f5f9',
                        }}>
                          {TYPE_LABELS[pm.type] || pm.type}
                        </span>
                      </td>
                      <td style={{ color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pm.description || '-'}
                      </td>
                      <td>{pm.sort_order ?? 0}</td>
                      <td>
                        <button
                          className={`badge ${pm.is_active ? 'badge-success' : 'badge-secondary'}`}
                          onClick={() => handleToggleStatus(pm)}
                          style={{ cursor: 'pointer', border: 'none', padding: '6px 12px' }}
                          title={`Click to ${pm.is_active ? 'deactivate' : 'activate'}`}
                        >
                          {pm.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button className="btn-action btn-edit" onClick={() => openModal('edit', pm)} title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                          </button>
                          {(pm.usage_count || 0) === 0 && (
                            <button className="btn-action btn-delete" onClick={() => openDeleteConfirm(pm)} title="Delete">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="mobile-cards-container mobile-only">
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No payment methods found</div>
            ) : (
              filtered.map((pm) => (
                <div key={pm.id} className="user-card">
                  <div className="user-card-field">
                    <span className="field-label">Name</span>
                    <span><strong>{pm.name}</strong></span>
                  </div>
                  <div className="user-card-field">
                    <span className="field-label">Code</span>
                    <span style={{ fontFamily: 'monospace' }}>{pm.code || '-'}</span>
                  </div>
                  <div className="user-card-field">
                    <span className="field-label">Type</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem',
                      backgroundColor: TYPE_COLORS[pm.type] || '#f1f5f9',
                    }}>{TYPE_LABELS[pm.type] || pm.type}</span>
                  </div>
                  <div className="user-card-field">
                    <span className="field-label">Description</span>
                    <span>{pm.description || '-'}</span>
                  </div>
                  <div className="user-card-field">
                    <span className="field-label">Sort Order</span>
                    <span>{pm.sort_order ?? 0}</span>
                  </div>
                  <div className="user-card-field">
                    <span className="field-label">Status</span>
                    <button
                      className={`badge ${pm.is_active ? 'badge-success' : 'badge-secondary'}`}
                      onClick={() => handleToggleStatus(pm)}
                      style={{ cursor: 'pointer', border: 'none', padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      {pm.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                  <div className="card-actions" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-warning" onClick={() => openModal('edit', pm)}>Edit</button>
                    {(pm.usage_count || 0) === 0 && (
                      <button className="btn btn-sm btn-danger" onClick={() => openDeleteConfirm(pm)}>Delete</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>{modalMode === 'create' ? 'Create Payment Method' : 'Edit Payment Method'}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label>Name *</label>
                    <input type="text" className="form-control" value={formData.name}
                      onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                      required placeholder="e.g. Cash" autoFocus />
                  </div>
                  <div className="form-group">
                    <label>Code</label>
                    <input type="text" className="form-control" value={formData.code}
                      onChange={e => setFormData(p => ({ ...p, code: e.target.value }))}
                      placeholder="e.g. CASH" />
                  </div>
                </div>
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                  <div className="form-group">
                    <label>Type *</label>
                    <select className="form-control" value={formData.type}
                      onChange={e => setFormData(p => ({ ...p, type: e.target.value }))}>
                      {Object.entries(TYPE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Sort Order</label>
                    <input type="number" className="form-control" value={formData.sortOrder}
                      onChange={e => setFormData(p => ({ ...p, sortOrder: Number(e.target.value) }))}
                      min={0} />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: 16 }}>
                  <label>Description</label>
                  <textarea className="form-control" rows={2} value={formData.description}
                    onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                    placeholder="Optional description" />
                </div>
                <div className="form-group" style={{ marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={formData.isActive}
                      onChange={e => setFormData(p => ({ ...p, isActive: e.target.checked }))} />
                    Active
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={showConfirmDelete}
        title="Delete Payment Method"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => { setShowConfirmDelete(false); setDeleteTarget(null); }}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}

export default PaymentMethods;
