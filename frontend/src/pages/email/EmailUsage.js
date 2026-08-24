import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { emailAPI } from '../../services/api';
import { useEmailUsageContext } from '../../context/EmailUsageContext';
import { useEmailTemplatesContext } from '../../context/EmailTemplatesContext';
import ConfirmModal from '../../components/ConfirmModal';
import EmailDrawer from '../../components/EmailDrawer';
import EmailUsageFormModal from './EmailUsageFormModal';
import { pageActions } from '../../utils/roleJobs';
import { useAuth } from '../../context/AuthContext';

export default function EmailUsage() {
  // Every write on the email screens is one of this page's grants (Role Jobs →
  // Email Templates). They were drawn for anyone who could open the screen, and
  // the server refused each one.
  const can = pageActions(useAuth().user, 'email_templates');
  const { usages, loadUsages, addUsage, updateUsage, removeUsage } = useEmailUsageContext();
  const { templates, loadTemplates } = useEmailTemplatesContext();
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState('create');
  const [initialData, setInitialData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    loadUsages();
    loadTemplates();
  }, []);

  const activeTemplates = Array.isArray(templates) ? templates.filter(t => t.isActive) : [];

  const handleSubmit = useCallback(async (data, m) => {
    setSaving(true);
    if (m === 'edit') {
      const prev = usages.find(u => u._id === initialData._id);
      updateUsage(initialData._id, data);
      try {
        await emailAPI.updateUsage(initialData._id, data);
        toast.success('Usage updated');
      } catch (e) {
        if (prev) updateUsage(prev._id, prev);
        toast.error('Operation failed');
        setSaving(false);
        return;
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      addUsage({ _id: tempId, ...data });
      try {
        const r = await emailAPI.createUsage(data);
        const created = r.data?.data?.usage || r.data?.data;
        if (created) { removeUsage(tempId); addUsage(created); }
        toast.success('Usage created');
      } catch (e) {
        removeUsage(tempId);
        toast.error('Operation failed');
        setSaving(false);
        return;
      }
    }
    setShowModal(false);
    setInitialData(null);
    setSaving(false);
  }, [initialData, usages, addUsage, updateUsage, removeUsage]);

  const handleEdit = (u) => {
    setInitialData(u);
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
    const deleted = usages.find(u => u._id === deleteTarget);
    removeUsage(deleteTarget);
    try { await emailAPI.deleteUsage(deleteTarget); toast.success('Usage deleted'); setDeleteTarget(null); } catch (e) { if (deleted) addUsage(deleted); toast.error('Delete failed'); }
    finally { setActionLoading(''); }
  }, [deleteTarget, usages, removeUsage, addUsage]);

  const handleValidate = async (id) => {
    setActionLoading('validate');
    try {
      const r = await emailAPI.validateUsage(id);
      setValidationResult(r.data?.data || r.data);
      toast.success('Validation completed');
    } catch (e) {
      setValidationResult({ valid: false, errors: ['Validation failed'] });
      toast.error('Validation failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleTemplateAssign = async (usage, templateId) => {
    const previous = usage.template;
    const selectedTemplate = activeTemplates.find(t => t._id === templateId);
    setActionLoading(`assign-${usage._id}`);
    updateUsage(usage._id, { template: selectedTemplate || templateId || null });
    try {
      const payload = {
        key: usage.key,
        name: usage.name,
        description: usage.description || '',
        template: templateId || null,
        variableMappings: usage.variableMappings || [],
        isActive: usage.isActive !== false,
      };
      const r = await emailAPI.updateUsage(usage._id, payload);
      const updated = r.data?.data?.usage || r.data?.data;
      if (updated) updateUsage(usage._id, updated);
      toast.success('Template assigned');
    } catch (e) {
      updateUsage(usage._id, { template: previous });
      toast.error('Template assignment failed');
    } finally {
      setActionLoading('');
    }
  };

  const filtered = Array.isArray(usages) ? usages.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase())
  ) : [];

  return (
    <div className="email-module">
      <div className="email-module-header">
        <h2>Email Usage</h2>
        {can('create') && <button className="btn btn-primary" onClick={handleCreate}>+ New Usage</button>}
      </div>

      <input className="form-control search-input" placeholder="Search usage records..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300, marginBottom: 16 }} />

      {validationResult && (
        <div className={`email-smtp-test-result ${validationResult.valid ? 'success' : 'error'}`} style={{ marginBottom: 16 }}>
          <strong>{validationResult.valid ? 'Validation Passed' : 'Validation Failed'}</strong>
          {validationResult.mappingErrors?.length > 0 && (
            <ul style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
              {validationResult.mappingErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
          {validationResult.renderErrors?.length > 0 && (
            <ul style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
              {validationResult.renderErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setValidationResult(null)}>Dismiss</button>
        </div>
      )}

      <div className="email-grid">
        {filtered.map(u => (
          <div key={u._id} className="email-card">
            <div className="email-card-header">
              <div>
                <div className="email-card-title">{u.name}</div>
                {u.description && <div className="email-card-sub">{u.description}</div>}
              </div>
              <span className={`email-card-badge ${u.isActive ? 'email-badge-active' : 'email-badge-inactive'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="email-card-body">
              <div style={{ fontSize: '0.8rem' }}>Key: <code>{u.key}</code></div>
              {u.template && (
                <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                  <strong>Template:</strong> {typeof u.template === 'object' ? `${u.template.templateName} (v${u.template.version})` : u.template}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <select
                  className="form-control"
                  value={u.template?._id || u.template || ''}
                  onChange={(e) => handleTemplateAssign(u, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={actionLoading === `assign-${u._id}`}
                >
                  <option value="">Use default/fallback</option>
                  {activeTemplates.map(t => (
                    <option key={t._id} value={t._id}>{t.templateName || t.name}</option>
                  ))}
                </select>
              </div>
              {u.variableMappings?.length > 0 && (
                <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  <strong>Variable Mappings:</strong> {u.variableMappings.length}
                </div>
              )}
            </div>
            <div className="email-card-actions">
              <button className="btn btn-sm" onClick={() => setDetailItem(u)}>Detail</button>
              {can('edit') && <button className="btn btn-sm" onClick={() => handleEdit(u)}>Edit</button>}
              <button className="btn btn-sm btn-primary" onClick={() => handleValidate(u._id)} disabled={actionLoading === 'validate'}>
                {actionLoading === 'validate' ? <><span className="spinner-mini"></span></> : 'Validate'}
              </button>
              {can('delete') && <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(u._id)}>Delete</button>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#999', padding: 40 }}>No usage records found</div>}
      </div>

      <EmailUsageFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setInitialData(null); }}
        mode={mode}
        initialData={initialData}
        onSubmit={handleSubmit}
        loading={saving}
      />

      <EmailDrawer isOpen={!!detailItem} onClose={() => setDetailItem(null)} title={detailItem?.name || 'Usage Details'}>
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
                  <span className="email-drawer-label">Key</span>
                  <span className="email-drawer-value"><code>{detailItem.key}</code></span>
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
                  <span className="email-drawer-label">Template</span>
                  <span className="email-drawer-value">
                    {typeof detailItem.template === 'object'
                      ? `${detailItem.template.templateName} (v${detailItem.template.version})`
                      : detailItem.template || 'None'}
                  </span>
                </div>
                <div className="email-drawer-row email-drawer-row-full">
                  <span className="email-drawer-label">Description</span>
                  <span className="email-drawer-value">{detailItem.description || '-'}</span>
                </div>
              </div>
            </div>
            {detailItem.variableMappings?.length > 0 && (
              <div className="email-drawer-section">
                <h4>Variable Mappings ({detailItem.variableMappings.length})</h4>
                <table className="table" style={{ fontSize: '0.8rem' }}>
                  <thead><tr><th>Variable</th><th>Value</th></tr></thead>
                  <tbody>
                    {detailItem.variableMappings.map((vm, i) => (
                      <tr key={i}>
                        <td><code>{vm.key || vm.variable}</code></td>
                        <td>{vm.value || vm.defaultValue || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

      <ConfirmModal isOpen={!!deleteTarget} title="Delete Usage" message="Delete this usage mapping?"
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" cancelText="Cancel" type="danger" loading={actionLoading === 'delete'} />
    </div>
  );
}
