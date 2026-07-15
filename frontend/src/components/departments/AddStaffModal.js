import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../../hooks/useModalKeyboard';

function AddStaffModal({
  isOpen, onClose, departmentId, departmentName,
  availableUsers = [], staffUserIds = [], managerId,
  onAssign,
  onCreateUser,
  saving,
}) {
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSelectedUserId('');
  }, [isOpen]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!selectedUserId) return;
    onAssign(selectedUserId);
  };

  useModalKeyboard(isOpen, onClose, handleSubmit, saving);

  if (!isOpen) return null;

  const filteredUsers = availableUsers.filter((u) => {
    const uid = u._id || u.id;
    if (!uid) return false;
    if (uid === managerId) return false;
    if (staffUserIds.includes(uid)) return false;
    return u.status === 'active' && u.isActive !== false;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h2>Add Staff</h2>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ marginBottom: 16, color: '#64748b', fontSize: 13 }}>
              Add staff to <strong>{departmentName}</strong>
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Add User</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
                onClick={onCreateUser}
              >
                + Create User &amp; Add To Staff
              </button>
            </div>

            <div className="form-group">
              <label>Select User</label>
              <select
                className="form-control"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">-- Choose a user --</option>
                {filteredUsers.map((u) => {
                  const uid = u._id || u.id;
                  const name = `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || u.email;
                  return (
                    <option key={uid} value={uid}>{name} ({u.email})</option>
                  );
                })}
              </select>
              {filteredUsers.length === 0 && (
                <small style={{ color: '#94a3b8', display: 'block', marginTop: 4 }}>
                  No active users are available.
                </small>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !selectedUserId}>
              {saving ? (
                <><span className="spinner-mini"></span> Saving...</>
              ) : 'Add to Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddStaffModal;
