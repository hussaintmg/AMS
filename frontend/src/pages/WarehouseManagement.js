import React, { useState, useEffect, useCallback, useRef } from 'react';
import { warehouseAPI, leadMasterAPI, warehouseManagerRolesAPI } from '../services/api';
import toast from 'react-hot-toast';
import ActionButtons from '../components/ActionButtons';
import { useAuth } from '../context/AuthContext';
import { pageActions } from '../utils/roleJobs';
import ToggleSwitch from '../components/ToggleSwitch';
import ConfirmModal from '../components/ConfirmModal';
import useModalKeyboard from '../hooks/useModalKeyboard';
import '../styles/warehouseManagement.css';
import ServerPagination from '../components/ServerPagination';

const toArray = (value) => Array.isArray(value) ? value : [];

function WarehouseManagement() {
  const { user } = useAuth();
  // See the note in SalesMasterData: none of these asked the role.
  const can = pageActions(user, 'warehouses');
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [stats, setStats] = useState({});

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [currentItem, setCurrentItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState(null);
  const drawerRef = useRef(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Form reference data: warehouse types reuse the Lead "types" master list and
  // managers come from the roles configured under Server Management → Role Usage.
  const [typeOptions, setTypeOptions] = useState([]);
  const [managerOptions, setManagerOptions] = useState([]);

  // ── Drawer keyboard ──────────────────────────────────────────────────

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [drawerOpen]);

  // ── Data fetching ────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const res = await warehouseAPI.getStats();
      if (res.data.success) setStats(res.data.data || {});
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const fetchFormReferenceData = useCallback(async () => {
    const [typesRes, managersRes] = await Promise.allSettled([
      leadMasterAPI.getAll('types', { active: 'true' }),
      warehouseManagerRolesAPI.getUsers(),
    ]);
    if (typesRes.status === 'fulfilled') {
      setTypeOptions(toArray(typesRes.value?.data?.data));
    } else {
      console.error('Failed to load warehouse types:', typesRes.reason);
    }
    if (managersRes.status === 'fulfilled') {
      setManagerOptions(toArray(managersRes.value?.data?.data?.users));
    } else {
      console.error('Failed to load warehouse managers:', managersRes.reason);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search, page: pagination.page, limit: pagination.limit };
      const res = await warehouseAPI.getAll(params);
      if (res.data.success) {
        setWarehouses(toArray(res.data.data));
        if (res.data.pagination) setPagination(res.data.pagination);
      }
    } catch (error) {
      toast.error('Failed to fetch warehouses');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [search, pagination.page, pagination.limit]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchFormReferenceData(); }, [fetchFormReferenceData]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const paginate = (page) => setPagination(prev => ({ ...prev, page }));

  // ── Modal ────────────────────────────────────────────────────────────

  const openModal = (mode, item = null) => {
    setModalMode(mode);
    setCurrentItem(item);
    setFormData(item ? { ...item } : { isActive: true });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormData({});
    setCurrentItem(null);
  };

  useModalKeyboard(modalOpen, closeModal, null);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.warehouseName?.trim()) { toast.error('Warehouse name is required'); return; }
    if (!formData.code?.trim()) { toast.error('Code is required'); return; }
    setSaving(true);
    try {
      const data = { ...formData };
      if (data.capacity) data.capacity = Number(data.capacity);

      const id = currentItem?._id;
      const res = id
        ? await warehouseAPI.update(id, data)
        : await warehouseAPI.create(data);

      if (res.data.success) {
        toast.success(res.data.message);
        fetchData();
        fetchStats();
        closeModal();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await warehouseAPI.delete(deleteTarget._id);
      if (res.data.success) {
        toast.success('Deleted successfully');
        fetchData();
        fetchStats();
        setDeleteTarget(null);
        if (drawerItem?._id === deleteTarget._id) closeDrawer();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Delete failed');
    }
  };

  // ── Drawer ───────────────────────────────────────────────────────────

  const openDrawer = (item) => {
    setDrawerItem(item);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerItem(null);
  };

  // ── Render helpers ───────────────────────────────────────────────────

  const renderStatus = (item) => (
    <span className={`badge-st ${item.isActive ? 'active' : 'inactive'}`}>
      {item.isActive ? 'Active' : 'Inactive'}
    </span>
  );

  const renderActions = (item) => (
    <ActionButtons
      onEdit={can('edit') ? () => openModal('edit', item) : null}
      onDelete={can('delete') ? () => setDeleteTarget(item) : null}
      extraActions={[{ label: 'View', icon: '👁️', onClick: () => openDrawer(item) }]}
    />
  );

  const renderPagination = () => <ServerPagination {...pagination} onPageChange={paginate} onPageSizeChange={(limit) => setPagination(prev => ({ ...prev, page: 1, limit }))} loading={loading} />;

  // ── Table ────────────────────────────────────────────────────────────

  const renderTable = () => (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Warehouse Name</th>
            <th>Type</th>
            <th>City</th>
            <th>Manager</th>
            <th>Capacity</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {warehouses.length === 0 ? (
            <tr><td colSpan="8" style={{ textAlign: 'center' }}>No warehouses found</td></tr>
          ) : warehouses.map(item => (
            <tr key={item._id} onClick={() => openDrawer(item)} style={{ cursor: 'pointer' }}>
              <td><strong className="wh-code">{item.code}</strong></td>
              <td>{item.warehouseName}</td>
              <td>{item.type || '—'}</td>
              <td>{item.city || '—'}</td>
              <td>{item.manager || '—'}</td>
              <td>{item.capacity ? `${item.capacity.toLocaleString()} u` : '—'}</td>
              <td>{renderStatus(item)}</td>
              <td onClick={e => e.stopPropagation()}>{renderActions(item)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Mobile cards ─────────────────────────────────────────────────────

  const renderCards = () => (
    <div className="mobile-cards">
      {warehouses.length === 0 ? (
        <div className="empty-state">No warehouses found</div>
      ) : warehouses.map(item => (
        <div key={item._id} className="data-card" onClick={() => openDrawer(item)}>
          <div className="card-field"><strong>{item.warehouseName}</strong> <span className="wh-code">({item.code})</span></div>
          {item.type && <div className="card-field"><label>Type:</label><span>{item.type}</span></div>}
          {item.city && <div className="card-field"><label>City:</label><span>{item.city}</span></div>}
          {item.manager && <div className="card-field"><label>Manager:</label><span>{item.manager}</span></div>}
          {item.capacity && <div className="card-field"><label>Capacity:</label><span>{item.capacity.toLocaleString()} units</span></div>}
          <div className="card-field">{renderStatus(item)}</div>
          <div className="card-actions" onClick={e => e.stopPropagation()}>
            <ActionButtons onEdit={can('edit') ? () => openModal('edit', item) : null} onDelete={can('delete') ? () => setDeleteTarget(item) : null} />
          </div>
        </div>
      ))}
    </div>
  );

  // ── Form ─────────────────────────────────────────────────────────────

  const renderForm = () => (
    <>
      <div className="form-group">
        <label>Warehouse Name *</label>
        <input type="text" name="warehouseName" value={formData.warehouseName || ''} onChange={handleInputChange} required autoFocus />
      </div>
      <div className="form-group">
        <label>Code *</label>
        <input type="text" name="code" value={formData.code || ''} onChange={handleInputChange} required placeholder="e.g. WH-001" />
      </div>
      <div className="grid-cols-2">
        <div className="form-group">
          <label>Type</label>
          <select name="type" value={formData.type || ''} onChange={handleInputChange}>
            <option value="">Select type</option>
            {typeOptions.map((t) => (
              <option key={t._id} value={t.name}>{t.name}</option>
            ))}
            {/* Preserve a value saved before this list existed. */}
            {formData.type && !typeOptions.some((t) => t.name === formData.type) && (
              <option value={formData.type}>{formData.type}</option>
            )}
          </select>
        </div>
        <div className="form-group">
          <label>Capacity (units)</label>
          <input type="number" name="capacity" value={formData.capacity ?? ''} onChange={handleInputChange} min="0" />
        </div>
      </div>
      <div className="form-group">
        <label>Manager</label>
        <select name="manager" value={formData.manager || ''} onChange={handleInputChange}>
          <option value="">
            {managerOptions.length ? 'Select manager' : 'No manager roles configured in Server Management'}
          </option>
          {managerOptions.map((u) => {
            const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
            return <option key={u._id} value={name}>{name}</option>;
          })}
          {/* Preserve a manager captured before the dropdown was introduced. */}
          {formData.manager && !managerOptions.some((u) => (
            (`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email) === formData.manager
          )) && <option value={formData.manager}>{formData.manager}</option>}
        </select>
      </div>
      <div className="grid-cols-2">
        <div className="form-group">
          <label>Phone</label>
          <input type="text" name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Phone number" />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email address" />
        </div>
      </div>
      <div className="form-group">
        <label>Address</label>
        <textarea name="address" value={formData.address || ''} onChange={handleInputChange} />
      </div>
      <div className="form-group">
        <label>City</label>
        <input type="text" name="city" value={formData.city || ''} onChange={handleInputChange} placeholder="City" />
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ToggleSwitch checked={formData.isActive !== false} onChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
          Active
        </label>
      </div>
    </>
  );

  // ── Drawer content ───────────────────────────────────────────────────

  const renderDrawerContent = () => {
    if (!drawerItem) return null;
    const fields = [
      { label: 'Warehouse Name', value: drawerItem.warehouseName },
      { label: 'Code', value: drawerItem.code },
      { label: 'Type', value: drawerItem.type },
      { label: 'Manager', value: drawerItem.manager },
      { label: 'Phone', value: drawerItem.phone },
      { label: 'Email', value: drawerItem.email },
      { label: 'Address', value: drawerItem.address },
      { label: 'City', value: drawerItem.city },
      { label: 'Capacity', value: drawerItem.capacity ? `${drawerItem.capacity.toLocaleString()} units` : '—' },
    ];
    return (
      <div className="drawer-content">
        <div className="drawer-section">
          <h4>Warehouse Information</h4>
          <div className="drawer-grid">
            {fields.map(f => (
              <div key={f.label} className="drawer-row">
                <span className="drawer-label">{f.label}</span>
                <span className="drawer-value">{f.value || '—'}</span>
              </div>
            ))}
            <div className="drawer-row drawer-row-full">
              <span className="drawer-label">Status</span>
              <span className="drawer-value">{renderStatus(drawerItem)}</span>
            </div>
          </div>
        </div>
        <div className="drawer-actions">
          <button className="btn-primary" onClick={() => { closeDrawer(); setTimeout(() => openModal('edit', drawerItem), 100); }}>
            Edit Warehouse
          </button>
          <button className="btn-secondary" onClick={() => setDeleteTarget(drawerItem)}>
            Delete
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="wh-page">
      {/* Header */}
      <div className="page-header">
        <h1>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="28">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Warehouse Management
        </h1>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon total">🏭</div>
          <div className="stat-info"><h3>Total</h3><div className="value">{stats.total ?? 0}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon active-st">✅</div>
          <div className="stat-info"><h3>Active</h3><div className="value">{stats.active ?? 0}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon inactive-st">❌</div>
          <div className="stat-info"><h3>Inactive</h3><div className="value">{stats.inactive ?? 0}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon cap">📦</div>
          <div className="stat-info"><h3>Cities</h3><div className="value">{stats.citiesCovered ?? 0}</div></div>
        </div>
      </div>

      {/* Content */}
      <div className="content-card">
        <div className="action-bar">
          <div className="search-box">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="11" cy="11" r="7" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m20 20-4-4" />
            </svg>
            <input type="text" placeholder="Search by name, code, city, manager..." value={search} onChange={handleSearch} />
          </div>
          {can('create') && <button className="add-btn" onClick={() => openModal('create')}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Warehouse
          </button>}
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><div className="spinner"></div></div>
        ) : (
          <>
            <div className="desktop-table">{renderTable()}</div>
            <div className="mobile-cards-view">{renderCards()}</div>
            {renderPagination()}
          </>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMode === 'create' ? 'Add Warehouse' : 'Edit Warehouse'}</h2>
              <button className="close-btn" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">{renderForm()}</div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner-mini"></span> Saving...</> : modalMode === 'create' ? 'Add Warehouse' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}>
          <div className="drawer-panel" ref={drawerRef} onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>{drawerItem?.warehouseName || 'Warehouse Details'}</h3>
              <button className="drawer-close" onClick={closeDrawer}>&times;</button>
            </div>
            <div className="drawer-body">
              {renderDrawerContent()}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Warehouse"
        message={`Are you sure you want to delete "${deleteTarget?.warehouseName || ''}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmText="Delete"
        type="danger"
      />
    </div>
  );
}

export default WarehouseManagement;
