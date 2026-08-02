/**
 * Vehicle Inventory Page
 * Professional corporate UI for managing vehicle inventory with full CRUD operations
 * Maintained by Hussain Developer
 * hussaintmerng@gmail.com | +92 319 1634446
 * AMS ERP
 * Date: 2026-01-06
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import SearchableSelect from "../components/SearchableSelect";
import VehicleMasterModal from "../components/vehicle/VehicleMasterModal";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { vehicleAPI, adminAPI, vehicleMasterAPI } from "../services/api";
import toast from "react-hot-toast";
import ErrorPopup from "../components/ErrorPopup";
import ActionButtons from "../components/ActionButtons";
import BarcodeButton from "../components/BarcodeButton";
import BulkUploadModal from "../components/BulkUploadModal";
import ConfirmModal from "../components/ConfirmModal";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import DataTable from "../components/DataTable";
import useModalKeyboard from "../hooks/useModalKeyboard";
import { Search } from "lucide-react";
import "../styles/vehicleInventory.css";

const Vehicles = () => {
  const { user: currentUser } = useAuth();

  // State
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorPopup, setErrorPopup] = useState(null);
  const [stats, setStats] = useState({});

  // Pagination & filtering
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") || "";

  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState("");
  const [makeFilter, setMakeFilter] = useState("");
  const [dispatchFilter, setDispatchFilter] = useState("");

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState(null);
  const formRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteAllTarget, setDeleteAllTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === vehicles.length
        ? new Set()
        : new Set(vehicles.map((v) => v.id)),
    );
  };

  const handleBulkDelete = async () => {
    setDeletingAll(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await vehicleAPI.delete(id);
      }
      toast.success(`${ids.length} vehicle(s) deleted`);
      setSelectedIds(new Set());
      setDeleteAllTarget(null);
      fetchVehicles();
      fetchReferenceData();
    } catch (err) {
      setErrorPopup(
        err.response?.data || { message: "Failed to delete vehicles" },
      );
    } finally {
      setDeletingAll(false);
    }
  };

  // Reference data
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [variants, setVariants] = useState([]);
  const [colors, setColors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // Dynamic Dropdowns
  const [statusOptions, setStatusOptions] = useState([]);
  const [conditionOptions, setConditionOptions] = useState([]);

  // Form data
  const [formData, setFormData] = useState({
    vin: "",
    engineNumber: "",
    makeId: "",
    modelId: "",
    variantId: "",
    colorId: "",
    year: new Date().getFullYear(),
    status: "at_yard",
    conditionType: "new",
    mileage: 0,
    purchasePrice: "",
    sellingPrice: "",
    warehouseId: "",
    location: "",
    arrivalDate: "",
    notes: "",
  });

  // Fetch vehicles
  const fetchVehicles = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(makeFilter && { makeId: makeFilter }),
        ...(dispatchFilter && { dispatchStatus: dispatchFilter }),
      };

      const response = await vehicleAPI.getAll(params);
      const responseData = response?.data?.data || {};
      setVehicles(responseData.vehicles || []);
      setTotalPages(responseData.pagination?.totalPages || 1);
      setTotal(responseData.pagination?.total || 0);
    } catch (err) {
      console.error("Error fetching vehicles:", err);
      toast.error("Failed to load vehicles");
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, makeFilter, dispatchFilter]);

  // Fetch reference data
  const fetchReferenceData = useCallback(async () => {
    // Settle each request independently. Some of these endpoints are permission
    // gated (e.g. statuses requires the "statuses" page), and with Promise.all a
    // single 403 would leave the brand/model/colour pickers empty for everyone
    // who lacks that permission.
    const [
      makesRes,
      colorsRes,
      warehousesRes,
      statsRes,
      statusRes,
      conditionRes,
    ] = await Promise.allSettled([
      vehicleAPI.getMakes(),
      vehicleAPI.getColors(),
      vehicleAPI.getWarehouses(),
      vehicleAPI.getStats(),
      adminAPI.getStatusesByTable("vehicles"),
      vehicleMasterAPI.getConditions(),
    ]);

    const valueOf = (result, fallback) => {
      if (result.status === "fulfilled")
        return result.value?.data?.data ?? fallback;
      console.error("Error fetching reference data:", result.reason);
      return fallback;
    };

    setMakes(valueOf(makesRes, []));
    setColors(valueOf(colorsRes, []));
    setWarehouses(valueOf(warehousesRes, []));
    setStats(valueOf(statsRes, {}));

    // Dynamic options are optional — keep the defaults when unavailable.
    const statuses = valueOf(statusRes, {})?.statuses;
    if (statuses) setStatusOptions(statuses);

    const conditions = valueOf(conditionRes, {})?.conditions;
    if (conditions) setConditionOptions(conditions);
  }, []);

  // Load models when make changes
  const loadModels = async (makeId) => {
    if (!makeId) {
      setModels([]);
      setVariants([]);
      return;
    }
    try {
      const response = await vehicleAPI.getModels(makeId);
      setModels(response?.data?.data || []);
    } catch (err) {
      console.error("Error loading models:", err);
      setModels([]);
    }
  };

  // Load variants when model changes
  const loadVariants = async (modelId) => {
    if (!modelId) {
      setVariants([]);
      return;
    }
    try {
      const response = await vehicleAPI.getVariants(modelId);
      setVariants(response?.data?.data || []);
    } catch (err) {
      console.error("Error loading variants:", err);
      setVariants([]);
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchReferenceData();
  }, [fetchVehicles, fetchReferenceData]);

  // Update search if URL search param changes
  useEffect(() => {
    if (urlSearch) {
      setSearch(urlSearch);
    }
  }, [urlSearch]);

  useEffect(() => {
    if (searchParams.get("action") === "create") openModal("create");
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchVehicles();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Handle form input change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === "makeId") {
      loadModels(value);
      setFormData((prev) => ({ ...prev, modelId: "", variantId: "" }));
    }
    if (name === "modelId") {
      loadVariants(value);
      setFormData((prev) => ({ ...prev, variantId: "" }));
    }
  };

  // Open modal
  const openModal = (mode, vehicle = null) => {
    setModalMode(mode);
    setSelectedVehicle(vehicle);

    if (mode === "create") {
      setFormData({
        vin: "",
        engineNumber: "",
        makeId: "",
        modelId: "",
        variantId: "",
        colorId: "",
        year: new Date().getFullYear(),
        status: "at_yard",
        conditionType: "new",
        mileage: 0,
        purchasePrice: "",
        sellingPrice: "",
        warehouseId: "",
        location: "",
        arrivalDate: "",
        notes: "",
      });
      setModels([]);
      setVariants([]);
    } else if (vehicle) {
      setFormData({
        vin: vehicle.vin,
        engineNumber: vehicle.engine_number,
        makeId: vehicle.make_id,
        modelId: vehicle.model_id,
        variantId: vehicle.variant_id,
        colorId: vehicle.color_id,
        year: vehicle.year,
        status: vehicle.status,
        conditionType: vehicle.condition_type,
        mileage: vehicle.mileage,
        purchasePrice: vehicle.purchase_price,
        sellingPrice: vehicle.selling_price,
        warehouseId: vehicle.warehouse_id || "",
        location: vehicle.location || "",
        arrivalDate: vehicle.arrival_date
          ? vehicle.arrival_date.split("T")[0]
          : "",
        notes: vehicle.notes || "",
      });
      loadModels(vehicle.make_id);
      setTimeout(() => loadVariants(vehicle.model_id), 100);
    }

    setShowModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setSelectedVehicle(null);
  };

  useModalKeyboard(showModal, closeModal, () =>
    formRef.current?.requestSubmit(),
  );

  // Create vehicle
  const handleCreateVehicle = async (e) => {
    e.preventDefault();
    try {
      await vehicleAPI.create(formData);
      toast.success("Vehicle created successfully!");
      closeModal();
      fetchVehicles();
      fetchReferenceData();
    } catch (err) {
      console.error("Error creating vehicle:", err);
      setErrorPopup(
        err.response?.data || { message: "Failed to create vehicle" },
      );
    }
  };

  // Update vehicle
  const handleUpdateVehicle = async (e) => {
    e.preventDefault();
    try {
      await vehicleAPI.update(selectedVehicle.id, formData);
      toast.success("Vehicle updated successfully!");
      closeModal();
      fetchVehicles();
    } catch (err) {
      console.error("Error updating vehicle:", err);
      setErrorPopup(
        err.response?.data || { message: "Failed to update vehicle" },
      );
    }
  };

  // Delete vehicle
  const handleDeleteVehicle = async (vehicleId, vin) => {
    setDeleteTarget({ id: vehicleId, vin });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const { id, vin } = deleteTarget;
    setDeleteTarget(null);
    try {
      await vehicleAPI.delete(id);
      toast.success("Vehicle deleted successfully!");
      fetchVehicles();
      fetchReferenceData();
    } catch (err) {
      console.error("Error deleting vehicle:", err);
      setErrorPopup(
        err.response?.data || { message: "Failed to delete vehicle" },
      );
    }
  };

  // Update status
  const handleUpdateStatus = async (vehicleId, newStatus) => {
    try {
      await vehicleAPI.updateStatus(vehicleId, newStatus);
      toast.success("Status updated successfully!");
      fetchVehicles();
      fetchReferenceData();
    } catch (err) {
      console.error("Error updating status:", err);
      setErrorPopup(
        err.response?.data || { message: "Failed to update status" },
      );
    }
  };

  // Quick-create handler
  const openQuickCreate = (type) => {
    setQuickCreateType(type);
  };

  const handleQuickCreateSaved = async (newItem) => {
    const type = quickCreateType;
    setQuickCreateType(null);
    if (!newItem?.id) return;

    try {
      if (type === "make") {
        const res = await vehicleAPI.getMakes();
        const updatedMakes = res?.data?.data || [];
        setMakes(updatedMakes);
        const match = updatedMakes.find(
          (m) => m.id === parseInt(newItem.id) || m.id === newItem.id,
        );
        if (match)
          setFormData((prev) => ({
            ...prev,
            makeId: match.id,
            modelId: "",
            variantId: "",
          }));
      } else if (type === "model") {
        const currentMakeId = formData.makeId || newItem.makeId;
        if (currentMakeId) {
          const res = await vehicleAPI.getModels(currentMakeId);
          const updatedModels = res?.data?.data || [];
          setModels(updatedModels);
          const match = updatedModels.find(
            (m) => m.id === parseInt(newItem.id) || m.id === newItem.id,
          );
          if (match)
            setFormData((prev) => ({
              ...prev,
              modelId: match.id,
              variantId: "",
            }));
        }
      } else if (type === "variant") {
        const currentModelId = formData.modelId || newItem.modelId;
        if (currentModelId) {
          const res = await vehicleAPI.getVariants(currentModelId);
          const updatedVariants = res?.data?.data || [];
          setVariants(updatedVariants);
          const match = updatedVariants.find(
            (v) => v.id === parseInt(newItem.id) || v.id === newItem.id,
          );
          if (match) setFormData((prev) => ({ ...prev, variantId: match.id }));
        }
      } else if (type === "color") {
        const res = await vehicleAPI.getColors();
        const updatedColors = res?.data?.data || [];
        setColors(updatedColors);
        const match = updatedColors.find(
          (c) => c.id === parseInt(newItem.id) || c.id === newItem.id,
        );
        if (match) setFormData((prev) => ({ ...prev, colorId: match.id }));
      } else if (type === "condition") {
        const res = await vehicleMasterAPI.getConditions();
        const updatedConditions = res?.data?.data?.conditions || [];
        setConditionOptions(updatedConditions);
        const match = updatedConditions.find(
          (c) => c.id === parseInt(newItem.id) || c.id === newItem.id,
        );
        if (match)
          setFormData((prev) => ({ ...prev, conditionType: match.name }));
      }
    } catch (err) {
      console.error(`Error refreshing ${type}s:`, err);
    }
  };

  // Status badge style
  const getStatusStyle = (statusCode) => {
    const status = statusOptions.find((s) => s.status_code === statusCode);
    if (status) {
      return {
        backgroundColor: status.status_bg_color,
        color: status.status_color,
        borderColor: status.status_bg_color,
      };
    }
    return { backgroundColor: "#e2e8f0", color: "#475569" }; // Default gray
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `PKR ${Number(amount).toLocaleString()}`;
  };

  const vehicleColumns = [
    {
      header: (
        <input
          type="checkbox"
          checked={selectedIds.size === vehicles.length && vehicles.length > 0}
          onChange={toggleSelectAll}
        />
      ),
      accessor: "_checkbox",
      style: { width: 40 },
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      hideOnMobile: true,
    },
    {
      header: "VIN",
      accessor: "vin",
      render: (row) => <strong className="vin-code">{row.vin}</strong>,
    },
    {
      header: "Vehicle",
      accessor: "make_name",
      render: (row) => (
        <div className="vehicle-info">
          <span className="vehicle-name">
            {[row.make_name, row.model_name].filter(Boolean).join(' ')
              || row.vehicle_name
              || row.chassis_number
              || row.vin
              || row.engine_number
              || '—'}
          </span>
          <span className="vehicle-variant">{row.variant_name || ''}</span>
        </div>
      ),
    },
    {
      header: "Color",
      accessor: "color_name",
      render: (row) => (
        <span
          className="color-badge"
          style={{ backgroundColor: row.color_hex || "#ccc" }}
        >
          {row.color_name}
        </span>
      ),
    },
    { header: "Year", accessor: "year" },
    {
      header: "Status",
      accessor: "status",
      render: (row) => {
        const statusStyle = getStatusStyle(row.status);
        return (
          <span className="badge" style={statusStyle}>
            {statusOptions.find((s) => s.status_code === row.status)
              ?.status_name || row.status?.replace(/_/g, " ")}
          </span>
        );
      },
    },
    {
      header: "Dispatch",
      accessor: "dispatch_no",
      render: (row) =>
        row.is_dispatched ? (
          <div className="vehicle-info">
            <span className="badge" style={{ background: "#ede9fe", color: "#6d28d9" }}>
              🚚 {row.dispatch_no}
            </span>
            <span className="vehicle-variant">
              {[
                row.dispatch_date ? new Date(row.dispatch_date).toLocaleDateString() : "",
                row.dispatch_pbo_no,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        ) : (
          <span className="badge" style={{ background: "#f1f5f9", color: "#64748b" }}>
            Not dispatched
          </span>
        ),
      hideOnMobile: true,
    },
    { header: "Condition", accessor: "condition_type" },
    {
      header: "Selling Price",
      accessor: "selling_price",
      render: (row) => (
        <span className="price-cell">{formatCurrency(row.selling_price)}</span>
      ),
    },
    { header: "Warehouse", accessor: "warehouse_name" },
    {
      header: "Actions",
      accessor: "actions",
      style: { width: "140px" },
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <BarcodeButton
            kind="vehicle"
            id={row.id}
            code={row.barcode}
            label={row.vehicle_name || row.vin}
            subtitle={row.chassis_number || row.vin || ""}
          />
          <ActionButtons
            onEdit={() => openModal("edit", row)}
            onDelete={() => handleDeleteVehicle(row.id, row.vin)}
            title={row.vin}
            showEdit
            showDelete={row.status !== "sold" && row.status !== "delivered"}
          />
        </div>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <div className="vehicle-inventory-page">
      {/* Page Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>Vehicle Inventory</h1>
          <p className="subtitle">
            Manage vehicle inventory, stock, and allocation
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-create"
            onClick={() => setShowBulkUpload(true)}
            title="Bulk upload vehicles (CSV / XLSX)"
          >
            <ArrowUpTrayIcon
              style={{ width: 18, height: 18, marginRight: 6 }}
            />
            Upload
          </button>
          <button
            className="btn btn-primary btn-create"
            onClick={() => openModal("create")}
          >
            <span className="icon">+</span>
            Add Vehicle
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-icon">🚗</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total_vehicles || 0}</span>
            <span className="stat-label">Total Vehicles</span>
          </div>
        </div>
        <div className="stat-card stat-yard">
          <div className="stat-icon">🏢</div>
          <div className="stat-content">
            <span className="stat-value">{stats.at_yard || 0}</span>
            <span className="stat-label">At Yard</span>
          </div>
        </div>
        <div className="stat-card stat-transit">
          <div className="stat-icon">🚚</div>
          <div className="stat-content">
            <span className="stat-value">{stats.in_transit || 0}</span>
            <span className="stat-label">In Transit</span>
          </div>
        </div>
        <div className="stat-card stat-allocated">
          <div className="stat-icon">📋</div>
          <div className="stat-content">
            <span className="stat-value">{stats.allocated || 0}</span>
            <span className="stat-label">Allocated</span>
          </div>
        </div>
        <div className="stat-card stat-sold">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <span className="stat-value">{stats.sold || 0}</span>
            <span className="stat-label">Sold</span>
          </div>
        </div>
      </div>

      <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

      {/* Filters */}
      <div className="filters-bar filters-grid">
        <div className="filter-field filter-field-search">
          <label>Search</label>
          <div className="search-box">
            <span className="search-icon">
              <Search size={18} style={{ color: "#9ca3af" }} />
            </span>
            <input
              type="text"
              placeholder="Search by chassis/VIN, engine, brand, dispatch no, PBO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="filter-field">
          <label>Status</label>
          <SearchableSelect
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="filter-select"
          >
            <option value="">All Status</option>
            {statusOptions.map((status) => (
              <option key={status.id} value={status.status_code}>
                {status.status_name}
              </option>
            ))}
          </SearchableSelect>
        </div>

        <div className="filter-field">
          <label>Brand</label>
          <SearchableSelect
            value={makeFilter}
            onChange={(e) => {
              setMakeFilter(e.target.value);
              setPage(1);
            }}
            className="filter-select"
          >
            <option value="">All Brands</option>
            {makes.map((make) => (
              <option key={make.id} value={make.id}>
                {make.name}
              </option>
            ))}
          </SearchableSelect>
        </div>

        <div className="filter-field">
          <label>Dispatch</label>
          <SearchableSelect
            value={dispatchFilter}
            onChange={(e) => {
              setDispatchFilter(e.target.value);
              setPage(1);
            }}
            className="filter-select"
          >
            <option value="">All Vehicles</option>
            <option value="dispatched">Dispatched</option>
            <option value="not_dispatched">Not Dispatched</option>
          </SearchableSelect>
        </div>

        <div className="filter-field filter-field-actions">
          {(search || statusFilter || makeFilter || dispatchFilter) && (
            <button
              type="button"
              className="btn btn-sm btn-outline filter-reset-btn"
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setMakeFilter("");
                setDispatchFilter("");
                setPage(1);
              }}
              title="Reset all filters"
            >
              Reset
            </button>
          )}
          <span className="results-count">{total} vehicles found</span>
        </div>
      </div>

      {/* Bulk Delete Bar */}
      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <span className="selection-count">{selectedIds.size} selected</span>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setDeleteAllTarget(true)}
          >
            Delete Selected
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Deselect All
          </button>
        </div>
      )}

      {/* Vehicles Table */}
      <DataTable
        columns={vehicleColumns}
        data={vehicles}
        loading={loading}
        pagination={{ page, totalPages, total, limit }}
        onPageChange={(p) => setPage(p)}
        onRowClick={(row) => openModal("edit", row)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Vehicle"
        message={`Are you sure you want to delete vehicle "${deleteTarget?.vin}"?`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        confirmText="Delete"
        type="danger"
      />

      {deleteAllTarget && (
        <div className="modal-overlay" onClick={() => setDeleteAllTarget(null)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Delete Selected Vehicles</h2>
              <button
                className="modal-close"
                onClick={() => setDeleteAllTarget(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete {selectedIds.size} vehicle(s)?
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteAllTarget(null)}
                disabled={deletingAll}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleBulkDelete}
                disabled={deletingAll}
              >
                {deletingAll ? "Deleting..." : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="modal-content modal-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                {modalMode === "create" ? "Add New Vehicle" : "Edit Vehicle"}
              </h2>
              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </div>

            <form
              ref={formRef}
              onSubmit={
                modalMode === "create"
                  ? handleCreateVehicle
                  : handleUpdateVehicle
              }
            >
              <div className="modal-body">
                <div className="form-section">
                  <h3>Vehicle Identification</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>VIN *</label>
                      <input
                        type="text"
                        name="vin"
                        className="form-input"
                        value={formData.vin}
                        onChange={handleInputChange}
                        required
                        maxLength={17}
                        placeholder="17-character VIN"
                      />
                    </div>
                    <div className="form-group">
                      <label>Engine Number *</label>
                      <input
                        type="text"
                        name="engineNumber"
                        className="form-input"
                        value={formData.engineNumber}
                        onChange={handleInputChange}
                        required
                        placeholder="Engine number"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Vehicle Details</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label-add">
                        Brand *
                        <a
                          className="label-add-link"
                          onClick={() => openQuickCreate("make")}
                        >
                          + Brand
                        </a>
                      </label>
                      <SearchableSelect
                        name="makeId"
                        value={formData.makeId}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">Select Brand</option>
                        {makes.map((make) => (
                          <option key={make.id} value={make.id}>
                            {make.name}
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>
                    <div className="form-group">
                      <label className="form-label-add">
                        Model *
                        <a
                          className="label-add-link"
                          onClick={() => openQuickCreate("model")}
                        >
                          + Model
                        </a>
                      </label>
                      <SearchableSelect
                        name="modelId"
                        value={formData.modelId}
                        onChange={handleInputChange}
                        required
                        disabled={!formData.makeId}
                      >
                        <option value="">Select Model</option>
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label-add">
                        Variant *
                        <a
                          className="label-add-link"
                          onClick={() => openQuickCreate("variant")}
                        >
                          + Variant
                        </a>
                      </label>
                      <SearchableSelect
                        name="variantId"
                        value={formData.variantId}
                        onChange={handleInputChange}
                        required
                        disabled={!formData.modelId}
                      >
                        <option value="">Select Variant</option>
                        {variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.name}
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>
                    <div className="form-group">
                      <label className="form-label-add">
                        Color *
                        <a
                          className="label-add-link"
                          onClick={() => openQuickCreate("color")}
                        >
                          + Color
                        </a>
                      </label>
                      <SearchableSelect
                        name="colorId"
                        value={formData.colorId}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="">Select Color</option>
                        {colors.map((color) => (
                          <option key={color.id} value={color.id}>
                            {color.name}
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Year *</label>
                      <input
                        type="number"
                        name="year"
                        className="form-input"
                        value={formData.year}
                        onChange={handleInputChange}
                        required
                        min={2000}
                        max={new Date().getFullYear() + 1}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label-add">
                        Condition
                        <a
                          className="label-add-link"
                          onClick={() => openQuickCreate("condition")}
                          title="Add Condition"
                        >
                          + Condition
                        </a>
                      </label>
                      <SearchableSelect
                        name="conditionType"
                        value={formData.conditionType}
                        onChange={handleInputChange}
                      >
                        {conditionOptions.map((condition) => (
                          <option key={condition.id} value={condition.name}>
                            {condition.name}
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>
                    <div className="form-group">
                      <label>Mileage (km)</label>
                      <input
                        type="number"
                        name="mileage"
                        className="form-input"
                        value={formData.mileage}
                        onChange={handleInputChange}
                        min={0}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Pricing & Location</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Purchase Price (PKR) *</label>
                      <input
                        type="number"
                        name="purchasePrice"
                        className="form-input"
                        value={formData.purchasePrice}
                        onChange={handleInputChange}
                        required
                        min={0}
                      />
                    </div>
                    <div className="form-group">
                      <label>Selling Price (PKR) *</label>
                      <input
                        type="number"
                        name="sellingPrice"
                        className="form-input"
                        value={formData.sellingPrice}
                        onChange={handleInputChange}
                        required
                        min={0}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Warehouse</label>
                      <SearchableSelect
                        name="warehouseId"
                        value={formData.warehouseId}
                        onChange={handleInputChange}
                      >
                        <option value="">Select Warehouse</option>
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name} ({wh.code})
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>
                    <div className="form-group">
                      <label>Arrival Date</label>
                      <input
                        type="date"
                        name="arrivalDate"
                        className="form-input"
                        value={formData.arrivalDate}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group full-width">
                      <label>Notes</label>
                      <textarea
                        name="notes"
                        className="form-input"
                        value={formData.notes}
                        onChange={handleInputChange}
                        placeholder="Additional notes..."
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === "create" ? "Add Vehicle" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick-create modal — portal to root */}
      {quickCreateType &&
        createPortal(
          <VehicleMasterModal
            type={quickCreateType}
            mode="create"
            makes={makes}
            models={models}
            onClose={() => setQuickCreateType(null)}
            onSaved={handleQuickCreateSaved}
            initialData={{
              ...(quickCreateType === "model" && formData.makeId
                ? { makeId: formData.makeId }
                : {}),
              ...(quickCreateType === "variant" && formData.makeId
                ? { makeId: formData.makeId }
                : {}),
              ...(quickCreateType === "variant" && formData.modelId
                ? { modelId: formData.modelId }
                : {}),
            }}
          />,
          document.body,
        )}

      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        title="Bulk upload vehicles"
        description="Import inventory rows with variant_id and color_id from Vehicle Master. Required columns are marked with * in the sample file."
        templateType="vehicles"
        onCompleted={() => {
          setPage(1);
          fetchVehicles();
          fetchReferenceData();
        }}
      />
    </div>
  );
};

export default Vehicles;
