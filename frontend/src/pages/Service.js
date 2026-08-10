import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import DataTable from '../components/DataTable';
import { Routes, Route, NavLink, useSearchParams, useNavigate } from 'react-router-dom';
import { serviceAPI, customerAPI, partsAPI, serviceMasterAPI, vehicleAPI } from '../services/api';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';
import SalesDrawer from '../components/sales/SalesDrawer';
import CustomerQuickCreate from '../components/customers/CustomerQuickCreate';
import useModalKeyboard from '../hooks/useModalKeyboard';
import { useAuth } from '../context/AuthContext';
import vehicleBrandingService from '../services/vehicleBrandingService';
import useErpDocumentSettings from '../hooks/useErpDocumentSettings';
import { fieldAccessor } from '../utils/roleJobs';
import '../styles/userManagement.css';
import '../styles/service.css';

function Service() {
  return (
    <div>
      <div className="page-header">
        <h1>Service Management</h1>
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <NavLink to="/service/appointments" className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}>Appointments</NavLink>
        <NavLink to="/service/job-cards" className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}>Job Cards</NavLink>
      </div>
      <Routes>
        <Route path="appointments" element={<Appointments />} />
        <Route path="job-cards" element={<JobCards />} />
        <Route path="*" element={<Appointments />} />
      </Routes>
    </div>
  );
}

function customerOptionLabel(customer) {
  if (!customer) return '';
  const no = customer.customer_number ? `${customer.customer_number} - ` : '';
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  const phone = customer.phone ? ` - ${customer.phone}` : '';
  return `${no}${name}${phone}`.trim();
}

async function fetchAllCustomersForDropdown() {
  const res = await customerAPI.getAllForDropdown();
  const all = res?.data?.data || [];
  const seen = new Set();
  return all.filter((c) => { if (!c?.id || seen.has(c.id)) return false; seen.add(c.id); return true; });
}

const APPT_STATUS_CLASS = { scheduled: 'info', confirmed: 'primary', in_progress: 'warning', completed: 'success', cancelled: 'danger', no_show: 'secondary' };

function ServicePagination({ pagination, setPagination }) {
  const total = Number(pagination.total || 0);
  const page = Number(pagination.page || 1);
  const limit = Number(pagination.limit || 20);
  const totalPages = Number(pagination.totalPages || Math.ceil(total / limit) || 1);
  return (
    <div className="pagination-controls service-pagination">
      <span>Showing {total ? ((page - 1) * limit) + 1 : 0} to {Math.min(page * limit, total)} of {total}</span>
      <div className="service-pagination-actions">
        <select className="form-control" value={limit} onChange={(e) => setPagination((prev) => ({ ...prev, limit: Number(e.target.value), page: 1 }))}>
          <option value="10">10 / page</option><option value="20">20 / page</option><option value="50">50 / page</option>
        </select>
        <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPagination((prev) => ({ ...prev, page: page - 1 }))}>‹</button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPagination((prev) => ({ ...prev, page: page + 1 }))}>›</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENTS
// ═══════════════════════════════════════════════════════════════════════════

