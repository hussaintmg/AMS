import React, { useEffect, useRef } from 'react';

export default function EmployeeDrawer({ isOpen, onClose, employee }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fullName = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || employee?.email || '-';
  const deptName = employee?.department?.name || '-';
  const roleName = employee?.role?.displayName || employee?.role?.name || '-';

  return (
    <div className="email-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="email-drawer" ref={drawerRef} onClick={e => e.stopPropagation()}
        style={{ '--drawer-width': '50%' }}>
        <div className="email-drawer-header">
          <h3>{fullName}</h3>
          <button className="email-drawer-close" onClick={onClose}>&times;</button>
        </div>
        <div className="email-drawer-body">
          <div className="email-drawer-section">
            <h4>Employee Information</h4>
            <div className="email-drawer-grid">
              <div className="email-drawer-row">
                <span className="email-drawer-label">Employee Code</span>
                <span className="email-drawer-value">{employee?.employeeCode || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Status</span>
                <span className={`email-drawer-value ${employee?.isActive ? 'status-active' : 'status-inactive'}`}>
                  {employee?.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Department</span>
                <span className="email-drawer-value">{deptName}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Designation</span>
                <span className="email-drawer-value">{employee?.designation || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Role</span>
                <span className="email-drawer-value">{roleName}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Joining Date</span>
                <span className="email-drawer-value">{employee?.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-GB') : '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Email</span>
                <span className="email-drawer-value">{employee?.email || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Phone</span>
                <span className="email-drawer-value">{employee?.phone || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">CNIC</span>
                <span className="email-drawer-value">{employee?.cnic || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Salary</span>
                <span className="email-drawer-value">{employee?.salary != null ? Number(employee.salary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
