import React, { useState, useEffect } from 'react';
import SearchableSelect from '../SearchableSelect';
import useModalKeyboard from '../../hooks/useModalKeyboard';

function UserFormModal({ isOpen, mode, initialData, roles, departments, onClose, onSubmit, loading }) {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        phone: '',
        roleId: '',
        department: '',
        jobTitle: ''
    });
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (!isOpen) return;
        if (mode === 'create') {
            setFormData({
                email: '',
                password: '',
                firstName: '',
                lastName: '',
                phone: '',
                roleId: '',
                department: '',
                jobTitle: ''
            });
        } else if (initialData) {
            setFormData({
                email: initialData.email || '',
                password: '',
                firstName: initialData.firstName || initialData.first_name || '',
                lastName: initialData.lastName || initialData.last_name || '',
                phone: initialData.phone || '',
                roleId: typeof initialData.role === 'object' ? (initialData.role._id || initialData.role.id) : (initialData.roleId || initialData.role || ''),
                department: initialData.department || initialData.department_name || '',
                jobTitle: initialData.designation || initialData.jobTitle || initialData.job_title || ''
            });
        }
        setErrors({});
    }, [isOpen, mode, initialData]);

    const validate = () => {
        const errs = {};
        if (!formData.firstName.trim()) errs.firstName = 'First name is required';
        if (!formData.lastName.trim()) errs.lastName = 'Last name is required';
        if (!formData.email.trim()) errs.email = 'Email is required';
        if (mode === 'create' && !formData.password) errs.password = 'Password is required';
        if (!formData.roleId) errs.roleId = 'Role is required';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        if (!validate()) return;
        onSubmit(formData);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: undefined }));
        }
    };

    useModalKeyboard(isOpen, onClose, handleSubmit);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{mode === 'create' ? 'Create New User' : 'Edit User'}</h2>
                    <button className="modal-close" onClick={onClose} type="button">×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label>First Name *</label>
                                <input
                                    type="text"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleInputChange}
                                    placeholder="Enter first name"
                                    className={errors.firstName ? 'form-control error' : 'form-control'}
                                />
                                {errors.firstName && <small style={{ color: '#dc2626' }}>{errors.firstName}</small>}
                            </div>
                            <div className="form-group">
                                <label>Last Name *</label>
                                <input
                                    type="text"
                                    name="lastName"
                                    value={formData.lastName}
                                    onChange={handleInputChange}
                                    placeholder="Enter last name"
                                    className={errors.lastName ? 'form-control error' : 'form-control'}
                                />
                                {errors.lastName && <small style={{ color: '#dc2626' }}>{errors.lastName}</small>}
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Email *</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    placeholder="user@example.com"
                                    className={errors.email ? 'form-control error' : 'form-control'}
                                />
                                {errors.email && <small style={{ color: '#dc2626' }}>{errors.email}</small>}
                            </div>
                            <div className="form-group">
                                <label>Phone</label>
                                <input
                                    type="text"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    placeholder="+92 xxx xxxxxxx"
                                    className="form-control"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>{mode === 'create' ? 'Password *' : 'New Password'}</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    placeholder={mode === 'create' ? 'Enter password' : 'Leave blank to keep current'}
                                    minLength={6}
                                    className={errors.password ? 'form-control error' : 'form-control'}
                                />
                                {errors.password && <small style={{ color: '#dc2626' }}>{errors.password}</small>}
                            </div>
                            <div className="form-group">
                                <label>Job Title</label>
                                <input
                                    type="text"
                                    name="jobTitle"
                                    value={formData.jobTitle}
                                    onChange={handleInputChange}
                                    placeholder="e.g. Sales Executive"
                                    className="form-control"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Role *</label>
                                <SearchableSelect
                                    name="roleId"
                                    value={formData.roleId}
                                    onChange={handleInputChange}
                                >
                                    <option value="">Select Role</option>
                                    {(roles || []).map(role => (
                                        <option key={role._id || role.id} value={role._id || role.id}>
                                            {(role.displayName || role.name || '').replace(/_/g, ' ').toUpperCase()}
                                        </option>
                                    ))}
                                </SearchableSelect>
                                {errors.roleId && <small style={{ color: '#dc2626' }}>{errors.roleId}</small>}
                            </div>
                            <div className="form-group">
                                <label>Department</label>
                                <SearchableSelect
                                    name="department"
                                    value={formData.department}
                                    onChange={handleInputChange}
                                >
                                    <option value="">Select Department</option>
                                    {(departments || []).map(dept => (
                                        <option key={dept._id || dept.id} value={dept._id || dept.id || dept.name}>
                                            {dept.name || dept.displayName || dept}
                                        </option>
                                    ))}
                                </SearchableSelect>
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? (
                                <>
                                    <span className="spinner-mini"></span>
                                    {mode === 'create' ? 'Creating...' : 'Saving...'}
                                </>
                            ) : (mode === 'create' ? 'Create User' : 'Save Changes')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default UserFormModal;
