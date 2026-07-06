import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useUserManagement } from "../context/UserManagementContext";
import toast from "react-hot-toast";
import ErrorPopup from "../components/ErrorPopup";
import ActionButtons from "../components/ActionButtons";
import DepartmentFormModal from "../components/departments/DepartmentFormModal";
import UserFormModal from "../components/users/UserFormModal";
import ConfirmModal from "../components/ConfirmModal";
import "../styles/userManagement.css";

const DepartmentManagement = () => {
  const { user } = useAuth();
  const {
    users: ctxUsers,
    stats: ctxStats,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    loadDepartments,
    loadRoles,
    loadDepartmentStats,
    createUser,
    roles,
  } = useUserManagement();

  const [departments, setDepartments] = useState([]);
  const [flatDepartments, setFlatDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorPopup, setErrorPopup] = useState(null);
  const [stats, setStats] = useState({});
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);

  // Department form modal state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptModalMode, setDeptModalMode] = useState("create");
  const [selectedDept, setSelectedDept] = useState(null);

  // Nested user creation modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  // Delete confirm modal state
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Load initial data
  useEffect(() => {
    if (!user) return;
    const loadAll = async () => {
      try {
        setLoading(true);
        const [deptData] = await Promise.all([
          loadDepartments(),
          loadRoles(),
          loadDepartmentStats(),
        ]);
        if (deptData) {
          setDepartments(
            Array.isArray(deptData.hierarchy) ? deptData.hierarchy : [],
          );
          setFlatDepartments(Array.isArray(deptData.flat) ? deptData.flat : []);
        }
      } catch (e) {
        // silent
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [user, loadDepartments, loadRoles, loadDepartmentStats]);

  // Sync users from context
  useEffect(() => {
    if (ctxUsers && Array.isArray(ctxUsers)) {
      setUsers(
        ctxUsers.map((u) => ({
          id: u._id || u.id,
          _id: u._id || u.id,
          first_name: u.firstName || u.first_name || "",
          last_name: u.lastName || u.last_name || "",
          firstName: u.firstName || u.first_name || "",
          lastName: u.lastName || u.last_name || "",
          email: u.email,
        })),
      );
    }
  }, [ctxUsers]);

  // Sync stats from context
  useEffect(() => {
    if (ctxStats) setStats(ctxStats);
  }, [ctxStats]);

  // Recursive component to render department tree
  const DepartmentNode = ({ dept, level = 0 }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
      <div className="dept-node" style={{ marginLeft: `${level * 20}px` }}>
        <div className="dept-card">
          <div className="dept-header">
            <div className="dept-title">
              {dept.children && dept.children.length > 0 && (
                <button
                  className="btn-expand"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                >
                  {isExpanded ? "▼" : "▶"}
                </button>
              )}
              <h3>{dept.name}</h3>
              <span className="badge badge-secondary">{dept.code}</span>
            </div>
            <div className="dept-actions">
              <ActionButtons
                onEdit={() => openDeptModal("edit", dept)}
                onDelete={() => setDeleteConfirm(dept)}
                showEdit
                showDelete
                title={dept.name}
              />
            </div>
          </div>

          <div className="dept-details">
            <div className="dept-detail-item">
              <span className="label">Manager:</span>
              <span className="value">{dept.manager_name || "Unassigned"}</span>
            </div>
            <div className="dept-detail-item">
              <span className="label">Staff:</span>
              <span className="value">{dept.total_users || 0}</span>
            </div>
            <div className="dept-detail-item">
              <span className="label">Status:</span>
              <span
                className={`status-dot ${dept.is_active ? "active" : "inactive"}`}
              ></span>
            </div>
          </div>
        </div>

        {isExpanded && dept.children && dept.children.length > 0 && (
          <div className="dept-children">
            {dept.children.map((child) => (
              <DepartmentNode key={child.id} dept={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Department modal handlers
  const openDeptModal = (mode, dept = null) => {
    setDeptModalMode(mode);
    setSelectedDept(dept);
    setShowDeptModal(true);
  };

  const closeDeptModal = () => {
    setShowDeptModal(false);
    setSelectedDept(null);
  };

  const handleDeptSubmit = async (formData, mode) => {
    setSaving(true);
    try {
      let result;
      if (mode === "edit" && selectedDept) {
        result = await updateDepartment(selectedDept.id, formData);
      } else {
        result = await createDepartment(formData);
      }
      if (result.success) {
        toast.success(
          `Department ${mode === "create" ? "created" : "updated"} successfully!`,
        );
        closeDeptModal();
        const res = await loadDepartments();
        if (res) {
          setDepartments(Array.isArray(res.hierarchy) ? res.hierarchy : []);
          setFlatDepartments(Array.isArray(res.flat) ? res.flat : []);
        }
      } else {
        setErrorPopup(result.error || { message: "Failed to save department" });
      }
    } catch (err) {
      setErrorPopup({ message: "Failed to save department" });
    } finally {
      setSaving(false);
    }
  };

  // Delete handlers
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      const result = await deleteDepartment(deleteConfirm.id);
      if (result.success) {
        toast.success("Department deleted successfully!");
        setDeleteConfirm(null);
        const res = await loadDepartments();
        if (res) {
          setDepartments(Array.isArray(res.hierarchy) ? res.hierarchy : []);
          setFlatDepartments(Array.isArray(res.flat) ? res.flat : []);
        }
      } else {
        toast.error(result.message || "Failed to delete department");
        setDeleteConfirm(null);
      }
    } catch (err) {
      toast.error("Failed to delete department");
      setDeleteConfirm(null);
    }
  };

  // Nested user creation from manager field
  const openCreateUser = () => {
    setShowUserModal(true);
  };

  const closeCreateUser = () => {
    setShowUserModal(false);
  };

  const handleUserCreated = async (formData) => {
    setSavingUser(true);
    try {
      const result = await createUser(formData);
      if (result.success) {
        toast.success("User created");
        setShowUserModal(false);
        const deptRes = await loadDepartments();
        if (deptRes) {
          setFlatDepartments(Array.isArray(deptRes.flat) ? deptRes.flat : []);
        }
      } else {
        setErrorPopup(result.error || { message: "Failed to create user" });
      }
    } catch (err) {
      setErrorPopup({ message: "Failed to create user" });
    } finally {
      setSavingUser(false);
    }
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
          onClick={() => openDeptModal("create")}
        >
          <span className="icon">+</span>
          New Department
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🏢</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total_departments || 0}</span>
            <span className="stat-label">Total Departments</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🌳</div>
          <div className="stat-content">
            <span className="stat-value">{stats.root_departments || 0}</span>
            <span className="stat-label">Root Units</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <span className="stat-value">
              {stats.users_with_department || 0}
            </span>
            <span className="stat-label">Assigned Staff</span>
          </div>
        </div>
      </div>

      <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

      <div className="department-tree-container">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
          </div>
        ) : departments.length === 0 ? (
          <div className="empty-state">No departments found. Create one.</div>
        ) : (
          <div className="tree-view">
            {departments.map((dept) => (
              <DepartmentNode key={dept.id} dept={dept} />
            ))}
          </div>
        )}
      </div>

      {/* Department form modal */}
      <DepartmentFormModal
        isOpen={showDeptModal}
        mode={deptModalMode}
        initialData={selectedDept}
        departments={flatDepartments}
        users={users}
        onClose={closeDeptModal}
        onSubmit={handleDeptSubmit}
        loading={saving}
        allowCreateManagerUser={true}
        onCreateManagerUser={openCreateUser}
      />

      {/* Nested User creation modal (from department manager field) */}
      <UserFormModal
        isOpen={showUserModal}
        mode="create"
        initialData={null}
        roles={roles}
        departments={flatDepartments}
        onClose={closeCreateUser}
        onSubmit={handleUserCreated}
        loading={savingUser}
        allowCreateDepartment={false}
      />

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Department"
        message={
          deleteConfirm
            ? `Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`
            : ""
        }
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};

export default DepartmentManagement;
