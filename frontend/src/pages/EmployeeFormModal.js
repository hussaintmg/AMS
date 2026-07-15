import React, { useState, useEffect } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import useModalKeyboard from '../hooks/useModalKeyboard';

function EmployeeFormModal({ isOpen, mode, initialData, departments, roles, onClose, onSubmit, loading }) {
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '', cnic: '',
    department: '', role: '', designation: '', joiningDate: '', salary: '', status: 'active',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setFormData({ firstName: '', lastName: '', email: '', phone: '', cnic: '',
        department: '', role: '', designation: '', joiningDate: '', salary: '', status: 'active' });
    } else if (initialData) {
      setFormData({
        firstName: initialData.firstName || '',
        lastName: initialData.lastName || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        cnic: initialData.cnic || '',
        department: initialData.department?._id || initialData.department || '',
        role: initialData.role?._id || initialData.role || '',
        designation: initialData.designation || '',
        joiningDate: initialData.joiningDate ? initialData.joiningDate.slice(0, 10) : '',
        salary: initialData.salary != null ? String(initialData.salary) : '',
        status: initialData.status || 'active',
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  const validate = () => {
    const errs = {};
    if (!formData.firstName.trim()) errs.firstName = 'First name is required';
    if (!formData.lastName.trim()) errs.lastName = 'Last name is required';
    if (!formData.department) errs.department = 'Department is required';
    if (mode === 'edit' && !formData.role) errs.role = 'Role is required';
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => { if (e) e.preventDefault(); if (!validate()) return; onSubmit(formData); };
  const handleChange = (e) => { const { name, value } = e.target; setFormData(p => ({ ...p, [name]: value })); if (errors[name]) setErrors(p => ({ ...p, [name]: undefined })); };

  useModalKeyboard(isOpen, onClose, handleSubmit, loading);

  if (!isOpen) return null;

  const deptOptions = departments.map(d => ({ id: d._id || d.id, name: d.name }));
  const roleOptions = roles.map(r => ({ id: r._id || r.id, name: r.displayName || r.name }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'New Employee' : 'Edit Employee'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>First Name *</label>
                <input className="form-control" name="firstName" value={formData.firstName} onChange={handleChange} required autoFocus />
                {errors.firstName && <span className="field-error">{errors.firstName}</span>}
              </div>
              <div className="form-group">
                <label>Last Name *</label>
                <input className="form-control" name="lastName" value={formData.lastName} onChange={handleChange} required />
                {errors.lastName && <span className="field-error">{errors.lastName}</span>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input type="email" className="form-control" name="email" value={formData.email} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input className="form-control" name="phone" value={formData.phone} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Department *</label>
                <SearchableSelect options={deptOptions} value={formData.department}
                  onChange={e => { setFormData(p => ({ ...p, department: e.target.value })); if (errors.department) setErrors(p => ({ ...p, department: undefined })); }} placeholder="Select department" />
                {errors.department && <span className="field-error">{errors.department}</span>}
              </div>
              <div className="form-group">
                <label>Designation</label>
                <input className="form-control" name="designation" value={formData.designation} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              {mode === 'edit' && (
                <div className="form-group">
                  <label>Role *</label>
                  <SearchableSelect options={roleOptions} value={formData.role}
                    onChange={e => { setFormData(p => ({ ...p, role: e.target.value })); if (errors.role) setErrors(p => ({ ...p, role: undefined })); }} placeholder="Select role" />
                  {errors.role && <span className="field-error">{errors.role}</span>}
                </div>
              )}
              <div className="form-group">
                <label>CNIC</label>
                <input className="form-control" name="cnic" value={formData.cnic} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Joining Date</label>
                <input type="date" className="form-control" name="joiningDate" value={formData.joiningDate} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Salary</label>
                <input type="number" step="0.01" className="form-control" name="salary" value={formData.salary} onChange={handleChange} />
              </div>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control" name="status" value={formData.status} onChange={handleChange}>
                <option value="active">Active</option>
                <option value="probation">Probation</option>
                <option value="on_leave">On Leave</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner-mini"></span> {mode === 'create' ? 'Creating...' : 'Saving...'}</>
                : mode === 'create' ? 'Create Employee' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EmployeeFormModal;
