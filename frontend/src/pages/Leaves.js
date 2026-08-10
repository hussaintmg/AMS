import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLeaves } from '../context/LeavesContext';
import toast from 'react-hot-toast';
import ErrorPopup from '../components/ErrorPopup';
import ConfirmModal from '../components/ConfirmModal';
import ActionButtons from '../components/ActionButtons';
import LeaveFormModal from './LeaveFormModal';
import LeaveDrawer from './LeaveDrawer';
import BulkSelectionBar from '../components/BulkSelectionBar';
import { Search } from "lucide-react";
import { fieldAccessor } from '../utils/roleJobs';
import '../styles/userManagement.css';

const STATUS_BADGE = {
  pending: 'badge-warning', approved: 'badge-success',
  rejected: 'badge-danger', cancelled: 'badge-secondary',
};

const Leaves = () => {
  const { user: currentUser, hasRole } = useAuth();
  const {
    leaves: ctxLeaves, employees, stats,
    loading: ctxLoading, saving,
    loadLeaves, loadReferenceData,
    createLeave, updateLeave, deleteLeave, approveRejectLeave, bulkDeleteLeaves, bulkDeactivateLeaves,
    setLeaves,
  } = useLeaves();
  const [loading, setLoading] = useState(true);
  const [errorPopup, setErrorPopup] = useState(null);
  // Which columns this role may read. The API already strips what it withholds,
  // so this only stops us drawing a column that would always be blank.
  const showField = fieldAccessor(currentUser, 'leaves');

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState('');
  const [empFilter, setEmpFilter] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedLeave, setSelectedLeave] = useState(null);

  const [drawerLeave, setDrawerLeave] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);
  const toggleSelected = (id) => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allSelected = ctxLeaves.length > 0 && ctxLeaves.every(item => selectedIds.has(item._id || item.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(ctxLeaves.map(item => item._id || item.id)));
  const handleBulkAction = async () => {
    const result = bulkAction === 'delete' ? await bulkDeleteLeaves([...selectedIds]) : await bulkDeactivateLeaves([...selectedIds]);
    if (result.success) { setSelectedIds(new Set()); setBulkAction(null); fetchLeaves(); loadReferenceData(); }
    else if (result.error) setErrorPopup(result.error);
  };

  const canApprove = hasRole(['super_admin', 'admin', 'hr_admin']);

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit, ...(search && { search }), ...(statusFilter && { status: statusFilter }), ...(empFilter && { employee: empFilter }) };
      const response = await loadLeaves(params);
      if (response) {
        const list = response.leaves || [];
        setLeaves(list);
        setTotalPages(Math.ceil(response.pagination?.total / limit) || 1);
        setTotal(response.pagination?.total || 0);
      }
    } catch (err) {
      toast.error('Failed to load leaves');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, empFilter, loadLeaves, setLeaves]);

  useEffect(() => { if (currentUser) fetchLeaves(); }, [currentUser, fetchLeaves]);

  useEffect(() => { if (currentUser) loadReferenceData().catch(() => {}); }, [currentUser, loadReferenceData]);

  useEffect(() => { if (urlSearch) setSearch(urlSearch); }, [urlSearch]);

  useEffect(() => { if (searchParams.get('action') === 'create') openModal('create'); }, []);

  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => { setPage(1); fetchLeaves(); }, 300);
    return () => clearTimeout(timer);
  }, [currentUser, search, statusFilter, empFilter, fetchLeaves]);

  const openModal = (mode, leave = null) => {
    setModalMode(mode);
    setSelectedLeave(leave);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setSelectedLeave(null); };

  const handleCreate = async (formData) => {
    const result = await createLeave(formData);
    if (result.success) { closeModal(); fetchLeaves(); }
    else if (result.error) setErrorPopup(result.error);
  };

  const handleUpdate = async (formData) => {
    const id = selectedLeave?._id || selectedLeave?.id;
    const result = await updateLeave(id, formData);
    if (result.success) { closeModal(); fetchLeaves(); }
    else if (result.error) setErrorPopup(result.error);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete._id || confirmDelete.id;
    const result = await deleteLeave(id);
    if (result.success) { setConfirmDelete(null); fetchLeaves(); }
    else if (result.error) setErrorPopup(result.error);
  };

  const handleApproveReject = async (id, status) => {
    const result = await approveRejectLeave(id, status);
    if (!result.success && result.error) setErrorPopup(result.error);
    if (result.success) fetchLeaves();
  };

  const empOptions = employees.map(e => ({
    id: e._id || e.id,
    name: `${e.firstName || e.first_name || ''} ${e.lastName || e.last_name || ''}`.trim() || e.email || '',
  }));

  const empName = (l) => {
    if (l.employee) return `${l.employee.firstName || ''} ${l.employee.lastName || ''}`.trim() || '-';
    return '-';
  };

  return (
    <div className="user-management-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Leaves</h1>
          <p className="subtitle">Manage leave requests, approvals, and balances</p>
        </div>
        <button className="btn btn-primary btn-create" onClick={() => openModal('create')}>
          <span className="icon">+</span> New Leave Request
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total || 0}</span>
            <span className="stat-label">Total Requests</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <span className="stat-value">{stats.pending || 0}</span>
            <span className="stat-label">Pending</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #22c55e' }}>
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <span className="stat-value">{stats.approved || 0}</span>
            <span className="stat-label">Approved</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="stat-icon">✕</div>
          <div className="stat-content">
            <span className="stat-value">{stats.rejected || 0}</span>
            <span className="stat-label">Rejected</span>
          </div>
        </div>
      </div>

      <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

      <div className="filters-bar">
        <div className="search-box">
          <span className="search-icon">
              <Search size={18} style={{ color: "#9ca3af" }} />
            </span>
          <input type="text" placeholder="Search by reason..."
            value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        </div>
        <select className="form-control" style={{ width: 140 }} value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="results-count">{total} requests found</span>
      </div>
      <BulkSelectionBar count={selectedIds.size} disabled={saving} onDeactivate={() => setBulkAction('deactivate')} onDelete={() => setBulkAction('delete')} />

      <div className="table-container desktop-only">
        {loading ? (
          <div className="loading-state"><div className="spinner"></div><p>Loading leaves...</p></div>
        ) : ctxLeaves.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>No Leave Requests Found</h3>
            <p>No leave requests match your search criteria.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="selection-cell"><input type="checkbox" aria-label="Select all leave requests on this page" checked={allSelected} onChange={toggleAll} /></th>
                {showField('employee') && <th>Employee</th>}
                {showField('leave') && <th>Leave Type</th>}
                {showField('leave') && <th>Start</th>}
                {showField('leave') && <th>End</th>}
                {showField('leave') && <th>Days</th>}
                {showField('status') && <th>Status</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ctxLeaves.map(leave => {
                const id = leave._id || leave.id;
                return (
                  <tr key={id} onClick={() => setDrawerLeave(leave)} style={{ cursor: 'pointer' }}>
                    <td className="selection-cell" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label="Select leave request" checked={selectedIds.has(id)} onChange={() => toggleSelected(id)} /></td>
                    {showField('employee') && <td>{empName(leave)}</td>}
                    {showField('leave') && <td><span className="badge badge-info">{leave.leaveType || '-'}</span></td>}
                    {showField('leave') && <td>{leave.startDate ? new Date(leave.startDate).toLocaleDateString('en-GB') : '-'}</td>}
                    {showField('leave') && <td>{leave.endDate ? new Date(leave.endDate).toLocaleDateString('en-GB') : '-'}</td>}
                    {showField('leave') && <td>{leave.days || '-'}</td>}
                    {showField('status') && (
                      <td>
                        <span className={`badge ${STATUS_BADGE[leave.status] || 'badge-secondary'}`}>
                          {leave.status || '-'}
                        </span>
                      </td>
                    )}
                    <td onClick={e => e.stopPropagation()}>
                      {leave.status === 'pending' ? (
                        <div className="action-buttons">
                          {canApprove && (
                            <>
                              <button className="btn btn-sm btn-success" onClick={() => handleApproveReject(id, 'approved')}>Approve</button>
                              <button className="btn btn-sm btn-secondary" onClick={() => handleApproveReject(id, 'rejected')}>Reject</button>
                            </>
                          )}
                          <ActionButtons
                            onEdit={() => openModal('edit', leave)}
                            onDelete={() => setConfirmDelete(leave)}
                            showEdit showDelete
                          />
                        </div>
                      ) : (
                        <ActionButtons
                          onEdit={() => openModal('edit', leave)}
                          onDelete={() => setConfirmDelete(leave)}
                          showEdit showDelete
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mobile-only">
        {loading ? (
          <div className="loading-state"><div className="spinner"></div><p>Loading leaves...</p></div>
        ) : ctxLeaves.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>No Leave Requests Found</h3>
          </div>
        ) : (
          <div className="cards-grid">
            {ctxLeaves.map(leave => {
              const id = leave._id || leave.id;
              const statusKey = (leave.status || '').toLowerCase();
              return (
                <div key={id} className="data-card" onClick={() => setDrawerLeave(leave)}>
                  <input type="checkbox" className="card-select-checkbox" aria-label="Select leave request" checked={selectedIds.has(id)} onChange={() => toggleSelected(id)} onClick={e => e.stopPropagation()} />
                  <div className="data-card-top">
                    <div className="data-card-avatar">
                      {((leave.employee?.firstName?.[0] || '') + (leave.employee?.lastName?.[0] || '')).trim() || '?'}
                    </div>
                    <div className="data-card-info">
                      {showField('employee') && <span className="data-card-title">{empName(leave)}</span>}
                      {showField('leave') && <span className="data-card-subtitle">{leave.leaveType || '-'}</span>}
                    </div>
                    {showField('status') && <span className={`badge-pill status-${statusKey}`}>{leave.status || '-'}</span>}
                  </div>
                  <div className="data-card-body">
                    {showField('leave') && (
                      <div className="data-card-row">
                        <span className="row-icon">📅</span>
                        <span className="row-label">Dates</span>
                        <span className="row-value">
                          {leave.startDate ? new Date(leave.startDate).toLocaleDateString('en-GB') : '-'} → {leave.endDate ? new Date(leave.endDate).toLocaleDateString('en-GB') : '-'}
                        </span>
                      </div>
                    )}
                    {showField('leave') && (
                      <div className="data-card-row">
                        <span className="row-icon">📆</span>
                        <span className="row-label">Days</span>
                        <span className="row-value">{leave.days || '-'}</span>
                      </div>
                    )}
                    {showField('reason') && (
                      <div className="data-card-row">
                        <span className="row-icon">💬</span>
                        <span className="row-label">Reason</span>
                        <span className="row-value">{leave.reason || '-'}</span>
                      </div>
                    )}
                  </div>
                  <div className="data-card-footer" onClick={e => e.stopPropagation()}>
                    {leave.status === 'pending' && canApprove && (
                      <>
                        <button className="btn btn-sm btn-success" onClick={() => handleApproveReject(id, 'approved')}>✓ Approve</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleApproveReject(id, 'rejected')}>✕ Reject</button>
                      </>
                    )}
                    <ActionButtons
                      onEdit={() => openModal('edit', leave)}
                      onDelete={() => setConfirmDelete(leave)}
                      showEdit showDelete
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn-page" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Previous</button>
          <div className="page-numbers">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pn; if (totalPages <= 5) pn = i + 1;
              else if (page <= 3) pn = i + 1;
              else if (page >= totalPages - 2) pn = totalPages - 4 + i;
              else pn = page - 2 + i;
              return <button key={pn} className={`btn-page ${page === pn ? 'active' : ''}`} onClick={() => setPage(pn)}>{pn}</button>;
            })}
          </div>
          <button className="btn-page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
        </div>
      )}

      <ConfirmModal
        isOpen={!!bulkAction}
        title={bulkAction === 'delete' ? 'Delete Leave Requests' : 'Deactivate Leave Requests'}
        message={`${bulkAction === 'delete' ? 'Delete' : 'Deactivate'} ${selectedIds.size} selected leave request(s)?`}
        confirmText={bulkAction === 'delete' ? 'Delete' : 'Deactivate'}
        onConfirm={handleBulkAction}
        onCancel={() => setBulkAction(null)}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Delete Leave Request"
        message="Delete this leave request?"
        confirmText="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <LeaveFormModal
        isOpen={showModal} mode={modalMode} initialData={selectedLeave}
        employees={employees}
        onClose={closeModal}
        onSubmit={modalMode === 'create' ? handleCreate : handleUpdate}
        loading={saving}
      />

      <LeaveDrawer isOpen={!!drawerLeave} onClose={() => setDrawerLeave(null)} leave={drawerLeave} />
    </div>
  );
};

export default Leaves;
