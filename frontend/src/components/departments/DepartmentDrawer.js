import React, { useState, useEffect, useCallback, useRef } from 'react';
import SearchableSelect from '../SearchableSelect';
import DepartmentStaffTable from './DepartmentStaffTable';
import AddStaffModal from './AddStaffModal';
import UserFormModal from '../users/UserFormModal';
import ConfirmModal from '../ConfirmModal';

function DepartmentDrawer({
  isOpen, onClose, department, staff,
  allUsers, roles, flatDepartments,
  onSaveDepartment, onDeleteDepartment, onRefresh,
  onAssignStaff, onRemoveStaff, onToggleStaffStatus, onEditStaff,
  saving,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [errors, setErrors] = useState({});

  // Add staff modal
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [addStaffSaving, setAddStaffSaving] = useState(false);

  // Create user from add staff
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserSaving, setCreateUserSaving] = useState(false);

  // Confirm delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Edit staff user form
  const [editStaffUser, setEditStaffUser] = useState(null);
  const [showEditStaff, setShowEditStaff] = useState(false);
  const [editStaffSaving, setEditStaffSaving] = useState(false);

  // Confirm remove staff
  const [removeStaffConfirm, setRemoveStaffConfirm] = useState(null);

  // Init edit form when entering edit mode
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      return;
    }
    if (isEditing && department) {
      setEditForm({
        name: department.name || '',
        code: department.code || '',
        description: department.description || '',
        parentId: department.parent_id || department.parent?._id || '',
        managerId: department.manager_id || department.manager?._id || '',
        email: department.email || '',
        phone: department.phone || '',
        budget: department.budget || 0,
        location: department.location || '',
        isActive: department.isActive !== undefined ? !!department.isActive : true,
      });
      setErrors({});
    }
  }, [isOpen, isEditing, department]);

  // ESC to close/cancel, Enter to save in edit mode
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
        return;
      }
      if (e.key === 'Enter' && isEditing && !e.shiftKey) {
        const tag = e.target?.tagName;
        if (tag === 'TEXTAREA') return;
        if (tag === 'SELECT') return;
        e.preventDefault();
        handleSaveRef.current(e);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isEditing, onClose]);

  const validate = () => {
    const errs = {};
    if (!editForm.name?.trim()) errs.name = 'Name is required';
    if (!editForm.code?.trim()) errs.code = 'Code is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    await onSaveDepartment(department._id || department.id, editForm);
    setIsEditing(false);
  };
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const handleDelete = async () => {
    setDeleteSaving(true);
    try {
      await onDeleteDepartment(department._id || department.id);
      setShowDeleteConfirm(false);
    } finally {
      setDeleteSaving(false);
    }
  };

  const handleAssignStaff = async (userId) => {
    setAddStaffSaving(true);
    try {
      await onAssignStaff(userId, department._id || department.id);
      setShowAddStaff(false);
    } finally {
      setAddStaffSaving(false);
    }
  };

  const handleCreateUser = async (formData) => {
    setCreateUserSaving(true);
    try {
      await onEditStaff(formData, 'create', department._id || department.id);
      setShowCreateUser(false);
      setShowAddStaff(false);
    } finally {
      setCreateUserSaving(false);
    }
  };

  const handleRemoveStaff = async (user) => {
    const userId = user._id || user.id;
    const deptId = department._id || department.id;
    setRemoveStaffConfirm(null);
    await onRemoveStaff(userId, deptId);
  };

  if (!isOpen) return null;

  const deptId = department?._id || department?.id;
  const staffIds = (staff || []).map((u) => u._id || u.id);
  const managerId = department.manager_id || department.manager?._id || '';
  const managerName = department.manager_name || '';
  const managerDeactivated = department.manager_deactivated;
  const managerUser = department.manager || null;

  return (
    <>
      <div className="dept-drawer-overlay" onClick={isEditing ? undefined : onClose}>
        <div className="dept-drawer" onClick={(e) => e.stopPropagation()}>
          {/* Drawer Header */}
          <div className="dept-drawer-header">
            <h3>{department.name || 'Department Details'}</h3>
            <button className="dept-drawer-close" onClick={isEditing ? () => setIsEditing(false) : onClose}>
              &times;
            </button>
          </div>

          {/* Top Action Bar */}
          <div className="dept-drawer-actions-bar">
            {!isEditing ? (
              <>
                <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setIsEditing(true)}>
                  Edit
                </button>
                <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setShowDeleteConfirm(true)}>
                  Delete
                </button>
                <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setShowAddStaff(true)}>
                  + Add Staff
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Update'}
                </button>
                <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>

          {/* Drawer Body */}
          <div className="dept-drawer-body">
            {/* Department Details Section */}
            <div className="dept-drawer-section">
              <h4>Department Details</h4>
              <div className="dept-detail-grid">
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Name</span>
                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        className={`form-control ${errors.name ? 'error' : ''}`}
                        name="name"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(e); }}
                      />
                      {errors.name && <small style={{ color: '#dc2626' }}>{errors.name}</small>}
                    </div>
                  ) : (
                    <span className="dept-detail-value">{department.name || '-'}</span>
                  )}
                </div>
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Code</span>
                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        className={`form-control ${errors.code ? 'error' : ''}`}
                        name="code"
                        value={editForm.code}
                        onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(e); }}
                      />
                      {errors.code && <small style={{ color: '#dc2626' }}>{errors.code}</small>}
                    </div>
                  ) : (
                    <span className="dept-detail-value">{department.code || '-'}</span>
                  )}
                </div>
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Status</span>
                  {isEditing ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editForm.isActive}
                        onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                      />
                      {editForm.isActive ? 'Active' : 'Inactive'}
                    </label>
                  ) : (
                    <span className={`status-badge ${department.isActive ? 'status-active' : 'status-inactive'}`}>
                      {department.isActive ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </div>
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Parent Department</span>
                  {isEditing ? (
                    <select
                      className="form-control"
                      value={editForm.parentId}
                      onChange={(e) => setEditForm({ ...editForm, parentId: e.target.value })}
                    >
                      <option value="">None (Top Level)</option>
                      {(flatDepartments || [])
                        .filter(d => (d.id || d._id) !== deptId)
                        .map(d => (
                          <option key={d.id || d._id} value={d.id || d._id}>{d.name}</option>
                        ))}
                    </select>
                  ) : (
                    <span className="dept-detail-value">
                      {department.parent?.name || department.parent_name || '-'}
                    </span>
                  )}
                </div>
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Email</span>
                  {isEditing ? (
                    <input
                      type="email"
                      className="form-control"
                      name="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    />
                  ) : (
                    <span className="dept-detail-value">{department.email || '-'}</span>
                  )}
                </div>
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Phone</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="form-control"
                      name="phone"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  ) : (
                    <span className="dept-detail-value">{department.phone || '-'}</span>
                  )}
                </div>
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Budget</span>
                  {isEditing ? (
                    <input
                      type="number" step="0.01"
                      className="form-control"
                      name="budget"
                      value={editForm.budget}
                      onChange={(e) => setEditForm({ ...editForm, budget: Number(e.target.value) })}
                    />
                  ) : (
                    <span className="dept-detail-value">{department.budget != null ? department.budget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</span>
                  )}
                </div>
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Location</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="form-control"
                      name="location"
                      value={editForm.location}
                      onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    />
                  ) : (
                    <span className="dept-detail-value">{department.location || '-'}</span>
                  )}
                </div>
                <div className="dept-detail-row dept-detail-row-full">
                  <span className="dept-detail-label">Description</span>
                  {isEditing ? (
                    <textarea
                      className="form-control"
                      rows="3"
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  ) : (
                    <span className="dept-detail-value">{department.description || '-'}</span>
                  )}
                </div>
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Created Date</span>
                  <span className="dept-detail-value">
                    {department.createdAt || department.created_at
                      ? new Date(department.createdAt || department.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })
                      : '-'}
                  </span>
                </div>
                <div className="dept-detail-row">
                  <span className="dept-detail-label">Updated Date</span>
                  <span className="dept-detail-value">
                    {department.updatedAt
                      ? new Date(department.updatedAt).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })
                      : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Manager Section */}
            <div className="dept-drawer-section">
              <h4>Manager</h4>
              {managerId ? (
                <div className="dept-detail-grid">
                  {isEditing ? (
                    <div className="dept-detail-row dept-detail-row-full">
                      <span className="dept-detail-label">Assign Manager</span>
                      <select
                        className="form-control"
                        value={editForm.managerId}
                        onChange={(e) => setEditForm({ ...editForm, managerId: e.target.value })}
                      >
                        <option value="">No Manager</option>
                        {(allUsers || [])
                          .filter((u) => {
                            const uid = u._id || u.id;
                            return u.status === 'active' && u.isActive !== false;
                          })
                          .map((u) => {
                            const uid = u._id || u.id;
                            const name = `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || u.email;
                            return (
                              <option key={uid} value={uid}>{name}</option>
                            );
                          })}
                        {/* Show inactive current manager as option */}
                        {managerUser && managerUser.status !== 'active' && (
                          <option value={managerId} disabled>
                            {managerName} (Deactivated)
                          </option>
                        )}
                      </select>
                    </div>
                  ) : (
                    <div className="dept-detail-row dept-detail-row-full">
                      <span className="dept-detail-label">Manager Name</span>
                      <span className="dept-detail-value">
                        {managerDeactivated ? (
                          <span style={{ color: '#dc2626', fontWeight: 500 }}>Manager Deactivated</span>
                        ) : managerName || (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Unassigned</span>
                        )}
                      </span>
                      {managerUser && (
                        <>
                          <span className="dept-detail-label">Email</span>
                          <span className="dept-detail-value">{managerUser.email || '-'}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="dept-detail-row dept-detail-row-full">
                  {isEditing ? (
                    <>
                      <span className="dept-detail-label">Assign Manager</span>
                      <select
                        className="form-control"
                        value={editForm.managerId}
                        onChange={(e) => setEditForm({ ...editForm, managerId: e.target.value })}
                      >
                        <option value="">No Manager</option>
                        {(allUsers || [])
                          .filter((u) => u.status === 'active' && u.isActive !== false)
                          .map((u) => {
                            const uid = u._id || u.id;
                            const name = `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim() || u.email;
                            return (
                              <option key={uid} value={uid}>{name}</option>
                            );
                          })}
                      </select>
                    </>
                  ) : (
                    <span className="dept-detail-value" style={{ color: '#94a3b8', fontStyle: 'italic' }}>No manager assigned</span>
                  )}
                </div>
              )}
            </div>

            {/* Staff Section */}
            <div className="dept-drawer-section">
              <h4>Staff ({staff?.length || 0})</h4>
              <DepartmentStaffTable
                staff={staff || []}
                onEdit={(user) => {
                  setEditStaffUser(user);
                  setShowEditStaff(true);
                }}
                onToggleStatus={(userId) => onToggleStaffStatus(userId)}
                onRemove={(user) => setRemoveStaffConfirm(user)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Add Staff Modal */}
      <AddStaffModal
        isOpen={showAddStaff}
        onClose={() => setShowAddStaff(false)}
        departmentId={deptId}
        departmentName={department.name}
        availableUsers={allUsers}
        staffUserIds={staffIds}
        managerId={managerId}
        onAssign={handleAssignStaff}
        onCreateUser={() => {
          setShowCreateUser(true);
        }}
        saving={addStaffSaving}
      />

      {/* Create user from Add Staff */}
      <UserFormModal
        isOpen={showCreateUser}
        mode="create"
        initialData={null}
        roles={roles}
        departments={flatDepartments}
        onClose={() => setShowCreateUser(false)}
        preselectDepartment={deptId}
        onSubmit={handleCreateUser}
        loading={createUserSaving}
        allowCreateDepartment={false}
        allowCreateRole={false}
      />

      {/* Edit user */}
      <UserFormModal
        isOpen={showEditStaff}
        mode="edit"
        initialData={editStaffUser}
        roles={roles}
        departments={flatDepartments}
        onClose={() => { setShowEditStaff(false); setEditStaffUser(null); }}
        onSubmit={async (formData) => {
          setEditStaffSaving(true);
          try {
            const userId = (editStaffUser?._id || editStaffUser?.id);
            await onEditStaff(formData, 'edit', userId);
            setShowEditStaff(false);
            setEditStaffUser(null);
          } finally {
            setEditStaffSaving(false);
          }
        }}
        loading={editStaffSaving}
        allowCreateDepartment={false}
        allowCreateRole={false}
      />

      {/* Delete Department Confirm */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Department"
        message={`Are you sure you want to permanently delete "${department.name}"? Sub-departments will move up to its parent and assigned staff will be unassigned. This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      {/* Remove Staff Confirm */}
      <ConfirmModal
        isOpen={!!removeStaffConfirm}
        title="Remove User"
        message={
          removeStaffConfirm
            ? `Remove "${(removeStaffConfirm.firstName || '') + ' ' + (removeStaffConfirm.lastName || '')}" from this department?`
            : ''
        }
        onConfirm={() => handleRemoveStaff(removeStaffConfirm)}
        onCancel={() => setRemoveStaffConfirm(null)}
        confirmText="Remove"
        cancelText="Cancel"
        type="danger"
      />
    </>
  );
}

export default DepartmentDrawer;
