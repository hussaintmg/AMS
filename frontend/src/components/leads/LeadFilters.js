import React, { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { useLeads } from '../../context/LeadsContext';

export default function LeadFilters({ onClose }) {
  const { meta, filters, applyFilters, handleFilter, clearFilters } = useLeads();
  const [local, setLocal] = useState({
    status: filters.status || '',
    source: filters.source || '',
    type: filters.type || '',
    priority: filters.priority || '',
    city: filters.city || '',
    assignedTo: filters.assignedTo || '',
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
  });

  const set = (field, value) => setLocal((prev) => ({ ...prev, [field]: value }));

  const apply = () => {
    const cleaned = {};
    Object.entries(local).forEach(([k, v]) => { if (v) cleaned[k] = v; });
    handleFilter(cleaned);
    applyFilters();
    if (onClose) onClose();
  };

  const clear = () => {
    setLocal({ status: '', source: '', type: '', priority: '', city: '', assignedTo: '', dateFrom: '', dateTo: '' });
    clearFilters();
    applyFilters();
    if (onClose) onClose();
  };

  return (
    <div className="filters-overlay" onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="filters-panel">
        <div className="filters-header">
          <h3><Filter size={16} /> Filters</h3>
          {onClose && <button className="modal-close" onClick={onClose}><X size={16} /></button>}
        </div>
        <div className="filters-body">
          <div className="form-group">
            <label>Status</label>
            <select className="form-input" value={local.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">All Statuses</option>
              {meta.statuses.map((s) => (
                <option key={s._id} value={s.value || s.label}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Source</label>
            <select className="form-input" value={local.source} onChange={(e) => set('source', e.target.value)}>
              <option value="">All Sources</option>
              {meta.sources.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Type</label>
            <select className="form-input" value={local.type} onChange={(e) => set('type', e.target.value)}>
              <option value="">All Types</option>
              {meta.types.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select className="form-input" value={local.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="">All Priorities</option>
              {meta.priorities.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>City</label>
            <select className="form-input" value={local.city} onChange={(e) => set('city', e.target.value)}>
              <option value="">All Cities</option>
              {meta.cities.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Assigned To</label>
            <select className="form-input" value={local.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
              <option value="">Everyone</option>
              <option value="unassigned">Unassigned</option>
              {meta.users.map((u) => (
                <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Date From</label>
              <input type="date" className="form-input" value={local.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Date To</label>
              <input type="date" className="form-input" value={local.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="filters-footer">
          <button className="btn btn-secondary" onClick={clear}>Clear All</button>
          <button className="btn btn-primary" onClick={apply}>Apply Filters</button>
        </div>
      </div>
    </div>
  );
}
