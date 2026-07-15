import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useUserManagement } from "../context/UserManagementContext";
import toast from "react-hot-toast";
import ErrorPopup from "../components/ErrorPopup";
import ActionButtons from "../components/ActionButtons";
import DepartmentFormModal from "../components/departments/DepartmentFormModal";
import DepartmentDrawer from "../components/departments/DepartmentDrawer";
import ConfirmModal from "../components/ConfirmModal";
import "../styles/userManagement.css";

const DepartmentManagement = () => {
  const { user } = useAuth();
  const {
    users: ctxUsers,
    stats: ctxStats,
    roles,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    loadDepartments,
    loadUsers,
    loadRoles,
    loadDepartmentStats,
    loadDepartmentById,
    assignUserDepartment,
    removeUserDepartment,
    createUser,
    updateUser,
    toggleUserStatus,
  } = useUserManagement();

  const [flatDepartments, setFlatDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorPopup, setErrorPopup] = useState(null);
  const [stats, setStats] = useState({
    total_departments: 0,
    active_departments: 0,
    inactive_departments: 0,
    total_active_staff: 0,
    total_managers: 0,
  });
  const [allUsers, setAllUsers] = useState([]);
  const [saving, setSaving] = useState(false);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [drawerDepartment, setDrawerDepartment] = useState(null);
  const [drawerStaff, setDrawerStaff] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Delete confirm from table
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      const [deptData] = await Promise.all([
        loadDepartments(),
        loadUsers({ limit: 1000 }),
        loadRoles(),
        loadDepartmentStats(),
      ]);
      if (deptData) {
        setFlatDepartments(Array.isArray(deptData.flat) ? deptData.flat : []);
      }
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, [loadDepartments, loadUsers, loadRoles, loadDepartmentStats]);

  useEffect(() => {
    if (user) loadAllData();
  }, [user, loadAllData]);

  useEffect(() => {
    if (!Array.isArray(ctxUsers)) return;
    setAllUsers(ctxUsers.map((item) => ({
      ...item,
      id: item._id || item.id,
      _id: item._id || item.id,
      firstName: item.firstName || item.first_name || '',
      lastName: item.lastName || item.last_name || '',
    })));
  }, [ctxUsers]);

  // Sync stats
  useEffect(() => {
    if (ctxStats) setStats((prev) => ({ ...prev, ...ctxStats }));
  }, [ctxStats]);

  // Drawer open — fetch full department data
  const openDrawer = async (dept) => {
    setSelectedDepartment(dept);
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const data = await loadDepartmentById(dept.id || dept._id);
      if (data) {
        setDrawerDepartment(data);
        setDrawerStaff(Array.isArray(data.staff) ? data.staff : []);
      }
    } catch (e) {
      toast.error("Failed to load department details");
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedDepartment(null);
    setDrawerDepartment(null);
    setDrawerStaff([]);
  };

  const refreshDrawer = useCallback(async () => {
    if (!selectedDepartment) return;
    try {
      const data = await loadDepartmentById(selectedDepartment.id || selectedDepartment._id);
      if (data) {
        setDrawerDepartment(data);
        setDrawerStaff(Array.isArray(data.staff) ? data.staff : []);
      }
    } catch (e) {
      // silent
    }
  }, [selectedDepartment, loadDepartmentById]);

  // Create department
  const handleCreateDepartment = async (formData, mode) => {
    setCreateSaving(true);
    try {
      const result = await createDepartment(formData);
      if (result.success) {
        toast.success("Department created successfully!");
        setShowCreateModal(false);
        await loadAllData();
      } else {
        setErrorPopup(result.error || { message: "Failed to create department" });
      }
    } catch (err) {
      setErrorPopup({ message: "Failed to create department" });
    } finally {
      setCreateSaving(false);
    }
  };

  // Save department (from drawer edit)
  const handleSaveDepartment = async (id, formData) => {
    setSaving(true);
    try {
      const result = await updateDepartment(id, formData);
      if (result.success) {
        toast.success("Department updated");
        await loadAllData();
        await refreshDrawer();
      } else {
        setErrorPopup(result.error || { message: "Failed to update department" });
      }
    } catch (err) {
      setErrorPopup({ message: "Failed to update department" });
    } finally {
      setSaving(false);
    }
  };

  // Delete department (from drawer)
  const handleDeleteFromDrawer = async (id) => {
    try {
      const result = await deleteDepartment(id);
      if (result.success) {
        toast.success("Department deleted");
        closeDrawer();
        await loadAllData();
      } else {
        toast.error(result.message || "Failed to delete department");
      }
    } catch (err) {
      toast.error("Failed to delete department");
    }
  };

  // Delete department (from table)
  const handleDeleteFromTable = async () => {
    if (!deleteConfirm) return;
    try {
      const result = await deleteDepartment(deleteConfirm.id || deleteConfirm._id);
      if (result.success) {
        toast.success("Department deleted successfully!");
        setDeleteConfirm(null);
        await loadAllData();
      } else {
        toast.error(result.message || "Failed to delete department");
        setDeleteConfirm(null);
      }
    } catch (err) {
      toast.error("Failed to delete department");
      setDeleteConfirm(null);
    }
  };

  // Assign user to department (Add Staff)
  const handleAssignStaff = async (userId, deptId) => {
    try {
      const result = await assignUserDepartment(userId, deptId);
      if (!result.success) throw new Error(result.message);
      toast.success("User added to department");
      await Promise.all([refreshDrawer(), loadAllData()]);
    } catch (err) {
      toast.error("Failed to add staff");
    }
  };

  // Remove user from department
  const handleRemoveStaff = async (userId, deptId) => {
    try {
      const result = await removeUserDepartment(userId, deptId);
      if (!result.success) throw new Error(result.message);
      toast.success("User removed from department");
      await Promise.all([refreshDrawer(), loadAllData()]);
    } catch (err) {
      toast.error("Failed to remove user");
    }
  };

  // Toggle staff status
  const handleToggleStaffStatus = async (userId) => {
    try {
      const result = await toggleUserStatus(userId);
      if (!result.success) throw new Error(result.message);
      await Promise.all([refreshDrawer(), loadAllData()]);
    } catch (err) {
      toast.error("Failed to toggle status");
    }
  };

  // Create or edit department users. Employee records are read-only here.
  const handleEditStaffUser = async (formData, mode, userIdOrDeptId) => {
    try {
      if (mode === "create") {
        const deptId = userIdOrDeptId;
        const result = await createUser({ ...formData, department: deptId });
        if (!result.success) throw new Error(result.message);
        toast.success("User created and added to staff");
        await Promise.all([refreshDrawer(), loadAllData()]);
      } else if (mode === "edit") {
        const result = await updateUser(userIdOrDeptId, formData);
        if (!result.success) throw new Error(result.message);
        toast.success("User updated");
        await Promise.all([refreshDrawer(), loadAllData()]);
      }
    } catch (err) {
      setErrorPopup({ message: "Failed to save user" });
    }
  };

  const formatDate = (d) => {
    if (!d) return "-";
    const date = new Date(d);
    return isNaN(date.getTime())
      ? "-"
      : date.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  };

  return (
    <div className="user-management-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Departments</h1>
          <p className="subtitle">Manage organizational structure</p>
        </div>
        <button
          className="btn btn-primary btn-create"
          onClick={() => setShowCreateModal(true)}
        >
          <span className="icon">+</span>
          New Department
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🏢</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total_departments || 0}</span>
            <span className="stat-label">Total Departments</span>
          </div>
        </div>
        <div className="stat-card stat-active">
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <span className="stat-value">{stats.active_departments || 0}</span>
            <span className="stat-label">Active</span>
          </div>
        </div>
        <div className="stat-card stat-inactive">
          <div className="stat-icon">⊘</div>
          <div className="stat-content">
            <span className="stat-value">{stats.inactive_departments || 0}</span>
            <span className="stat-label">Inactive</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total_active_staff || 0}</span>
            <span className="stat-label">Active Staff</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total_managers || 0}</span>
            <span className="stat-label">Managers</span>
          </div>
        </div>
      </div>

      <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

      {/* Desktop Table */}
      <div className="table-container desktop-only">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading departments...</p>
          </div>
        ) : flatDepartments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏢</div>
            <h3>No Departments Found</h3>
            <p>Create your first department to get started.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Department Name</th>
                <th>Code</th>
                <th>Manager</th>
                <th>Staff Count</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Created Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {flatDepartments.map((dept) => {
                const deptId = dept.id || dept._id;
                return (
                  <tr
                    key={deptId}
                    className={dept.is_active ? "" : "row-inactive"}
                    style={{ cursor: "pointer" }}
                    onClick={() => openDrawer(dept)}
                  >
                    <td>
                      <strong style={{ color: "#0f172a" }}>{dept.name}</strong>
                    </td>
                    <td>
                      <span className="badge badge-secondary">{dept.code}</span>
                    </td>
                    <td>
                      {dept.manager_deactivated ? (
                        <span style={{ color: "#dc2626", fontSize: 13 }}>Manager Deactivated</span>
                      ) : dept.manager_name ? (
                        dept.manager_name
                      ) : (
                        <span style={{ color: "#94a3b8" }}>-</span>
                      )}
                    </td>
                    <td>{dept.staff_count != null ? dept.staff_count : dept.total_users || 0}</td>
                    <td>{dept.email || "-"}</td>
                    <td>{dept.phone || "-"}</td>
                    <td>
                      <span
                        className={`status-badge ${dept.is_active ? "status-active" : "status-inactive"}`}
                      >
                        {dept.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{formatDate(dept.created_at || dept.createdAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <ActionButtons
                        onEdit={() => openDrawer(dept)}
                        onDelete={() => setDeleteConfirm(dept)}
                        showEdit
                        showDelete
                        title={dept.name}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards-container mobile-only">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading departments...</p>
          </div>
        ) : flatDepartments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏢</div>
            <h3>No Departments Found</h3>
            <p>Create your first department to get started.</p>
          </div>
        ) : (
          <div className="users-cards-grid">
            {flatDepartments.map((dept) => {
              const deptId = dept.id || dept._id;
              return (
                <div
                  key={deptId}
                  className={`user-card ${dept.is_active ? "" : "card-inactive"}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => openDrawer(dept)}
                >
                  <div className="user-card-header">
                    <div className="user-card-title">
                      <span className="user-card-name">{dept.name}</span>
                      <span className="badge badge-secondary">{dept.code}</span>
                    </div>
                    <span
                      className={`status-badge ${dept.is_active ? "status-active" : "status-inactive"}`}
                    >
                      {dept.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="user-card-body">
                    <div className="user-card-field">
                      <span className="field-label">Manager</span>
                      <span className="field-value">
                        {dept.manager_deactivated ? (
                          <span style={{ color: "#dc2626", fontSize: 12 }}>Manager Deactivated</span>
                        ) : dept.manager_name || "-"}
                      </span>
                    </div>
                    <div className="user-card-field">
                      <span className="field-label">Staff</span>
                      <span className="field-value">{dept.staff_count != null ? dept.staff_count : dept.total_users || 0}</span>
                    </div>
                    <div className="user-card-field">
                      <span className="field-label">Email</span>
                      <span className="field-value">{dept.email || "-"}</span>
                    </div>
                    <div className="user-card-field">
                      <span className="field-label">Phone</span>
                      <span className="field-value">{dept.phone || "-"}</span>
                    </div>
                  </div>
                  <div className="user-card-actions" onClick={(e) => e.stopPropagation()}>
                    <ActionButtons
                      onEdit={() => openDrawer(dept)}
                      onDelete={() => setDeleteConfirm(dept)}
                      showEdit
                      showDelete
                      title={dept.name}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Department Modal */}
      <DepartmentFormModal
        isOpen={showCreateModal}
        mode="create"
        initialData={null}
        departments={flatDepartments}
        users={allUsers}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateDepartment}
        loading={createSaving}
        allowCreateManagerUser={true}
      />

      {/* Department Details Drawer */}
      <DepartmentDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        department={drawerDepartment || selectedDepartment}
        staff={drawerStaff}
        allUsers={allUsers}
        roles={roles}
        flatDepartments={flatDepartments}
        onSaveDepartment={handleSaveDepartment}
        onDeleteDepartment={handleDeleteFromDrawer}
        onRefresh={refreshDrawer}
        onAssignStaff={handleAssignStaff}
        onRemoveStaff={handleRemoveStaff}
        onToggleStaffStatus={handleToggleStaffStatus}
        onEditStaff={handleEditStaffUser}
        saving={saving}
      />

      {/* Delete Confirm (from table) */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Department"
        message={
          deleteConfirm
            ? `Are you sure you want to delete "${deleteConfirm.name}"? This will deactivate the department and its sub-departments.`
            : ""
        }
        onConfirm={handleDeleteFromTable}
        onCancel={() => setDeleteConfirm(null)}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};

export default DepartmentManagement;
