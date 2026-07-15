import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
    Plus, Pencil, Trash2, X, Upload,
    MapPin, Flag, Megaphone, List, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { leadMasterAPI } from '../services/api';
import LeadMasterDrawer from '../components/leads/LeadMasterDrawer';
import LeadMasterModal from '../components/leads/LeadMasterModal';
import ToggleSwitch from '../components/ToggleSwitch';
import ConfirmModal from '../components/ConfirmModal';


const styles = `
.lead-master-container { padding: 1.5rem; }
.lead-master-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
.lead-master-title { font-size: 1.75rem; font-weight: 700; color: var(--text-primary); }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card { background: white; border: 1px solid #edf2f7; border-radius: 14px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); display: flex; align-items: center; gap: 1rem; transition: all 0.2s ease; }
.stat-card:hover { border-color: #dbeafe; box-shadow: 0 6px 16px rgba(15,23,42,0.08); transform: translateY(-2px); }
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
.content-card { background: white; border: 1px solid #edf2f7; border-radius: 14px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
.lead-master-filter-bar { display: flex; align-items: end; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; padding: 0.875rem; border: 1px solid var(--border-light); border-radius: 12px; background: var(--bg-secondary); }
.lead-master-filter-group { display: grid; gap: 0.375rem; min-width: 160px; }
.lead-master-filter-group label { font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.lead-master-filter-search { min-width: 240px; flex: 1; }
.lead-master-pagination { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; }
.lead-master-pagination-info { color: var(--text-secondary); font-size: 0.875rem; font-weight: 600; }
.lead-master-pagination-actions { display: flex; align-items: center; gap: 0.5rem; }
.lead-master-table-wrap { display: block; overflow-x: auto; }
.lead-master-cards { display: none; }
.data-table .filter-row th { padding: 4px 8px; background: rgba(0,0,0,0.02); }
.filter-input { padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.8rem; background: white; width: 100%; box-sizing: border-box; }
.filter-input:focus { outline: none; border-color: var(--primary-600); }
.lead-master-card-grid { display: grid; grid-template-columns: 1fr; gap: 0.75rem; }
.lead-master-card { border: 1px solid var(--border-light); border-radius: 14px; padding: 1rem; background: #fff; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: all 0.2s ease; }
.lead-master-card:hover { border-color: #dbeafe; box-shadow: 0 6px 16px rgba(15,23,42,0.08); transform: translateY(-2px); }
.lead-master-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; }
.lead-master-card-title { font-weight: 800; color: var(--text-primary); }
.lead-master-card-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; font-size: 0.8125rem; color: var(--text-secondary); }
.lead-master-card-meta strong { display: block; color: var(--text-primary); font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.125rem; }
.lead-master-card-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-light); }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { text-align: left; padding: 0.75rem 1rem; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 600; font-size: 0.8125rem; text-transform: uppercase; user-select: none; }
.data-table th.sortable { cursor: pointer; }
.data-table th.sortable:hover { color: var(--primary-color); }
.data-table th .sort-icon { display: inline-flex; vertical-align: middle; margin-left: 0.25rem; width: 14px; height: 14px; }
.data-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-light); }
.data-table tr:hover { background: var(--bg-hover); cursor: pointer; }
.color-badge { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-badge { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.status-badge.active { background: #dcfce7; color: #16a34a; }
.status-badge.inactive { background: #fee2e2; color: #dc2626; }
.mapping-badges { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.mapping-badge { display: inline-flex; align-items: center; padding: 0.25rem 0.625rem; border-radius: 9999px; background: #eef2ff; color: #4338ca; font-size: 0.75rem; font-weight: 700; }
.mapping-empty { color: var(--text-secondary); font-size: 0.8125rem; }
.mapping-checkbox-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.625rem; }
.mapping-checkbox { display: flex !important; align-items: center; gap: 0.5rem; padding: 0.625rem 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; margin: 0 !important; }
.mapping-checkbox input { width: 16px; height: 16px; accent-color: var(--primary-color); }
.mapping-checkbox span { font-size: 0.875rem; font-weight: 600; }
.actions-cell { display: flex; align-items: center; gap: 6px; }
.btn-icon { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0; border-radius: 9px; cursor: pointer; transition: all 0.15s ease; background: #f8fafc; color: #64748b; }
.btn-icon svg { width: 17px; height: 17px; stroke-width: 2; }
.btn-icon.edit { background: #eff6ff; color: #2563eb; border-color: #dbeafe; }
.btn-icon.edit:hover { background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18); }
.btn-icon.delete { background: #fef2f2; color: #dc2626; border-color: #fee2e2; }
.btn-icon.delete:hover { background: #fee2e2; color: #b91c1c; border-color: #fecaca; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(220, 38, 38, 0.18); }
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
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 1024px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .stats-grid { grid-template-columns: 1fr; } .tabs-container { overflow-x: auto; flex-wrap: nowrap; } .form-row { grid-template-columns: 1fr; } .mapping-checkbox-grid { grid-template-columns: 1fr; } .lead-master-filter-group, .lead-master-filter-search { min-width: 100%; } .lead-master-table-wrap { display: none; } .lead-master-cards { display: block; } .lead-master-card-meta { grid-template-columns: 1fr; } }
`;

