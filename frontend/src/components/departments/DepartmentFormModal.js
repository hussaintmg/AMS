import React, { useState, useEffect } from "react";
import SearchableSelect from "../SearchableSelect";
import useModalKeyboard from "../../hooks/useModalKeyboard";
import modalSubmit from '../../utils/modalForm';
import ModalPortal from '../ModalPortal';

function DepartmentFormModal({
  isOpen,
  onClose,
  mode,
  initialData,
  departments,
  users,
  onSubmit,
  loading,
  allowCreateManagerUser = true,
  onCreateManagerUser,
}) {
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    parentId: "",
    managerId: "",
    email: "",
    phone: "",
    location: "",
    budget: 0,
    isActive: true,
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (mode === "create") {
      setFormData({
        name: "",
        code: "",
        description: "",
        parentId: initialData ? initialData.id : "",
        managerId: "",
        email: "",
        phone: "",
        location: "",
        budget: 0,
        isActive: true,
      });
    } else if (initialData) {
      setFormData({
        name: initialData.name || "",
        code: initialData.code || "",
        description: initialData.description || "",
        parentId: initialData.parent_id || "",
        managerId: initialData.manager_id || "",
        email: initialData.email || "",
        phone: initialData.phone || "",
        location: initialData.location || "",
        budget: initialData.budget || 0,
        isActive:
          initialData.is_active !== undefined ? !!initialData.is_active : true,
      });
    }
    setErrors({});
  }, [isOpen, mode, initialData]);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = "Department name is required";
    if (!formData.code.trim()) errs.code = "Department code is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    onSubmit(formData, mode);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  useModalKeyboard(isOpen, onClose, handleSubmit);

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "500px" }}
        >
          <div className="modal-header">
            <h2>{mode === "create" ? "New Department" : "Edit Department"}</h2>
            <button className="modal-close" onClick={onClose} type="button">
              ×
            </button>
          </div>

          <form onSubmit={modalSubmit(handleSubmit)}>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Department Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className={
                      errors.name ? "form-control error" : "form-control"
                    }
                    placeholder="e.g. Sales"
                  />
                  {errors.name && (
                    <small style={{ color: "#dc2626" }}>{errors.name}</small>
                  )}
                </div>
                <div className="form-group">
                  <label>Code *</label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    className={
                      errors.code ? "form-control error" : "form-control"
                    }
                    placeholder="e.g. SLS"
                  />
                  {errors.code && (
                    <small style={{ color: "#dc2626" }}>{errors.code}</small>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Parent Department</label>
                  <SearchableSelect
                    name="parentId"
                    value={formData.parentId}
                    onChange={handleInputChange}
                  >
                    <option value="">None (Top Level)</option>
                    {(departments || [])
                      .filter((d) => !initialData || d.id !== initialData.id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </SearchableSelect>
                </div>
                <div className="form-group">
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    Manager
                    {allowCreateManagerUser && onCreateManagerUser && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "8px 12px", whiteSpace: "nowrap" }}
                        onClick={onCreateManagerUser}
                        title="Create new user"
                      >
                        + Create User
                      </button>
                    )}
                  </label>
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
                  >
                    <div style={{ flex: 1 }}>
                      <SearchableSelect
                        name="managerId"
                        value={formData.managerId}
                        onChange={handleInputChange}
                      >
                        <option value="">Unassigned</option>
                        {(users || []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.first_name} {u.last_name}
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className="form-control"
                  rows="3"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="form-control"
                  />
                </div>
                <div className="form-group">
                  <label>Budget</label>
                  <input
                    type="number" step="0.01"
                    name="budget"
                    value={formData.budget}
                    onChange={handleInputChange}
                    className="form-control"
                  />
                </div>
              </div>

              <div className="form-group checkbox-group">
                <label
                  style={{
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"flex-start",
                    gap:"10px"
                  }}
                >
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  Active Department
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-mini"></span> Saving...
                  </>
                ) : mode === "create" ? (
                  "Create Department"
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

export default DepartmentFormModal;
