import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ChevronLeft, ChevronRight, User, CalendarDays, ChartBar, ArrowRightLeft, X, Filter, Upload } from 'lucide-react';
import { LeadsProvider, useLeads } from '../context/LeadsContext';
import LeadFormModal from '../components/leads/LeadFormModal';
import LeadDrawer from '../components/leads/LeadDrawer';
import ActionButtons from '../components/ActionButtons';
import ConfirmModal from '../components/ConfirmModal';
import BulkUploadModal from '../components/BulkUploadModal';
import ServerPagination from '../components/ServerPagination';
import { useAuth } from '../context/AuthContext';
import { canRoleDo, getRoleJob, fieldAccessor } from '../utils/roleJobs';
import '../styles/leadManagement.css';
import '../styles/filters.css';

const statsIcons = {
  total: { icon: User, color: '#3b82f6', bg: '#dbeafe' },
  newLeads: { icon: ChartBar, color: '#10b981', bg: '#dcfce7' },
  followUpToday: { icon: CalendarDays, color: '#f59e0b', bg: '#fef3c7' },
  converted: { icon: ArrowRightLeft, color: '#8b5cf6', bg: '#ede9fe' },
  lost: { icon: X, color: '#ef4444', bg: '#fee2e2' },
  highPriority: { icon: ChartBar, color: '#ef4444', bg: '#fee2e2' },
  unassigned: { icon: User, color: '#6b7280', bg: '#f3f4f6' },
};

function LeadsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Columns the role may not read are stripped by the API; don't draw them.
  const showField = fieldAccessor(user, 'leads');
  /**
   * What this role may do here.
   *
   * This screen had no permission check of any kind: Add, Edit, Delete and
   * Convert to Customer were drawn for everyone who could open Leads, and the
   * server's 403 was the first anyone heard of it. A role that has never been
   * through Role Jobs keeps the old behaviour, so nothing that works today
   * stops — see `policyAllows` in Sales.js for the same shape.
   */
  const allows = (action, legacy) => (getRoleJob(user, 'leads') ? canRoleDo(user, 'leads', action) : legacy);
  const canCreate = allows('create', true);
  const canEdit = allows('edit', true);
  const canDelete = allows('delete', true);
  // Converting writes a Customer and stamps the lead; the API guards it as an
  // edit of the lead.
  // Converting is its own grant (Role Jobs → Leads → Convert), separate from edit.
  const canConvert = allows('convert', canEdit);
  const canImport = allows('import', canCreate);
  const [urlParams] = useSearchParams();
  const { leads, meta, stats, pagination, search, filters, loading, handleSearch, handleFilter, clearFilters, goToPage, setPageSize, refreshLeads, deleteLead, loadLeads, convertLead } = useLeads();
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [drawerId, setDrawerId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [searchInput, setSearchInput] = useState(() => urlParams.get('search') || search);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showFilters, setShowFilters] = useState(false);
  const [converting, setConverting] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteAllTarget, setDeleteAllTarget] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === leads.length ? new Set() : new Set(leads.map(l => l._id)));
  };

  const handleBulkDelete = async () => {
    setDeletingAll(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const res = await deleteLead(id);
        if (!res?.success) toast.error(res?.message || `Failed to delete ${id}`);
      }
      toast.success(`${ids.length} lead(s) deactivated`);
      setSelectedIds(new Set());
      setDeleteAllTarget(null);
      refreshLeads();
    } catch (err) {
      toast.error('Bulk delete failed');
    } finally {
      setDeletingAll(false);
    }
  };

  useEffect(() => {
    const searchParam = urlParams.get('search');
    const openParam = urlParams.get('open');
    const actionParam = urlParams.get('action');
    const convertedParam = urlParams.get('converted');
    if (openParam) setDrawerId(openParam);
    if (actionParam === 'create') setShowForm(true);
    if (convertedParam === 'true') {
      handleFilter({ converted: 'true' });
    }
    if (searchParam) {
      setSearchInput(searchParam);
      handleSearch(searchParam);
      setTimeout(() => loadLeads(1), 0);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) handleSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadLeads(1);
  }, [search]);

  useEffect(() => {
    loadLeads(1);
  }, [filters]);

  const handleFilterChange = (key, val) => {
    handleFilter({ [key]: val });
  };

  const resetFilters = () => {
    setSearchInput('');
    clearFilters();
  };

  const hasActiveFilters = () => {
    return Object.entries(filters).some(([k, v]) => v && v !== '' && v !== false);
  };

  const handleConvert = async (leadId) => {
    setConverting(leadId);
    try {
      const res = await convertLead(leadId);
      if (res?.success) {
        toast.success(res.message || 'Lead converted successfully');
        refreshLeads();
      } else {
        toast.error(res?.message || 'Conversion failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Conversion failed');
    } finally {
      setConverting(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteLead(deleteTarget._id);
      if (res?.success) toast.success(res.message);
      else toast.error(res?.message || 'Delete failed');
    } catch (err) {
      toast.error('Failed to delete lead');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const renderStats = () => {
    if (!stats) return null;
    const items = [
      { key: 'total', label: 'Total Leads', value: stats.total },
      { key: 'newLeads', label: 'New (7 days)', value: stats.newLeads },
      { key: 'followUpToday', label: 'Follow-Up Today', value: stats.followUpToday },
      { key: 'converted', label: 'Converted', value: stats.converted },
      { key: 'lost', label: 'Lost', value: stats.lost },
      { key: 'highPriority', label: 'High Priority', value: stats.highPriority },
      { key: 'unassigned', label: 'Unassigned', value: stats.unassigned },
    ];
    return (
      <div className="lead-stats-grid" style={{ marginBottom: '16px' }}>
        {items.map((item) => {
          const s = statsIcons[item.key] || statsIcons.total;
          const Icon = s.icon;
          return (
            <div key={item.key} className="lead-stat-card" style={{ borderLeftColor: s.color }}>
              <div className="lead-stat-icon" style={{ background: s.bg, color: s.color }}><Icon /></div>
              <div className="lead-stat-info">
                <span className="lead-stat-value">{item.value}</span>
                <span className="lead-stat-label">{item.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTable = () => (
    <div className="table-container desktop-only lead-table-scroll">
      {loading ? (
        <div className="loading-state"><div className="spinner"></div><p>Loading leads...</p></div>
      ) : leads.length === 0 ? (
        <div className="empty-state" style={{padding:"5px 10px"}}><h3>No Leads Found</h3><p>Try adjusting filters or create a new lead.</p></div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}><input type="checkbox" checked={selectedIds.size === leads.length && leads.length > 0} onChange={toggleSelectAll} /></th>
              <th>Customer</th>
              {(showField('phone') || showField('email')) && <th>Contact</th>}
              {showField('classification') && <th>Source</th>}
              {showField('classification') && <th>Priority</th>}
              {showField('classification') && <th>Status</th>}
              {showField('assignment') && <th>Assigned To</th>}
              {showField('value') && <th>Value</th>}
              {showField('activity') && <th>Follow-Up</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead._id} className={lead.convertedToCustomer ? 'row-converted' : ''} onClick={() => setDrawerId(lead._id)} style={{ cursor: 'pointer' }}>
                <td style={{ width: 40 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(lead._id)} onChange={() => toggleSelect(lead._id)} /></td>
                <td>
                  <div className="user-cell">
                    <div className="user-info">
                      <span className="user-name">{lead.customerName}</span>
                      {showField('email') && lead.email && <div className="user-emp-id">{lead.email}</div>}
                    </div>
                  </div>
                </td>
                {(showField('phone') || showField('email')) && (
                  <td>
                    <div className="contact-info">{showField('email') && lead.email}{showField('email') && showField('phone') && <br />}{showField('phone') && lead.phone}</div>
                  </td>
                )}
                {showField('classification') && <td>{lead.source?.name || '-'}</td>}
                {showField('classification') && (
                  <td>
                    {lead.priority ? (
                      <span className="priority-badge" style={{ background: (lead.priority.color || '#6b7280') + '22', color: lead.priority.color || '#6b7280' }}>
                        {lead.priority.name}
                      </span>
                    ) : '-'}
                  </td>
                )}
                {showField('classification') && (
                <td>
                  {lead.convertedToCustomer ? (
                    <span className="status-badge clickable" style={{ background: '#dcfce7', color: '#16a34a', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); navigate('/customers'); }}>
                      Converted{lead.convertedCustomerId?.customerCode ? ` \u2192 ${lead.convertedCustomerId.customerCode}` : ''}
                    </span>
                  ) : (
                    <span className={`status-badge ${lead.status === 'Lost' || lead.lostReason ? 'status-inactive' : 'status-active'}`}>{lead.status || 'N/A'}</span>
                  )}
                </td>
                )}
                {showField('assignment') && <td>{lead.assignedTo ? `${lead.assignedTo.firstName || ''} ${lead.assignedTo.lastName || ''}`.trim() || lead.assignedTo.email : '-'}</td>}
                {showField('value') && <td>{lead.leadValue ? Number(lead.leadValue).toLocaleString() : '-'}</td>}
                {showField('activity') && <td>{lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleDateString() : '-'}</td>}
                <td>
                  <ActionButtons
                    showView
                    onView={() => setDrawerId(lead._id)}
                    onEdit={canEdit ? () => { setEditLead(lead); setShowForm(true); } : null}
                    onDelete={canDelete ? () => setDeleteTarget(lead) : null}
                    showToggle={false}
                    disableDelete={!!lead.convertedToCustomer}
                    deleteDisabledTitle="Cannot delete a converted lead"
                    title={lead.leadNo}
                    customActions={canConvert && !lead.convertedToCustomer ? [{
                      icon: <ArrowRightLeft size={16} />,
                      title: 'Convert to Customer',
                      className: 'btn-convert',
                      onClick: () => handleConvert(lead._id),
                    }] : []}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderCards = () => (
    <div className="mobile-cards-container mobile-only">
      {loading ? (
        <div className="loading-state"><div className="spinner"></div><p>Loading leads...</p></div>
      ) : leads.length === 0 ? (
        <div className="empty-state" style={{ padding: "5px 10px" }}><h3>No Leads Found</h3><p>Try adjusting filters or create a new lead.</p></div>
      ) : (
        <div className="users-cards-grid">
          {leads.map((lead) => (
            <div key={lead._id} className={`user-card ${lead.convertedToCustomer ? 'card-converted' : ''}`} onClick={() => setDrawerId(lead._id)}>
              <div className="user-card-header">
                <div className="user-card-title">
                  <span className="user-card-name">{lead.customerName}</span>
                  <span className="user-card-role">{lead.leadNo}</span>
                </div>
                {lead.convertedToCustomer ? (
                  <span className="status-badge clickable" style={{ background: '#dcfce7', color: '#16a34a', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); navigate('/customers'); }}>
                    Converted{lead.convertedCustomerId?.customerCode ? ` \u2192 ${lead.convertedCustomerId.customerCode}` : ''}
                  </span>
                ) : (
                  <span className={`status-badge ${lead.status === 'Lost' || lead.lostReason ? 'status-inactive' : 'status-active'}`}>{lead.status || 'N/A'}</span>
                )}
              </div>
              <div className="user-card-body">
                <div className="user-card-field"><span className="field-label">Email</span><span className="field-value">{lead.email || '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Phone</span><span className="field-value">{lead.phone || '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Source</span><span className="field-value">{lead.source?.name || '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Priority</span><span className="field-value">{lead.priority?.name || '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Value</span><span className="field-value">{lead.leadValue ? Number(lead.leadValue).toLocaleString() : '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Assigned</span><span className="field-value">{lead.assignedTo ? `${lead.assignedTo.firstName || ''} ${lead.assignedTo.lastName || ''}`.trim() : 'Unassigned'}</span></div>
              </div>
              <div className="user-card-actions">
                <ActionButtons
                  showView
                  onView={() => setDrawerId(lead._id)}
                  onEdit={canEdit ? () => { setEditLead(lead); setShowForm(true); } : null}
                  onDelete={canDelete ? () => setDeleteTarget(lead) : null}
                  showToggle={false}
                  disableDelete={!!lead.convertedToCustomer}
                  deleteDisabledTitle="Cannot delete a converted lead"
                  title={lead.leadNo}
                  customActions={canConvert && !lead.convertedToCustomer ? [{
                    icon: <ArrowRightLeft size={16} />,
                    title: 'Convert to Customer',
                    className: 'btn-convert',
                    onClick: () => handleConvert(lead._id),
                  }] : []}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPagination = () => <ServerPagination page={pagination.page} totalPages={pagination.pages} total={pagination.total} limit={pagination.limit || 20} onPageChange={goToPage} onPageSizeChange={setPageSize} loading={loading} />;

  const renderFilters = () => (
    <div className="filter-bar">
      <div className="filter-search-wrapper">
        <span className="filter-search-icon">&#x1F50D;</span>
        <input className="form-control filter-search-input" placeholder="Search by name, email, phone, or lead no..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        {searchInput && <button className="filter-clear-btn" onClick={() => { setSearchInput(''); clearFilters(); }}>&times;</button>}
      </div>
      {isMobile ? (
        <button className="btn btn-secondary btn-sm" onClick={() => setShowFilters(!showFilters)}><Filter size={16} /> Filters</button>
      ) : null}
      {(!isMobile || showFilters) && (
        <>
          <div className="filter-group">
            <label>SOURCE</label>
            <select className="form-control" value={filters.source || ''} onChange={(e) => handleFilterChange('source', e.target.value)}>
              <option value="">All Sources</option>
              {(meta.sources || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>TYPE</label>
            <select className="form-control" value={filters.type || ''} onChange={(e) => handleFilterChange('type', e.target.value)}>
              <option value="">All Types</option>
              {(meta.types || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>CITY</label>
            <select className="form-control" value={filters.city || ''} onChange={(e) => handleFilterChange('city', e.target.value)}>
              <option value="">All Cities</option>
              {(meta.cities || []).map((city) => <option key={city._id} value={city.name}>{city.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>PRIORITY</label>
            <select className="form-control" value={filters.priority || ''} onChange={(e) => handleFilterChange('priority', e.target.value)}>
              <option value="">All Priorities</option>
              {(meta.priorities || []).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>CUSTOMER TYPE</label>
            <select className="form-control" value={filters.customerType || ''} onChange={(e) => handleFilterChange('customerType', e.target.value)}>
              <option value="">All Types</option>
              <option value="individual">Individual</option>
              <option value="corporate">Corporate</option>
            </select>
          </div>
          <div className="filter-group">
            <label>ASSIGNED TO</label>
            <select className="form-control" value={filters.assignedTo || ''} onChange={(e) => handleFilterChange('assignedTo', e.target.value)}>
              <option value="">All Users</option>
              <option value="unassigned">Unassigned</option>
              {(meta.users || []).map((u) => <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>DEPARTMENT</label>
            <select className="form-control" value={filters.department || ''} onChange={(e) => handleFilterChange('department', e.target.value)}>
              <option value="">All Departments</option>
              {(meta.departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>CONVERTED</label>
            <select className="form-control" value={filters.converted || ''} onChange={(e) => handleFilterChange('converted', e.target.value)}>
              <option value="">All</option>
              <option value="true">Converted</option>
              <option value="false">Not Converted</option>
            </select>
          </div>
          <div className="filter-date-range">
            <div className="filter-date-group">
              <label>FROM</label>
              <input type="date" className="form-control" value={filters.startDate || ''} onChange={(e) => handleFilterChange('startDate', e.target.value)} />
            </div>
            <span className="filter-date-sep">&mdash;</span>
            <div className="filter-date-group">
              <label>TO</label>
              <input type="date" className="form-control" value={filters.endDate || ''} onChange={(e) => handleFilterChange('endDate', e.target.value)} />
            </div>
          </div>
          {hasActiveFilters() && (
            <button className="btn btn-secondary filter-reset-btn" onClick={resetFilters}>Reset Filters</button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <h1>Leads Management</h1>
          <p className="subtitle">Manage and track sales leads</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Bulk upload creates leads, so it is the same permission as Add. */}
          {canImport && (
            <button
              type="button"
              className="btn btn-secondary btn-create"
              onClick={() => setShowBulkUpload(true)}
              title="Bulk upload leads (CSV / XLSX)"
            >
              <Upload size={18} style={{ marginRight: 6 }} />
              Upload
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary btn-create" onClick={() => { setEditLead(null); setShowForm(true); }}>
              <Plus size={20} /> Add New Lead
            </button>
          )}
        </div>
      </div>

      {renderStats()}

      {renderFilters()}

      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <span className="selection-count">{selectedIds.size} selected</span>
          <button className="btn btn-danger btn-sm" onClick={() => setDeleteAllTarget(true)}>Delete Selected</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>Deselect All</button>
        </div>
      )}
      {isMobile ? renderCards() : renderTable()}
      {renderPagination()}

      {deleteAllTarget && (
        <ConfirmModal
          isOpen={true}
          title="Delete Selected Leads"
          message={`Are you sure you want to deactivate ${selectedIds.size} lead(s)?`}
          confirmText={deletingAll ? 'Deleting...' : 'Delete All'}
          cancelText="Cancel"
          type="danger"
          onConfirm={handleBulkDelete}
          onCancel={() => setDeleteAllTarget(null)}
        />
      )}

      {showForm && (
        <LeadFormModal
          lead={editLead}
          onClose={() => { setShowForm(false); setEditLead(null); }}
          onSaved={refreshLeads}
        />
      )}

      {drawerId && (
        <LeadDrawer
          leadId={drawerId}
          onClose={() => setDrawerId(null)}
          onUpdated={refreshLeads}
        />
      )}

      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        title="Bulk upload leads"
        description="Import leads from CSV or XLSX. Required columns: customer_name, email, phone."
        templateType="leads"
        onCompleted={() => { refreshLeads(); }}
      />

      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          title="Delete Lead"
          message={`Are you sure you want to deactivate lead ${deleteTarget.leadNo}? This action can be reversed by an admin.`}
          confirmText={deleting ? 'Deleting...' : 'Delete'}
          cancelText="Cancel"
          type="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default function Leads() {
  return (
    <LeadsProvider>
      <LeadsPage />
    </LeadsProvider>
  );
}
