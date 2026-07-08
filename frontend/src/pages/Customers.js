import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, ChevronLeft, ChevronRight, User, CalendarDays, ChartBar, ArrowRightLeft, X, Building2, Users, Filter } from 'lucide-react';
import { CustomersProvider, useCustomers } from '../context/CustomersContext';
import CustomerFormModal from '../components/customers/CustomerFormModal';
import CustomerDrawer from '../components/customers/CustomerDrawer';
import ActionButtons from '../components/ActionButtons';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/leadManagement.css';
import '../styles/filters.css';

function XIcon({ className }) { return <X className={className} />; }

const statsIcons = {
  total: { icon: Users, color: '#3b82f6', bg: '#dbeafe' },
  active: { icon: User, color: '#10b981', bg: '#dcfce7' },
  inactive: { icon: X, color: '#ef4444', bg: '#fee2e2' },
  individual: { icon: User, color: '#8b5cf6', bg: '#ede9fe' },
  corporate: { icon: Building2, color: '#f59e0b', bg: '#fef3c7' },
  convertedFromLead: { icon: ArrowRightLeft, color: '#06b6d4', bg: '#cffafe' },
  newThisMonth: { icon: ChartBar, color: '#f97316', bg: '#ffedd5' },
};

function CustomersPage() {
  const { customers, stats, meta, pagination, loading, filters, search, handleSearch, handleFilter, clearFilters, loadCustomers, openDrawer, closeDrawer, drawerOpen, selectedCustomerId, refresh, deleteCustomer, toggleCustomerStatus } = useCustomers();
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [searchInput, setSearchInput] = useState(search);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showFilters, setShowFilters] = useState(false);

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
    if (search !== searchInput) loadCustomers(1);
  }, [search]);

  useEffect(() => {
    loadCustomers(1);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteCustomer(deleteTarget._id);
      if (res?.success) toast.success(res.message);
      else toast.error(res?.message || 'Delete failed');
    } catch (err) {
      toast.error('Failed to delete customer');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const renderStats = () => {
    if (!stats) return null;
    const items = [
      { key: 'total', label: 'Total Customers', value: stats.total },
      { key: 'active', label: 'Active', value: stats.active },
      { key: 'inactive', label: 'Inactive', value: stats.inactive },
      { key: 'individual', label: 'Individual', value: stats.individual },
      { key: 'corporate', label: 'Corporate', value: stats.corporate },
      { key: 'convertedFromLead', label: 'From Leads', value: stats.convertedFromLead },
      { key: 'newThisMonth', label: 'New (30 days)', value: stats.newThisMonth },
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
    <div className="table-container desktop-only">
      {loading ? (
        <div className="loading-state"><div className="spinner"></div><p>Loading customers...</p></div>
      ) : customers.length === 0 ? (
        <div className="empty-state" style={{padding:"5px 10px"}}><h3>No Customers Found</h3><p>Try adjusting filters or create a new customer.</p></div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Source</th>
              <th>Type</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th>Department</th>
              <th>Active Status</th>
              <th>Created Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c._id} className={!c.isActive ? 'row-inactive' : ''} onClick={() => openDrawer(c._id)} style={{ cursor: 'pointer' }}>
                <td>
                  <div className="user-cell">
                    <div className="user-info">
                      <span className="user-name">{c.firstName} {c.lastName}</span>
                    </div>
                  </div>
                </td>
                <td>{c.email || '-'}</td>
                <td>{c.phone || '-'}</td>
                <td>{c.source?.name || '-'}</td>
                <td>{c.type?.name || '-'}</td>
                <td>{c.status || '-'}</td>
                <td>{c.assignedTo ? `${c.assignedTo.firstName || ''} ${c.assignedTo.lastName || ''}`.trim() || c.assignedTo.email : '-'}</td>
                <td>{c.department?.name || '-'}</td>
                <td><span className={`status-badge ${c.isActive ? 'status-active' : 'status-inactive'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-'}</td>
                <td>
                  <ActionButtons
                    onEdit={() => { setEditCustomer(c); setShowForm(true); }}
                    onToggle={() => toggleCustomerStatus(c._id).then((res) => { if (res?.success) toast.success(res.message); }).catch(() => toast.error('Failed to toggle status'))}
                    onDelete={() => setDeleteTarget(c)}
                    status={c.isActive}
                    title={c.customerCode}
                    showToggle
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
        <div className="loading-state"><div className="spinner"></div><p>Loading customers...</p></div>
      ) : customers.length === 0 ? (
        <div className="empty-state" style={{padding:"5px 10px"}}><h3>No Customers Found</h3></div>
      ) : (
        <div className="users-cards-grid">
          {customers.map((c) => (
            <div key={c._id} className={`user-card ${!c.isActive ? 'card-inactive' : ''}`} onClick={() => openDrawer(c._id)}>
              <div className="user-card-header">
                <div className="user-card-title">
                  <span className="user-card-name">{c.firstName} {c.lastName}</span>
                  <span className="user-card-role">{c.customerCode}</span>
                </div>
                <span className={`status-badge ${c.isActive ? 'status-active' : 'status-inactive'}`}>{c.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="user-card-body">
                <div className="user-card-field"><span className="field-label">Email</span><span className="field-value">{c.email || '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Phone</span><span className="field-value">{c.phone || '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Source</span><span className="field-value">{c.source?.name || '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Type</span><span className="field-value">{c.type?.name || '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Status</span><span className="field-value">{c.status || '-'}</span></div>
                <div className="user-card-field"><span className="field-label">Department</span><span className="field-value">{c.department?.name || '-'}</span></div>
              </div>
              <div className="user-card-actions">
                <ActionButtons
                  onEdit={() => { setEditCustomer(c); setShowForm(true); }}
                  onToggle={() => toggleCustomerStatus(c._id).then((res) => { if (res?.success) toast.success(res.message); }).catch(() => toast.error('Failed'))}
                  onDelete={() => setDeleteTarget(c)}
                  status={c.isActive}
                  title={c.customerCode}
                  showToggle
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPagination = () => {
    if (pagination.pages <= 1) return null;
    return (
      <div className="pagination">
        <button className="btn btn-secondary btn-sm" disabled={pagination.page <= 1} onClick={() => loadCustomers(pagination.page - 1)}><ChevronLeft size={16} /></button>
        <span className="page-info">Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
        <button className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.pages} onClick={() => loadCustomers(pagination.page + 1)}><ChevronRight size={16} /></button>
      </div>
    );
  };

  const renderFilters = () => (
    <div className="filter-bar">
      <div className="filter-search-wrapper">
        <span className="filter-search-icon">&#x1F50D;</span>
        <input className="form-control filter-search-input" placeholder="Search by name, email, phone, or code..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
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
            <label>STATUS</label>
            <select className="form-control" value={filters.status || ''} onChange={(e) => handleFilterChange('status', e.target.value)}>
              <option value="">All Statuses</option>
              {(meta.statuses || []).map((s) => <option key={s._id} value={s.value || s.label}>{s.label}</option>)}
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
            <label>ACTIVE</label>
            <select className="form-control" value={filters.isActive || 'all'} onChange={(e) => handleFilterChange('isActive', e.target.value)}>
              <option value="all">All</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>
          <div className="filter-date-range">
            <div className="filter-date-group">
              <label>FROM</label>
              <input type="date" className="form-control" value={filters.startDate || ''} onChange={(e) => handleFilterChange('startDate', e.target.value)} />
            </div>
            <span className="filter-date-sep">—</span>
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
          <h1>Customers Management</h1>
          <p className="subtitle">Manage customer records</p>
        </div>
        <button className="btn btn-primary btn-create" onClick={() => { setEditCustomer(null); setShowForm(true); }}>
          <Plus size={20} /> Add New Customer
        </button>
      </div>

      {renderStats()}

      {renderFilters()}

      {isMobile ? renderCards() : renderTable()}
      {renderPagination()}

      {showForm && (
        <CustomerFormModal
          customer={editCustomer}
          onClose={() => { setShowForm(false); setEditCustomer(null); }}
          onSaved={refresh}
        />
      )}

      {drawerOpen && selectedCustomerId && (
        <CustomerDrawer
          customerId={selectedCustomerId}
          onClose={closeDrawer}
          onUpdated={refresh}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          title="Delete Customer"
          message={`Are you sure you want to deactivate customer ${deleteTarget.customerCode}?`}
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

export default function Customers() {
  return (
    <CustomersProvider>
      <CustomersPage />
    </CustomersProvider>
  );
}
