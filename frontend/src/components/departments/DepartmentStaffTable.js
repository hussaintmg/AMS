import React from 'react';
import ActionButtons from '../ActionButtons';

function DepartmentStaffTable({ staff = [], onEdit, onToggleStatus, onRemove }) {
  if (!staff || staff.length === 0) {
    return <div className="empty-state" style={{ padding: '16px 0' }}>No staff assigned to this department.</div>;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="desktop-only" style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%', minWidth: 500 }}>
          <thead>
            <tr>
              <th>User Name</th>
              <th>Role</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((user) => {
              const uid = user._id || user.id;
              const fullName = `${user.firstName || user.first_name || ''} ${user.lastName || user.last_name || ''}`.trim() || user.email;
              const roleName = user.role?.displayName || user.role?.name || '-';
              const statusText = user.status || (user.isActive ? 'active' : 'inactive');
              const isEmployee = user.staffType === 'employee';
              return (
                <tr key={uid}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                        <span>{(user.firstName || '?')[0]}{(user.lastName || '')[0] || ''}</span>
                      </div>
                      <div className="user-info">
                        <span className="user-name">{fullName}</span>
                        <small style={{ color: '#64748b' }}>{isEmployee ? `Employee${user.employeeCode ? ` · ${user.employeeCode}` : ''}` : 'User'}</small>
                      </div>
                    </div>
                  </td>
                  <td>{roleName.replace(/_/g, ' ')}</td>
                  <td>{user.email}</td>
                  <td>{user.phone || '-'}</td>
                  <td>
                    <span className={`status-badge ${statusText === 'active' ? 'status-active' : 'status-inactive'}`}>
                      {statusText.charAt(0).toUpperCase() + statusText.slice(1)}
                    </span>
                  </td>
                  <td>
                    {isEmployee ? <span style={{ color: '#94a3b8', fontSize: 12 }}>Read only</span> : <ActionButtons
                      onEdit={() => onEdit?.(user)}
                      onToggle={() => onToggleStatus?.(uid)}
                      onDelete={() => onRemove?.(user)}
                      status={statusText === 'active'}
                      title={user.email}
                      showEdit
                      showToggle
                      showDelete
                      deleteTitle="Remove from department"
                      toggleIconOnly
                    />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mobile-only">
        {staff.map((user) => {
          const uid = user._id || user.id;
          const fullName = `${user.firstName || user.first_name || ''} ${user.lastName || user.last_name || ''}`.trim() || user.email;
          const roleName = user.role?.displayName || user.role?.name || '-';
          const statusText = user.status || (user.isActive ? 'active' : 'inactive');
          const isEmployee = user.staffType === 'employee';
          return (
            <div key={uid} className="user-card" style={{ padding: 12 }}>
              <div className="user-card-header" style={{ marginBottom: 8 }}>
                <div className="user-card-title">
                  <span className="user-card-name" style={{ fontSize: 14 }}>{fullName}</span>
                  <span className="user-card-role" style={{ fontSize: 12 }}>{isEmployee ? 'Employee' : 'User'} · {roleName.replace(/_/g, ' ')}</span>
                </div>
                <span className={`status-badge ${statusText === 'active' ? 'status-active' : 'status-inactive'}`} style={{ fontSize: 11 }}>
                  {statusText.charAt(0).toUpperCase() + statusText.slice(1)}
                </span>
              </div>
              <div className="user-card-body" style={{ fontSize: 12, gap: 4 }}>
                <div className="user-card-field">
                  <span className="field-label">Email</span>
                  <span className="field-value">{user.email}</span>
                </div>
                <div className="user-card-field">
                  <span className="field-label">Phone</span>
                  <span className="field-value">{user.phone || '-'}</span>
                </div>
              </div>
              <div className="user-card-actions" style={{ marginTop: 8 }}>
                {isEmployee ? <span style={{ color: '#94a3b8', fontSize: 12 }}>Read only</span> : <ActionButtons
                  onEdit={() => onEdit?.(user)}
                  onToggle={() => onToggleStatus?.(uid)}
                  onDelete={() => onRemove?.(user)}
                  status={statusText === 'active'}
                  title={user.email}
                  showEdit
                  showToggle
                  showDelete
                  deleteTitle="Remove from department"
                  toggleIconOnly
                />}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default DepartmentStaffTable;
