import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
    Plus, Pencil, Trash2, X,
    Tag, MapPin, Flag, Megaphone, List
} from 'lucide-react';
import { leadMasterAPI } from '../services/api';
import LeadMasterDrawer from '../components/leads/LeadMasterDrawer';

const styles = `
.lead-master-container { padding: 1.5rem; }
.lead-master-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
.lead-master-title { font-size: 1.75rem; font-weight: 700; color: var(--text-primary); }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card { background: white; border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 1rem; }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.stat-icon svg { width: 24px; height: 24px; color: white; }
.stat-icon.sources { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.stat-icon.types { background: linear-gradient(135deg, #06b6d4, #0891b2); }
.stat-icon.priorities { background: linear-gradient(135deg, #f59e0b, #d97706); }
.stat-icon.cities { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
.stat-content h3 { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.stat-content p { font-size: 0.875rem; color: var(--text-secondary); }
.tabs-container { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--border-light); padding-bottom: 0; flex-wrap: wrap; }
.tab-btn { padding: 0.75rem 1.5rem; font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); background: transparent; border: none; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all 0.2s; display: flex; align-items: center; gap: 0.5rem; }
.tab-btn:hover { color: var(--primary-color); }
.tab-btn.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
.tab-btn svg { width: 18px; height: 18px; }
.content-card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { text-align: left; padding: 0.75rem 1rem; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 600; font-size: 0.8125rem; text-transform: uppercase; }
.data-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-light); }
.data-table tr:hover { background: var(--bg-hover); cursor: pointer; }
.color-badge { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-badge { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-badge.active { background: #dcfce7; color: #16a34a; }
.status-badge.inactive { background: #fee2e2; color: #dc2626; }
.actions-cell { display: flex; gap: 0.5rem; }
.btn-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
.btn-icon svg { width: 16px; height: 16px; }
.btn-icon.edit { background: #dbeafe; color: #2563eb; }
.btn-icon.edit:hover { background: #2563eb; color: white; }
.btn-icon.delete { background: #fee2e2; color: #dc2626; }
.btn-icon.delete:hover { background: #dc2626; color: white; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s; }
.modal-content { background: white; border-radius: 16px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; animation: slideUp 0.3s; }
.modal-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); }
.modal-close { background: none; border: none; cursor: pointer; color: var(--text-secondary); }
.modal-close svg { width: 24px; height: 24px; }
.modal-body { padding: 1.5rem; }
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-size: 0.875rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.375rem; }
.form-input { width: 100%; padding: 0.625rem 0.875rem; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.875rem; transition: all 0.2s; box-sizing: border-box; }
.form-input:focus { outline: none; border-color: var(--primary-color); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.modal-footer { padding: 1rem 1.5rem; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 0.75rem; background: #f9fafb; border-radius: 0 0 16px 16px; }
.empty-state { text-align: center; padding: 3rem; color: var(--text-secondary); }
.status-management-link { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem; color: #92400e; font-size: 0.9375rem; }
.status-management-link svg { width: 24px; height: 24px; flex-shrink: 0; color: #f59e0b; }
.status-management-link a { color: #2563eb; font-weight: 600; text-decoration: underline; }
.toggle-switch { position: relative; width: 44px; height: 24px; display: inline-block; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: #d1d5db; border-radius: 24px; cursor: pointer; transition: 0.3s; }
.toggle-slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
.toggle-switch input:checked + .toggle-slider { background: #10b981; }
.toggle-switch input:checked + .toggle-slider::before { transform: translateX(20px); }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 1024px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .stats-grid { grid-template-columns: 1fr; } .tabs-container { overflow-x: auto; flex-wrap: nowrap; } .form-row { grid-template-columns: 1fr; } }
`;

const TAB_CONFIG = [
  { key: 'sources', label: 'Sources', icon: Megaphone },
  { key: 'types', label: 'Lead Types', icon: List },
  { key: 'priorities', label: 'Priorities', icon: Flag },
  { key: 'cities', label: 'Cities', icon: MapPin },
];

