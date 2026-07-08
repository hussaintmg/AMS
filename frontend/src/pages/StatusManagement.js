import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStatusManagement } from '../context/StatusManagementContext';
import ErrorPopup from '../components/ErrorPopup';
import ActionButtons from '../components/ActionButtons';
import ConfirmModal from '../components/ConfirmModal';
import StatusFormModal from '../components/statuses/StatusFormModal';
import StatusDrawer from '../components/statuses/StatusDrawer';
import '../styles/userManagement.css';

const StatusManagement = () => {
  const {
    collections, stats, loading, saving,
    drawerOpen, selectedCollection, statusItems, drawerLoading,
    loadCollections, loadStats,
    createCollection, updateCollection, deleteCollection,
    openDrawer, closeDrawer,
    createStatusItem, updateStatusItem, deleteStatusItem,
    toggleStatusItem, setDefaultStatusItem,
  } = useStatusManagement();

  const { user } = useAuth();
  const [errorPopup, setErrorPopup] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadCollections();
    loadStats();
  }, []);

  // Refresh when search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = {};
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (filterStatus !== 'all') params.isActive = filterStatus;
      loadCollections(params);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filterStatus, loadCollections]);

  const handleCreate = async (data) => {
    setCreateSaving(true);
    try {
      const result = await createCollection(data);
      if (result.success) {
        setShowCreateModal(false);
      }
    } finally {
      setCreateSaving(false);
    }
  };

  const handleSaveFromDrawer = async (id, formData) => {
    const payload = {
      ...formData,
      usage: formData.usage.filter((u) => u.module || u.page || u.field),
    };
    const result = await updateCollection(id, payload);
    return result;
  };

  const handleDelete = async (id) => {
    setDeleteSaving(true);
    try {
      await deleteCollection(id);
      setDeleteConfirm(null);
    } finally {
      setDeleteSaving(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '-';
    }
  };

  // Filter collections locally for instant feedback alongside API search
  const displayedCollections = (collections || []).filter((c) => {
    if (filterStatus === 'active' && !c.isActive) return false;
    if (filterStatus === 'inactive' && c.isActive) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.key || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.usage || []).some((u) =>
        (u.module || '').toLowerCase().includes(q) ||
        (u.page || '').toLowerCase().includes(q) ||
        (u.field || '').toLowerCase().includes(q)
      )
    );
  });

  return (
    <div className="user-management-page">
      <div className="page-header">
        <div>
          <h1>Status Collections</h1>
          <p className="subtitle">Manage status collections and their items</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + Create Status Collection
        </button>
      </div>

      <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

      {/* Stats */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">&#x1F4CB;</div>
            <div className="stat-content">
              <span className="stat-value">{stats.total || 0}</span>
              <span className="stat-label">Total Collections</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">&#x2705;</div>
            <div className="stat-content">
              <span className="stat-value">{stats.active || 0}</span>
              <span className="stat-label">Active</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">&#x274C;</div>
            <div className="stat-content">
              <span className="stat-value">{stats.inactive || 0}</span>
              <span className="stat-label">Inactive</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">&#x1F4A0;</div>
            <div className="stat-content">
              <span className="stat-value">{stats.totalItems || 0}</span>
              <span className="stat-label">Total Status Items</span>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="form-control"
          style={{ maxWidth: '320px' }}
          placeholder="Search collections..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="form-control"
          style={{ maxWidth: '160px' }}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
        </div>
      )}

      {/* Desktop Table */}
      {!loading && (
        <div className="table-container desktop-only">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Status Count</th>
                <th>Active Items</th>
                <th>Usage Count</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ width: '100px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedCollections.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                    No status collections found
                  </td>
                </tr>
              ) : (
                displayedCollections.map((col) => (
                  <tr
                    key={col._id || col.id}
                    onClick={() => openDrawer(col._id || col.id)}
                    style={{ cursor: 'pointer' }}
                    className={!col.isActive ? 'inactive-row' : ''}
                  >
                    <td><strong>{col.name}</strong></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{col.key}</td>
                    <td>{col.statusCount ?? 0}</td>
                    <td>{col.activeStatusCount ?? 0}</td>
                    <td>{(col.usage || []).filter((u) => u.module).length}</td>
                    <td>
                      <span className={`badge ${col.isActive ? 'badge-active' : 'badge-inactive'}`}>
                        {col.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(col.createdAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="action-buttons">
                        <button
                          className="btn-action btn-edit"
                          onClick={() => openDrawer(col._id || col.id)}
                          title="View Details"
                        >&#128065;</button>
                        <button
                          className="btn-action btn-delete"
                          onClick={() => setDeleteConfirm(col)}
                          title="Delete"
                        >&#128465;</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile Cards */}
      {!loading && (
        <div className="mobile-cards-container mobile-only">
          {displayedCollections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              No status collections found
            </div>
          ) : (
            displayedCollections.map((col) => (
              <div
                key={col._id || col.id}
                className="user-card"
                onClick={() => openDrawer(col._id || col.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="user-card-header">
                  <strong>{col.name}</strong>
                  <span className={`badge ${col.isActive ? 'badge-active' : 'badge-inactive'}`}>
                    {col.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="user-card-body">
                  <div className="user-card-field">
                    <span className="field-label">Key</span>
                    <span>{col.key}</span>
                  </div>
                  <div className="user-card-field">
                    <span className="field-label">Statuses</span>
                    <span>{col.statusCount ?? 0} total, {col.activeStatusCount ?? 0} active</span>
                  </div>
                  <div className="user-card-field">
                    <span className="field-label">Created</span>
                    <span>{formatDate(col.createdAt)}</span>
                  </div>
                </div>
                <div className="user-card-actions">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={(e) => { e.stopPropagation(); openDrawer(col._id || col.id); }}
                  >View</button>
                  <button
                    className="btn btn-sm btn-delete"
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(col); }}
                  >Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Modal */}
      <StatusFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        mode="create"
        onSubmit={handleCreate}
        loading={createSaving}
      />

      {/* Drawer */}
      <StatusDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        collection={selectedCollection}
        statusItems={statusItems}
        onSaveCollection={handleSaveFromDrawer}
        onDeleteCollection={(id) => deleteCollection(id)}
        onCreateItem={createStatusItem}
        onUpdateItem={updateStatusItem}
        onDeleteItem={deleteStatusItem}
        onToggleItem={toggleStatusItem}
        onSetDefault={setDefaultStatusItem}
        saving={saving}
      />

      {/* Delete Collection Confirm */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Status Collection"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? Its statuses will be deactivated.`}
        onConfirm={() => handleDelete(deleteConfirm?._id || deleteConfirm?.id)}
        onCancel={() => setDeleteConfirm(null)}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};

export default StatusManagement;
