import React, { useEffect, useState } from "react";
import useModalKeyboard from "../../hooks/useModalKeyboard";

function RoleFormModal({ isOpen, onClose, onSubmit, loading = false }) {
  const [formData, setFormData] = useState({
    role: "",
    displayName: "",
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    setFormData({ role: "", displayName: "" });
    setErrors({});
  }, [isOpen]);

  const validate = () => {
    const nextErrors = {};
    if (!formData.role.trim()) nextErrors.role = "Role is required";
    if (!formData.displayName.trim()) {
      nextErrors.displayName = "Display name is required";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    if (event) event.preventDefault();
    if (!validate()) return;

    onSubmit({
      name: formData.role.trim().toLowerCase().replace(/\s+/g, "_"),
      displayName: formData.displayName.trim(),
    });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  useModalKeyboard(isOpen, onClose, handleSubmit, loading);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Role</h2>
          <button className="modal-close" onClick={onClose} type="button" disabled={loading}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>Role *</label>
                <input
                  type="text"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  placeholder="sales_manager"
                  className={errors.role ? "form-control error" : "form-control"}
                  autoFocus
                />
                {errors.role && <small style={{ color: "#dc2626" }}>{errors.role}</small>}
              </div>
              <div className="form-group">
                <label>Display Name *</label>
                <input
                  type="text"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleChange}
                  placeholder="Sales Manager"
                  className={errors.displayName ? "form-control error" : "form-control"}
                />
                {errors.displayName && (
                  <small style={{ color: "#dc2626" }}>{errors.displayName}</small>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Creating..." : "Create Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RoleFormModal;
