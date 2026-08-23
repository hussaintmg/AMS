import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fieldAccessor, canRoleDo, getRoleJob, pageActions, canQuickCreate } from "../utils/roleJobs";
import { partsAPI, vehicleMasterAPI } from "../services/api";
import toast from "react-hot-toast";
import { Package, Search, Plus, Upload, Pencil, Trash2, ScanLine } from "lucide-react";
import ErrorPopup from "../components/ErrorPopup";
import ActionButtons from "../components/ActionButtons";
import BarcodeButton from "../components/BarcodeButton";
import BarcodeBulkPrint from "../components/BarcodeBulkPrint";
import SearchableSelect from "../components/SearchableSelect";
import DataTable from "../components/DataTable";
import ConfirmModal from "../components/ConfirmModal";
import BulkUploadModal from "../components/BulkUploadModal";
import useModalKeyboard from "../hooks/useModalKeyboard";
import CategoryFormModal from "./parts/CategoryFormModal";
import SupplierFormModal from "./parts/SupplierFormModal";
import SourceTypeFormModal from "./parts/SourceTypeFormModal";
import "../styles/partsInventory.css";

// Source types are dealer-defined, so badge colours are assigned by position
// instead of being hard-coded per type.
const SOURCE_BADGE_CLASSES = [
  "badge-primary",
  "badge-purple",
  "badge-info",
  "badge-success",
  "badge-warning",
  "badge-secondary",
];
const SOURCE_STAT_COLORS = ["#22c55e", "#8b5cf6", "#0ea5e9", "#f97316", "#14b8a6", "#64748b"];

