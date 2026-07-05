/**
 * Service Management Page
 * Professional Corporate UI for Appointments and Job Cards
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 * Date: 2026-01-08
 */

import React, { useState, useEffect, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { Routes, Route, NavLink, useSearchParams } from 'react-router-dom';
import { serviceAPI, customerAPI, partsAPI } from '../services/api';
import toast from 'react-hot-toast';
import ActionButtons from '../components/ActionButtons';
import ConfirmModal from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import vehicleBrandingService from '../services/vehicleBrandingService';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SERVICE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Service() {
    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Service Management</h1>
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
    const customerNo = customer.customer_number ? `${customer.customer_number} - ` : '';
    const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    const phone = customer.phone ? ` - ${customer.phone}` : '';
    return `${customerNo}${name}${phone}`.trim();
}

async function fetchAllCustomersForDropdown() {
    const allCustomersRes = await customerAPI.getAllForDropdown();
    const allCustomers = allCustomersRes?.data?.data || [];
    const seen = new Set();
    return allCustomers.filter((customer) => {
        if (!customer?.id || seen.has(customer.id)) return false;
        seen.add(customer.id);
        return true;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENTS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Appointments() {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [advisors, setAdvisors] = useState([]);
    const [vehicleBrands, setVehicleBrands] = useState([]);
    const [formData, setFormData] = useState({
        customerId: '', vehicleId: '', vehicleNumber: '', vehicleMake: '', vehicleModel: '',
        vehicleYear: '', vehicleVin: '', serviceTypeId: '', appointmentDate: '',
        appointmentTime: '', estimatedDuration: '', customerConcerns: '',
        notes: '', serviceAdvisorId: ''
    });

    const canCreate = user?.role === 'super_admin' || user?.role === 'service_manager' || user?.role === 'service_advisor';
    const canEdit = user?.role === 'super_admin' || user?.role === 'service_manager';
    const canDelete = user?.role === 'super_admin' || user?.role === 'service_manager';

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await serviceAPI.getAppointments({ search: urlSearch });
            setData(res.data?.data || []);
        } catch (error) {
            console.error('Error fetching appointments:', error);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [urlSearch]);

    const fetchDropdowns = useCallback(async () => {
        try {
            // Fetch all dropdowns with individual error handling
            const results = await Promise.allSettled([
                fetchAllCustomersForDropdown(),
                serviceAPI.getServiceTypes(),
                serviceAPI.getAdvisors().catch(() => ({ data: { data: [] } })),
                vehicleBrandingService.getActiveBrands().catch(() => ({ data: { brands: [] }, success: true }))
            ]);

            setCustomers(results[0].status === 'fulfilled' ? results[0].value || [] : []);
            setServiceTypes(results[1].status === 'fulfilled' ? results[1].value?.data?.data || [] : []);
            setAdvisors(results[2].status === 'fulfilled' ? results[2].value?.data?.data || [] : []);
            setVehicleBrands(results[3].status === 'fulfilled' ? results[3].value?.data?.brands || results[3].value?.data?.data?.brands || [] : []);
        } catch (error) {
            console.error('Error fetching dropdowns:', error);
        }
    }, []);

    useEffect(() => { fetchData(); fetchDropdowns(); }, [fetchData, fetchDropdowns]);

    const openModal = (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        if (item) {
            setFormData({
                customerId: item.customer_id || '',
                vehicleId: item.vehicle_id || '',
                vehicleNumber: item.customer_vehicle_number || '',
                vehicleMake: item.customer_vehicle_make || '',
                vehicleModel: item.customer_vehicle_model || '',
                vehicleYear: item.customer_vehicle_year || '',
                vehicleVin: item.customer_vehicle_vin || '',
                serviceTypeId: item.service_type_id || '',
                appointmentDate: item.appointment_date ? item.appointment_date.split('T')[0] : '',
                appointmentTime: item.appointment_time || '',
                estimatedDuration: item.estimated_duration || '',
                customerConcerns: item.customer_concerns || '',
                notes: item.notes || '',
                serviceAdvisorId: item.service_advisor_id || ''
            });
        } else {
            setFormData({
                customerId: '', vehicleId: '', vehicleNumber: '', vehicleMake: '', vehicleModel: '',
                vehicleYear: '', vehicleVin: '', serviceTypeId: '', appointmentDate: '',
                appointmentTime: '', estimatedDuration: '', customerConcerns: '',
                notes: '', serviceAdvisorId: ''
            });
        }
        setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setSelectedItem(null); };

    const handleVehicleBrandSelect = (e) => {
        const brandId = e.target.value;
        const selectedBrand = vehicleBrands.find((b) => String(b.id) === String(brandId));
        setFormData({
            ...formData,
            // Keep vehicleId for backward compatibility with backend payload, but we no longer bind it to inventory.
            vehicleId: '',
            vehicleMake: selectedBrand?.name || '',
        });
    };

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'create') {
                await serviceAPI.createAppointment(formData);
                toast.success('Appointment created successfully');
            } else if (modalMode === 'edit') {
                await serviceAPI.updateAppointment(selectedItem.id, formData);
                toast.success('Appointment updated successfully');
            }
            closeModal();
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        }
    };

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

    const handleDeleteClick = (id) => {
        setConfirmModal({
            isOpen: true,
            title: 'Cancel Appointment',
            message: 'Are you sure you want to cancel this appointment?',
            type: 'danger',
            onConfirm: () => handleDelete(id)
        });
    };

    const handleDelete = async (id) => {
        try {
            await serviceAPI.deleteAppointment(id);
            toast.success('Appointment cancelled');
            setConfirmModal({ isOpen: false });
            fetchData();
        } catch (error) {
            toast.error('Failed to cancel appointment');
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        try {
            await serviceAPI.updateAppointmentStatus(id, newStatus);
            toast.success('Status updated');
            fetchData();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleConvertToJobCard = async (item) => {
        try {
            await serviceAPI.createJobCard({
                appointmentId: item.id,
                customerId: item.customer_id,
                vehicleNumber: item.customer_vehicle_number,
                vehicleMake: item.customer_vehicle_make,
                vehicleModel: item.customer_vehicle_model,
                vehicleVin: item.customer_vehicle_vin,
                customerRemarks: item.customer_concerns
            });
            toast.success('Job card created from appointment');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create job card');
        }
    };

    const getStatusBadgeClass = (status) => {
        const classes = {
            scheduled: 'info', confirmed: 'primary', in_progress: 'warning',
            completed: 'success', cancelled: 'danger', no_show: 'secondary'
        };
        return classes[status] || 'info';
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div className="card">
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                type={confirmModal.type}
            />
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Appointments</h3>
                {canCreate && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Appointment</button>}
            </div>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Appt #</th>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th>Service Type</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map(a => (
                        <tr key={a.id}>
                            <td><strong>{a.appointment_number}</strong></td>
                            <td>{a.customer_name}</td>
                            <td>{a.customer_vehicle_make} {a.customer_vehicle_model}<br /><small className="text-muted">{a.customer_vehicle_number}</small></td>
                            <td>{a.service_type_name || '-'}</td>
                            <td>{a.appointment_date ? new Date(a.appointment_date).toLocaleDateString() : '-'}</td>
                            <td>{a.appointment_time || '-'}</td>
                            <td>
                                <SearchableSelect
                                    className={`badge badge-${getStatusBadgeClass(a.status)}`}
                                    value={a.status}
                                    onChange={(e) => handleStatusChange(a.id, e.target.value)}
                                    disabled={['completed', 'cancelled', 'no_show'].includes(a.status)}
                                    style={{ border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                                >
                                    <option value="scheduled">Scheduled</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                    <option value="no_show">No Show</option>
                                </SearchableSelect>
                            </td>
                            <td>
                                <ActionButtons
                                    showView={true}
                                    onView={() => openModal('view', a)}
                                    onEdit={canEdit && !['completed', 'cancelled', 'no_show'].includes(a.status) ? () => openModal('edit', a) : null}
                                    onDelete={canDelete && !['completed', 'cancelled'].includes(a.status) ? () => handleDeleteClick(a.id) : null}
                                    extraActions={canCreate && ['scheduled', 'confirmed'].includes(a.status) ? [
                                        { icon: <span className="material-icons" style={{ fontSize: '18px' }}>build</span>, title: 'Create Job Card', onClick: () => handleConvertToJobCard(a), className: 'btn-success' }
                                    ] : []}
                                />
                            </td>
                        </tr>
                    ))}
                    {data.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No appointments found</td></tr>}
                </tbody>
            </table>

            {showModal && (
                <Modal title={`${modalMode === 'create' ? 'Create' : modalMode === 'edit' ? 'Edit' : 'View'} Appointment`} onClose={closeModal}>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Customer *</label>
                            <SearchableSelect name="customerId" value={formData.customerId} onChange={handleChange} required disabled={modalMode === 'view'}>
                                <option value="">Select Customer</option>
                                {customers.map(c => <option key={c.id} value={c.id}>{customerOptionLabel(c)}</option>)}
                            </SearchableSelect>
                        </div>

                        {/* Vehicle Selection - from inventory or manual entry */}
                        <div className="form-group">
                            <label>
                                Vehicle Brand (Optional){' '}
                                <a href="/vehicle-branding" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                                    Manage brands
                                </a>
                            </label>
                            <SearchableSelect
                                name="vehicleBrandId"
                                value={vehicleBrands.find((b) => b.name === formData.vehicleMake)?.id || ''}
                                onChange={handleVehicleBrandSelect}
                                disabled={modalMode === 'view'}
                            >
                                <option value="">-- Select brand or enter details manually below --</option>
                                {vehicleBrands.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </SearchableSelect>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Vehicle Number</label>
                                <input type="text" name="vehicleNumber" value={formData.vehicleNumber} onChange={handleChange} placeholder="ABC-123" disabled={modalMode === 'view'} />
                            </div>
                            <div className="form-group">
                                <label>Vehicle Make</label>
                                <input type="text" name="vehicleMake" value={formData.vehicleMake} onChange={handleChange} placeholder="Toyota" disabled={modalMode === 'view'} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Vehicle Model</label>
                                <input type="text" name="vehicleModel" value={formData.vehicleModel} onChange={handleChange} placeholder="Corolla" disabled={modalMode === 'view'} />
                            </div>
                            <div className="form-group">
                                <label>Year</label>
                                <input type="number" name="vehicleYear" value={formData.vehicleYear} onChange={handleChange} placeholder="2024" disabled={modalMode === 'view'} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>VIN (Optional)</label>
                            <input type="text" name="vehicleVin" value={formData.vehicleVin} onChange={handleChange} placeholder="Vehicle Identification Number" disabled={modalMode === 'view'} />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Service Type</label>
                                <SearchableSelect name="serviceTypeId" value={formData.serviceTypeId} onChange={handleChange} disabled={modalMode === 'view'}>
                                    <option value="">Select Service Type</option>
                                    {serviceTypes.map(t => <option key={t.id} value={t.id}>{t.name} - PKR {Number(t.base_price).toLocaleString()}</option>)}
                                </SearchableSelect>
                            </div>
                            <div className="form-group">
                                <label>Service Advisor</label>
                                <SearchableSelect name="serviceAdvisorId" value={formData.serviceAdvisorId} onChange={handleChange} disabled={modalMode === 'view'}>
                                    <option value="">Select Advisor</option>
                                    {advisors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </SearchableSelect>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Appointment Date *</label>
                                <input type="date" name="appointmentDate" value={formData.appointmentDate} onChange={handleChange} required disabled={modalMode === 'view'} />
                            </div>
                            <div className="form-group">
                                <label>Appointment Time *</label>
                                <input type="time" name="appointmentTime" value={formData.appointmentTime} onChange={handleChange} required disabled={modalMode === 'view'} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Estimated Duration (minutes)</label>
                            <input type="number" name="estimatedDuration" value={formData.estimatedDuration} onChange={handleChange} placeholder="60" disabled={modalMode === 'view'} />
                        </div>
                        <div className="form-group">
                            <label>Customer Concerns</label>
                            <textarea name="customerConcerns" value={formData.customerConcerns} onChange={handleChange} rows="3" placeholder="Describe the issues or services requested..." disabled={modalMode === 'view'} />
                        </div>
                        <div className="form-group">
                            <label>Internal Notes</label>
                            <textarea name="notes" value={formData.notes} onChange={handleChange} rows="2" placeholder="Internal notes..." disabled={modalMode === 'view'} />
                        </div>
                        {modalMode !== 'view' && (
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{modalMode === 'create' ? 'Create' : 'Update'}</button>
                            </div>
                        )}
                    </form>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB CARDS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function JobCards() {
    const { user } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [selectedItem, setSelectedItem] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [technicians, setTechnicians] = useState([]);
    const [advisors, setAdvisors] = useState([]);
    const [parts, setParts] = useState([]);
    const [vehicleBrands, setVehicleBrands] = useState([]);
    const [formData, setFormData] = useState({
        customerId: '', vehicleId: '', vehicleNumber: '', vehicleMake: '', vehicleModel: '',
        vehicleVin: '', odometerReading: '', fuelLevel: '', promisedDate: '',
        customerRemarks: '', technicianRemarks: '', serviceAdvisorId: '', technicianId: '',
        discount: '0', taxAmount: '0'
    });
    // Services and parts for the job card
    const [jobServices, setJobServices] = useState([]);
    const [jobParts, setJobParts] = useState([]);
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [showPartModal, setShowPartModal] = useState(false);
    const [serviceForm, setServiceForm] = useState({ serviceTypeId: '', description: '', hours: '', rate: '', technicianId: '' });
    const [partForm, setPartForm] = useState({ partId: '', quantity: '1', unitPrice: '', isWarranty: false });

    const canCreate = user?.role === 'super_admin' || user?.role === 'service_manager' || user?.role === 'service_advisor';
    const canEdit = user?.role === 'super_admin' || user?.role === 'service_manager';
    const canComplete = user?.role === 'super_admin' || user?.role === 'service_manager' || user?.role === 'technician';

    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await serviceAPI.getJobCards({ search: urlSearch });
            setData(res.data?.data || []);
        } catch (error) {
            console.error('Error fetching job cards:', error);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [urlSearch]);

    const fetchDropdowns = useCallback(async () => {
        try {
            // Fetch all dropdowns with individual error handling
            const results = await Promise.allSettled([
                fetchAllCustomersForDropdown(),
                serviceAPI.getServiceTypes(),
                serviceAPI.getTechnicians().catch(() => ({ data: { data: [] } })),
                serviceAPI.getAdvisors().catch(() => ({ data: { data: [] } })),
                partsAPI.getAll({ limit: 500 }),
                vehicleBrandingService.getActiveBrands().catch(() => ({ data: { brands: [] }, success: true }))
            ]);

            setCustomers(results[0].status === 'fulfilled' ? results[0].value || [] : []);
            setServiceTypes(results[1].status === 'fulfilled' ? results[1].value?.data?.data || [] : []);
            setTechnicians(results[2].status === 'fulfilled' ? results[2].value?.data?.data || [] : []);
            setAdvisors(results[3].status === 'fulfilled' ? results[3].value?.data?.data || [] : []);
            setParts(results[4].status === 'fulfilled' ? results[4].value?.data?.data?.parts || [] : []);
            setVehicleBrands(results[5].status === 'fulfilled' ? results[5].value?.data?.brands || results[5].value?.data?.data?.brands || [] : []);
        } catch (error) {
            console.error('Error fetching dropdowns:', error);
        }
    }, []);

    useEffect(() => { fetchData(); fetchDropdowns(); }, [fetchData, fetchDropdowns]);

    const openModal = async (mode, item = null) => {
        setModalMode(mode);
        setSelectedItem(item);
        setJobServices([]);
        setJobParts([]);

        if (item) {
            // Fetch full job card details with services and parts
            try {
                const res = await serviceAPI.getJobCard(item.id);
                const jc = res.data.data;
                setFormData({
                    customerId: jc.customer_id || '',
                    vehicleId: jc.vehicle_id || '',
                    vehicleNumber: jc.customer_vehicle_number || '',
                    vehicleMake: jc.customer_vehicle_make || '',
                    vehicleModel: jc.customer_vehicle_model || '',
                    vehicleVin: jc.customer_vehicle_vin || '',
                    odometerReading: jc.odometer_reading || '',
                    fuelLevel: jc.fuel_level || '',
                    promisedDate: jc.promised_date ? jc.promised_date.split('T')[0] + 'T' + (jc.promised_date.split('T')[1] || '10:00').substring(0, 5) : '',
                    customerRemarks: jc.customer_remarks || '',
                    technicianRemarks: jc.technician_remarks || '',
                    serviceAdvisorId: jc.service_advisor_id || '',
                    technicianId: jc.technician_id || '',
                    discount: jc.discount || '0',
                    taxAmount: jc.tax_amount || '0'
                });
                setJobServices(jc.services || []);
                setJobParts(jc.parts || []);
            } catch (error) {
                console.error('Error fetching job card details:', error);
            }
        } else {
            setFormData({
                customerId: '', vehicleId: '', vehicleNumber: '', vehicleMake: '', vehicleModel: '',
                vehicleVin: '', odometerReading: '', fuelLevel: '', promisedDate: '',
                customerRemarks: '', technicianRemarks: '', serviceAdvisorId: '', technicianId: '',
                discount: '0', taxAmount: '0'
            });
        }
        setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setSelectedItem(null); };

    const handleVehicleBrandSelect = (e) => {
        const brandId = e.target.value;
        const selectedBrand = vehicleBrands.find((b) => String(b.id) === String(brandId));
        setFormData({
            ...formData,
            vehicleId: '',
            vehicleMake: selectedBrand?.name || '',
        });
    };

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'create') {
                await serviceAPI.createJobCard(formData);
                toast.success('Job card created successfully');
            } else if (modalMode === 'edit') {
                await serviceAPI.updateJobCard(selectedItem.id, formData);
                toast.success('Job card updated successfully');
            }
            closeModal();
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Operation failed');
        }
    };

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

    const handleDeleteClick = (id) => {
        setConfirmModal({
            isOpen: true,
            title: 'Cancel Job Card',
            message: 'Are you sure you want to cancel this job card?',
            type: 'danger',
            onConfirm: () => handleDelete(id)
        });
    };

    const handleDelete = async (id) => {
        try {
            await serviceAPI.deleteJobCard(id);
            toast.success('Job card cancelled');
            setConfirmModal({ isOpen: false });
            fetchData();
        } catch (error) {
            toast.error('Failed to cancel job card');
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        try {
            await serviceAPI.updateJobCardStatus(id, newStatus);
            toast.success('Status updated');
            fetchData();
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleCompleteClick = (id) => {
        setConfirmModal({
            isOpen: true,
            title: 'Complete Job Card',
            message: 'Are you sure you want to mark this job card as completed? Totals will be calculated and finalized.',
            type: 'primary',
            confirmText: 'Complete',
            onConfirm: () => handleComplete(id)
        });
    };

    const handleComplete = async (id) => {
        try {
            await serviceAPI.completeJobCard(id, { technicianRemarks: formData.technicianRemarks });
            toast.success('Job card completed');
            setConfirmModal({ isOpen: false });
            fetchData();
        } catch (error) {
            toast.error('Failed to complete job card');
        }
    };

    // Add Service
    const handleAddService = async () => {
        if (!selectedItem) return;
        try {
            await serviceAPI.addJobCardService(selectedItem.id, serviceForm);
            toast.success('Service added');
            setShowServiceModal(false);
            setServiceForm({ serviceTypeId: '', description: '', hours: '', rate: '', technicianId: '' });
            // Refresh job card details
            const res = await serviceAPI.getJobCard(selectedItem.id);
            setJobServices(res.data.data.services || []);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add service');
        }
    };

    const handleDeleteService = async (serviceId) => {
        if (!selectedItem) return;
        try {
            await serviceAPI.deleteJobCardService(selectedItem.id, serviceId);
            toast.success('Service removed');
            const res = await serviceAPI.getJobCard(selectedItem.id);
            setJobServices(res.data.data.services || []);
            fetchData();
        } catch (error) {
            toast.error('Failed to remove service');
        }
    };

    // Add Part
    const handleAddPart = async () => {
        if (!selectedItem) return;
        try {
            await serviceAPI.addJobCardPart(selectedItem.id, partForm);
            toast.success('Part added');
            setShowPartModal(false);
            setPartForm({ partId: '', quantity: '1', unitPrice: '', isWarranty: false });
            // Refresh job card details
            const res = await serviceAPI.getJobCard(selectedItem.id);
            setJobParts(res.data.data.parts || []);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add part');
        }
    };

    const handleDeletePart = async (partId) => {
        if (!selectedItem) return;
        try {
            await serviceAPI.deleteJobCardPart(selectedItem.id, partId);
            toast.success('Part removed');
            const res = await serviceAPI.getJobCard(selectedItem.id);
            setJobParts(res.data.data.parts || []);
            fetchData();
        } catch (error) {
            toast.error('Failed to remove part');
        }
    };

    const handlePartSelect = (e) => {
        const selectedPart = parts.find(p => p.id === parseInt(e.target.value));
        setPartForm({
            ...partForm,
            partId: e.target.value,
            unitPrice: selectedPart?.selling_price || ''
        });
    };

    const getStatusBadgeClass = (status) => {
        const classes = {
            open: 'info', in_progress: 'warning', on_hold: 'secondary',
            completed: 'success', delivered: 'primary', cancelled: 'danger'
        };
        return classes[status] || 'info';
    };

    // Calculate totals for display
    const calculateTotals = () => {
        const laborTotal = jobServices.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
        const partsTotal = jobParts.filter(p => !p.is_warranty).reduce((sum, p) => sum + parseFloat(p.total || 0), 0);
        const discount = parseFloat(formData.discount) || 0;
        const tax = parseFloat(formData.taxAmount) || 0;
        const grandTotal = laborTotal + partsTotal - discount + tax;
        return { laborTotal, partsTotal, discount, tax, grandTotal };
    };

    if (loading) return <div className="spinner"></div>;

    const totals = calculateTotals();

    return (
        <div className="card">
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                type={confirmModal.type}
                confirmText={confirmModal.confirmText}
            />
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Job Cards</h3>
                {canCreate && <button className="btn btn-primary" onClick={() => openModal('create')}>+ New Job Card</button>}
            </div>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>JC #</th>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th>Received</th>
                        <th>Labor</th>
                        <th>Parts</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map(jc => (
                        <tr key={jc.id}>
                            <td><strong>{jc.job_card_number}</strong></td>
                            <td>{jc.customer_name}</td>
                            <td>{jc.customer_vehicle_make} {jc.customer_vehicle_model}<br /><small className="text-muted">{jc.customer_vehicle_number}</small></td>
                            <td>{jc.received_date ? new Date(jc.received_date).toLocaleDateString() : '-'}</td>
                            <td>PKR {Number(jc.labor_total || 0).toLocaleString()}</td>
                            <td>PKR {Number(jc.parts_total || 0).toLocaleString()}</td>
                            <td><strong>PKR {Number(jc.grand_total || 0).toLocaleString()}</strong></td>
                            <td>
                                <SearchableSelect
                                    className={`badge badge-${getStatusBadgeClass(jc.status)}`}
                                    value={jc.status}
                                    onChange={(e) => handleStatusChange(jc.id, e.target.value)}
                                    disabled={['delivered', 'cancelled'].includes(jc.status)}
                                    style={{ border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                                >
                                    <option value="open">Open</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="on_hold">On Hold</option>
                                    <option value="completed">Completed</option>
                                    <option value="delivered">Delivered</option>
                                    <option value="cancelled">Cancelled</option>
                                </SearchableSelect>
                            </td>
                            <td>
                                <ActionButtons
                                    showView={true}
                                    onView={() => openModal('view', jc)}
                                    onEdit={canEdit && !['completed', 'delivered', 'cancelled'].includes(jc.status) ? () => openModal('edit', jc) : null}
                                    onDelete={canEdit && !['completed', 'delivered'].includes(jc.status) ? () => handleDeleteClick(jc.id) : null}
                                    extraActions={canComplete && jc.status === 'in_progress' ? [
                                        { icon: <span className="material-icons" style={{ fontSize: '18px' }}>check_circle</span>, title: 'Complete', onClick: () => handleCompleteClick(jc.id), className: 'btn-success' }
                                    ] : []}
                                />
                            </td>
                        </tr>
                    ))}
                    {data.length === 0 && <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>No job cards found</td></tr>}
                </tbody>
            </table>

            {showModal && (
                <Modal title={`${modalMode === 'create' ? 'Create' : modalMode === 'edit' ? 'Edit' : 'View'} Job Card`} onClose={closeModal} size="large">
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Customer & Vehicle</h4>
                                <div className="form-group">
                                    <label>Customer *</label>
                                    <SearchableSelect name="customerId" value={formData.customerId} onChange={handleChange} required disabled={modalMode === 'view'}>
                                        <option value="">Select Customer</option>
                                        {customers.map(c => <option key={c.id} value={c.id}>{customerOptionLabel(c)}</option>)}
                                    </SearchableSelect>
                                </div>

                                {/* Vehicle Selection - from inventory or manual entry */}
                                <div className="form-group">
                                    <label>
                                        Vehicle Brand (Optional){' '}
                                        <a href="/vehicle-branding" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                                            Manage brands
                                        </a>
                                    </label>
                                    <SearchableSelect
                                        name="vehicleBrandId"
                                        value={vehicleBrands.find((b) => b.name === formData.vehicleMake)?.id || ''}
                                        onChange={handleVehicleBrandSelect}
                                        disabled={modalMode === 'view'}
                                    >
                                        <option value="">-- Select brand or enter details manually below --</option>
                                        {vehicleBrands.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.name}
                                            </option>
                                        ))}
                                    </SearchableSelect>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Vehicle Number</label>
                                        <input type="text" name="vehicleNumber" value={formData.vehicleNumber} onChange={handleChange} disabled={modalMode === 'view'} />
                                    </div>
                                    <div className="form-group">
                                        <label>Make</label>
                                        <input type="text" name="vehicleMake" value={formData.vehicleMake} onChange={handleChange} disabled={modalMode === 'view'} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Model</label>
                                        <input type="text" name="vehicleModel" value={formData.vehicleModel} onChange={handleChange} disabled={modalMode === 'view'} />
                                    </div>
                                    <div className="form-group">
                                        <label>VIN</label>
                                        <input type="text" name="vehicleVin" value={formData.vehicleVin} onChange={handleChange} disabled={modalMode === 'view'} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Odometer Reading</label>
                                        <input type="number" name="odometerReading" value={formData.odometerReading} onChange={handleChange} placeholder="KM" disabled={modalMode === 'view'} />
                                    </div>
                                    <div className="form-group">
                                        <label>Fuel Level</label>
                                        <SearchableSelect name="fuelLevel" value={formData.fuelLevel} onChange={handleChange} disabled={modalMode === 'view'}>
                                            <option value="">Select Level</option>
                                            <option value="empty">Empty</option>
                                            <option value="quarter">1/4</option>
                                            <option value="half">1/2</option>
                                            <option value="three_quarter">3/4</option>
                                            <option value="full">Full</option>
                                        </SearchableSelect>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Assignment & Dates</h4>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Service Advisor</label>
                                        <SearchableSelect name="serviceAdvisorId" value={formData.serviceAdvisorId} onChange={handleChange} disabled={modalMode === 'view'}>
                                            <option value="">Select Advisor</option>
                                            {advisors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                        </SearchableSelect>
                                    </div>
                                    <div className="form-group">
                                        <label>Technician</label>
                                        <SearchableSelect name="technicianId" value={formData.technicianId} onChange={handleChange} disabled={modalMode === 'view'}>
                                            <option value="">Select Technician</option>
                                            {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </SearchableSelect>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Promised Completion Date</label>
                                    <input type="datetime-local" name="promisedDate" value={formData.promisedDate} onChange={handleChange} disabled={modalMode === 'view'} />
                                </div>
                                <div className="form-group">
                                    <label>Customer Remarks</label>
                                    <textarea name="customerRemarks" value={formData.customerRemarks} onChange={handleChange} rows="2" disabled={modalMode === 'view'} />
                                </div>
                                <div className="form-group">
                                    <label>Technician Remarks</label>
                                    <textarea name="technicianRemarks" value={formData.technicianRemarks} onChange={handleChange} rows="2" disabled={modalMode === 'view'} />
                                </div>
                            </div>
                        </div>

                        {/* Services Section - only show for edit/view */}
                        {(modalMode === 'edit' || modalMode === 'view') && selectedItem && (
                            <div style={{ marginTop: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h4 style={{ margin: 0 }}>Services (Labor)</h4>
                                    {modalMode === 'edit' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowServiceModal(true)}>+ Add Service</button>}
                                </div>
                                <table className="data-table" style={{ marginBottom: '1rem' }}>
                                    <thead>
                                        <tr><th>Description</th><th>Hours</th><th>Rate</th><th>Total</th><th>Status</th>{modalMode === 'edit' && <th>Action</th>}</tr>
                                    </thead>
                                    <tbody>
                                        {jobServices.map(s => (
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
                        )}

                        {/* Parts Section - only show for edit/view */}
                        {(modalMode === 'edit' || modalMode === 'view') && selectedItem && (
                            <div style={{ marginTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h4 style={{ margin: 0 }}>Parts</h4>
                                    {modalMode === 'edit' && <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowPartModal(true)}>+ Add Part</button>}
                                </div>
                                <table className="data-table" style={{ marginBottom: '1rem' }}>
                                    <thead>
                                        <tr><th>Part #</th><th>Name</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Warranty</th>{modalMode === 'edit' && <th>Action</th>}</tr>
                                    </thead>
                                    <tbody>
                                        {jobParts.map(p => (
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
                        )}

                        {/* Totals Section - show for edit/view */}
                        {(modalMode === 'edit' || modalMode === 'view') && selectedItem && (
                            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
                                <h4 style={{ marginBottom: '1rem' }}>Totals</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', textAlign: 'center' }}>
                                    <div>
                                        <small className="text-muted">Labor</small>
                                        <div><strong>PKR {totals.laborTotal.toLocaleString()}</strong></div>
                                    </div>
                                    <div>
                                        <small className="text-muted">Parts</small>
                                        <div><strong>PKR {totals.partsTotal.toLocaleString()}</strong></div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px' }}>Discount</label>
                                        <input type="number" name="discount" value={formData.discount} onChange={handleChange} style={{ width: '100%' }} disabled={modalMode === 'view'} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px' }}>Tax</label>
                                        <input type="number" name="taxAmount" value={formData.taxAmount} onChange={handleChange} style={{ width: '100%' }} disabled={modalMode === 'view'} />
                                    </div>
                                    <div style={{ background: '#1a73e8', color: 'white', padding: '0.5rem', borderRadius: '4px' }}>
                                        <small>Grand Total</small>
                                        <div><strong>PKR {totals.grandTotal.toLocaleString()}</strong></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {modalMode !== 'view' && (
                            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{modalMode === 'create' ? 'Create' : 'Update'}</button>
                            </div>
                        )}
                    </form>
                </Modal>
            )}

            {/* Add Service Modal */}
            {showServiceModal && (
                <Modal title="Add Service" onClose={() => setShowServiceModal(false)}>
                    <div className="form-group">
                        <label>Service Type</label>
                        <SearchableSelect value={serviceForm.serviceTypeId} onChange={(e) => {
                            const st = serviceTypes.find(t => t.id === parseInt(e.target.value));
                            setServiceForm({ ...serviceForm, serviceTypeId: e.target.value, description: st?.name || '', rate: st?.base_price || '', hours: st?.estimated_hours || '' });
                        }}>
                            <option value="">Select Type</option>
                            {serviceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </SearchableSelect>
                    </div>
                    <div className="form-group">
                        <label>Description *</label>
                        <input type="text" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} required />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Hours</label>
                            <input type="number" step="0.5" value={serviceForm.hours} onChange={(e) => setServiceForm({ ...serviceForm, hours: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Rate (PKR) *</label>
                            <input type="number" value={serviceForm.rate} onChange={(e) => setServiceForm({ ...serviceForm, rate: e.target.value })} required />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Technician</label>
                        <SearchableSelect value={serviceForm.technicianId} onChange={(e) => setServiceForm({ ...serviceForm, technicianId: e.target.value })}>
                            <option value="">Select Technician</option>
                            {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </SearchableSelect>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowServiceModal(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={handleAddService}>Add Service</button>
                    </div>
                </Modal>
            )}

            {/* Add Part Modal */}
            {showPartModal && (
                <Modal title="Add Part" onClose={() => setShowPartModal(false)}>
                    <div className="form-group">
                        <label>Part *</label>
                        <SearchableSelect value={partForm.partId} onChange={handlePartSelect} required>
                            <option value="">Select Part</option>
                            {parts.map(p => <option key={p.id} value={p.id}>{p.part_number} - {p.name} (Stock: {p.current_stock})</option>)}
                        </SearchableSelect>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Quantity *</label>
                            <input type="number" min="1" value={partForm.quantity} onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Unit Price (PKR) *</label>
                            <input type="number" value={partForm.unitPrice} onChange={(e) => setPartForm({ ...partForm, unitPrice: e.target.value })} required />
                        </div>
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="checkbox" checked={partForm.isWarranty} onChange={(e) => setPartForm({ ...partForm, isWarranty: e.target.checked })} />
                            Warranty Item (No charge)
                        </label>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowPartModal(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={handleAddPart}>Add Part</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Modal({ title, children, onClose, size = 'normal' }) {
    return (
        <div className="modal-overlay">
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: size === 'large' ? '900px' : '600px', maxHeight: '90vh', overflowY: 'auto' }}
            >
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">{children}</div>
            </div>
        </div>
    );
}

export default Service;