const TAB_CONFIG = [
  { key: 'sources', label: 'Sources', icon: Megaphone },
  { key: 'types', label: 'Lead Types', icon: List },
  { key: 'priorities', label: 'Priorities', icon: Flag },
  { key: 'cities', label: 'Cities', icon: MapPin },
];

const PAGE_SIZE = 10;

function LeadMasterData() {
  const [activeTab, setActiveTab] = useState('sources');
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [drawerItem, setDrawerItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState('sortOrder');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteAllTarget, setDeleteAllTarget] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === pageItems.length && pageItems.length > 0 ? new Set() : new Set(pageItems.map(d => d._id)));
  };

  const handleBulkDelete = async () => {
    setDeletingAll(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await leadMasterAPI.delete(activeTab, id);
      }
      toast.success(`${ids.length} item(s) deleted`);
      setSelectedIds(new Set());
      setDeleteAllTarget(false);
      loadItems();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk delete failed');
    } finally {
      setDeletingAll(false);
    }
  };

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
      if (categoryFilter) params.category = categoryFilter;
      const { data } = await leadMasterAPI.getAll(activeTab, params);
      if (data?.success) setItems(data.data);
    } catch (err) {
      toast.error(`Failed to load ${activeTab}`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, categoryFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { setPage(1); setSelectedIds(new Set()); setDeleteAllTarget(false); }, [activeTab, searchQuery, statusFilter, categoryFilter, sortField, sortDir]);

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

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleteSaving(true);
    try {
      const res = await leadMasterAPI.delete(activeTab, deleteItem._id);
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
    setDeleteSaving(false);
    setDeleteItem(null);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="sort-icon"><ArrowUpDown size={14} /></span>;
    return <span className="sort-icon">{sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</span>;
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

  const renderPagination = () => {
    if (filteredItems.length <= PAGE_SIZE) return null;
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, filteredItems.length);
    return (
      <div className="lead-master-pagination">
        <span className="lead-master-pagination-info">
          Showing {start}-{end} of {filteredItems.length}
        </span>
        <div className="lead-master-pagination-actions">
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
          <span className="lead-master-pagination-info">Page {page} of {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      </div>
    );
  };

  const filteredItems = useMemo(() => {
    const term = (v) => (v || '').toString().toLowerCase();
    const f = items.filter((item) => {
      if (statusFilter === 'active' && !item.isActive) return false;
      if (statusFilter === 'inactive' && item.isActive) return false;
      if (activeTab === 'types' && categoryFilter && item.category !== categoryFilter) return false;
      if (searchQuery && !term(item.name).includes(term(searchQuery))) return false;
      return true;
    });
    f.sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      let cmp = 0;
      if (typeof aVal === 'string') cmp = aVal.localeCompare(bVal);
      else cmp = aVal - bVal;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return f;
  }, [activeTab, categoryFilter, items, sortDir, sortField, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const renderTable = () => {
    const isPrioritiesType = activeTab === 'priorities';
    const isTypesType = activeTab === 'types';
    const columns = [
      { key: 'name', label: 'Name', sortable: true },
      ...(isTypesType ? [{ key: 'category', label: 'Category', sortable: true, render: (item) => <span className="color-badge info">{item.category || '-'}</span> }] : []),
      ...(isTypesType ? [{
        key: 'portalModules',
        label: 'Mapping',
        sortable: false,
        render: (item) => (
          <div className="mapping-badges">
            {(item.portalModules || []).length
              ? item.portalModules.map((module) => <span key={module} className="mapping-badge">{module}</span>)
              : <span className="mapping-empty">Not mapped</span>}
          </div>
        ),
      }] : []),
      ...(activeTab !== 'cities' ? [{ key: 'description', label: 'Description', sortable: true }] : []),
      ...(isPrioritiesType ? [{ key: 'level', label: 'Level', sortable: true, render: (item) => item.level ?? '-' }] : []),
      ...(activeTab === 'priorities' ? [{ key: 'color', label: 'Color', sortable: false, render: (item) => <span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 4, background: item.color, verticalAlign: 'middle' }} /> }] : []),
      ...(activeTab !== 'cities' ? [{ key: 'sortOrder', label: 'Order', sortable: true }] : []),
      { key: 'lead_count', label: 'Leads', sortable: true, render: (item) => item.lead_count ?? '-' },
      { key: 'isActive', label: 'Status', sortable: true, render: (item) => (
        <ToggleSwitch checked={item.isActive} onChange={() => handleToggleActive(item)} />
      )},
      { key: 'actions', label: 'Actions', sortable: false, render: (item) => (
        <div className="actions-cell" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon edit" title="Edit" onClick={() => setDrawerItem(item)}><Pencil size={16} /></button>
          <button className="btn-icon delete" title="Delete" onClick={(e) => { e.stopPropagation(); setDeleteItem(item); }}><Trash2 size={16} /></button>
        </div>
      )},
    ];

    return (
      <>
        <div className="lead-master-table-wrap desktop-only">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === pageItems.length && pageItems.length > 0} onChange={toggleSelectAll} /></th>
                {columns.map((c) => (
                  <th key={c.key} className={c.sortable ? 'sortable' : ''} onClick={c.sortable ? () => handleSort(c.key) : undefined}>
                    {c.label}
                    {c.sortable && <SortIcon field={c.key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length + 1} className="empty-state">Loading...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="empty-state">No {activeTab} found</td></tr>
              ) : pageItems.map((item) => (
                <tr key={item._id} onClick={() => setDrawerItem(item)}>
                  <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(item._id)} onChange={() => toggleSelect(item._id)} /></td>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render ? c.render(item) : item[c.key] || '-'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="lead-master-cards mobile-only">
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">No {activeTab} found</div>
          ) : (
              <div className="lead-master-card-grid">
              {pageItems.map((item) => (
                <div key={item._id} className="lead-master-card data-card" onClick={() => setDrawerItem(item)}>
                  <div className="lead-master-card-header">
                    <div>
                      <div className="lead-master-card-title">{item.name}</div>
                      <div className="mapping-empty">{item.code || getLabel(activeTab)}</div>
                    </div>
                    <span className={`status-badge ${item.isActive ? 'active' : 'inactive'}`}>{item.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="lead-master-card-meta">
                    {isTypesType && <div><strong>Category</strong>{item.category || '-'}</div>}
                    {isTypesType && <div><strong>Mapping</strong>{(item.portalModules || []).join(', ') || 'Not mapped'}</div>}
                    {activeTab !== 'cities' && <div><strong>Description</strong>{item.description || '-'}</div>}
                    {isPrioritiesType && <div><strong>Level</strong>{item.level ?? '-'}</div>}
                    <div><strong>Leads</strong>{item.lead_count ?? '-'}</div>
                  </div>
                  <div className="lead-master-card-actions actions-cell" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-icon edit" title="Edit" onClick={() => setDrawerItem(item)}><Pencil size={16} /></button>
                    <button className="btn-icon delete" title="Delete" onClick={() => setDeleteItem(item)}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <style>{styles}</style>
      <div className="lead-master-container">
        <div className="lead-master-header">
          <h1 className="lead-master-title">Lead Master Data</h1>
        </div>

        {renderStats()}

        <div className="tabs-container">
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.key); setDrawerItem(null); setDeleteItem(null); }}
              >
                <Icon /> {tab.label}
              </button>
            );
          })}
        </div>

        <div className="content-card">
          <div className="content-header">
            <h2>{TAB_CONFIG.find((t) => t.key === activeTab)?.label}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={18} /> Add {getLabel(activeTab)}
              </button>
            </div>
          </div>
          <div className="lead-master-filter-bar">
            <div className="lead-master-filter-group lead-master-filter-search">
              <label>Search</label>
              <input type="text" className="filter-input" placeholder={`Search ${activeTab}...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="lead-master-filter-group">
              <label>Status</label>
              <select className="filter-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {activeTab === 'types' && (
              <div className="lead-master-filter-group">
                <label>Category</label>
                <select className="filter-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="">All</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="service">Service</option>
                  <option value="parts">Parts</option>
                  <option value="general">General</option>
                  <option value="corporate">Corporate</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="selection-bar">
              <span className="selection-count">{selectedIds.size} selected</span>
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteAllTarget(true)}>Delete Selected</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>Deselect All</button>
            </div>
          )}
          {renderTable()}
          {renderPagination()}
        </div>

        {showCreate && (
          <LeadMasterModal
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

        <ConfirmModal
          isOpen={!!deleteItem}
          title={`Delete ${getLabel(activeTab)}`}
          message={`Are you sure you want to delete "${deleteItem?.name || ''}"? This action cannot be undone if no leads are using it.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteItem(null)}
          confirmText={deleteSaving ? 'Deleting...' : 'Delete'}
          type="danger"
        />
        <ConfirmModal
          isOpen={deleteAllTarget}
          title={`Delete Selected ${getLabel(activeTab)}s`}
          message={`Are you sure you want to delete ${selectedIds.size} ${getLabel(activeTab).toLowerCase()}(s)? This action cannot be undone.`}
          onConfirm={handleBulkDelete}
          onCancel={() => setDeleteAllTarget(false)}
          confirmText={deletingAll ? 'Deleting...' : 'Delete All'}
          type="danger"
        />
      </div>
    </>
  );
}

export default LeadMasterData;
