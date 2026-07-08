import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  X,
  Pencil,
  Trash2,
  User,
  CalendarDays,
  Phone,
  Mail,
  MapPin,
  Ban,
  Building2,
  Clock,
  Tag,
} from "lucide-react";
import { useCustomers } from "../../context/CustomersContext";
import ConfirmModal from "../ConfirmModal";
import CustomerFormModal from "./CustomerFormModal";

function DetailRow({ icon, label, value }) {
  return (
    <div className="drawer-detail-row">
      {icon && <span className="drawer-detail-icon">{icon}</span>}
      <div className="drawer-detail-content">
        <span className="drawer-detail-label">{label}</span>
        <span className="drawer-detail-value">{value || "-"}</span>
      </div>
    </div>
  );
}

export default function CustomerDrawer({ customerId, onClose, onUpdated }) {
  const { getCustomerById, deleteCustomer, toggleCustomerStatus } =
    useCustomers();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCustomerById(customerId);
      if (data) setCustomer(data);
    } catch (err) {
      toast.error("Failed to load customer details");
    } finally {
      setLoading(false);
    }
  }, [customerId, getCustomerById]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await deleteCustomer(customer._id);
      if (res?.success) {
        toast.success(res.message);
        setShowDeleteConfirm(false);
        if (onUpdated) onUpdated();
        onClose();
      } else {
        toast.error(res?.message || "Delete failed");
      }
    } catch (err) {
      toast.error("Failed to delete customer");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async () => {
    try {
      const res = await toggleCustomerStatus(customer._id);
      if (res?.success) {
        toast.success(res.message);
        load();
        if (onUpdated) onUpdated();
      } else {
        toast.error(res?.message || "Failed to toggle status");
      }
    } catch (err) {
      toast.error("Failed to toggle status");
    }
  };

  const handleEditSaved = () => {
    setShowEditModal(false);
    load();
    if (onUpdated) onUpdated();
  };

  if (loading) {
    return (
      <div
        className="drawer-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="drawer-panel">
          <div className="drawer-loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div
        className="drawer-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="drawer-panel">
          <div className="drawer-loading">Customer not found</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="drawer-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="drawer-panel">
          <div className="drawer-header">
            <div>
              <h3>
                {customer.firstName} {customer.lastName}
              </h3>
              <span className="customer-code">{customer.customerCode}</span>
            </div>
            <div className="drawer-header-actions">
              <button
                className="btn-icon edit"
                title="Edit"
                onClick={() => setShowEditModal(true)}
              >
                <Pencil size={18} />
              </button>
              <button
                className={`btn-icon ${customer.isActive ? "deactivate" : "activate"}`}
                title={customer.isActive ? "Deactivate" : "Activate"}
                onClick={handleToggleStatus}
              >
                <Ban size={18} />
              </button>
              <button
                className="btn-icon delete"
                title="Delete"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={18} />
              </button>
              <button className="modal-close" onClick={onClose}>
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="drawer-body">
            <div className="customer-badges">
              <span
                className={`status-badge ${customer.isActive ? "active" : "inactive"}`}
              >
                {customer.isActive ? "Active" : "Inactive"}
              </span>
              <span
                className="status-badge"
                style={{
                  background:
                    customer.customerType === "corporate"
                      ? "#dbeafe"
                      : "#f3e8ff",
                  color:
                    customer.customerType === "corporate"
                      ? "#1d4ed8"
                      : "#9333ea",
                }}
              >
                {customer.customerType === "corporate"
                  ? "Corporate"
                  : "Individual"}
              </span>
            </div>

            <div className="drawer-section-group">
              <h4 className="drawer-section-title">
                <User size={16} /> Lead Information
              </h4>
              <DetailRow
                icon={<Tag size={16} />}
                label="Lead Ref"
                value={customer.leadRef?.leadNo}
              />
              {customer.convertedAt && (
                <DetailRow
                  icon={<CalendarDays size={16} />}
                  label="Converted At"
                  value={new Date(customer.convertedAt).toLocaleString()}
                />
              )}
              {customer.convertedBy && (
                <DetailRow
                  icon={<User size={16} />}
                  label="Converted By"
                  value={
                    customer.convertedBy?.firstName
                      ? `${customer.convertedBy.firstName} ${customer.convertedBy.lastName}`
                      : "-"
                  }
                />
              )}
            </div>

            <div className="drawer-section-group">
              <h4 className="drawer-section-title">
                <User size={16} /> Personal
              </h4>
              <DetailRow label="First Name" value={customer.firstName} />
              <DetailRow label="Last Name" value={customer.lastName} />
              <DetailRow
                icon={<Mail size={16} />}
                label="Email"
                value={customer.email}
              />
              <DetailRow
                icon={<Phone size={16} />}
                label="Phone"
                value={customer.phone}
              />
              <DetailRow
                icon={<Phone size={16} />}
                label="Alternate Phone"
                value={customer.alternatePhone}
              />
              {customer.customerType === "corporate" && (
                <DetailRow
                  icon={<Building2 size={16} />}
                  label="Company"
                  value={customer.companyName}
                />
              )}
              <DetailRow
                icon={<Tag size={16} />}
                label="Source"
                value={customer.source?.name || "-"}
              />
              <DetailRow
                icon={<Tag size={16} />}
                label="Type"
                value={customer.type?.name || "-"}
              />
              <DetailRow
                icon={<Tag size={16} />}
                label="Status"
                value={customer.status || "-"}
              />
            </div>

            {customer.description && (
              <div className="drawer-section-group">
                <h4 className="drawer-section-title">Description</h4>
                <p className="drawer-description-text">
                  {customer.description}
                </p>
              </div>
            )}

            <div className="drawer-section-group">
              <h4 className="drawer-section-title">
                <MapPin size={16} /> Address
              </h4>
              <DetailRow
                icon={<MapPin size={16} />}
                label="Address"
                value={customer.address}
              />
              <DetailRow label="City" value={customer.city} />
              <DetailRow label="State" value={customer.state} />
              <DetailRow label="Country" value={customer.country} />
              <DetailRow label="Zip Code" value={customer.zipCode} />
            </div>

            <div className="drawer-section-group">
              <h4 className="drawer-section-title">
                <User size={16} /> Assignments
              </h4>
              <DetailRow
                icon={<User size={16} />}
                label="Assigned To"
                value={
                  customer.assignedTo
                    ? `${customer.assignedTo.firstName} ${customer.assignedTo.lastName}`
                    : "Unassigned"
                }
              />
              <DetailRow
                label="Department"
                value={customer.department?.name || "-"}
              />
              <DetailRow
                icon={<User size={16} />}
                label="Linked User"
                value={
                  customer.user
                    ? `${customer.user.firstName} ${customer.user.lastName}`
                    : "No linked user"
                }
              />
              <DetailRow label="User Email" value={customer.user?.email} />
              <DetailRow
                label="User Status"
                value={customer.user?.isActive ? "Active" : "Inactive"}
              />
            </div>

            <div className="drawer-section-group">
              <h4 className="drawer-section-title">
                <Clock size={16} /> System
              </h4>
              <DetailRow
                icon={<User size={16} />}
                label="Created By"
                value={
                  customer.createdBy
                    ? `${customer.createdBy.firstName} ${customer.createdBy.lastName}`
                    : "-"
                }
              />
              <DetailRow
                icon={<CalendarDays size={16} />}
                label="Created At"
                value={new Date(customer.createdAt).toLocaleString()}
              />
              <DetailRow
                icon={<User size={16} />}
                label="Updated By"
                value={
                  customer.updatedBy
                    ? `${customer.updatedBy.firstName} ${customer.updatedBy.lastName}`
                    : "-"
                }
              />
              <DetailRow
                icon={<CalendarDays size={16} />}
                label="Updated At"
                value={new Date(customer.updatedAt).toLocaleString()}
              />
            </div>

            <div className="drawer-section-group">
              <h4 className="drawer-section-title">
                <Clock size={16} /> Timeline
              </h4>
              <p
                className="drawer-description-text"
                style={{ color: "var(--gray-500)", fontStyle: "italic" }}
              >
                Timeline functionality coming soon.
              </p>
            </div>
          </div>

          {showDeleteConfirm && (
            <ConfirmModal
              isOpen={true}
              title="Delete Customer"
              message={`Are you sure you want to deactivate customer ${customer.customerCode}?`}
              confirmText={deleting ? "Deleting..." : "Delete"}
              cancelText="Cancel"
              type="danger"
              onConfirm={handleDelete}
              onCancel={() => setShowDeleteConfirm(false)}
            />
          )}
        </div>
      </div>

      {showEditModal && (
        <CustomerFormModal
          customer={customer}
          onClose={() => setShowEditModal(false)}
          onSaved={handleEditSaved}
        />
      )}
    </>
  );
}