function MasterModal({ type, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', description: '', color: '#6b7280', sortOrder: 0, category: 'general', level: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (type === 'cities' || type === 'sources') delete payload.category;
      if (type !== 'priorities') delete payload.level;
      if (type === 'cities') delete payload.color;
      const res = await leadMasterAPI.create(type, payload);
      if (res.data?.success) {
        toast.success(res.data.message);
        if (onSaved) onSaved();
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

  const label = { sources: 'Source', types: 'Type', priorities: 'Priority', cities: 'City' }[type] || 'Item';

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div className="modal-header">
          <h3>Add {label}</h3>
          <button className="modal-close" onClick={onClose}><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit}>
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
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeadMasterData() {
  const [activeTab, setActiveTab] = useState('sources');
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [drawerItem, setDrawerItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const getLabel = (type) => ({ sources: 'Source', types: 'Type', priorities: 'Priority', cities: 'City' }[type] || 'Item');

  const loadStats = useCallback(async () => {
    try {
      const { data } = await leadMasterAPI.getStats();
      if (data?.success) setStats(data.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      const { data } = await leadMasterAPI.getAll(activeTab, params);
      if (data?.success) setItems(data.data);
    } catch (err) {
      toast.error(`Failed to load ${activeTab}`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleToggleActive = async (item) => {
    try {
      const res = await leadMasterAPI.update(activeTab, item._id, { isActive: !item.isActive });
      if (res.data?.success) {
        toast.success(res.data.message);
        loadItems();
        loadStats();
      }
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const renderStats = () => {
    if (!stats) return null;
    const config = [
      { key: 'sources', label: 'Sources', icon: Megaphone, cls: 'sources' },
      { key: 'types', label: 'Lead Types', icon: List, cls: 'types' },
      { key: 'priorities', label: 'Priorities', icon: Flag, cls: 'priorities' },
      { key: 'cities', label: 'Cities', icon: MapPin, cls: 'cities' },
    ];
    return (
      <div className="stats-grid">
        {config.map((c) => {
          const Icon = c.icon;
          const s = stats[c.key] || { total: 0, active: 0 };
          return (
            <div key={c.key} className="stat-card">
              <div className={`stat-icon ${c.cls}`}><Icon /></div>
              <div className="stat-content">
                <h3>{s.total}</h3>
                <p>{s.active} active {c.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTable = () => {
    const isPrioritiesType = activeTab === 'priorities';
    const isTypesType = activeTab === 'types';
    const columns = [
      { key: 'name', label: 'Name' },
      ...(isTypesType ? [{ key: 'category', label: 'Category', render: (item) => <span className="color-badge info">{item.category || '-'}</span> }] : []),
      ...(activeTab !== 'cities' ? [{ key: 'description', label: 'Description' }] : []),
      ...(isPrioritiesType ? [{ key: 'level', label: 'Level', render: (item) => item.level ?? '-' }] : []),
      ...(activeTab === 'priorities' ? [{ key: 'color', label: 'Color', render: (item) => <span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 4, background: item.color, verticalAlign: 'middle' }} /> }] : []),
      ...(activeTab !== 'cities' ? [{ key: 'sortOrder', label: 'Order' }] : []),
      { key: 'lead_count', label: 'Leads', render: (item) => item.lead_count ?? '-' },
      { key: 'isActive', label: 'Status', render: (item) => (
        <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={item.isActive} onChange={() => handleToggleActive(item)} />
          <span className="toggle-slider"></span>
        </label>
      )},
      { key: 'actions', label: 'Actions', render: (item) => (
        <div className="actions-cell" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon edit" title="Edit" onClick={() => setDrawerItem(item)}><Pencil size={16} /></button>
          <button className="btn-icon delete" title="Delete" onClick={() => setDrawerItem({ ...item, _deleteIntent: true })}><Trash2 size={16} /></button>
        </div>
      )},
    ];

    return (
      <table className="data-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="empty-state">Loading...</td></tr>
          ) : items.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty-state">No {activeTab} found</td></tr>
          ) : items.map((item) => (
            <tr key={item._id} onClick={() => setDrawerItem(item)}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(item) : item[c.key] || '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <>
      <style>{styles}</style>
      <div className="lead-master-container">
        <div className="lead-master-header">
          <h1 className="lead-master-title">Lead Master Data</h1>
          <div className="page-actions">
            <input
              type="text"
              className="form-input"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '200px' }}
            />
          </div>
        </div>

        {renderStats()}

        <div className="status-management-link">
          <Tag size={24} />
          <span>
            Statuses are now managed centrally in <a href="/admin/statuses">Status Management</a>.
            Please use that module to configure lead statuses and their display settings.
          </span>
        </div>

        <div className="tabs-container">
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.key); setDrawerItem(null); }}
              >
                <Icon /> {tab.label}
              </button>
            );
          })}
        </div>

        <div className="content-card">
          <div className="content-header">
            <h2>{TAB_CONFIG.find((t) => t.key === activeTab)?.label}</h2>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={18} /> Add {getLabel(activeTab)}
            </button>
          </div>

          {renderTable()}
        </div>

        {showCreate && (
          <MasterModal
            type={activeTab}
            onClose={() => setShowCreate(false)}
            onSaved={() => { loadItems(); loadStats(); }}
          />
        )}

        {drawerItem && !drawerItem._deleteIntent && (
          <LeadMasterDrawer
            type={activeTab}
            item={drawerItem}
            onClose={() => setDrawerItem(null)}
            onUpdated={() => { loadItems(); loadStats(); }}
          />
        )}

        {drawerItem && drawerItem._deleteIntent && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDrawerItem(null); }}>
            <div className="modal-content">
              <div className="modal-header">
                <h3>Delete {getLabel(activeTab)}</h3>
                <button className="modal-close" onClick={() => setDrawerItem(null)}><X size={24} /></button>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to delete "{drawerItem.name}"? This action cannot be undone if no leads are using it.</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setDrawerItem(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={async () => {
                  try {
                    const res = await leadMasterAPI.delete(activeTab, drawerItem._id);
                    if (res.data?.success) {
                      toast.success(res.data.message);
                      loadItems();
                      loadStats();
                    } else {
                      toast.error(res.data?.message || 'Delete failed');
                    }
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed to delete');
                  }
                  setDrawerItem(null);
                }}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default LeadMasterData;
