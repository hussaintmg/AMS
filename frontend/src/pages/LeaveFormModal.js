import React, { useState, useEffect } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import useModalKeyboard from '../hooks/useModalKeyboard';

const LEAVE_TYPES = [
  { value: 'sick', label: 'Sick Leave' },
  { value: 'casual', label: 'Casual Leave' },
  { value: 'annual', label: 'Annual Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'maternity', label: 'Maternity Leave' },
  { value: 'paternity', label: 'Paternity Leave' },
  { value: 'other', label: 'Other' },
];

function LeaveFormModal({ isOpen, mode, initialData, employees, onClose, onSubmit, loading }) {
  const [formData, setFormData] = useState({
    employee: '', leaveType: '', startDate: '', endDate: '', days: '', reason: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setFormData({ employee: '', leaveType: '', startDate: '', endDate: '', days: '', reason: '' });
    } else if (initialData) {
      setFormData({
        employee: initialData.employee?._id || initialData.employee || '',
        leaveType: initialData.leaveType || '',
        startDate: initialData.startDate ? initialData.startDate.slice(0, 10) : '',
        endDate: initialData.endDate ? initialData.endDate.slice(0, 10) : '',
        days: initialData.days != null ? String(initialData.days) : '',
        reason: initialData.reason || '',
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  useEffect(() => {
    if (formData.startDate && formData.endDate) {
      const s = new Date(formData.startDate);
      const e = new Date(formData.endDate);
      if (e >= s) {
        const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
        setFormData(p => ({ ...p, days: String(diff) }));
      }
    }
  }, [formData.startDate, formData.endDate]);

  const validate = () => {
    const errs = {};
    if (!formData.employee) errs.employee = 'Employee is required';
    if (!formData.leaveType) errs.leaveType = 'Leave type is required';
    if (!formData.startDate) errs.startDate = 'Start date is required';
    if (!formData.endDate) errs.endDate = 'End date is required';
    if (!formData.days || Number(formData.days) < 1) errs.days = 'Days must be at least 1';
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => { if (e) e.preventDefault(); if (!validate()) return; onSubmit(formData); };
  const handleChange = (e) => { const { name, value } = e.target; setFormData(p => ({ ...p, [name]: value })); if (errors[name]) setErrors(p => ({ ...p, [name]: undefined })); };

  useModalKeyboard(isOpen, onClose, handleSubmit, loading);

  if (!isOpen) return null;

  const empOptions = employees.map(e => ({
    id: e._id || e.id,
    name: `${e.firstName || e.first_name || ''} ${e.lastName || e.last_name || ''}`.trim() || e.email || '',
  }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'New Leave Request' : 'Edit Leave'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Employee *</label>
              <SearchableSelect options={empOptions} value={formData.employee}
                onChange={e => setFormData(p => ({ ...p, employee: e.target.value }))} required />
              {errors.employee && <span className="field-error">{errors.employee}</span>}
            </div>
            <div className="form-group">
              <label>Leave Type *</label>
              <select className="form-control" name="leaveType" value={formData.leaveType} onChange={handleChange} required>
                <option value="">Select leave type</option>
                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {errors.leaveType && <span className="field-error">{errors.leaveType}</span>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Start Date *</label>
                <input type="date" className="form-control" name="startDate" value={formData.startDate} onChange={handleChange} required />
                {errors.startDate && <span className="field-error">{errors.startDate}</span>}
              </div>
              <div className="form-group">
                <label>End Date *</label>
                <input type="date" className="form-control" name="endDate" value={formData.endDate} onChange={handleChange} required />
                {errors.endDate && <span className="field-error">{errors.endDate}</span>}
              </div>
            </div>
            <div className="form-group">
              <label>Days *</label>
              <input type="number" step="0.5" className="form-control" name="days" value={formData.days} onChange={handleChange} required />
              {errors.days && <span className="field-error">{errors.days}</span>}
            </div>
            <div className="form-group">
              <label>Reason</label>
              <textarea className="form-control" rows={3} name="reason" value={formData.reason} onChange={handleChange} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner-mini"></span> {mode === 'create' ? 'Submitting...' : 'Saving...'}</>
                : mode === 'create' ? 'Submit Request' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LeaveFormModal;