function Appointments() {
  const { user } = useAuth();
  // Which columns this role may read. The API already strips what it withholds,
  // so this only stops us drawing a column that would always be blank.
  const showField = fieldAccessor(user, 'service_appointments');
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedItem, setSelectedItem] = useState(null);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [vehicleBrands, setVehicleBrands] = useState([]);
  const [vehicleModels, setVehicleModels] = useState([]);
  const [vehicleVariants, setVehicleVariants] = useState([]);
  const [selectedMakeId, setSelectedMakeId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [stats, setStats] = useState({ total: 0, scheduled: 0, confirmed: 0, in_progress: 0, completed: 0, today: 0 });
  const [filters, setFilters] = useState({ search: urlSearch, status: '', customerId: '', dateFrom: '', dateTo: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const [formData, setFormData] = useState({
    customerId: '', vehicleId: '', vehicleNumber: '', vehicleMake: '', vehicleModel: '',
    vehicleVariant: '', vehicleYear: '', vehicleVin: '', serviceTypeId: '', appointmentDate: '',
    appointmentTime: '', estimatedDuration: '', customerConcerns: '', notes: '', serviceAdvisorId: '',
  });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const canCreate = ['super_admin', 'service_manager', 'service_advisor'].includes(user?.role);
  const canEdit = ['super_admin', 'service_manager'].includes(user?.role);
  const canDelete = ['super_admin', 'service_manager'].includes(user?.role);

  const fetchData = useCallback(async () => {
      try {
        setLoading(true);
        const params = { ...filters, page: pagination.page, limit: pagination.limit };
        Object.keys(params).forEach((key) => { if (params[key] === '' || params[key] == null) delete params[key]; });
        const [res, statsRes] = await Promise.all([serviceAPI.getAppointments(params), serviceAPI.getAppointmentStats()]);
        setData(res.data?.data || []);
        setPagination((prev) => ({ ...prev, ...(res.data?.pagination || {}) }));
        setStats(statsRes.data?.data || {});
      }
      catch (_) { setData([]); } finally { setLoading(false); }
  }, [filters, pagination.page, pagination.limit]);

  // Detail drawer
  const [drawerItem, setDrawerItem] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const loadDrawer = useCallback(async (id) => {
    setDrawerLoading(true);
    try {
      const res = await serviceAPI.getAppointment(id);
      setDrawerItem(res.data?.data || null);
    } catch (_) {
      toast.error('Failed to load appointment');
      setDrawerItem(null);
    } finally { setDrawerLoading(false); }
  }, []);

  const openDrawer = (row) => { setDrawerItem({ id: row.id }); loadDrawer(row.id); };

  const handleDrawerStatus = async (status) => {
    if (!drawerItem?.id) return;
    setSavingStatus(true);
    try {
      await serviceAPI.updateAppointmentStatus(drawerItem.id, status);
      toast.success('Status updated');
      await Promise.all([loadDrawer(drawerItem.id), fetchData()]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update status');
    } finally { setSavingStatus(false); }
  };

  const fetchDropdowns = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        fetchAllCustomersForDropdown(),
        serviceMasterAPI.getTypes(),
        serviceAPI.getAdvisors().catch(() => ({ data: { data: [] } })),
        vehicleAPI.getMakes(),
      ]);
      setCustomers(results[0].status === 'fulfilled' ? results[0].value || [] : []);
      const types = results[1].status === 'fulfilled' ? results[1].value?.data?.data || [] : [];
      setServiceTypes(types);
      setAdvisors(results[2].status === 'fulfilled' ? results[2].value?.data?.data || [] : []);
      // Brands come from vehicle master data so the picker matches the makes,
      // models and variants actually held in the catalogue.
      setVehicleBrands(results[3].status === 'fulfilled' ? results[3].value?.data?.data || [] : []);
    } catch (_) {}
  }, []);

  // Models/variants cascade from the current make/model selection.
  const loadModelsForMake = useCallback(async (makeId) => {
    if (!makeId) { setVehicleModels([]); setVehicleVariants([]); return; }
    try {
      const res = await vehicleAPI.getModels(makeId);
      setVehicleModels(res?.data?.data || []);
    } catch (_) { setVehicleModels([]); }
  }, []);

  const loadVariantsForModel = useCallback(async (modelId) => {
    if (!modelId) { setVehicleVariants([]); return; }
    try {
      const res = await vehicleAPI.getVariants(modelId);
      setVehicleVariants(res?.data?.data || []);
    } catch (_) { setVehicleVariants([]); }
  }, []);

  useEffect(() => { fetchData(); fetchDropdowns(); }, [fetchData, fetchDropdowns]);
  useEffect(() => { if (searchParams.get('action') === 'create') openModal('create'); }, []);

  const updateFilter = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };
  const clearFilters = () => { setFilters({ search: '', status: '', customerId: '', dateFrom: '', dateTo: '' }); setPagination((prev) => ({ ...prev, page: 1 })); };

  // Rule 2 — refresh dropdown and auto-select the customer created inline
  const handleCustomerCreated = useCallback(async (created) => {
    try { setCustomers(await fetchAllCustomersForDropdown()); } catch (_) { /* best-effort refresh */ }
    const newId = created?._id || created?.id;
    if (newId) setFormData((prev) => ({ ...prev, customerId: String(newId) }));
  }, []);

  const openModal = (mode, item = null) => {
    setModalMode(mode);
    setSelectedItem(item);
    setFormData(item ? {
      customerId: item.customer_id || '', vehicleId: item.vehicle_id || '',
      vehicleNumber: item.customer_vehicle_number || '', vehicleMake: item.customer_vehicle_make || '',
      vehicleModel: item.customer_vehicle_model || '', vehicleVariant: item.customer_vehicle_variant || '',
      vehicleYear: item.customer_vehicle_year || '',
      vehicleVin: item.customer_vehicle_vin || '', serviceTypeId: item.service_type_id || '',
      appointmentDate: item.appointment_date ? item.appointment_date.split('T')[0] : '',
      appointmentTime: item.appointment_time || '', estimatedDuration: item.estimated_duration || '',
      customerConcerns: item.customer_concerns || '', notes: item.notes || '',
      serviceAdvisorId: item.service_advisor_id || '',
    } : {
      customerId: '', vehicleId: '', vehicleNumber: '', vehicleMake: '', vehicleModel: '',
      vehicleVariant: '', vehicleYear: '', vehicleVin: '', serviceTypeId: '', appointmentDate: '',
      appointmentTime: '', estimatedDuration: '', customerConcerns: '', notes: '', serviceAdvisorId: '',
    });

    // Rebuild the make → model → variant cascade from the stored names so an
    // existing appointment opens with its dropdowns populated.
    const make = item && vehicleBrands.find((b) => b.name === item.customer_vehicle_make);
    setSelectedMakeId(make ? String(make.id) : '');
    setSelectedModelId('');
    setVehicleModels([]);
    setVehicleVariants([]);
    if (make) {
      vehicleAPI.getModels(make.id)
        .then((res) => {
          const models = res?.data?.data || [];
          setVehicleModels(models);
          const model = models.find((m) => m.name === item.customer_vehicle_model);
          if (!model) return;
          setSelectedModelId(String(model.id));
          return vehicleAPI.getVariants(model.id)
            .then((vr) => setVehicleVariants(vr?.data?.data || []));
        })
        .catch(() => {});
    }

    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setSelectedItem(null); };

  // Appointments store the make/model/variant as names, so keep the selected id
  // only to drive the next dropdown in the cascade.
  const handleVehicleBrandSelect = (e) => {
    const brand = vehicleBrands.find((b) => String(b.id) === String(e.target.value));
    setSelectedMakeId(e.target.value || '');
    setSelectedModelId('');
    setFormData((prev) => ({ ...prev, vehicleId: '', vehicleMake: brand?.name || '', vehicleModel: '', vehicleVariant: '' }));
    loadModelsForMake(e.target.value);
    setVehicleVariants([]);
  };

  const handleVehicleModelSelect = (e) => {
    const model = vehicleModels.find((m) => String(m.id) === String(e.target.value));
    setSelectedModelId(e.target.value || '');
    setFormData((prev) => ({ ...prev, vehicleModel: model?.name || '', vehicleVariant: '' }));
    loadVariantsForModel(e.target.value);
  };

  const handleVehicleVariantSelect = (e) => {
    const variant = vehicleVariants.find((v) => String(v.id) === String(e.target.value));
    setFormData((prev) => ({ ...prev, vehicleVariant: variant?.name || '' }));
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.customerId || !formData.appointmentDate || !formData.appointmentTime) {
      toast.error('Customer, date, and time are required'); return;
    }
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await serviceAPI.createAppointment(formData);
        toast.success('Appointment created');
      } else {
        await serviceAPI.updateAppointment(selectedItem.id, formData);
        toast.success('Appointment updated');
      }
      closeModal();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  useModalKeyboard(showModal, closeModal, handleSubmit, saving);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await serviceAPI.deleteAppointment(confirmDelete);
      toast.success('Appointment cancelled');
      setConfirmDelete(null);
      fetchData();
    } catch (_) { toast.error('Failed to cancel appointment'); setConfirmDelete(null); }
  };

  const handleStatusChange = async (id, status) => {
    try { await serviceAPI.updateAppointmentStatus(id, status); toast.success('Status updated'); fetchData(); }
    catch (_) { toast.error('Failed to update status'); }
  };

  const handleConvertToJobCard = async (item) => {
    try {
      await serviceAPI.createJobCard({
        appointmentId: item.id, customerId: item.customer_id,
        vehicleNumber: item.customer_vehicle_number, vehicleMake: item.customer_vehicle_make,
        vehicleModel: item.customer_vehicle_model, vehicleVin: item.customer_vehicle_vin,
        customerRemarks: item.customer_concerns,
      });
      toast.success('Job card created from appointment');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create job card'); }
  };

  const stOptions = serviceTypes.map((t) => ({ id: String(t._id || t.id), name: `${t.name}${t.basePrice ? ` - PKR ${Number(t.basePrice).toLocaleString()}` : ''}` }));
  const advisorOptions = advisors.map((a) => ({ id: String(a.id), name: a.name }));
  const customerOptions = customers.map((c) => ({ id: String(c.id), name: customerOptionLabel(c) }));
  const brandOptions = vehicleBrands.map((b) => ({ id: String(b.id), name: b.name }));
  const modelOptions = vehicleModels.map((m) => ({ id: String(m.id), name: m.name }));
  const variantOptions = vehicleVariants.map((v) => ({ id: String(v.id), name: v.name }));

  return (
    <div className="card">
      <ConfirmModal isOpen={!!confirmDelete} title="Cancel Appointment"
        message="Are you sure you want to cancel this appointment?"
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)}
        confirmText="Cancel" type="danger" />
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Appointments</h3>
        {canCreate && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Appointment</button>}
      </div>

      <div className="stats-grid service-stats-grid">
        {[['Total', stats.total, 'info'], ['Today', stats.today, 'primary'], ['Scheduled', stats.scheduled, 'warning'], ['In Progress', stats.in_progress, 'primary'], ['Completed', stats.completed, 'success']].map(([label, value, tone]) => (
          <div className={`stat-card ${tone}`} key={label}><div className="stat-info"><h3>{label}</h3><div className="value">{value || 0}</div></div></div>
        ))}
      </div>

      <div className="service-filter-bar">
        <div className="form-group service-filter-search"><label>Search</label><input className="form-control" value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} placeholder="Search appointment, customer or vehicle..." /></div>
        <div className="form-group"><label>Status</label><select className="form-control" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}><option value="">All statuses</option><option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No show</option></select></div>
        <div className="form-group"><label>Customer</label><SearchableSelect value={filters.customerId} onChange={(e) => updateFilter('customerId', e.target.value)} options={customerOptions} placeholder="All customers" /></div>
        <div className="form-group"><label>From</label><input type="date" className="form-control" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} /></div>
        <div className="form-group"><label>To</label><input type="date" className="form-control" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} /></div>
        <button type="button" className="btn btn-secondary service-filter-reset" onClick={clearFilters}>Reset</button>
      </div>

      {/* Desktop Table */}
      <div className="desktop-only">
        <DataTable
          columns={[
            { field: 'document', header: 'Appt #', accessor: 'appointment_number' },
            { field: 'customer', header: 'Customer', accessor: 'customer_name' },
            { field: 'vehicle', header: 'Vehicle', render: (r) => <>{r.customer_vehicle_make} {r.customer_vehicle_model}<br /><small>{r.customer_vehicle_number}</small></> },
            { field: 'service_type', header: 'Service Type', accessor: 'service_type_name' },
            { field: 'document', header: 'Date', render: (r) => r.appointment_date ? new Date(r.appointment_date).toLocaleDateString() : '-' },
            { field: 'document', header: 'Time', accessor: 'appointment_time' },
            { field: 'document', header: 'Status', render: (r) => (
              <select className={`badge badge-${APPT_STATUS_CLASS[r.status] || 'info'}`}
                value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value)}
                disabled={['completed', 'cancelled', 'no_show'].includes(r.status)}
                style={{ border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
              </select>
            )},
            { header: 'Actions', style: { width: 140 }, render: (r) => (
              <div className="action-buttons">
                <button className="btn-action btn-view" onClick={() => openModal('view', r)} title="View">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                {canEdit && !['completed', 'cancelled', 'no_show'].includes(r.status) && (
                  <button className="btn-action btn-edit" onClick={() => openModal('edit', r)} title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                )}
                {canDelete && !['completed', 'cancelled'].includes(r.status) && (
                  <button className="btn-action btn-delete" onClick={() => setConfirmDelete(r.id)} title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                )}
                {canCreate && ['scheduled', 'confirmed'].includes(r.status) && (
                  <button className="btn-action btn-success" onClick={() => handleConvertToJobCard(r)} title="Create Job Card"
                    style={{ backgroundColor: '#22c55e', color: '#fff' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  </button>
                )}
              </div>
            )},
          // A column tied to a field the role may not read is dropped whole,
          // rather than left as an always-blank cell.
          ].filter((column) => !column.field || showField(column.field))}
          data={data}
          loading={loading}
          onRowClick={openDrawer}
          emptyMessage="No appointments found"
        />
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards-container mobile-only">
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner"></div></div>
        : data.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No appointments found</div>
        : data.map((a) => (
          <div key={a.id} className="user-card">
            {showField('document') && <div className="user-card-field"><span className="field-label">Appt #</span><span><strong>{a.appointment_number}</strong></span></div>}
            {showField('customer') && <div className="user-card-field"><span className="field-label">Customer</span><span>{a.customer_name}</span></div>}
            {showField('vehicle') && <div className="user-card-field"><span className="field-label">Vehicle</span><span>{a.customer_vehicle_make} {a.customer_vehicle_model} - {a.customer_vehicle_number}</span></div>}
            {showField('document') && <div className="user-card-field"><span className="field-label">Date</span><span>{a.appointment_date ? new Date(a.appointment_date).toLocaleDateString() : '-'} {a.appointment_time || ''}</span></div>}
            {showField('document') && <div className="user-card-field"><span className="field-label">Status</span>
              <span className={`badge badge-${APPT_STATUS_CLASS[a.status] || 'info'}`}>{a.status}</span>
            </div>}
            <div className="card-actions">
              <button className="btn btn-sm btn-info" onClick={() => openModal('view', a)}>View</button>
              {canEdit && !['completed', 'cancelled', 'no_show'].includes(a.status) && (
                <button className="btn btn-sm btn-warning" onClick={() => openModal('edit', a)}>Edit</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ServicePagination pagination={pagination} setPagination={setPagination} />

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: modalMode === 'view' ? '600px' : '700px' }}>
            <div className="modal-header">
              <h3>{modalMode === 'create' ? 'Create' : modalMode === 'edit' ? 'Edit' : 'View'} Appointment</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={modalMode === 'view' ? (e) => e.preventDefault() : handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label-add"><span>Customer *</span> {modalMode !== 'view' && <CustomerQuickCreate onCreated={handleCustomerCreated} />}</label>
                  <SearchableSelect name="customerId" value={formData.customerId} onChange={handleChange}
                    options={customerOptions} placeholder="Select Customer"
                    required disabled={modalMode === 'view'} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Vehicle Brand</label>
                    <SearchableSelect value={selectedMakeId}
                      onChange={handleVehicleBrandSelect} options={brandOptions} placeholder="Select Brand"
                      disabled={modalMode === 'view'} />
                  </div>
                  <div className="form-group">
                    <label>Vehicle Model</label>
                    <SearchableSelect value={selectedModelId}
                      onChange={handleVehicleModelSelect} options={modelOptions} placeholder="Select Model"
                      disabled={modalMode === 'view' || !selectedMakeId} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Vehicle Variant</label>
                    <SearchableSelect value={vehicleVariants.find((v) => v.name === formData.vehicleVariant)?.id || ''}
                      onChange={handleVehicleVariantSelect} options={variantOptions} placeholder="Select Variant"
                      disabled={modalMode === 'view' || !selectedModelId} />
                  </div>
                  <div className="form-group">
                    <label>Vehicle Number</label>
                    <input type="text" name="vehicleNumber" className="form-control" value={formData.vehicleNumber} onChange={handleChange} placeholder="ABC-123" disabled={modalMode === 'view'} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Year</label>
                    <input type="number" name="vehicleYear" className="form-control" value={formData.vehicleYear} onChange={handleChange} placeholder="2024" disabled={modalMode === 'view'} />
                  </div>
                  <div className="form-group">
                    <label>VIN</label>
                    <input type="text" name="vehicleVin" className="form-control" value={formData.vehicleVin} onChange={handleChange} placeholder="VIN" disabled={modalMode === 'view'} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Service Type</label>
                    <SearchableSelect name="serviceTypeId" value={formData.serviceTypeId} onChange={handleChange}
                      options={stOptions} placeholder="Select Service Type" disabled={modalMode === 'view'} />
                  </div>
                  <div className="form-group">
                    <label>Service Advisor</label>
                    <SearchableSelect name="serviceAdvisorId" value={formData.serviceAdvisorId} onChange={handleChange}
                      options={advisorOptions} placeholder="Select Advisor" disabled={modalMode === 'view'} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Appointment Date *</label>
                    <input type="date" name="appointmentDate" className="form-control" value={formData.appointmentDate} onChange={handleChange} required disabled={modalMode === 'view'} autoFocus />
                  </div>
                  <div className="form-group">
                    <label>Appointment Time *</label>
                    <input type="time" name="appointmentTime" className="form-control" value={formData.appointmentTime} onChange={handleChange} required disabled={modalMode === 'view'} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Estimated Duration (minutes)</label>
                  <input type="number" name="estimatedDuration" className="form-control" value={formData.estimatedDuration} onChange={handleChange} placeholder="60" disabled={modalMode === 'view'} />
                </div>
                <div className="form-group">
                  <label>Customer Concerns</label>
                  <textarea name="customerConcerns" className="form-control" value={formData.customerConcerns} onChange={handleChange} rows="2" placeholder="Describe issues..." disabled={modalMode === 'view'} />
                </div>
                <div className="form-group">
                  <label>Internal Notes</label>
                  <textarea name="notes" className="form-control" value={formData.notes} onChange={handleChange} rows="2" placeholder="Internal notes..." disabled={modalMode === 'view'} />
                </div>
              </div>
              {modalMode !== 'view' && (
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Update'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      <SalesDrawer
        isOpen={Boolean(drawerItem)}
        loading={drawerLoading}
        onClose={() => setDrawerItem(null)}
        title={`Appointment ${drawerItem?.appointment_number || ''}`}
        subtitle={drawerItem?.customer_name}
        fields={[
          { label: 'Date', value: drawerItem?.appointment_date ? new Date(drawerItem.appointment_date).toLocaleDateString('en-GB') : '-' },
          { label: 'Time', value: drawerItem?.appointment_time },
          { label: 'Service Type', value: drawerItem?.service_type_name },
          { label: 'Vehicle', value: [drawerItem?.customer_vehicle_make, drawerItem?.customer_vehicle_model, drawerItem?.customer_vehicle_variant].filter(Boolean).join(' ') },
          { label: 'Vehicle No.', value: drawerItem?.customer_vehicle_number },
          { label: 'Estimated Duration', value: drawerItem?.estimated_duration ? `${drawerItem.estimated_duration} min` : '-' },
          { label: 'Customer Concerns', value: drawerItem?.customer_concerns, full: true },
          { label: 'Notes', value: drawerItem?.notes, full: true },
        ]}
        statusOptions={Object.keys(APPT_STATUS_CLASS).map((value) => ({ value, label: value.replace(/_/g, ' ') }))}
        status={drawerItem?.status}
        onStatusChange={handleDrawerStatus}
        savingStatus={savingStatus}
        canEditStatus={canEdit}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARDS
// ═══════════════════════════════════════════════════════════════════════════

const JC_STATUS_CLASS = { open: 'info', in_progress: 'warning', on_hold: 'secondary', completed: 'success', delivered: 'primary', cancelled: 'danger' };

function JobCards() {
  const { user } = useAuth();
  // Which columns this role may read. The API already strips what it withholds,
  // so this only stops us drawing a column that would always be blank.
  const showField = fieldAccessor(user, 'services');
  const { currency, serviceTax, taxAmount: calculateConfiguredTax } = useErpDocumentSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedItem, setSelectedItem] = useState(null);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [laborRates, setLaborRates] = useState([]);
  const [warrantyTypes, setWarrantyTypes] = useState([]);
  const [servicePackages, setServicePackages] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [parts, setParts] = useState([]);
  const [vehicleBrands, setVehicleBrands] = useState([]);
  const [stats, setStats] = useState({ total: 0, open: 0, in_progress: 0, completed: 0, delivered: 0, totalRevenue: 0 });
  const [filters, setFilters] = useState({ search: urlSearch, status: '', customerId: '', technicianId: '', dateFrom: '', dateTo: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const [formData, setFormData] = useState({
    customerId: '', vehicleId: '', vehicleNumber: '', vehicleMake: '', vehicleModel: '',
    vehicleVin: '', odometerReading: '', fuelLevel: '', promisedDate: '',
    customerRemarks: '', technicianRemarks: '', serviceAdvisorId: '', technicianId: '',
    discount: '0', taxAmount: '0', warrantyTypeId: '', servicePackageId: '',
  });

  const [jobServices, setJobServices] = useState([]);
  const [jobParts, setJobParts] = useState([]);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [showPartModal, setShowPartModal] = useState(false);
  const [partSaving, setPartSaving] = useState(false);
  const [serviceForm, setServiceForm] = useState({ serviceTypeId: '', description: '', hours: '', rate: '', technicianId: '', laborRateId: '' });
  const [partForm, setPartForm] = useState({ partId: '', quantity: '1', unitPrice: '', isWarranty: false });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(null);

  const canCreate = ['super_admin', 'service_manager', 'service_advisor'].includes(user?.role);
  const canEdit = ['super_admin', 'service_manager'].includes(user?.role);
  const canComplete = ['super_admin', 'service_manager', 'technician'].includes(user?.role);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = { ...filters, page: pagination.page, limit: pagination.limit };
      Object.keys(params).forEach((key) => { if (params[key] === '' || params[key] == null) delete params[key]; });
      const [res, statsRes] = await Promise.all([serviceAPI.getJobCards(params), serviceAPI.getJobCardStats()]);
      setData(res.data?.data || []);
      setPagination((prev) => ({ ...prev, ...(res.data?.pagination || {}) }));
      setStats(statsRes.data?.data || {});
    }
    catch (_) { setData([]); } finally { setLoading(false); }
  }, [filters, pagination.page, pagination.limit]);

  const [jcDrawer, setJcDrawer] = useState(null);
  const [jcDrawerLoading, setJcDrawerLoading] = useState(false);
  const [jcSavingStatus, setJcSavingStatus] = useState(false);

  const loadJcDrawer = useCallback(async (id) => {
    setJcDrawerLoading(true);
    try {
      const res = await serviceAPI.getJobCard(id);
      setJcDrawer(res.data?.data || null);
    } catch (_) {
      toast.error('Failed to load job card');
      setJcDrawer(null);
    } finally { setJcDrawerLoading(false); }
  }, []);

  const openJcDrawer = (row) => { setJcDrawer({ id: row.id }); loadJcDrawer(row.id); };

  const handleJcStatus = async (status) => {
    if (!jcDrawer?.id) return;
    setJcSavingStatus(true);
    try {
      await serviceAPI.updateJobCardStatus(jcDrawer.id, status);
      toast.success('Status updated');
      await Promise.all([loadJcDrawer(jcDrawer.id), fetchData()]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update status');
    } finally { setJcSavingStatus(false); }
  };

  const fetchDropdowns = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        fetchAllCustomersForDropdown(),
        serviceMasterAPI.getTypes(),
        serviceMasterAPI.getLaborRates(),
        serviceMasterAPI.getWarranties(),
        serviceMasterAPI.getPackages({ limit: 500 }),
        serviceAPI.getTechnicians().catch(() => ({ data: { data: [] } })),
        serviceAPI.getAdvisors().catch(() => ({ data: { data: [] } })),
        partsAPI.getAll({ limit: 500 }),
        vehicleBrandingService.getActiveBrands().catch(() => ({ data: { brands: [] }, success: true })),
      ]);
      setCustomers(results[0].status === 'fulfilled' ? results[0].value || [] : []);
      setServiceTypes(results[1].status === 'fulfilled' ? results[1].value?.data?.data || [] : []);
      setLaborRates(results[2].status === 'fulfilled' ? results[2].value?.data?.data || [] : []);
      setWarrantyTypes(results[3].status === 'fulfilled' ? results[3].value?.data?.data || [] : []);
      setServicePackages(results[4].status === 'fulfilled' ? results[4].value?.data?.data || [] : []);
      setTechnicians(results[5].status === 'fulfilled' ? results[5].value?.data?.data || [] : []);
      setAdvisors(results[6].status === 'fulfilled' ? results[6].value?.data?.data || [] : []);
      setParts(results[7].status === 'fulfilled' ? results[7].value?.data?.data?.parts || [] : []);
      const brands = results[8].status === 'fulfilled'
        ? results[8].value?.data?.brands || results[8].value?.data?.data?.brands || []
        : [];
      setVehicleBrands(brands);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchData(); fetchDropdowns(); }, [fetchData, fetchDropdowns]);
  useEffect(() => { if (searchParams.get('action') === 'create') openModal('create'); }, []);

  const updateFilter = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };
  const clearFilters = () => { setFilters({ search: '', status: '', customerId: '', technicianId: '', dateFrom: '', dateTo: '' }); setPagination((prev) => ({ ...prev, page: 1 })); };

  const openModal = async (mode, item = null) => {
    setModalMode(mode);
    setSelectedItem(item);
    setJobServices([]);
    setJobParts([]);
    if (item) {
      try {
        const res = await serviceAPI.getJobCard(item.id);
        const jc = res.data.data;
        setFormData({
          customerId: jc.customer_id || '', vehicleId: jc.vehicle_id || '',
          vehicleNumber: jc.customer_vehicle_number || '', vehicleMake: jc.customer_vehicle_make || '',
          vehicleModel: jc.customer_vehicle_model || '', vehicleVin: jc.customer_vehicle_vin || '',
          odometerReading: jc.odometer_reading || '', fuelLevel: jc.fuel_level || '',
          promisedDate: jc.promised_date ? jc.promised_date.split('T')[0] + 'T' + (jc.promised_date.split('T')[1] || '10:00').substring(0, 5) : '',
          customerRemarks: jc.customer_remarks || '', technicianRemarks: jc.technician_remarks || '',
          serviceAdvisorId: jc.service_advisor_id || '', technicianId: jc.technician_id || '',
          discount: jc.discount || '0', taxAmount: jc.tax_amount || '0',
          warrantyTypeId: jc.warranty_type_id || '',
          servicePackageId: jc.service_package_id || '',
        });
        setJobServices(jc.services || []);
        setJobParts(jc.parts || []);
      } catch (_) { toast.error('Failed to load job card'); }
    } else {
      setFormData({
        customerId: '', vehicleId: '', vehicleNumber: '', vehicleMake: '', vehicleModel: '',
        vehicleVin: '', odometerReading: '', fuelLevel: '', promisedDate: '',
        customerRemarks: '', technicianRemarks: '', serviceAdvisorId: '', technicianId: '',
        discount: '0', taxAmount: '0', warrantyTypeId: '', servicePackageId: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setSelectedItem(null); };

  const handleVehicleBrandSelect = (e) => {
    const brand = vehicleBrands.find((b) => String(b.id) === String(e.target.value));
    setFormData({ ...formData, vehicleId: '', vehicleMake: brand?.name || '' });
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.customerId) { toast.error('Customer is required'); return; }
    setSaving(true);
    try {
      const laborBase = jobServices.reduce((sum, item) => sum + Number(item.total || 0), 0);
      const partsBase = jobParts.filter((item) => !item.is_warranty).reduce((sum, item) => sum + Number(item.total || 0), 0);
      const payload = {
        ...formData,
        taxAmount: Number(formData.taxAmount) > 0 || !serviceTax
          ? Number(formData.taxAmount || 0)
          : calculateConfiguredTax(Math.max(0, laborBase + partsBase - Number(formData.discount || 0)), serviceTax)
      };
      if (modalMode === 'create') {
        await serviceAPI.createJobCard(payload);
        toast.success('Job card created');
      } else {
        await serviceAPI.updateJobCard(selectedItem.id, payload);
        toast.success('Job card updated');
      }
      closeModal();
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Operation failed'); }
    finally { setSaving(false); }
  };

  useModalKeyboard(showModal, closeModal, handleSubmit, saving);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try { await serviceAPI.deleteJobCard(confirmDelete); toast.success('Job card cancelled'); setConfirmDelete(null); fetchData(); }
    catch (_) { toast.error('Failed to cancel job card'); setConfirmDelete(null); }
  };

  const handleComplete = async () => {
    if (!confirmComplete) return;
    try { await serviceAPI.completeJobCard(confirmComplete, { technicianRemarks: formData.technicianRemarks }); toast.success('Job card completed'); setConfirmComplete(null); fetchData(); }
    catch (_) { toast.error('Failed to complete job card'); setConfirmComplete(null); }
  };

  const handleStatusChange = async (id, status) => {
    try { await serviceAPI.updateJobCardStatus(id, status); toast.success('Status updated'); fetchData(); }
    catch (_) { toast.error('Failed to update status'); }
  };

  // Service sub-modal
  const handleAddService = async () => {
    if (!selectedItem || !serviceForm.description || !serviceForm.rate) { toast.error('Description and rate are required'); return; }
    setServiceSaving(true);
    try {
      await serviceAPI.addJobCardService(selectedItem.id, serviceForm);
      toast.success('Service added');
      setShowServiceModal(false);
      setServiceForm({ serviceTypeId: '', description: '', hours: '', rate: '', technicianId: '' });
      const res = await serviceAPI.getJobCard(selectedItem.id);
      setJobServices(res.data.data.services || []);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add service'); }
    finally { setServiceSaving(false); }
  };

  const handleDeleteService = async (serviceId) => {
    if (!selectedItem) return;
    try { await serviceAPI.deleteJobCardService(selectedItem.id, serviceId); toast.success('Service removed'); const res = await serviceAPI.getJobCard(selectedItem.id); setJobServices(res.data.data.services || []); fetchData(); }
    catch (_) { toast.error('Failed to remove service'); }
  };

  // Part sub-modal
  const handleAddPart = async () => {
    if (!selectedItem || !partForm.partId || !partForm.quantity) { toast.error('Part and quantity are required'); return; }
    setPartSaving(true);
    try {
      await serviceAPI.addJobCardPart(selectedItem.id, partForm);
      toast.success('Part added');
      setShowPartModal(false);
      setPartForm({ partId: '', quantity: '1', unitPrice: '', isWarranty: false });
      const res = await serviceAPI.getJobCard(selectedItem.id);
      setJobParts(res.data.data.parts || []);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add part'); }
    finally { setPartSaving(false); }
  };

  const handleDeletePart = async (partId) => {
    if (!selectedItem) return;
    try { await serviceAPI.deleteJobCardPart(selectedItem.id, partId); toast.success('Part removed'); const res = await serviceAPI.getJobCard(selectedItem.id); setJobParts(res.data.data.parts || []); fetchData(); }
    catch (_) { toast.error('Failed to remove part'); }
  };

  const handlePartSelect = (e) => {
    const p = parts.find((p) => String(p.id) === String(e.target.value));
    setPartForm({ ...partForm, partId: e.target.value, unitPrice: p?.selling_price || '' });
  };

  // Keyboard behaviour for the add-service / add-part sub-modals
  // (registered after their submit handlers to avoid use-before-init).
  useModalKeyboard(showServiceModal, () => setShowServiceModal(false), handleAddService, serviceSaving);
  useModalKeyboard(showPartModal, () => setShowPartModal(false), handleAddPart, partSaving);

  // Rule 2 — refresh dropdown and auto-select the customer created inline
  const handleCustomerCreated = useCallback(async (created) => {
    try { setCustomers(await fetchAllCustomersForDropdown()); } catch (_) { /* best-effort refresh */ }
    const newId = created?._id || created?.id;
    if (newId) setFormData((prev) => ({ ...prev, customerId: String(newId) }));
  }, []);

  const totals = (() => {
    const laborTotal = jobServices.reduce((s, sv) => s + parseFloat(sv.total || 0), 0);
    const partsTotal = jobParts.filter((p) => !p.is_warranty).reduce((s, p) => s + parseFloat(p.total || 0), 0);
    const discount = parseFloat(formData.discount) || 0;
    const tax = parseFloat(formData.taxAmount) || 0;
    return { laborTotal, partsTotal, discount, tax, grandTotal: laborTotal + partsTotal - discount + tax };
  })();

  const stOptions = serviceTypes.map((t) => ({ id: String(t._id || t.id), name: `${t.name}${t.basePrice ? ` - PKR ${Number(t.basePrice).toLocaleString()}` : ''}` }));
  const lrOptions = laborRates.map((lr) => ({ id: String(lr._id || lr.id), name: `${lr.name}${lr.rate ? ` - PKR ${Number(lr.rate).toLocaleString()}/hr` : ''}` }));
  const wtOptions = warrantyTypes.map((w) => ({ id: String(w._id || w.id), name: `${w.name}${w.durationMonths ? ` (${w.durationMonths}mo)` : ''}` }));
  const packageOptions = servicePackages.map((p) => ({ id: String(p._id || p.id), name: `${p.packageName || p.name}${p.price ? ` - PKR ${Number(p.price).toLocaleString()}` : ''}` }));
  const technicianOptions = technicians.map((t) => ({ id: String(t.id), name: t.name }));
  const advisorOptions = advisors.map((a) => ({ id: String(a.id), name: a.name }));
  const customerOptions = customers.map((c) => ({ id: String(c.id), name: customerOptionLabel(c) }));
  const brandOptions = vehicleBrands.map((b) => ({ id: String(b.id), name: b.name }));
  const partOptions = parts.map((p) => ({ id: String(p.id), name: `${p.part_number} - ${p.name} (Stock: ${p.current_stock})` }));

  return (
    <div className="card">
      <ConfirmModal isOpen={!!confirmDelete} title="Cancel Job Card"
        message="Are you sure you want to cancel this job card?"
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)}
        confirmText="Cancel" type="danger" />
      <ConfirmModal isOpen={!!confirmComplete} title="Complete Job Card"
        message="Mark this job card as completed? Totals will be finalized."
        onConfirm={handleComplete} onCancel={() => setConfirmComplete(null)}
        confirmText="Complete" type="primary" />
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Job Cards</h3>
        {canCreate && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Job Card</button>}
      </div>

      <div className="stats-grid service-stats-grid">
        {[['Total', stats.total, 'info'], ['Open', stats.open, 'primary'], ['In Progress', stats.in_progress, 'warning'], ['Completed', stats.completed, 'success'], ['Revenue', `PKR ${Number(stats.totalRevenue || 0).toLocaleString()}`, 'success']].map(([label, value, tone]) => (
          <div className={`stat-card ${tone}`} key={label}><div className="stat-info"><h3>{label}</h3><div className="value">{value || 0}</div></div></div>
        ))}
      </div>

      <div className="service-filter-bar">
        <div className="form-group service-filter-search"><label>Search</label><input className="form-control" value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} placeholder="Search job card, customer or vehicle..." /></div>
        <div className="form-group"><label>Status</label><select className="form-control" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}><option value="">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></div>
        <div className="form-group"><label>Customer</label><SearchableSelect value={filters.customerId} onChange={(e) => updateFilter('customerId', e.target.value)} options={customerOptions} placeholder="All customers" /></div>
        <div className="form-group"><label>Technician</label><SearchableSelect value={filters.technicianId} onChange={(e) => updateFilter('technicianId', e.target.value)} options={technicianOptions} placeholder="All technicians" /></div>
        <div className="form-group"><label>From</label><input type="date" className="form-control" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} /></div>
        <div className="form-group"><label>To</label><input type="date" className="form-control" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} /></div>
        <button type="button" className="btn btn-secondary service-filter-reset" onClick={clearFilters}>Reset</button>
      </div>

      {/* Desktop Table */}
      <div className="desktop-only">
        <DataTable
          columns={[
            { field: 'document', header: 'JC #', accessor: 'job_card_number' },
            { field: 'customer', header: 'Customer', accessor: 'customer_name' },
            { field: 'vehicle', header: 'Vehicle', render: (r) => <>{r.customer_vehicle_make} {r.customer_vehicle_model}<br /><small>{r.customer_vehicle_number}</small></> },
            { field: 'document', header: 'Received', render: (r) => r.received_date ? new Date(r.received_date).toLocaleDateString() : '-' },
            { field: 'amounts', header: 'Labor', render: (r) => `PKR ${Number(r.labor_total || 0).toLocaleString()}` },
            { field: 'amounts', header: 'Parts', render: (r) => `PKR ${Number(r.parts_total || 0).toLocaleString()}` },
            { field: 'amounts', header: 'Total', render: (r) => <strong>PKR {Number(r.grand_total || 0).toLocaleString()}</strong> },
            { field: 'invoice', header: 'Invoice', render: (r) => r.invoice_number ? <button type="button" className="link-button" onClick={() => navigate(`/invoices?search=${encodeURIComponent(r.invoice_number)}`)}>{r.invoice_number}</button> : <span className="text-muted">Pending</span> },
            { field: 'document', header: 'Status', render: (r) => (
              <select className={`badge badge-${JC_STATUS_CLASS[r.status] || 'info'}`}
                value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value)}
                disabled={['delivered', 'cancelled'].includes(r.status)}
                style={{ border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )},
            { header: 'Actions', style: { width: 140 }, render: (r) => (
              <div className="action-buttons">
                <button className="btn-action btn-view" onClick={() => openModal('view', r)} title="View">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                {canEdit && !['completed', 'delivered', 'cancelled'].includes(r.status) && (
                  <button className="btn-action btn-edit" onClick={() => openModal('edit', r)} title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                )}
                {canEdit && !['completed', 'delivered'].includes(r.status) && (
                  <button className="btn-action btn-delete" onClick={() => setConfirmDelete(r.id)} title="Cancel">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                )}
                {canComplete && r.status === 'in_progress' && (
                  <button className="btn-action btn-success" onClick={() => setConfirmComplete(r.id)} title="Complete"
                    style={{ backgroundColor: '#22c55e', color: '#fff' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                )}
              </div>
            )},
          // A column tied to a field the role may not read is dropped whole,
          // rather than left as an always-blank cell.
          ].filter((column) => !column.field || showField(column.field))}
          data={data}
          loading={loading}
          onRowClick={openJcDrawer}
          emptyMessage="No job cards found"
        />
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards-container mobile-only">
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner"></div></div>
        : data.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No job cards found</div>
        : data.map((jc) => (
          <div key={jc.id} className="user-card">
            {showField('document') && <div className="user-card-field"><span className="field-label">JC #</span><span><strong>{jc.job_card_number}</strong></span></div>}
            {showField('customer') && <div className="user-card-field"><span className="field-label">Customer</span><span>{jc.customer_name}</span></div>}
            {showField('vehicle') && <div className="user-card-field"><span className="field-label">Vehicle</span><span>{jc.customer_vehicle_make} {jc.customer_vehicle_model} - {jc.customer_vehicle_number}</span></div>}
            {showField('amounts') && <div className="user-card-field"><span className="field-label">Total</span><span><strong>PKR {Number(jc.grand_total || 0).toLocaleString()}</strong></span></div>}
            {showField('invoice') && <div className="user-card-field"><span className="field-label">Invoice</span><span>{jc.invoice_number ? <button type="button" className="link-button" onClick={() => navigate(`/invoices?search=${encodeURIComponent(jc.invoice_number)}`)}>{jc.invoice_number}</button> : 'Pending'}</span></div>}
            {showField('document') && <div className="user-card-field"><span className="field-label">Status</span>
              <span className={`badge badge-${JC_STATUS_CLASS[jc.status] || 'info'}`}>{jc.status}</span>
            </div>}
            <div className="card-actions">
              <button className="btn btn-sm btn-info" onClick={() => openModal('view', jc)}>View</button>
              {canEdit && !['completed', 'delivered', 'cancelled'].includes(jc.status) && (
                <button className="btn btn-sm btn-warning" onClick={() => openModal('edit', jc)}>Edit</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ServicePagination pagination={pagination} setPagination={setPagination} />

      {/* Main Job Card Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>{modalMode === 'create' ? 'Create' : modalMode === 'edit' ? 'Edit' : 'View'} Job Card</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={modalMode === 'view' ? (e) => e.preventDefault() : handleSubmit}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <h4 style={{ marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Customer & Vehicle</h4>
                    <div className="form-group">
                      <label className="form-label-add"><span>Customer *</span> {modalMode !== 'view' && <CustomerQuickCreate onCreated={handleCustomerCreated} />}</label>
                      <SearchableSelect name="customerId" value={formData.customerId} onChange={handleChange}
                        options={customerOptions} placeholder="Select Customer" required disabled={modalMode === 'view'} />
                    </div>
                    <div className="form-group">
                      <label>Vehicle Brand</label>
                      <SearchableSelect value={vehicleBrands.find((b) => b.name === formData.vehicleMake)?.id || ''}
                        onChange={handleVehicleBrandSelect} options={brandOptions} placeholder="-- Select brand --"
                        disabled={modalMode === 'view'} />
                    </div>
                    <div className="form-row">
                      <div className="form-group"><label>Vehicle Number</label><input type="text" name="vehicleNumber" className="form-control" value={formData.vehicleNumber} onChange={handleChange} disabled={modalMode === 'view'} /></div>
                      <div className="form-group"><label>Make</label><input type="text" name="vehicleMake" className="form-control" value={formData.vehicleMake} onChange={handleChange} disabled={modalMode === 'view'} /></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group"><label>Model</label><input type="text" name="vehicleModel" className="form-control" value={formData.vehicleModel} onChange={handleChange} disabled={modalMode === 'view'} /></div>
                      <div className="form-group"><label>VIN</label><input type="text" name="vehicleVin" className="form-control" value={formData.vehicleVin} onChange={handleChange} disabled={modalMode === 'view'} /></div>
                    </div>
                    <div className="form-row">
                      <div className="form-group"><label>Odometer (KM)</label><input type="number" name="odometerReading" className="form-control" value={formData.odometerReading} onChange={handleChange} placeholder="KM" disabled={modalMode === 'view'} /></div>
                      <div className="form-group"><label>Fuel Level</label>
                        <select name="fuelLevel" className="form-control" value={formData.fuelLevel} onChange={handleChange} disabled={modalMode === 'view'}>
                          <option value="">Select</option>
                          <option value="empty">Empty</option>
                          <option value="quarter">1/4</option>
                          <option value="half">1/2</option>
                          <option value="three_quarter">3/4</option>
                          <option value="full">Full</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 style={{ marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Assignment & Dates</h4>
                    <div className="form-row">
                      <div className="form-group"><label>Service Advisor</label>
                        <SearchableSelect name="serviceAdvisorId" value={formData.serviceAdvisorId} onChange={handleChange}
                          options={advisorOptions} placeholder="Select Advisor" disabled={modalMode === 'view'} />
                      </div>
                      <div className="form-group"><label>Technician</label>
                        <SearchableSelect name="technicianId" value={formData.technicianId} onChange={handleChange}
                          options={technicianOptions} placeholder="Select Technician" disabled={modalMode === 'view'} />
                      </div>
                    </div>
                    <div className="form-group"><label>Promised Completion</label>
                      <input type="datetime-local" name="promisedDate" className="form-control" value={formData.promisedDate} onChange={handleChange} disabled={modalMode === 'view'} />
                    </div>
                    <div className="form-group"><label>Customer Remarks</label>
                      <textarea name="customerRemarks" className="form-control" value={formData.customerRemarks} onChange={handleChange} rows="2" disabled={modalMode === 'view'} />
                    </div>
                    <div className="form-group"><label>Technician Remarks</label>
                      <textarea name="technicianRemarks" className="form-control" value={formData.technicianRemarks} onChange={handleChange} rows="2" disabled={modalMode === 'view'} />
                    </div>
                    {/* Warranty Type */}
                    <div className="form-group"><label>Warranty Type</label>
                      <SearchableSelect name="warrantyTypeId" value={formData.warrantyTypeId || ''}
                        onChange={handleChange} options={wtOptions} placeholder="Select warranty (optional)"
                        disabled={modalMode === 'view'} />
                    </div>
                    <div className="form-group"><label>Service Package</label>
                      <SearchableSelect name="servicePackageId" value={formData.servicePackageId || ''}
                        onChange={handleChange} options={packageOptions} placeholder="Select package (optional)"
                        disabled={modalMode === 'view'} />
                      {modalMode === 'create' && formData.servicePackageId && <small className="form-hint">Package services will be added when this job card is created.</small>}
                    </div>
                  </div>
                </div>

                {/* Services Section */}
                {(modalMode === 'edit' || modalMode === 'view') && selectedItem && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0 }}>Services (Labor)</h4>
                      {modalMode === 'edit' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowServiceModal(true)}>+ Add Service</button>}
                    </div>
                    <div className="table-responsive">
                      <table className="data-table" style={{ marginBottom: '1rem' }}>
                        <thead>
                          <tr><th>Description</th><th>Hours</th><th>Rate</th><th>Total</th><th>Status</th>{modalMode === 'edit' && <th>Action</th>}</tr>
                        </thead>
                        <tbody>
                          {jobServices.map((s) => (
                            <tr key={s.id}>
                              <td>{s.description}</td>
                              <td>{s.hours || '-'}</td>
                              <td>PKR {Number(s.rate).toLocaleString()}</td>
                              <td>PKR {Number(s.total).toLocaleString()}</td>
                              <td><span className={`badge badge-${s.status === 'completed' ? 'success' : s.status === 'in_progress' ? 'warning' : 'info'}`}>{s.status}</span></td>
                              {modalMode === 'edit' && <td><button type="button" className="btn btn-sm btn-danger" onClick={() => handleDeleteService(s.id)}>×</button></td>}
                            </tr>
                          ))}
                          {jobServices.length === 0 && <tr><td colSpan={modalMode === 'edit' ? 6 : 5} style={{ textAlign: 'center' }}>No services added</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Parts Section */}
                {(modalMode === 'edit' || modalMode === 'view') && selectedItem && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0 }}>Parts</h4>
                      {modalMode === 'edit' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowPartModal(true)}>+ Add Part</button>}
                    </div>
                    <div className="table-responsive">
                      <table className="data-table" style={{ marginBottom: '1rem' }}>
                        <thead>
                          <tr><th>Part #</th><th>Name</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Warranty</th>{modalMode === 'edit' && <th>Action</th>}</tr>
                        </thead>
                        <tbody>
                          {jobParts.map((p) => (
                            <tr key={p.id}>
                              <td>{p.part_number}</td>
                              <td>{p.part_name}</td>
                              <td>{p.quantity}</td>
                              <td>PKR {Number(p.unit_price).toLocaleString()}</td>
                              <td>PKR {Number(p.total).toLocaleString()}</td>
                              <td>{p.is_warranty ? <span className="badge badge-success">Yes</span> : 'No'}</td>
                              {modalMode === 'edit' && <td><button type="button" className="btn btn-sm btn-danger" onClick={() => handleDeletePart(p.id)}>×</button></td>}
                            </tr>
                          ))}
                          {jobParts.length === 0 && <tr><td colSpan={modalMode === 'edit' ? 7 : 6} style={{ textAlign: 'center' }}>No parts added</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Totals */}
                {(modalMode === 'edit' || modalMode === 'view') && selectedItem && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
                    <h4 style={{ marginBottom: '0.75rem' }}>Totals</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', textAlign: 'center' }}>
                      <div><small>Labor ({currency.code})</small><div><strong>{currency.symbol} {totals.laborTotal.toLocaleString()}</strong></div></div>
                      <div><small>Parts ({currency.code})</small><div><strong>{currency.symbol} {totals.partsTotal.toLocaleString()}</strong></div></div>
                      <div><label style={{ fontSize: 12 }}>Discount</label><input type="number" name="discount" className="form-control" value={formData.discount} onChange={handleChange} disabled={modalMode === 'view'} /></div>
                      <div><label style={{ fontSize: 12 }}>Tax {serviceTax ? `(${serviceTax.tax_name} ${serviceTax.tax_rate}%)` : ''}</label><input type="number" name="taxAmount" className="form-control" value={formData.taxAmount} onChange={handleChange} disabled={modalMode === 'view'} /></div>
                      <div style={{ background: '#1a73e8', color: 'white', padding: '0.5rem', borderRadius: '4px' }}>
                        <small>Grand Total</small>
                        <div><strong>{currency.symbol} {totals.grandTotal.toLocaleString()}</strong></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {modalMode !== 'view' && (
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Update'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Add Service Modal */}
      {showServiceModal && (
        <div className="modal-overlay" onClick={() => setShowServiceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Add Service</h3>
              <button className="modal-close" onClick={() => setShowServiceModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Service Type</label>
                <SearchableSelect value={serviceForm.serviceTypeId} onChange={(e) => {
                  const st = serviceTypes.find((t) => String(t._id || t.id) === String(e.target.value));
                  const lr = laborRates.length === 1 ? laborRates[0] : null;
                  setServiceForm({
                    ...serviceForm, serviceTypeId: e.target.value,
                    description: st?.name || '',
                    rate: st?.basePrice || lr?.rate || '',
                    hours: st?.estimatedHours || '',
                  });
                }} options={stOptions} placeholder="Select Type" />
              </div>
              <div className="form-group">
                <label>Labor Rate</label>
                <SearchableSelect value={serviceForm.laborRateId || ''} onChange={(e) => {
                  const lr = laborRates.find((l) => String(l._id || l.id) === String(e.target.value));
                  setServiceForm({ ...serviceForm, laborRateId: e.target.value, rate: lr?.rate || serviceForm.rate });
                }} options={lrOptions} placeholder="Override rate (optional)" />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <input type="text" className="form-control" value={serviceForm.description}
                  onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} required autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Hours</label>
                  <input type="number" step="0.5" className="form-control" value={serviceForm.hours}
                    onChange={(e) => setServiceForm({ ...serviceForm, hours: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Rate (PKR) *</label>
                  <input type="number" className="form-control" value={serviceForm.rate}
                    onChange={(e) => setServiceForm({ ...serviceForm, rate: e.target.value })} required />
                </div>
              </div>
              <div className="form-group">
                <label>Technician</label>
                <SearchableSelect value={serviceForm.technicianId} onChange={(e) => setServiceForm({ ...serviceForm, technicianId: e.target.value })}
                  options={technicianOptions} placeholder="Select Technician" />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowServiceModal(false)} disabled={serviceSaving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleAddService} disabled={serviceSaving}>
                {serviceSaving ? 'Adding...' : 'Add Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Part Modal */}
      {showPartModal && (
        <div className="modal-overlay" onClick={() => setShowPartModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Add Part</h3>
              <button className="modal-close" onClick={() => setShowPartModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Part *</label>
                <SearchableSelect value={partForm.partId} onChange={handlePartSelect}
                  options={partOptions} placeholder="Select Part" required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity *</label>
                  <input type="number" min="1" className="form-control" value={partForm.quantity}
                    onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })} required autoFocus />
                </div>
                <div className="form-group">
                  <label>Unit Price (PKR) *</label>
                  <input type="number" className="form-control" value={partForm.unitPrice}
                    onChange={(e) => setPartForm({ ...partForm, unitPrice: e.target.value })} required />
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={partForm.isWarranty}
                    onChange={(e) => setPartForm({ ...partForm, isWarranty: e.target.checked })} />
                  Warranty Item (No charge)
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowPartModal(false)} disabled={partSaving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleAddPart} disabled={partSaving}>
                {partSaving ? 'Adding...' : 'Add Part'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SalesDrawer
        isOpen={Boolean(jcDrawer)}
        loading={jcDrawerLoading}
        onClose={() => setJcDrawer(null)}
        title={`Job Card ${jcDrawer?.job_card_number || ''}`}
        subtitle={jcDrawer?.customer_name}
        fields={[
          { label: 'Received', value: jcDrawer?.received_date ? new Date(jcDrawer.received_date).toLocaleDateString('en-GB') : '-' },
          { label: 'Promised', value: jcDrawer?.promised_date ? new Date(jcDrawer.promised_date).toLocaleDateString('en-GB') : '-' },
          { label: 'Vehicle', value: [jcDrawer?.customer_vehicle_make, jcDrawer?.customer_vehicle_model].filter(Boolean).join(' ') },
          { label: 'Vehicle No.', value: jcDrawer?.customer_vehicle_number },
          { label: 'Odometer', value: jcDrawer?.odometer_reading },
          { label: 'Service Advisor', value: jcDrawer?.service_advisor_name },
          { label: 'Service Package', value: jcDrawer?.service_package_name },
          { label: 'Warranty', value: jcDrawer?.warranty_type_name },
          { label: 'Labour Total', value: jcDrawer?.labor_total != null ? `PKR ${Number(jcDrawer.labor_total).toLocaleString()}` : '-' },
          { label: 'Parts Total', value: jcDrawer?.parts_total != null ? `PKR ${Number(jcDrawer.parts_total).toLocaleString()}` : '-' },
          { label: 'Customer Remarks', value: jcDrawer?.customer_remarks, full: true },
          { label: 'Technician Remarks', value: jcDrawer?.technician_remarks, full: true },
        ]}
        items={[
          ...(jcDrawer?.services || []).map((x) => ({
            description: `Labour: ${x.description || x.service_type_name || '-'}`,
            quantity: x.hours, unitPrice: x.rate, total: x.total,
          })),
          ...(jcDrawer?.parts || []).map((x) => ({
            description: `Part: ${x.part_name || x.description || '-'}${x.is_warranty ? ' (warranty)' : ''}`,
            quantity: x.quantity, unitPrice: x.unit_price, total: x.total,
          })),
        ]}
        statusOptions={Object.keys(JC_STATUS_CLASS).map((value) => ({ value, label: value.replace(/_/g, ' ') }))}
        status={jcDrawer?.status}
        onStatusChange={handleJcStatus}
        savingStatus={jcSavingStatus}
        canEditStatus={canEdit}
        totals={{
          total: jcDrawer?.grand_total,
          paid: jcDrawer?.paid_amount || 0,
          balance: jcDrawer?.balance_amount != null
            ? jcDrawer.balance_amount
            : Number(jcDrawer?.grand_total || 0) - Number(jcDrawer?.paid_amount || 0),
        }}
      />
    </div>
  );
}

export default Service;
