import React, { useEffect, useRef } from 'react';

const STATUS_BADGE = {
  pending: 'badge-warning', approved: 'badge-success',
  rejected: 'badge-danger', cancelled: 'badge-secondary',
};

const LEAVE_TYPE_LABELS = {
  sick: 'Sick Leave', casual: 'Casual Leave', annual: 'Annual Leave',
  unpaid: 'Unpaid Leave', maternity: 'Maternity Leave', paternity: 'Paternity Leave', other: 'Other',
};

export default function LeaveDrawer({ isOpen, onClose, leave }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const empName = leave?.employee ? `${leave.employee.firstName || ''} ${leave.employee.lastName || ''}`.trim() || '-' : '-';
  const empCode = leave?.employee?.employeeCode || '-';
  const statusEl = leave?.status ? (
    <span className={`badge ${STATUS_BADGE[leave.status] || 'badge-secondary'}`}>{leave.status}</span>
  ) : '-';

  return (
    <div className="email-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="email-drawer" ref={drawerRef} onClick={e => e.stopPropagation()}
        style={{ '--drawer-width': '50%' }}>
        <div className="email-drawer-header">
          <h3>Leave Detail</h3>
          <button className="email-drawer-close" onClick={onClose}>&times;</button>
        </div>
        <div className="email-drawer-body">
          <div className="email-drawer-section">
            <h4>Leave Information</h4>
            <div className="email-drawer-grid">
              <div className="email-drawer-row">
                <span className="email-drawer-label">Employee</span>
                <span className="email-drawer-value">{empName} ({empCode})</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Status</span>
                <span className="email-drawer-value">{statusEl}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Leave Type</span>
                <span className="email-drawer-value">{LEAVE_TYPE_LABELS[leave?.leaveType] || leave?.leaveType || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Days</span>
                <span className="email-drawer-value">{leave?.days || '-'}</span>
              </div>
              <div className="email-drawer-row email-drawer-row-full">
                <span className="email-drawer-label">Start Date</span>
                <span className="email-drawer-value">{leave?.startDate ? new Date(leave.startDate).toLocaleDateString('en-GB') : '-'}</span>
              </div>
              <div className="email-drawer-row email-drawer-row-full">
                <span className="email-drawer-label">End Date</span>
                <span className="email-drawer-value">{leave?.endDate ? new Date(leave.endDate).toLocaleDateString('en-GB') : '-'}</span>
              </div>
              <div className="email-drawer-row email-drawer-row-full">
                <span className="email-drawer-label">Reason</span>
                <span className="email-drawer-value">{leave?.reason || 'No reason provided'}</span>
              </div>
              {leave?.approvedBy && (
                <div className="email-drawer-row email-drawer-row-full">
                  <span className="email-drawer-label">Approved By</span>
                  <span className="email-drawer-value">{leave.approvedBy.firstName} {leave.approvedBy.lastName}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