const PartsInventory = () => {
  const { user: currentUser, isSuperAdmin } = useAuth();
  // Purchase price is super-admin-only. This hides the column, the form field
  // and the inventory-value card; the API enforces the same rule on its own, so
  // another role gets responses without the field either way.
  const canSeePurchasePrice = isSuperAdmin;
  // Everything else on this page can be withheld per role from Server
  // Management → Role Jobs → Visible data fields.
  const showField = fieldAccessor(currentUser, 'parts');

  /**
   * What this role may do here.
   *
   * The screen had none of this: Add Part, Upload, the row Edit/Delete and the
   * Rename/Delete on every source-type chip were drawn for anyone who could open
   * Parts, and the server's 403 was the first the operator heard of it. Verified
   * live on the parts-manager role, which holds create and edit but not delete —
   * it was being offered Delete on every part and every chip.
   *
   * A role that has never been through Role Jobs keeps the old behaviour, so
   * nothing in use today stops working.
   */
  const allows = (action) => (getRoleJob(currentUser, 'parts') ? canRoleDo(currentUser, 'parts', action) : true);
  const canCreatePart = allows('create');
  // Generating a barcode and importing a spreadsheet are their own grants
  // (Role Jobs → Parts); an unconfigured role keeps what it had.
  const canGenerateBarcode = getRoleJob(currentUser, 'parts') ? canRoleDo(currentUser, 'parts', 'barcode') : true;
  const canImportParts = getRoleJob(currentUser, 'parts') ? canRoleDo(currentUser, 'parts', 'import') : canCreatePart;
  const canEditPart = allows('edit');
  const canDeletePart = allows('delete');
  /**
   * One grant per way of moving stock, apart from edit: goods-in may only add,
   * goods-out may only remove, and overwriting the count is its own trust
   * (Role Jobs → "Increase stock" / "Decrease stock" / "Set exact stock
   * value"). Each grant is exactly one option in the Adjust Stock dialog, and
   * a role holding none of them is not offered the dialog at all.
   */
  /**
   * The "+ Create …" links beside the pickers were drawn for anyone who could
   * open this form, but the records behind them belong to other pages and are
   * guarded there: categories and suppliers are Vehicle Master Data, source
   * types are Parts. A role without those rights was being offered a button
   * whose only outcome was a 403.
   */
  const canCreateVehicleMaster = pageActions(currentUser, 'vehicle_master')('create');
  const canCreateSourceType = canCreatePart;

  const canIncreaseStock = allows('stockIncrease');
  const canDecreaseStock = allows('stockDecrease');
  const canSetStock = allows('stockSet');
  const stockAdjustTypes = [
    canIncreaseStock && { value: 'increase', label: 'Increase (+)' },
    canDecreaseStock && { value: 'decrease', label: 'Decrease (-)' },
    canSetStock && { value: 'set', label: 'Set to Exact Value' },
  ].filter(Boolean);
  const canAdjustStock = stockAdjustTypes.length > 0;

  // State
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorPopup, setErrorPopup] = useState(null);
  const [stats, setStats] = useState({});

  // Tabs
  const [activeTab, setActiveTab] = useState("all");

  // Pagination & filtering
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") || "";

  const [search, setSearch] = useState(urlSearch);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  // Role Jobs → Parts → Forms may withhold a shortcut on this form even from a
  // role that may create the record on its own master-data page.
  const partFormKind = modalMode === 'edit' ? 'edit' : 'create';
  const partQuick = (key) => canQuickCreate(currentUser, 'parts', partFormKind, key);
  const [selectedPart, setSelectedPart] = useState(null);
  const [showStockModal, setShowStockModal] = useState(false);
  const stockFormRef = useRef(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showSourceTypeModal, setShowSourceTypeModal] = useState(false);
  // Set when the "+ Source Type" tab is used to edit rather than create one
  const [editingSourceType, setEditingSourceType] = useState(null);
  const [sourceTypeDeleteTarget, setSourceTypeDeleteTarget] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteAllTarget, setDeleteAllTarget] = useState(null);
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
      prev.size === parts.length ? new Set() : new Set(parts.map((p) => p.id)),
    );
  };

  const handleBulkDelete = async () => {
    setDeletingAll(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await partsAPI.delete(id);
      }
      toast.success(`${ids.length} part(s) deleted`);
      setSelectedIds(new Set());
      setDeleteAllTarget(null);
      fetchParts();
      fetchReferenceData();
    } catch (err) {
      setErrorPopup(
        err.response?.data || { message: "Failed to delete parts" },
      );
    } finally {
      setDeletingAll(false);
    }
  };

  // Reference data
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [sourceTypes, setSourceTypes] = useState([]);

  // Form data
  const [formData, setFormData] = useState({
    partNumber: "",
    name: "",
    categoryId: "",
    description: "",
    brand: "",
    sourceType: "manufacturer",
    supplierId: "",
    unit: "piece",
    purchasePrice: "",
    sellingPrice: "",
    currentStock: 0,
    minimumStock: 5,
    maximumStock: 100,
    reorderLevel: 10,
    warehouseId: "",
    binLocation: "",
  });

  // Stock adjustment form
  const [stockForm, setStockForm] = useState({
    adjustmentType: "increase",
    quantity: "",
    reason: "",
  });

  // Fetch parts
  const fetchParts = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit,
        ...(search && { search }),
        ...(activeTab !== "all" && { sourceType: activeTab }),
        ...(categoryFilter && { categoryId: categoryFilter }),
        ...(stockFilter && { stockStatus: stockFilter }),
      };

      const response = await partsAPI.getAll(params);
      const responseData = response?.data?.data || {};
      setParts(responseData.parts || []);
      setTotalPages(responseData.pagination?.totalPages || 1);
      setTotal(responseData.pagination?.total || 0);
    } catch (err) {
      console.error("Error fetching parts:", err);
      toast.error("Failed to load parts");
      setParts([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, activeTab, categoryFilter, stockFilter]);

  // Fetch reference data
  const fetchReferenceData = useCallback(async () => {
    try {
      const [categoriesRes, suppliersRes, sourceTypesRes, statsRes] = await Promise.all([
        partsAPI.getCategories(),
        partsAPI.getSuppliers(),
        partsAPI.getSourceTypes(),
        partsAPI.getStats(),
      ]);

      setCategories(categoriesRes?.data?.data || []);
      setSuppliers(suppliersRes?.data?.data || []);
      setSourceTypes(sourceTypesRes?.data?.data || []);
      setStats(statsRes?.data?.data || {});
    } catch (err) {
      console.error("Error fetching reference data:", err);
      setCategories([]);
      setSuppliers([]);
      setSourceTypes([]);
    }
  }, []);

  useEffect(() => {
    fetchParts();
    fetchReferenceData();
  }, [fetchParts, fetchReferenceData]);

  // Update search if URL search param changes
  useEffect(() => {
    if (urlSearch) {
      setSearch(urlSearch);
    }
  }, [urlSearch]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchParts();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
  };

  // Handle form input change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle stock form change
  const handleStockFormChange = (e) => {
    const { name, value } = e.target;
    setStockForm((prev) => ({ ...prev, [name]: value }));
  };

  // Open modal
  const openModal = (mode, part = null) => {
    setModalMode(mode);
    setSelectedPart(part);

    if (mode === "create") {
      setFormData({
        partNumber: "",
        name: "",
        categoryId: "",
        description: "",
        brand: "",
        sourceType:
          activeTab !== "all"
            ? activeTab
            : sourceTypes[0]?.value || "manufacturer",
        supplierId: "",
        unit: "piece",
        purchasePrice: "",
        sellingPrice: "",
        currentStock: 0,
        minimumStock: 5,
        maximumStock: 100,
        reorderLevel: 10,
        warehouseId: "",
        binLocation: "",
      });
    } else if (part) {
      setFormData({
        partNumber: part.part_number,
        name: part.name,
        categoryId: part.category_id || "",
        description: part.description || "",
        brand: part.brand || "",
        sourceType: part.source_type,
        supplierId: part.supplier_id || "",
        unit: part.unit,
        purchasePrice: part.purchase_price,
        sellingPrice: part.selling_price,
        currentStock: part.current_stock,
        minimumStock: part.minimum_stock,
        maximumStock: part.maximum_stock,
        reorderLevel: part.reorder_level,
        warehouseId: part.warehouse_id || "",
        binLocation: part.bin_location || "",
      });
    }

    setShowModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setSelectedPart(null);
  };

  // Open stock adjustment modal — the dialog opens on a movement this role is
  // actually allowed to make, so submitting without touching the dropdown can
  // never be refused.
  const openStockModal = (part) => {
    setSelectedPart(part);
    setStockForm({
      adjustmentType: stockAdjustTypes[0]?.value || "",
      quantity: "",
      reason: "",
    });
    setShowStockModal(true);
  };

  // Close stock modal
  const closeStockModal = () => {
    setShowStockModal(false);
    setSelectedPart(null);
  };

  useModalKeyboard(showStockModal, closeStockModal, () =>
    stockFormRef.current?.requestSubmit(),
  );

  // Part form submit handler
  const handlePartFormSubmit = (e) => {
    if (e) e.preventDefault();
    if (modalMode === "create") {
      handleCreatePart(e);
    } else {
      handleUpdatePart(e);
    }
  };

  // Create part
  const handleCreatePart = async (e) => {
    if (e) e.preventDefault();
    try {
      await partsAPI.create(formData);
      toast.success("Part created successfully!");
      closeModal();
      fetchParts();
      fetchReferenceData();
    } catch (err) {
      console.error("Error creating part:", err);
      setErrorPopup(err.response?.data || { message: "Failed to create part" });
    }
  };

  // Update part
  const handleUpdatePart = async (e) => {
    if (e) e.preventDefault();
    try {
      await partsAPI.update(selectedPart.id, formData);
      toast.success("Part updated successfully!");
      closeModal();
      fetchParts();
    } catch (err) {
      console.error("Error updating part:", err);
      setErrorPopup(err.response?.data || { message: "Failed to update part" });
    }
  };

  // Confirm delete
  const openDeleteConfirm = (part) => {
    setDeleteTarget(part);
    setShowConfirmDelete(true);
  };

  // Execute delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await partsAPI.delete(deleteTarget.id);
      toast.success("Part deleted successfully!");
      setShowConfirmDelete(false);
      setDeleteTarget(null);
      fetchParts();
      fetchReferenceData();
    } catch (err) {
      console.error("Error deleting part:", err);
      setErrorPopup(err.response?.data || { message: "Failed to delete part" });
      setShowConfirmDelete(false);
      setDeleteTarget(null);
    }
  };

  // Quick-create: category
  const handleCategoryCreated = (newCat) => {
    fetchReferenceData();
    setFormData((prev) => ({ ...prev, categoryId: String(newCat.id) }));
  };

  // Quick-create: supplier
  const handleSupplierCreated = (newSup) => {
    fetchReferenceData();
    setFormData((prev) => ({ ...prev, supplierId: String(newSup.id) }));
  };

  // Quick-create: source type — select it right away so the part being added uses it
  const handleSourceTypeCreated = (newType) => {
    if (newType?.value) {
      setSourceTypes((prev) =>
        prev.some((type) => type.value === newType.value) ? prev : [...prev, newType],
      );
      setFormData((prev) => ({ ...prev, sourceType: newType.value }));
    }
    fetchReferenceData();
  };

  // Renaming keeps the same `value`, so the active tab and every part on it stay put
  const handleSourceTypeUpdated = (updated) => {
    if (updated?.id) {
      setSourceTypes((prev) =>
        prev.map((type) => (type.id === updated.id ? { ...type, ...updated } : type)),
      );
    }
    fetchReferenceData();
  };

  const openSourceTypeEdit = (type) => {
    setEditingSourceType(type);
    setShowSourceTypeModal(true);
  };

  const closeSourceTypeModal = () => {
    setShowSourceTypeModal(false);
    setEditingSourceType(null);
  };

  // The API refuses to delete a type parts still point at, so surface that message
  const handleDeleteSourceType = async () => {
    const target = sourceTypeDeleteTarget;
    if (!target) return;
    try {
      await partsAPI.deleteSourceType(target.id);
      toast.success("Source type deleted");
      setSourceTypes((prev) => prev.filter((type) => type.id !== target.id));
      if (activeTab === target.value) handleTabChange("all");
      setSourceTypeDeleteTarget(null);
      fetchReferenceData();
    } catch (err) {
      setSourceTypeDeleteTarget(null);
      setErrorPopup(
        err.response?.data || { message: "Failed to delete source type" },
      );
    }
  };

  // Adjust stock
  const handleAdjustStock = async (e) => {
    e.preventDefault();
    try {
      await partsAPI.adjustStock(selectedPart.id, stockForm);
      toast.success("Stock adjusted successfully!");
      closeStockModal();
      fetchParts();
      fetchReferenceData();
    } catch (err) {
      console.error("Error adjusting stock:", err);
      setErrorPopup(
        err.response?.data || { message: "Failed to adjust stock" },
      );
    }
  };

  useModalKeyboard(showModal, closeModal, handlePartFormSubmit);

  // Get stock status badge
  const getStockStatusBadge = (stock) => {
    const quantity = Number(stock);

    if (isNaN(quantity)) {
      return {
        class: "badge-secondary",
        text: "Unknown",
      };
    }

    if (quantity <= 0) {
      return {
        class: "badge-danger",
        text: "Out of Stock",
      };
    }

    if (quantity <= 10) {
      return {
        class: "badge-warning",
        text: "Low Stock",
      };
    }

    if (quantity <= 100) {
      return {
        class: "badge-success",
        text: "In Stock",
      };
    }

    return {
      class: "badge-info",
      text: "Overstocked",
    };
  };

  // Get source type badge — label and colour come from the configured list
  const getSourceTypeBadge = (sourceType) => {
    const index = sourceTypes.findIndex((type) => type.value === sourceType);
    if (index === -1) {
      return {
        class: "badge-secondary",
        text: sourceType
          ? String(sourceType).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : "—",
      };
    }
    return {
      class: SOURCE_BADGE_CLASSES[index % SOURCE_BADGE_CLASSES.length],
      text: sourceTypes[index].name,
    };
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `PKR ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const showHelp = (message) => {
    toast(message, { duration: 3000 });
  };

  const InfoLabel = ({ label, help }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      {help ? (
        <button
          type="button"
          onClick={() => showHelp(help)}
          aria-label={`Help: ${label}`}
          title="Help"
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#475569",
            fontSize: 12,
            lineHeight: "16px",
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          i
        </button>
      ) : null}
    </span>
  );

  const toNumber = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const partsColumns = [
    {
      header: (
        <input
          type="checkbox"
          checked={selectedIds.size === parts.length && parts.length > 0}
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
      header: "Part #",
      accessor: "part_number",
      render: (row) => (
        <strong className="part-number">{row.part_number}</strong>
      ),
    },
    {
      header: "Name",
      accessor: "name",
      render: (row) => (
        <div className="part-info">
          <span className="part-name">{row.name}</span>
          {row.brand && <span className="part-brand">{row.brand}</span>}
        </div>
      ),
    },
    ...(showField('classification') ? [{
      header: "Source",
      accessor: "source_type",
      render: (row) => {
        const badge = getSourceTypeBadge(row.source_type);
        return <span className={`badge ${badge.class}`}>{badge.text}</span>;
      },
    },
    { header: "Category", accessor: "category_name" }] : []),
    ...(showField('stock') ? [{
      header: "Stock",
      accessor: "current_stock",
      render: (row) => (
        <>
          <span className="stock-qty">{row.current_stock}</span>
          <span className="stock-unit"> {row.unit}</span>
        </>
      ),
    },
    {
      header: "Status",
      accessor: "stock_status",
      render: (row) => {
        const badge = getStockStatusBadge(row.current_stock);
        return <span className={`badge ${badge.class}`}>{badge.text}</span>;
      },
    }] : []),
    ...(canSeePurchasePrice && showField('purchase_price')
      ? [
          {
            header: "Purchase Price",
            accessor: "purchase_price",
            render: (row) => (
              <span className="price-cell">{formatCurrency(row.purchase_price)}</span>
            ),
          },
        ]
      : []),
    ...(showField('selling_price') ? [{
      header: "Selling Price",
      accessor: "selling_price",
      render: (row) => (
        <span className="price-cell">{formatCurrency(row.selling_price)}</span>
      ),
    }] : []),
    {
      header: "Actions",
      accessor: "actions",
      style: { width: "120px" },
      render: (row) => (
        <div className="action-group" onClick={(e) => e.stopPropagation()}>
          {canAdjustStock && (
            <button
              className="btn-icon btn-adjust"
              onClick={() => openStockModal(row)}
              title="Adjust Stock"
            >
              <Package size={16} />
            </button>
          )}
          {canGenerateBarcode && <BarcodeButton
            kind="part"
            id={row.id}
            code={row.barcode}
            label={row.name || row.part_name}
            subtitle={row.part_number || row.sku || ""}
          />}
          <ActionButtons
            onEdit={canEditPart ? () => openModal("edit", row) : null}
            onDelete={canDeletePart ? () => openDeleteConfirm(row) : null}
            title={row.part_number}
            showEdit={canEditPart}
            showDelete={canDeletePart}
          />
        </div>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <div className="parts-inventory-page">
      {/* Page Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>Parts Inventory</h1>
          <p className="subtitle">
            Manage vehicle parts from manufacturers and third-party suppliers
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
          {/* Straight to the counter screen for this side of the business. */}
          <a
            href="/parts-sales/barcode-scan"
            className="btn btn-secondary btn-create"
            title="Scan parts into a quotation, booking or sale"
          >
            <ScanLine size={18} style={{ marginRight: 6 }} />
            Scan
          </a>
          {/* Both create parts, so both need Create. */}
          {canImportParts && (
            <button
              type="button"
              className="btn btn-secondary btn-create"
              onClick={() => setShowBulkUpload(true)}
              title="Bulk upload parts (CSV / XLSX)"
            >
              <Upload size={18} style={{ marginRight: 6 }} />
              Upload
            </button>
          )}
          {canCreatePart && (
            <button
              className="btn btn-primary btn-create"
              onClick={() => openModal("create")}
            >
              <Plus size={18} />
              <span>Add Part</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-icon">
            <Package size={24} style={{ color: "#3b82f6" }} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.total_parts || 0}</span>
            <span className="stat-label">Total Parts</span>
          </div>
        </div>
        {(stats.by_source || []).map((source, index) => (
          <div className="stat-card stat-source" key={source.value}>
            <div className="stat-icon">
              <Package
                size={24}
                style={{ color: SOURCE_STAT_COLORS[index % SOURCE_STAT_COLORS.length] }}
              />
            </div>
            <div className="stat-content">
              <span className="stat-value">{source.count || 0}</span>
              <span className="stat-label">{source.name}</span>
            </div>
          </div>
        ))}
        <div className="stat-card stat-low-stock">
          <div className="stat-icon">
            <Package size={24} style={{ color: "#eab308" }} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.low_stock_count || 0}</span>
            <span className="stat-label">Low Stock</span>
          </div>
        </div>
        {/* Inventory value is stock × purchase price, so it follows the same
            rule as the price it is built from. */}
        {canSeePurchasePrice && (
          <div className="stat-card stat-value">
            <div className="stat-icon">
              <Package size={24} style={{ color: "#059669" }} />
            </div>
            <div className="stat-content">
              <span className="stat-value">
                {formatCurrency(stats.total_inventory_value || 0)}
              </span>
              <span className="stat-label">Inventory Value</span>
            </div>
          </div>
        )}
      </div>

      <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

      {/* Tabs — one per configured source type, plus the client's own additions */}
      <div className="tabs-container">
        <button
          className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => handleTabChange("all")}
        >
          All Parts
        </button>
        {/* Every source type renames inline; only dealer-added ones can be deleted. */}
        {sourceTypes.map((type) => (
          <div
            key={type.value}
            className={`tab-item ${activeTab === type.value ? "active" : ""}`}
          >
            <button
              type="button"
              className="tab-btn"
              onClick={() => handleTabChange(type.value)}
            >
              {type.name}
            </button>
            <span className="tab-item-actions">
              {canEditPart && (
                <button
                  type="button"
                  className="tab-item-action"
                  title={`Rename "${type.name}"`}
                  onClick={() => openSourceTypeEdit(type)}
                >
                  <Pencil size={13} />
                </button>
              )}
              {/* Built-ins are reported on across the system, so they rename but never delete */}
              {canDeletePart && !type.is_system && (
                <button
                  type="button"
                  className="tab-item-action tab-item-action-danger"
                  title={`Delete "${type.name}"`}
                  onClick={() => setSourceTypeDeleteTarget(type)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </span>
          </div>
        ))}
        {canCreatePart && (
          <button
            type="button"
            className="tab-btn tab-btn-add"
            onClick={() => {
              setEditingSourceType(null);
              setShowSourceTypeModal(true);
            }}
            title="Add a new source type"
          >
            <Plus size={14} />
            <span>Source Type</span>
          </button>
        )}
      </div>

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
            placeholder="Search by part number, name, brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          </div>
        </div>

        <div className="filter-field"><label>Category</label><SearchableSelect
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="filter-select"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </SearchableSelect></div>

        <div className="filter-field"><label>Stock</label><SearchableSelect
          value={stockFilter}
          onChange={(e) => {
            setStockFilter(e.target.value);
            setPage(1);
          }}
          className="filter-select"
        >
          {/* These values go straight to the API as `stockStatus`, so they are
              its vocabulary — the same words it returns in `stock_status` on
              every row. "low" and "out" matched no branch there, so those two
              options quietly filtered nothing and showed the whole list. */}
          <option value="">All Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="normal">Normal</option>
        </SearchableSelect></div>

        <div className="filter-field filter-field-actions">
        {(search || categoryFilter || stockFilter) && (
          <button
            type="button"
            className="btn btn-sm btn-outline filter-reset-btn"
            onClick={() => {
              setSearch("");
              setCategoryFilter("");
              setStockFilter("");
              setPage(1);
            }}
            title="Reset all filters"
          >
            Reset
          </button>
        )}

        <span className="results-count">{total} parts found</span>
        </div>
      </div>

      {/* Bulk Delete Bar */}
      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <span className="selection-count">{selectedIds.size} selected</span>
          <BarcodeBulkPrint kind="part" ids={Array.from(selectedIds)} />
          {canDeletePart && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setDeleteAllTarget(true)}
            >
              Delete Selected
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Deselect All
          </button>
        </div>
      )}

      {/* Parts Table */}
      <DataTable
        columns={partsColumns}
        data={parts}
        loading={loading}
        pagination={{ page, totalPages, total, limit }}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(nextLimit) => { setPage(1); setLimit(nextLimit); }}
        onRowClick={(row) => openModal("edit", row)}
        rowClassName={(row) =>
          row.stock_status === "out_of_stock" ? "row-warning" : ""
        }
      />

      {deleteAllTarget && (
        <ConfirmModal
          isOpen={true}
          title="Delete Selected Parts"
          message={`Are you sure you want to delete ${selectedIds.size} part(s)?`}
          confirmText={deletingAll ? "Deleting..." : "Delete All"}
          cancelText="Cancel"
          type="danger"
          onConfirm={handleBulkDelete}
          onCancel={() => setDeleteAllTarget(null)}
        />
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content modal-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{modalMode === "create" ? "Add New Part" : "Edit Part"}</h2>
              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </div>

            <form onSubmit={handlePartFormSubmit}>
              <div className="modal-body">
                <div className="form-section">
                  <h3>Part Information</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Part Number *"
                          help="Unique identifier for this part (e.g., OEM-TOY-001)."
                        />
                      </label>
                      <input
                        type="text"
                        name="partNumber"
                        className="form-input"
                        value={formData.partNumber}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., OEM-TOY-001"
                      />
                    </div>
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Name *"
                          help="Human-friendly name of the part (e.g., Oil Filter)."
                        />
                      </label>
                      <input
                        type="text"
                        name="name"
                        className="form-input"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        placeholder="Part name"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <div className="form-label-add">
                        <InfoLabel
                          label="Source Type *"
                          help="Where the part comes from. Manufacturer = OEM, 3rd Party = aftermarket. Add your own types with + Create Source Type."
                        />
                        {canCreateSourceType && partQuick('source_type') && (
                          <button
                            type="button"
                            className="label-add-link"
                            data-quick-create="source_type"
                            onClick={() => {
                              setEditingSourceType(null);
                              setShowSourceTypeModal(true);
                            }}
                          >
                            + Create Source Type
                          </button>
                        )}
                      </div>
                      <SearchableSelect
                        name="sourceType"
                        value={formData.sourceType}
                        onChange={handleInputChange}
                        required
                      >
                        {sourceTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.name}
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>
                    <div className="form-group">
                      <div className="form-label-add">
                        <InfoLabel
                          label="Category"
                          help="Optional grouping for reporting and filtering (e.g., Engine, Electrical)."
                        />
                        {canCreateVehicleMaster && partQuick('category') && (
                          <button
                            type="button"
                            className="label-add-link"
                            data-quick-create="category"
                            onClick={() => setShowCategoryModal(true)}
                          >
                            + Create Category
                          </button>
                        )}
                      </div>
                      <SearchableSelect
                        name="categoryId"
                        value={formData.categoryId}
                        onChange={handleInputChange}
                        options={categories}
                        placeholder="Select Category"
                        labelField="name"
                        valueField="id"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Brand"
                          help="Brand/manufacturer name printed on the part (optional)."
                        />
                      </label>
                      <input
                        type="text"
                        name="brand"
                        className="form-input"
                        value={formData.brand}
                        onChange={handleInputChange}
                        placeholder="Brand name"
                      />
                    </div>
                    <div className="form-group">
                      <div className="form-label-add">
                        <InfoLabel
                          label="Supplier"
                          help="Supplier you purchase this part from (optional)."
                        />
                        {canCreateVehicleMaster && partQuick('supplier') && (
                          <button
                            type="button"
                            className="label-add-link"
                            data-quick-create="supplier"
                            onClick={() => setShowSupplierModal(true)}
                          >
                            + Create Supplier
                          </button>
                        )}
                      </div>
                      <SearchableSelect
                        name="supplierId"
                        value={formData.supplierId}
                        onChange={handleInputChange}
                      >
                        <option value="">Select Supplier</option>
                        {suppliers.map((sup) => (
                          <option key={sup.id} value={sup.id}>
                            {sup.name}
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group full-width">
                      <label>
                        <InfoLabel
                          label="Description"
                          help="Optional notes/specs to help staff identify the exact part."
                        />
                      </label>
                      <textarea
                        name="description"
                        className="form-input"
                        value={formData.description}
                        onChange={handleInputChange}
                        placeholder="Part description..."
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Pricing</h3>
                  <div className="form-row">
                    {canSeePurchasePrice && (
                      <div className="form-group">
                        <label>
                          <InfoLabel
                            label="Purchase Price (PKR)"
                            help="Your cost price (used for inventory valuation and profit calculation). Only a Super Admin can see or change it."
                          />
                        </label>
                        <input
                          type="number" step="0.01"
                          name="purchasePrice"
                          className="form-input"
                          value={formData.purchasePrice}
                          onChange={handleInputChange}
                          min={0}
                        />
                      </div>
                    )}
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Selling Price (PKR) *"
                          help="Default selling price for invoices/job cards."
                        />
                      </label>
                      <input
                        type="number" step="0.01"
                        name="sellingPrice"
                        className="form-input"
                        value={formData.sellingPrice}
                        onChange={handleInputChange}
                        required
                        min={0}
                      />
                    </div>
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Unit"
                          help="How this part is counted (piece/set/pair/liter/kg)."
                        />
                      </label>
                      <SearchableSelect
                        name="unit"
                        value={formData.unit}
                        onChange={handleInputChange}
                      >
                        <option value="piece">Piece</option>
                        <option value="set">Set</option>
                        <option value="pair">Pair</option>
                        <option value="liter">Liter</option>
                        <option value="kg">Kilogram</option>
                      </SearchableSelect>
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Stock Levels</h3>
                  <div className="form-row">
                    {modalMode === "create" && (
                      <div className="form-group">
                        <label>
                          <InfoLabel
                            label="Initial Stock"
                            help="Starting quantity when you add this part."
                          />
                        </label>
                        <input
                          type="number"
                          step="any"
                          name="currentStock"
                          className="form-input"
                          value={formData.currentStock}
                          onChange={handleInputChange}
                          min={0}
                        />
                      </div>
                    )}
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Total Inventory"
                          help="Read-only preview of current total stock. Updates in real time as you change stock quantity."
                        />
                      </label>
                      <input
                        type="number"
                        value={toNumber(formData.currentStock, 0)}
                        disabled
                        style={{ background: "#f8fafc" }}
                      />
                    </div>
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Minimum Stock"
                          help="When stock goes below this, it will show as Low Stock."
                        />
                      </label>
                      <input
                        type="number"
                        step="any"
                        name="minimumStock"
                        className="form-input"
                        value={formData.minimumStock}
                        onChange={handleInputChange}
                        min={0}
                      />
                    </div>
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Maximum Stock"
                          help="Target maximum quantity (helps prevent overstocking)."
                        />
                      </label>
                      <input
                        type="number"
                        step="any"
                        name="maximumStock"
                        className="form-input"
                        value={formData.maximumStock}
                        onChange={handleInputChange}
                        min={0}
                      />
                    </div>
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Reorder Level"
                          help="When stock reaches this level, consider reordering."
                        />
                      </label>
                      <input
                        type="number"
                        step="any"
                        name="reorderLevel"
                        className="form-input"
                        value={formData.reorderLevel}
                        onChange={handleInputChange}
                        min={0}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>
                        <InfoLabel
                          label="Bin Location"
                          help="Optional warehouse shelf/bin location (e.g., A1-S2-R3)."
                        />
                      </label>
                      <input
                        type="text"
                        name="binLocation"
                        className="form-input"
                        value={formData.binLocation}
                        onChange={handleInputChange}
                        placeholder="e.g., A1-S2-R3"
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
                  {modalMode === "create" ? "Add Part" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showStockModal && selectedPart && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeStockModal();
          }}
        >
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Adjust Stock</h2>
              <button className="modal-close" onClick={closeStockModal}>
                ×
              </button>
            </div>

            <form ref={stockFormRef} onSubmit={handleAdjustStock}>
              <div className="modal-body">
                <div className="stock-info">
                  <p>
                    <strong>{selectedPart.name}</strong>
                  </p>
                  <p>
                    Current Stock:{" "}
                    <span className="stock-value">
                      {selectedPart.current_stock} {selectedPart.unit}
                    </span>
                  </p>
                </div>

                <div className="form-group">
                  <label>
                    <InfoLabel
                      label="Adjustment Type *"
                      help="Increase adds stock, Decrease subtracts stock, Set overwrites stock to an exact value."
                    />
                  </label>
                  {/* Only the movements this role is granted. Passed as
                      `options` rather than <option> children: the children form
                      would leave `false` holes for the withheld ones. */}
                  <SearchableSelect
                    name="adjustmentType"
                    value={stockForm.adjustmentType}
                    onChange={handleStockFormChange}
                    options={stockAdjustTypes}
                    labelField="label"
                    valueField="value"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>
                    <InfoLabel
                      label="Quantity *"
                      help="Enter quantity to increase/decrease, or the exact quantity when using Set."
                    />
                  </label>
                  <input
                    type="number"
                    step="any"
                    name="quantity"
                    className="form-input"
                    value={stockForm.quantity}
                    onChange={handleStockFormChange}
                    required
                    min={1}
                    placeholder="Enter quantity"
                  />
                </div>

                <div className="form-group">
                  <label>
                    <InfoLabel
                      label="New Total Inventory"
                      help="Live preview of the resulting stock after this adjustment."
                    />
                  </label>
                  <input
                    type="number"
                    disabled
                    style={{ background: "#f8fafc" }}
                    value={(() => {
                      const current = toNumber(selectedPart.current_stock, 0);
                      const qty = toNumber(stockForm.quantity, 0);
                      if (stockForm.adjustmentType === "increase")
                        return current + qty;
                      if (stockForm.adjustmentType === "decrease")
                        return Math.max(0, current - qty);
                      if (stockForm.adjustmentType === "set")
                        return Math.max(0, qty);
                      return current;
                    })()}
                  />
                </div>

                <div className="form-group">
                  <label>
                    <InfoLabel
                      label="Reason"
                      help="Optional note for auditing (e.g., Purchase received, Damaged, Stock count)."
                    />
                  </label>
                  <textarea
                    name="reason"
                    value={stockForm.reason}
                    onChange={handleStockFormChange}
                    placeholder="Reason for adjustment..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeStockModal}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Quick-Create Modal */}
      <CategoryFormModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onCategoryCreated={handleCategoryCreated}
      />

      {/* Bulk Upload */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        title="Bulk upload parts"
        description={`Import parts from CSV or XLSX. Only part_number and name are required — leave any other column blank and it is left alone. Re-uploading the same part_number updates that part.${
          canSeePurchasePrice ? "" : " purchase_price is Super Admin only and is ignored here."
        }`}
        templateType="parts"
        onCompleted={() => fetchParts()}
      />

      {/* Supplier Quick-Create Modal */}
      <SupplierFormModal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        onSupplierCreated={handleSupplierCreated}
      />

      {/* Source Type Create / Edit Modal */}
      <SourceTypeFormModal
        isOpen={showSourceTypeModal}
        onClose={closeSourceTypeModal}
        sourceType={editingSourceType}
        onSourceTypeCreated={handleSourceTypeCreated}
        onSourceTypeUpdated={handleSourceTypeUpdated}
      />

      {/* Confirm Delete Source Type */}
      <ConfirmModal
        isOpen={Boolean(sourceTypeDeleteTarget)}
        title="Delete Source Type"
        message={`Delete the source type "${sourceTypeDeleteTarget?.name}"? Its tab is removed from the parts list. Parts still using it must be moved to another source type first.`}
        onConfirm={handleDeleteSourceType}
        onCancel={() => setSourceTypeDeleteTarget(null)}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={showConfirmDelete}
        title="Delete Part"
        message={`Are you sure you want to delete part "${deleteTarget?.part_number}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setShowConfirmDelete(false);
          setDeleteTarget(null);
        }}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};

export default PartsInventory;
