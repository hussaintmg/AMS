import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { emailAPI } from '../../services/api';
import { useEmailComponentsContext } from '../../context/EmailComponentsContext';
import ConfirmModal from '../../components/ConfirmModal';
import EmailDrawer from '../../components/EmailDrawer';
import EmailComponentFormModal from './EmailComponentFormModal';

const categories = ['header', 'footer', 'layout', 'content', 'media', 'cta', 'legal', 'custom'];

export default function EmailComponents() {
  const navigate = useNavigate();
  const { components, loadComponents, addComponent, updateComponent, removeComponent } = useEmailComponentsContext();
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState('create');
  const [initialData, setInitialData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [detailItem, setDetailItem] = useState(null);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => { loadComponents(); }, []);

  const handleSubmit = useCallback(async (data, m) => {
    setSaving(true);
    if (m === 'edit') {
      const prev = components.find(c => c._id === initialData._id);
      updateComponent(initialData._id, data);
      try {
        await emailAPI.updateComponent(initialData._id, data);
        toast.success('Component updated');
      } catch (e) {
        if (prev) updateComponent(prev._id, prev);
        toast.error('Operation failed');
        setSaving(false);
        return;
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      addComponent({ _id: tempId, ...data });
      try {
        const r = await emailAPI.createComponent(data);
        const created = r.data?.data?.component || r.data?.data;
        if (created) { removeComponent(tempId); addComponent(created); }
        toast.success('Component created');
      } catch (e) {
        removeComponent(tempId);
        toast.error('Operation failed');
        setSaving(false);
        return;
      }
    }
    setShowModal(false);
    setInitialData(null);
    setSaving(false);
  }, [initialData, components, addComponent, updateComponent, removeComponent]);

  const handleEdit = (comp) => {
    setInitialData(comp);
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
    const deleted = components.find(c => c._id === deleteTarget);
    removeComponent(deleteTarget);
    try { await emailAPI.deleteComponent(deleteTarget); toast.success('Component deleted'); setDeleteTarget(null); } catch (e) { if (deleted) addComponent(deleted); toast.error('Delete failed'); }
    finally { setActionLoading(''); }
  }, [deleteTarget, components, removeComponent, addComponent]);

  const handleDuplicate = async (id) => {
    setActionLoading(`dup-${id}`);
    try {
      const r = await emailAPI.duplicateComponent(id);
      const dup = r.data?.data?.component || r.data?.data;
      if (dup) addComponent(dup);
      toast.success('Component duplicated');
    } catch (e) { toast.error('Duplicate failed'); }
    finally { setActionLoading(''); }
  };

  const handleToggleActive = async (comp) => {
    const prevActive = comp.isActive;
    setActionLoading(`toggle-${comp._id}`);
    updateComponent(comp._id, { isActive: !prevActive });
    try {
      await emailAPI.updateComponent(comp._id, { isActive: !prevActive });
      toast.success(prevActive ? 'Component deactivated' : 'Component activated');
    } catch (e) {
      updateComponent(comp._id, { isActive: prevActive });
      toast.error('Toggle failed');
    } finally {
      setActionLoading('');
    }
  };

  const filtered = Array.isArray(components) ? components.filter(c =>
    (c.name?.toLowerCase().includes(search.toLowerCase()) || c.description?.toLowerCase().includes(search.toLowerCase())) &&
    (filterCat === 'all' || c.category === filterCat)
  ) : [];

  return (
    <div className="email-module">
      <div className="email-module-header">
        <h2>Email Components</h2>
        <button className="btn btn-primary" onClick={handleCreate}>+ New Component</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input className="form-control search-input" placeholder="Search components..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
        <select className="form-control" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      <div className="email-grid">
        {filtered.map(c => (
          <div key={c._id} className="email-card">
            <div className="email-card-header">
              <div>
                <div className="email-card-title">{c.name}</div>
                {c.description && <div className="email-card-sub">{c.description}</div>}
              </div>
              <span className={`email-card-badge ${c.isActive ? 'email-badge-active' : 'email-badge-inactive'}`}>{c.isActive ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="email-card-body">
              <span className="email-card-badge" style={{ background: '#e3f2fd', color: '#1565c0' }}>{c.category}</span>
              {c.variablesUsed?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: '0.8rem' }}>
                  <strong>Variables:</strong> {c.variablesUsed.join(', ')}
                </div>
              )}
              <div style={{ marginTop: 8, maxHeight: 60, overflow: 'hidden', fontSize: '0.75rem', color: '#999', fontFamily: 'monospace' }}>
                {c.html?.substring(0, 120)}
              </div>
            </div>
            <div className="email-card-actions">
              <button className="btn btn-sm btn-primary" onClick={() => navigate(`/email/components/${c._id}/editor`)}>Open Editor</button>
              <button className="btn btn-sm" onClick={() => setDetailItem(c)}>Detail</button>
              <button className="btn btn-sm" onClick={() => handleEdit(c)}>Edit</button>
              <button className="btn btn-sm" onClick={() => handleDuplicate(c._id)} disabled={actionLoading === `dup-${c._id}`}>
                {actionLoading === `dup-${c._id}` ? <><span className="spinner-mini"></span></> : 'Duplicate'}
              </button>
              <button className="btn btn-sm" onClick={() => handleToggleActive(c)} disabled={actionLoading === `toggle-${c._id}`}>
                {actionLoading === `toggle-${c._id}` ? <><span className="spinner-mini"></span></> : (c.isActive ? 'Deactivate' : 'Activate')}
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(c._id)}>Delete</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#999', padding: 40 }}>No components found</div>}
      </div>

      <EmailComponentFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setInitialData(null); }}
        mode={mode}
        initialData={initialData}
        onSubmit={handleSubmit}
        loading={saving}
      />

      <EmailDrawer isOpen={!!detailItem} onClose={() => setDetailItem(null)} title={detailItem?.name || 'Component Details'}>
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
                  <span className="email-drawer-label">Category</span>
                  <span className="email-drawer-value">{detailItem.category}</span>
                </div>
                <div className="email-drawer-row">
                  <span className="email-drawer-label">Status</span>
                  <span className="email-drawer-value">
                    <span className={`email-card-badge ${detailItem.isActive ? 'email-badge-active' : 'email-badge-inactive'}`}>
                      {detailItem.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </span>
                </div>
                <div className="email-drawer-row">
                  <span className="email-drawer-label">Key</span>
                  <span className="email-drawer-value"><code>{detailItem.key}</code></span>
                </div>
                <div className="email-drawer-row email-drawer-row-full">
                  <span className="email-drawer-label">Description</span>
                  <span className="email-drawer-value">{detailItem.description || '-'}</span>
                </div>
              </div>
            </div>
            {detailItem.parameters?.length > 0 && (
              <div className="email-drawer-section">
                <h4>Parameters ({detailItem.parameters.length})</h4>
                <div className="email-drawer-grid">
                  {detailItem.parameters.map((p, i) => (
                    <div className="email-drawer-row" key={i}>
                      <span className="email-drawer-label">{p.name || p.key}</span>
                      <span className="email-drawer-value">
                        <code>{p.key}</code> ({p.type}){p.required ? ' *' : ''}
                        {p.defaultValue !== undefined && p.defaultValue !== null && p.defaultValue !== '' ? ` = ${p.defaultValue}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {detailItem.variablesUsed?.length > 0 && (
              <div className="email-drawer-section">
                <h4>Variables ({detailItem.variablesUsed.length})</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {detailItem.variablesUsed.map((v, i) => (
                    <code key={i} style={{ background: '#e3f2fd', color: '#1565c0', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>{v}</code>
                  ))}
                </div>
              </div>
            )}
            <div className="email-drawer-section">
              <h4>HTML Preview</h4>
              <div style={{ background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: 6, padding: 12, maxHeight: 300, overflow: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {(detailItem.html || '').substring(0, 2000)}{(detailItem.html || '').length > 2000 ? '...' : ''}
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

      <ConfirmModal isOpen={!!deleteTarget} title="Delete Component" message="Delete this component?"
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" cancelText="Cancel" type="danger" loading={actionLoading === 'delete'} />
    </div>
  );
}
