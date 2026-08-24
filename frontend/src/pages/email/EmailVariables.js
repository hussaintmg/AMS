import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { emailAPI } from '../../services/api';
import { useEmailVariablesContext } from '../../context/EmailVariablesContext';
import ConfirmModal from '../../components/ConfirmModal';
import EmailDrawer from '../../components/EmailDrawer';
import EmailVariableFormModal from './EmailVariableFormModal';
import EmailBulkImportModal from './EmailBulkImportModal';
import { pageActions } from '../../utils/roleJobs';
import { useAuth } from '../../context/AuthContext';

export default function EmailVariables() {
  // Every write on the email screens is one of this page's grants (Role Jobs →
  // Email Templates). They were drawn for anyone who could open the screen, and
  // the server refused each one.
  const can = pageActions(useAuth().user, 'email_templates');
  const { variables, loadVariables, addVariable, updateVariable, removeVariable } = useEmailVariablesContext();
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState('create');
  const [initialData, setInitialData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [detailItem, setDetailItem] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [categories, setCategories] = useState([]);
  const [actionLoading, setActionLoading] = useState('');
  const limit = 20;

  useEffect(() => { loadVariables({ page, limit }); }, [page]);

  useEffect(() => {
    const unsub = setTimeout(() => {
      loadVariables({ page: 1, limit, search: search || undefined, category: filterCategory || undefined, isActive: filterStatus !== 'all' ? filterStatus : undefined });
    }, 300);
    return () => clearTimeout(unsub);
  }, [search, filterCategory, filterStatus]);

  useEffect(() => {
    const cats = [...new Set(variables.map(v => v.category).filter(Boolean))];
    setCategories(cats);
    setTotal(variables.length);
  }, [variables]);

  const handleSubmit = useCallback(async (data, m) => {
    setSaving(true);
    if (m === 'edit') {
      const prev = variables.find(v => v._id === initialData._id);
      updateVariable(initialData._id, data);
      try {
        await emailAPI.updateVariable(initialData._id, data);
        toast.success('Variable updated');
      } catch (e) {
        if (prev) updateVariable(prev._id, prev);
        toast.error('Operation failed');
        setSaving(false);
        return;
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      addVariable({ _id: tempId, ...data, createdAt: new Date().toISOString() });
      try {
        const r = await emailAPI.createVariable(data);
        const created = r.data?.data?.variable || r.data?.data;
        if (created) { removeVariable(tempId); addVariable(created); }
        toast.success('Variable created');
      } catch (e) {
        removeVariable(tempId);
        toast.error('Operation failed');
        setSaving(false);
        return;
      }
    }
    setShowModal(false);
    setInitialData(null);
    setSaving(false);
  }, [initialData, variables, addVariable, updateVariable, removeVariable]);

  const handleEdit = (variable) => {
    setInitialData(variable);
    setMode('edit');
    setShowModal(true);
  };

  const handleCreate = () => {
    setInitialData(null);
    setMode('create');
    setShowModal(true);
  };

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setActionLoading('delete');
    const deleted = variables.find(v => v._id === deleteTarget);
    removeVariable(deleteTarget);
    try { await emailAPI.deleteVariable(deleteTarget); toast.success('Variable deleted'); setDeleteTarget(null); } catch (e) { if (deleted) addVariable(deleted); toast.error('Delete failed'); }
    finally { setActionLoading(''); }
  }, [deleteTarget, variables, removeVariable, addVariable]);

  const handleToggle = async (variable) => {
    const prev = { ...variable };
    setActionLoading(`toggle-${variable._id}`);
    updateVariable(variable._id, { isActive: !variable.isActive });
    try {
      await emailAPI.toggleVariable(variable._id);
      toast.success(variable.isActive ? 'Variable deactivated' : 'Variable activated');
    } catch (e) {
      updateVariable(variable._id, { isActive: prev.isActive });
      toast.error('Toggle failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleImported = () => {
    loadVariables({ page: 1, limit });
    setShowImport(false);
  };

  const filtered = Array.isArray(variables) ? variables : [];

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="email-module">
      <div className="email-module-header">
        <h2>Email Variables</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {can('create') && <button className="btn btn-secondary" onClick={() => setShowImport(true)}>Import CSV</button>}
          {can('create') && <button className="btn btn-secondary" onClick={() => { setMode('json'); setShowImport(true); }}>Import JSON</button>}
          {can('create') && <button className="btn btn-primary" onClick={handleCreate}>+ New Variable</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control search-input" placeholder="Search variables..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ maxWidth: 300 }} />
        <select className="form-control" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }} style={{ maxWidth: 150 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-control" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={{ maxWidth: 120 }}>
          <option value="all">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Desktop table */}
      <div className="email-table-mobile-view">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Reference</th>
              <th>Default</th>
              <th>Category</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v._id}>
                <td data-label="Name">
                  <span style={{ cursor: 'pointer', fontWeight: 500 }} onClick={() => setDetailItem(v)}>{v.name}</span>
                </td>
                <td data-label="Reference"><code>{`{{${v.reference}}}`}</code></td>
                <td data-label="Default">{v.defaultValue || '-'}</td>
                <td data-label="Category">{v.category}</td>
                <td data-label="Status">
                  <span className={`email-card-badge ${v.isActive ? 'email-badge-active' : 'email-badge-inactive'}`}>{v.isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td data-label="Created">{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '-'}</td>
                <td data-label="Actions">
                  {can('edit') && <button className="btn btn-sm" onClick={() => handleEdit(v)}>Edit</button>}
                  <button className="btn btn-sm" onClick={() => handleToggle(v)} disabled={actionLoading === `toggle-${v._id}`}>
                    {actionLoading === `toggle-${v._id}` ? <><span className="spinner-mini"></span></> : (v.isActive ? 'Deactivate' : 'Activate')}
                  </button>
                  {can('delete') && <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(v._id)}>Delete</button>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999' }}>No variables found</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="email-grid" style={{ display: 'none' }}>
        {filtered.map(v => (
          <div key={v._id} className="email-card">
            <div className="email-card-header">
              <div>
                <div className="email-card-title">{v.name}</div>
                <div className="email-card-sub"><code>{`{{${v.reference}}}`}</code></div>
              </div>
              <span className={`email-card-badge ${v.isActive ? 'email-badge-active' : 'email-badge-inactive'}`}>{v.isActive ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="email-card-body">
              <span className="email-card-badge" style={{ background: '#e3f2fd', color: '#1565c0' }}>{v.category}</span>
              {v.description && <p style={{ marginTop: 8, fontSize: '0.8rem' }}>{v.description}</p>}
              {v.defaultValue && <p style={{ marginTop: 8, fontSize: '0.8rem' }}><strong>Default:</strong> {v.defaultValue}</p>}
            </div>
            <div className="email-card-actions">
              <button className="btn btn-sm" onClick={() => setDetailItem(v)}>Detail</button>
              {can('edit') && <button className="btn btn-sm" onClick={() => handleEdit(v)}>Edit</button>}
              <button className="btn btn-sm" onClick={() => handleToggle(v)} disabled={actionLoading === `toggle-${v._id}`}>
                {actionLoading === `toggle-${v._id}` ? <><span className="spinner-mini"></span></> : (v.isActive ? 'Deactivate' : 'Activate')}
              </button>
              {can('delete') && <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(v._id)}>Delete</button>}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>Page {page} of {totalPages}</span>
          <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      <EmailVariableFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setInitialData(null); }}
        mode={mode}
        initialData={initialData}
        onSubmit={handleSubmit}
        loading={saving}
      />

      <EmailBulkImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={handleImported}
      />

      <EmailDrawer isOpen={!!detailItem} onClose={() => setDetailItem(null)} title={detailItem?.name || 'Variable Details'}>
        {detailItem && (
          <>
            <div className="email-drawer-section">
              <h4>Details</h4>
              <div className="email-drawer-grid">
                <div className="email-drawer-row">
                  <span className="email-drawer-label">Name</span>
                  <span className="email-drawer-value">{detailItem.name}</span>
                </div>
                <div className="email-drawer-row">
                  <span className="email-drawer-label">Reference</span>
                  <span className="email-drawer-value"><code>{`{{${detailItem.reference}}}`}</code></span>
                </div>
                <div className="email-drawer-row">
                  <span className="email-drawer-label">Category</span>
                  <span className="email-drawer-value">{detailItem.category}</span>
                </div>
                <div className="email-drawer-row">
                  <span className="email-drawer-label">Default</span>
                  <span className="email-drawer-value">{detailItem.defaultValue || '-'}</span>
                </div>
                <div className="email-drawer-row">
                  <span className="email-drawer-label">Status</span>
                  <span className="email-drawer-value">
                    <span className={`email-card-badge ${detailItem.isActive ? 'email-badge-active' : 'email-badge-inactive'}`}>
                      {detailItem.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </span>
                </div>
                {detailItem.description && (
                  <div className="email-drawer-row email-drawer-row-full">
                    <span className="email-drawer-label">Description</span>
                    <span className="email-drawer-value">{detailItem.description}</span>
                  </div>
                )}
              </div>
            </div>
            {detailItem.createdAt && (
              <div className="email-drawer-section">
                <h4>Audit</h4>
                <div className="email-drawer-grid">
                  <div className="email-drawer-row">
                    <span className="email-drawer-label">Created</span>
                    <span className="email-drawer-value">{new Date(detailItem.createdAt).toLocaleString()}</span>
                  </div>
                  {detailItem.updatedAt && (
                    <div className="email-drawer-row">
                      <span className="email-drawer-label">Updated</span>
                      <span className="email-drawer-value">{new Date(detailItem.updatedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </EmailDrawer>

      <ConfirmModal isOpen={!!deleteTarget} title="Delete Variable" message="Delete this variable?"
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" cancelText="Cancel" type="danger" loading={actionLoading === 'delete'} />
    </div>
  );
}
