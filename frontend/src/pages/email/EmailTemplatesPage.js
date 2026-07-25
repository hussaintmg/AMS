import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { emailAPI } from '../../services/api';
import { useEmailTemplatesContext } from '../../context/EmailTemplatesContext';
import { useEmailUsageContext } from '../../context/EmailUsageContext';
import ConfirmModal from '../../components/ConfirmModal';
import EmailTemplateFormModal from './EmailTemplateFormModal';

export default function EmailTemplatesPage() {
  const navigate = useNavigate();
  const { templates, templateStats, loadTemplates, addTemplate, updateTemplate, removeTemplate } = useEmailTemplatesContext();
  const { loadUsages } = useEmailUsageContext();
  const [variables, setVariables] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState('create');
  const [initialData, setInitialData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [testEmail, setTestEmail] = useState('');
  const [showTest, setShowTest] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const [variableMappings, setVariableMappings] = useState({});
  const [showVariableSelector, setShowVariableSelector] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    loadTemplates({ status: filterStatus !== 'all' ? filterStatus : undefined });
    emailAPI.searchVariables('').then(r => setVariables(r.data?.data?.variables || [])).catch(() => {});
    loadUsages();
  }, [filterStatus]);

  const handleSubmit = useCallback(async (data, m) => {
    setSaving(true);
    if (m === 'edit') {
      const prev = templates.find(t => t._id === initialData._id);
      updateTemplate(initialData._id, data);
      try {
        await emailAPI.updateTemplate(initialData._id, data);
        toast.success('Template updated');
        setShowModal(false);
        setInitialData(null);
      } catch (e) {
        if (prev) updateTemplate(prev._id, prev);
        toast.error('Operation failed');
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      addTemplate({ _id: tempId, templateName: data.templateName, status: 'draft', ...data });
      try {
        const r = await emailAPI.createTemplate(data);
        const created = r.data?.data?.template || r.data?.data;
        const newId = created?._id;
        if (created) { removeTemplate(tempId); addTemplate(created); }
        toast.success('Template created');
        setShowModal(false);
        setInitialData(null);
        if (newId) navigate(`/email/templates/${newId}/editor`);
      } catch (e) {
        removeTemplate(tempId);
        toast.error('Operation failed');
      }
    }
    setSaving(false);
  }, [initialData, templates, addTemplate, updateTemplate, removeTemplate, navigate]);

  const handleEdit = (tmpl) => {
    setInitialData(tmpl);
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
    const deleted = templates.find(t => t._id === deleteTarget);
    removeTemplate(deleteTarget);
    if (selectedTemplate?._id === deleteTarget) setSelectedTemplate(null);
    try {
      await emailAPI.deleteTemplate(deleteTarget);
      toast.success('Template deleted');
      setDeleteTarget(null);
    } catch (e) {
      if (deleted) addTemplate(deleted);
      toast.error('Delete failed');
    } finally {
      setActionLoading('');
    }
  }, [deleteTarget, templates, selectedTemplate, removeTemplate, addTemplate]);

  const handlePreview = async (tmpl) => {
    setActionLoading('preview');
    try {
      const r = await emailAPI.previewEmail({ templateId: tmpl._id, context: variableMappings });
      setPreviewHtml(r.data?.data?.rendered?.html || '<p>No preview available</p>');
      setSelectedTemplate(tmpl);
      setShowPreview(true);
    } catch (e) {
      toast.error('Preview failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleTestSend = async () => {
    if (!testEmail || !selectedTemplate || actionLoading === 'send') return;
    setActionLoading('send');
    try {
      await emailAPI.sendTestEmail({ templateId: selectedTemplate._id, email: testEmail, context: variableMappings });
      toast.success('Test email sent');
      setShowTest(false);
    } catch (e) {
      toast.error('Send failed');
    } finally {
      setActionLoading('');
    }
  };

  const loadVersions = async (tmpl) => {
    setActionLoading('versions');
    try {
      const r = await emailAPI.getVersions(tmpl._id);
      setVersions(r.data?.data?.versions || []);
      setSelectedTemplate(tmpl);
      setShowVersions(true);
    } catch (e) {
      toast.error('Failed to load versions');
    } finally {
      setActionLoading('');
    }
  };

  const handleRestore = async (versionId) => {
    setActionLoading('restore');
    try {
      await emailAPI.restoreVersion(versionId);
      toast.success('Version restored');
      loadTemplates();
      setShowVersions(false);
    } catch (e) {
      toast.error('Restore failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleToggleActive = async (tmpl) => {
    const prevActive = tmpl.isActive || tmpl.active;
    setActionLoading('toggle');
    updateTemplate(tmpl._id, { isActive: !prevActive });
    try {
      if (prevActive) {
        await emailAPI.deactivateTemplate(tmpl._id);
        toast.success('Template deactivated');
      } else {
        await emailAPI.activateTemplate(tmpl._id);
        toast.success('Template activated');
      }
    } catch (e) {
      updateTemplate(tmpl._id, { isActive: prevActive });
      toast.error('Toggle failed');
    } finally {
      setActionLoading('');
    }
  };

  const filtered = Array.isArray(templates) ? templates.filter(t =>
    ((t.templateName || t.name)?.toLowerCase().includes(search.toLowerCase()) || t.subject?.toLowerCase().includes(search.toLowerCase())) &&
    (filterStatus === 'all' || t.status === filterStatus)
  ) : [];

  const groupedVars = Array.isArray(variables) ? variables.reduce((acc, v) => {
    const group = v.group || 'Other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(v);
    return acc;
  }, {}) : {};

  const previewWidths = { desktop: '100%', tablet: '768px', mobile: '375px', inbox: '600px', full: '100%' };

  return (
    <div className="email-module">
      <div className="email-module-header">
        <h2>Email Templates</h2>
        <button className="btn btn-primary" onClick={handleCreate}>+ Create Template</button>
      </div>

      {templateStats && (
        <div className="email-stats-grid">
          <div className="email-stat-card"><div className="email-stat-value">{templateStats.total || 0}</div><div className="email-stat-label">Total</div></div>
          <div className="email-stat-card"><div className="email-stat-value">{templateStats.published || 0}</div><div className="email-stat-label">Published</div></div>
          <div className="email-stat-card"><div className="email-stat-value">{templateStats.draft || 0}</div><div className="email-stat-label">Drafts</div></div>
          <div className="email-stat-card"><div className="email-stat-value">{templateStats.active || 0}</div><div className="email-stat-label">Active</div></div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input className="form-control search-input" placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
        <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="email-grid">
        {filtered.map(t => (
          <div key={t._id} className="email-card" onClick={() => setSelectedTemplate(t)}>
            <div className="email-card-header">
              <div>
                <div className="email-card-title">{t.templateName || t.name}</div>
                {t.subject && <div className="email-card-sub">{t.subject}</div>}
              </div>
              <span className={`email-card-badge ${t.status === 'published' ? 'email-badge-published' : t.status === 'archived' ? 'email-badge-archived' : 'email-badge-draft'}`}>{t.status}</span>
            </div>
            <div className="email-card-body">
              {t.description && <p>{t.description}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <span className={`email-card-badge ${t.isActive || t.active ? 'email-badge-active' : 'email-badge-inactive'}`}>{t.isActive || t.active ? 'Active' : 'Inactive'}</span>
                <span className="email-card-badge" style={{ background: '#e3f2fd', color: '#1565c0' }}>v{t.version || 1}</span>
              </div>
            </div>
            <div className="email-card-actions">
              <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); navigate(`/email/templates/${t._id}/editor`); }}>Builder</button>
              <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); handlePreview(t); }} disabled={actionLoading === 'preview'}>
                {actionLoading === 'preview' ? <><span className="spinner-mini"></span> Loading...</> : 'Preview'}
              </button>
              <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setSelectedTemplate(t); setShowTest(true); }}>Test</button>
              <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); loadVersions(t); }} disabled={actionLoading === 'versions'}>
                {actionLoading === 'versions' ? <><span className="spinner-mini"></span></> : 'Versions'}
              </button>
              <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleEdit(t); }}>Edit</button>
              <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleToggleActive(t); }} disabled={actionLoading === 'toggle'}>
                {actionLoading === 'toggle' ? <><span className="spinner-mini"></span></> : ((t.isActive || t.active) ? 'Deactivate' : 'Activate')}
              </button>
              <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(t._id); }}>Delete</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#999', padding: 40 }}>No templates found</div>}
      </div>

      <EmailTemplateFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setInitialData(null); }}
        mode={mode}
        initialData={initialData}
        onSubmit={handleSubmit}
        loading={saving}
      />

      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <h3>Preview: {selectedTemplate?.templateName || selectedTemplate?.name}</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="form-control" style={{ width: 120 }} value={previewMode} onChange={e => setPreviewMode(e.target.value)}>
                  <option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option><option value="inbox">Inbox</option><option value="full">Full Width</option>
                </select>
                <button className="modal-close" onClick={() => setShowPreview(false)}>&times;</button>
              </div>
            </div>
            <div className="modal-body" style={{ background: '#f0f0f0', display: 'flex', justifyContent: 'center', padding: 20 }}>
              <div style={{ width: previewWidths[previewMode], maxWidth: '100%', background: '#fff', border: '1px solid #ddd', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', transition: 'width 0.3s' }}>
                <iframe srcDoc={previewHtml} title="Email Preview" style={{ width: '100%', height: 500, border: 'none' }} />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => { setShowPreview(false); setShowTest(true); }}>Send Test</button>
              <button className="btn btn-secondary" onClick={() => setShowVariableSelector(true)}>Set Variables</button>
              <button className="btn btn-primary" onClick={() => setShowPreview(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showTest && (
        <div className="modal-overlay" onClick={() => setShowTest(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header"><h3>Send Test Email</h3><button className="modal-close" onClick={() => setShowTest(false)}>&times;</button></div>
            <div className="modal-body">
              <p className="form-text">Sending: <strong>{selectedTemplate?.templateName || selectedTemplate?.name}</strong></p>
              <div className="form-group"><label>Recipient Email *</label>
                <input type="email" className="form-control" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                  placeholder="test@example.com" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleTestSend(); }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTest(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleTestSend} disabled={!testEmail || actionLoading === 'send'}>
                {actionLoading === 'send' ? <><span className="spinner-mini"></span> Sending...</> : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVersions && (
        <div className="modal-overlay" onClick={() => setShowVersions(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header"><h3>Versions: {selectedTemplate?.templateName || selectedTemplate?.name}</h3><button className="modal-close" onClick={() => setShowVersions(false)}>&times;</button></div>
            <div className="modal-body">
              <table className="table">
                <thead><tr><th>Version</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {versions.map(v => (
                    <tr key={v._id}>
                      <td>v{v.versionNumber || v.version}</td>
                      <td><span className={`email-card-badge ${v.status === 'published' ? 'email-badge-published' : 'email-badge-draft'}`}>{v.status}</span></td>
                      <td>{new Date(v.createdAt).toLocaleString()}</td>
                      <td><button className="btn btn-sm btn-primary" onClick={() => handleRestore(v._id)} disabled={actionLoading === 'restore'}>
                        {actionLoading === 'restore' ? <><span className="spinner-mini"></span></> : 'Restore'}
                      </button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showVariableSelector && (
        <div className="modal-overlay" onClick={() => setShowVariableSelector(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header"><h3>Variable Mappings</h3><button className="modal-close" onClick={() => setShowVariableSelector(false)}>&times;</button></div>
            <div className="modal-body">
              {Object.entries(groupedVars).map(([group, vars]) => (
                <div key={group} className="email-variable-group">
                  <div className="email-variable-group-header">{group}</div>
                  {vars.map(v => (
                    <div key={v.key || v.name} className="email-variable-item" style={{ cursor: 'default' }}>
                      <span><code>{`{{${v.key || v.name}}}`}</code> <span className="var-label">{v.label || v.description}</span></span>
                      <input className="form-control" style={{ width: 200, fontSize: '0.8rem' }} placeholder="Value"
                        value={variableMappings[v.key || v.name] || ''}
                        onChange={e => setVariableMappings(p => ({ ...p, [v.key || v.name]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowVariableSelector(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!deleteTarget} title="Delete Template" message="Delete this template and all its versions?"
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" cancelText="Cancel" type="danger" loading={actionLoading === 'delete'} />
    </div>
  );
}
