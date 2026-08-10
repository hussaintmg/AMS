import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fieldAccessor, pageActions } from "../utils/roleJobs";
import { useEmployees } from "../context/EmployeesContext";
import toast from "react-hot-toast";
import ErrorPopup from "../components/ErrorPopup";
import ConfirmModal from "../components/ConfirmModal";
import ActionButtons from "../components/ActionButtons";
import EmployeeFormModal from "./EmployeeFormModal";
import EmployeeDrawer from "./EmployeeDrawer";
import BulkUploadModal from "../components/BulkUploadModal";
import { Upload } from "lucide-react";
import BulkSelectionBar from "../components/BulkSelectionBar";
import { Search } from "lucide-react";
import "../styles/userManagement.css";

const Employees = () => {
  const { user: currentUser } = useAuth();
  // Every write on this screen was drawn for anyone who could open it; only
  // the bulk upload asked anything, and it asked about the role's *name*.
  const can = pageActions(currentUser, 'employees');
  const canBulkUpload = can('create') && ["super_admin", "admin", "hr_admin"].includes(
    currentUser?.role,
  );
  const showField = fieldAccessor(currentUser, 'employees');
  const {
    employees: ctxEmployees,
    departments,
    roles,
    stats,
    loading: ctxLoading,
    saving,
    loadEmployees,
    loadReferenceData,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    toggleEmployeeStatus,
    bulkDeleteEmployees,
    bulkDeactivateEmployees,
    setEmployees,
  } = useEmployees();
  const [loading, setLoading] = useState(true);
  const [errorPopup, setErrorPopup] = useState(null);

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") || "";

  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const [drawerEmployee, setDrawerEmployee] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);

  const toggleSelected = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allSelected =
    ctxEmployees.length > 0 &&
    ctxEmployees.every((emp) => selectedIds.has(emp._id || emp.id));
  const toggleAll = () =>
    setSelectedIds(
      allSelected
        ? new Set()
        : new Set(ctxEmployees.map((emp) => emp._id || emp.id)),
    );
  const handleBulkAction = async () => {
    const ids = [...selectedIds];
    const result =
      bulkAction === "delete"
        ? await bulkDeleteEmployees(ids)
        : await bulkDeactivateEmployees(ids);
    if (result.success) {
      setSelectedIds(new Set());
      setBulkAction(null);
      fetchEmployees();
      loadReferenceData();
    } else if (result.error) setErrorPopup(result.error);
  };

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      };
      const response = await loadEmployees(params);
      if (response) {
        const list = response.employees || [];
        setEmployees(list);
        setTotalPages(Math.ceil(response.pagination?.total / limit) || 1);
        setTotal(response.pagination?.total || 0);
      }
    } catch (err) {
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, loadEmployees, setEmployees]);

  useEffect(() => {
    if (currentUser) fetchEmployees();
  }, [currentUser, fetchEmployees]);

  useEffect(() => {
    if (currentUser) loadReferenceData().catch(() => {});
  }, [currentUser, loadReferenceData]);

  useEffect(() => {
    if (urlSearch) setSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => { if (searchParams.get('action') === 'create') openModal('create'); }, []);

  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      setPage(1);
      fetchEmployees();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentUser, search, statusFilter, fetchEmployees]);

  const openModal = (mode, emp = null) => {
    setModalMode(mode);
    setSelectedEmployee(emp);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedEmployee(null);
  };

  const handleCreate = async (formData) => {
    const result = await createEmployee(formData);
    if (result.success) {
      closeModal();
      fetchEmployees();
    } else if (result.error) setErrorPopup(result.error);
  };

  const handleUpdate = async (formData) => {
    const id = selectedEmployee?._id || selectedEmployee?.id;
    const result = await updateEmployee(id, formData);
    if (result.success) {
      closeModal();
      fetchEmployees();
    } else if (result.error) setErrorPopup(result.error);
  };

  const handleToggleStatus = async (id) => {
    const result = await toggleEmployeeStatus(id);
    if (!result.success && result.error) setErrorPopup(result.error);
    if (result.success) fetchEmployees();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete._id || confirmDelete.id;
    const result = await deleteEmployee(id);
    if (result.success) {
      setConfirmDelete(null);
      fetchEmployees();
    } else if (result.error) setErrorPopup(result.error);
  };

  const fullName = (emp) =>
    `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.email || "-";

  return (
    <div className="user-management-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Employees</h1>
          <p className="subtitle">
            Manage employee records, departments, and assignments
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {canBulkUpload && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowBulkUpload(true)}
              title="Bulk upload employees (CSV / XLSX)"
            >
              <Upload size={18} style={{ marginRight: 6 }} /> Upload
            </button>
          )}
          {can('create') && <button
            className="btn btn-primary btn-create"
            onClick={() => openModal("create")}
          >
            <span className="icon">+</span> Add New Employee
          </button>}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total || 0}</span>
            <span className="stat-label">Total Employees</span>
          </div>
        </div>
        <div className="stat-card stat-active">
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <span className="stat-value">{stats.active || 0}</span>
            <span className="stat-label">Active</span>
          </div>
        </div>
        <div className="stat-card stat-inactive">
          <div className="stat-icon">⊘</div>
          <div className="stat-content">
            <span className="stat-value">{stats.inactive || 0}</span>
            <span className="stat-label">Inactive</span>
          </div>
        </div>
        <div className="stat-card stat-today">
          <div className="stat-icon">🏢</div>
          <div className="stat-content">
            <span className="stat-value">{stats.departments || 0}</span>
            <span className="stat-label">Departments</span>
          </div>
        </div>
      </div>

      <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

      <div className="filters-bar">
        <div className="search-box">
          <span className="search-icon">
            <Search size={18} style={{ color: "#9ca3af" }} />
          </span>
          <input
            type="text"
            placeholder="Search by name, email, phone, or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
        <select
          className="form-control"
          style={{ width: 140 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span className="results-count">{total} employees found</span>
      </div>
      <BulkSelectionBar
        count={selectedIds.size}
        disabled={saving}
        onDeactivate={() => setBulkAction("deactivate")}
        onDelete={() => setBulkAction("delete")}
      />

      <div className="table-container desktop-only">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading employees...</p>
          </div>
        ) : ctxEmployees.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👤</div>
            <h3>No Employees Found</h3>
            <p>No employees match your search criteria.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label="Select all employees on this page"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th>Employee</th>
                {showField('contact') && <th>Email</th>}
                {showField('employment') && <th>Department</th>}
                {showField('employment') && <th>Designation</th>}
                {showField('employment') && <th>Status</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ctxEmployees.map((emp) => {
                const id = emp._id || emp.id;
                const statusText =
                  emp.status || (emp.isActive ? "active" : "inactive");
                const deptName = emp.department?.name || "-";
                return (
                  <tr
                    key={id}
                    className={!emp.isActive ? "row-inactive" : ""}
                    onClick={() => setDrawerEmployee(emp)}
                    style={{ cursor: "pointer" }}
                  >
                    <td
                      className="selection-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${fullName(emp)}`}
                        checked={selectedIds.has(id)}
                        onChange={() => toggleSelected(id)}
                      />
                    </td>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          <span>
                            {(emp.firstName || "?")[0]}
                            {(emp.lastName || "")[0] || ""}
                          </span>
                        </div>
                        <div className="user-info">
                          <span className="user-name">{fullName(emp)}</span>
                        </div>
                      </div>
                    </td>
                    {showField('contact') && <td>{emp.email || "-"}</td>}
                    {showField('employment') && <td>{deptName}</td>}
                    {showField('employment') && <td>{emp.designation || "-"}</td>}
                    {showField('employment') && (
                      <td>
                        <span
                          className={`status-badge ${statusText === "active" ? "status-active" : "status-inactive"}`}
                        >
                          {statusText.charAt(0).toUpperCase() +
                            statusText.slice(1)}
                        </span>
                      </td>
                    )}
                    <td onClick={(e) => e.stopPropagation()}>
                      <ActionButtons
                        onEdit={can('edit') ? () => openModal("edit", emp) : null}
                        onToggle={can('edit') ? () => handleToggleStatus(id) : null}
                        onDelete={can('delete') ? () => setConfirmDelete(emp) : null}
                        status={emp.isActive}
                        title={emp.email || fullName(emp)}
                        showEdit={can('edit')}
                        showToggle={can('edit')}
                        showDelete={can('delete')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mobile-only">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading employees...</p>
          </div>
        ) : ctxEmployees.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👤</div>
            <h3>No Employees Found</h3>
          </div>
        ) : (
          <div className="cards-grid">
            {ctxEmployees.map((emp) => {
              const id = emp._id || emp.id;
              const statusText =
                emp.status || (emp.isActive ? "active" : "inactive");
              return (
                <div
                  key={id}
                  className={`data-card ${!emp.isActive ? "card-inactive" : ""}`}
                  onClick={() => setDrawerEmployee(emp)}
                >
                  <div className="data-card-top">
                    <input
                      type="checkbox"
                      className="card-select-checkbox"
                      aria-label={`Select ${fullName(emp)}`}
                      checked={selectedIds.has(id)}
                      onChange={() => toggleSelected(id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="data-card-avatar">
                      {(emp.firstName || "?")[0]}
                      {(emp.lastName || "")[0] || ""}
                    </div>
                    <div className="data-card-info">
                      <span className="data-card-title">{fullName(emp)}</span>
                      <span className="data-card-subtitle">
                        {emp.designation || "-"}
                      </span>
                    </div>
                    <span className={`badge-pill status-${statusText}`}>
                      {statusText.charAt(0).toUpperCase() + statusText.slice(1)}
                    </span>
                  </div>
                  <div className="data-card-body">
                    <div className="data-card-row">
                      <span className="row-icon">✉</span>
                      <span className="row-label">Email</span>
                      <span className="row-value">{emp.email || "-"}</span>
                    </div>
                    <div className="data-card-row">
                      <span className="row-icon">🏢</span>
                      <span className="row-label">Dept</span>
                      <span className="row-value">
                        {emp.department?.name || "-"}
                      </span>
                    </div>
                  </div>
                  <div
                    className="data-card-footer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionButtons
                      onEdit={can('edit') ? () => openModal("edit", emp) : null}
                      onToggle={can('edit') ? () => handleToggleStatus(id) : null}
                      onDelete={can('delete') ? () => setConfirmDelete(emp) : null}
                      status={emp.isActive}
                      title={emp.email || fullName(emp)}
                      showEdit={can('edit')}
                      showToggle={can('edit')}
                      showDelete
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn-page"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <div className="page-numbers">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pn;
              if (totalPages <= 5) pn = i + 1;
              else if (page <= 3) pn = i + 1;
              else if (page >= totalPages - 2) pn = totalPages - 4 + i;
              else pn = page - 2 + i;
              return (
                <button
                  key={pn}
                  className={`btn-page ${page === pn ? "active" : ""}`}
                  onClick={() => setPage(pn)}
                >
                  {pn}
                </button>
              );
            })}
          </div>
          <button
            className="btn-page"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={!!bulkAction}
        title={
          bulkAction === "delete" ? "Delete Employees" : "Deactivate Employees"
        }
        message={`${bulkAction === "delete" ? "Delete" : "Deactivate"} ${selectedIds.size} selected employee(s)?`}
        confirmText={bulkAction === "delete" ? "Delete" : "Deactivate"}
        onConfirm={handleBulkAction}
        onCancel={() => setBulkAction(null)}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Delete Employee"
        message={`Are you sure you want to delete "${confirmDelete ? fullName(confirmDelete) : ""}"? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        type="danger"
      />

      <EmployeeFormModal
        isOpen={showModal}
        mode={modalMode}
        initialData={selectedEmployee}
        departments={departments}
        roles={roles}
        onClose={closeModal}
        onSubmit={modalMode === "create" ? handleCreate : handleUpdate}
        loading={saving}
      />

      <EmployeeDrawer
        isOpen={!!drawerEmployee}
        onClose={() => setDrawerEmployee(null)}
        employee={drawerEmployee}
      />

      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        title="Bulk upload employees"
        description="Import employees from CSV or XLSX. Required: first_name, last_name, email, phone."
        templateType="employees"
        onCompleted={fetchEmployees}
      />
    </div>
  );
};

export default Employees;
