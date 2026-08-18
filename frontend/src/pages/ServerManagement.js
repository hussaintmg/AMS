import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import * as Icons from "lucide-react";
import defaultPages from "../constants/pages";
import { useServerManagement } from "../context/ServerManagementContext";
import { useBranding } from "../context/BrandingContext";
import UserFormModal from "../components/users/UserFormModal";
import RoleFormModal from "../components/roles/rolesFormModel";
import useModalKeyboard from "../hooks/useModalKeyboard";
import FilterBar, {
  SearchInput,
  ResetFiltersButton,
} from "../components/filters/FilterBar";
import { serverManagementAPI, adminAPI, customerRoleConfigAPI, employeeRoleConfigAPI, warehouseManagerRolesAPI, serviceAdvisorRolesAPI, modulesAPI } from "../services/api";
import ToggleSwitch from "../components/ToggleSwitch";
import { useAuth } from "../context/AuthContext";
import { showApiSuccess, showApiError } from "../utils/toastResponse";
import "../styles/serverManagement.css";
import "../styles/filters.css";

const tabs = [
  "Frontend Management",
  "Branding",
  "Roles Permissions",
  "User Permissions",
  "Log Permissions",
  "Role Jobs",
  "Role Usage",
  // Optional modules: the custom (free-text) quotation / invoice / booking
  // screens, each behind its own switch.
  "Custom",
];
const assetFields = [
  ["favicon", "Favicon"],
  ["sidebarLogo", "Sidebar Logo"],
  ["loginLogo", "Login Logo"],
  ["loadingLogo", "Loading Logo"],
];
const iconNames = Object.keys(Icons)
  .filter(
    (name) =>
      !name.endsWith("Icon") &&
      /^[A-Z]/.test(name) &&
      typeof Icons[name]?.render === "function",
  )
  .sort();
const DEFAULT_ICON = "FileText";
const sidebarGradientPresets = [
  ["Midnight", "#1e3a5f", "#0f172a"],
  ["Ocean", "#075985", "#1d4ed8"],
  ["Emerald", "#064e3b", "#047857"],
  ["Purple", "#3b0764", "#6d28d9"],
  ["Graphite", "#111827", "#374151"],
];
const sidebarPositions = ["left top", "center top", "right top", "left center", "center center", "right center", "left bottom", "center bottom", "right bottom"];

const blankRole = {
  name: "",
  displayName: "",
  description: "",
  permissions: [],
};

const blankPage = {
  name: "",
  label: "",
  path: "",
  module: "",
  group: "",
  icon: DEFAULT_ICON,
  description: "",
  sortOrder: 0,
  isActive: true,
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const getRoleId = (role) => role?._id || role?.id;
const pageKey = (page) => page.name || page.key || page.path;
const viewPermission = (page, enabled) => ({
  pageKey: pageKey(page),
  path: page.path,
  module: page.module || page.group || "",
  canView: enabled,
  isActive: true,
});

const emptyLogDraft = {
  viewType: "own",
  selectedUserIds: [],
  selectedRoleIds: [],
};

const normalizeLogDraft = (permissions, fallbackViewType = "own") => {
  if (Array.isArray(permissions)) {
    const active = permissions.filter(
      (permission) => permission?.isActive !== false,
    );
    const allPerm = active.find((permission) => permission.type === "all");
    const userPerms = active.filter((permission) => permission.type === "user");
    const rolePerms = active.filter((permission) => permission.type === "role");
    return {
      viewType: allPerm
        ? "all"
        : userPerms.length
          ? "users"
          : rolePerms.length
            ? "roles"
            : fallbackViewType,
      selectedUserIds: userPerms
        .map((permission) => String(permission.refId || ""))
        .filter(Boolean),
      selectedRoleIds: rolePerms
        .map((permission) => String(permission.refId || ""))
        .filter(Boolean),
    };
  }

  const mode = permissions?.mode;
  return {
    viewType:
      mode === "all"
        ? "all"
        : mode === "selected_users"
          ? "users"
          : mode === "selected_roles"
            ? "roles"
            : fallbackViewType,
    selectedUserIds: Array.isArray(permissions?.users)
      ? permissions.users
          .map((item) => String(item?._id || item || ""))
          .filter(Boolean)
      : [],
    selectedRoleIds: Array.isArray(permissions?.roles)
      ? permissions.roles
          .map((item) => String(item?._id || item || ""))
          .filter(Boolean)
      : [],
  };
};

const buildLogPermissionsConfig = (draft) => {
  if (draft.viewType === "all") return { mode: "all", users: [], roles: [] };
  if (draft.viewType === "users")
    return { mode: "selected_users", users: draft.selectedUserIds, roles: [] };
  if (draft.viewType === "roles")
    return { mode: "selected_roles", users: [], roles: draft.selectedRoleIds };
  return { mode: "own", users: [], roles: [] };
};

const hasView = (permissions = [], page) =>
  asArray(permissions).some(
    (permission) =>
      (permission.canView === true || permission.actions?.view === true) &&
      (permission.pageKey === pageKey(page) || permission.path === page.path),
  );

function IconPicker({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const pickerRef = useRef(null);
  const menuRef = useRef(null);
  const iconExists = Boolean(
    value && Icons[value] && typeof Icons[value]?.render === "function",
  );
  const SelectedIcon = iconExists ? Icons[value] : Icons[DEFAULT_ICON];
  const hasDropdown = iconNames.length > 0;
  const filtered = iconNames
    .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80);

  const computeMenuStyle = () => {
    if (!pickerRef.current) return;
    const rect = pickerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dh = 320;
    return {
      position: "fixed",
      left: rect.left + "px",
      top: (spaceBelow >= dh + 6 ? rect.bottom + 6 : rect.top - dh - 6) + "px",
      width: Math.max(rect.width, 220) + "px",
      zIndex: 9999,
      maxHeight: dh + "px",
      overflowY: "auto",
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: "8px",
      boxShadow: "0 12px 24px rgba(15,23,42,0.14)",
      padding: "10px",
    };
  };

  const openMenu = () => {
    if (!pickerRef.current || !hasDropdown) return;
    setMenuStyle(computeMenuStyle());
    setOpen(true);
    setQuery("");
  };

  const closeMenu = () => {
    setOpen(false);
    setQuery("");
  };

  const repositionMenu = () => {
    if (!open || !pickerRef.current) return;
    setMenuStyle(computeMenuStyle());
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        pickerRef.current &&
        !pickerRef.current.contains(e.target)
      ) {
        closeMenu();
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", repositionMenu, true);
    window.addEventListener("resize", repositionMenu);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", repositionMenu, true);
      window.removeEventListener("resize", repositionMenu);
    };
  }, [open]);

  const selectIcon = (name) => {
    onChange(name);
    closeMenu();
  };

  return (
    <div ref={pickerRef} className="sm-icon-picker">
      <div className="sm-icon-trigger" onClick={openMenu}>
        <SelectedIcon size={17} />
        <input
          className="form-input sm-icon-input"
          value={value || ""}
          placeholder="Example: LayoutDashboard"
          onChange={(event) => onChange(event.target.value)}
          onFocus={openMenu}
        />
      </div>
      {!iconExists && value && (
        <small className="sm-icon-warning">
          Icon not found. Default icon will be used.
        </small>
      )}
      {open &&
        createPortal(
          <div ref={menuRef} className="sm-icon-dropdown" style={menuStyle}>
            <input
              className="form-input"
              value={query}
              placeholder="Search icons..."
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              data-enter-submit="false"
              style={{ marginBottom: "8px" }}
            />
            <div className="sm-icon-grid">
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: "10px",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  No icons found
                </div>
              ) : (
                filtered.map((name) => {
                  const Icon = Icons[name];
                  return (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      onClick={() => selectIcon(name)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px",
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        borderRadius: "6px",
                        width: "100%",
                      }}
                    >
                      <Icon size={16} />
                      <span style={{ fontSize: "13px" }}>{name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ServerManagement() {
  const {
    pages: pageList,
    roles: roleList,
    users: userList,
    activePages,
    loading: ctxLoading,
    error: ctxError,
    loadData,
    syncPages,
    createPage,
    saveSidebar: ctxSaveSidebar,
    updatePagesList,
    createRole,
    updateRole,
    createUser: ctxCreateUser,
    updateUserPermissions: ctxUpdateUserPermissions,
    updateRolePermissions: ctxUpdateRolePermissions,
    refreshSidebar,
  } = useServerManagement();

  const {
    branding,
    assets: brandingAssets,
    saveBranding,
    uploadAssets,
    deleteAsset,
    replaceAsset,
    refreshBranding,
    setAssets: setBrandingAssets,
    applyBranding,
  } = useBranding();

  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [assets, setAssets] = useState([]);
  const [brandingDraft, setBrandingDraft] = useState(branding);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleDraft, setRoleDraft] = useState(blankRole);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userPermissionDraft, setUserPermissionDraft] = useState([]);
  const [showPageModal, setShowPageModal] = useState(false);
  const [pageDraft, setPageDraft] = useState(blankPage);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userModalLoading, setUserModalLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [rolePageSearch, setRolePageSearch] = useState("");
  const [brandingAssetSearch, setBrandingAssetSearch] = useState("");
  const [brandingFormatFilter, setBrandingFormatFilter] = useState("");
  const [selectedLogRoleId, setSelectedLogRoleId] = useState("");
  const [logRoleDraft, setLogRoleDraft] = useState(emptyLogDraft);
  const [selectedLogUserId, setSelectedLogUserId] = useState("");
  const [logUserSource, setLogUserSource] = useState("role");
  const [logUserDraft, setLogUserDraft] = useState(emptyLogDraft);
  const [logUserSearch, setLogUserSearch] = useState("");
  const [leadAssignmentRoleIds, setLeadAssignmentRoleIds] = useState([]);
  const [leadAssignmentSelectedRoles, setLeadAssignmentSelectedRoles] =
    useState([]);
  const [leadAssignmentSaving, setLeadAssignmentSaving] = useState(false);
  const [customerConfigActiveRoleId, setCustomerConfigActiveRoleId] = useState('');
  const [customerConfigAvailableRoleIds, setCustomerConfigAvailableRoleIds] = useState([]);
  const [customerConfigSaving, setCustomerConfigSaving] = useState(false);
  const [employeeConfigActiveRoleId, setEmployeeConfigActiveRoleId] = useState('');
  const [employeeConfigSaving, setEmployeeConfigSaving] = useState(false);
  const [warehouseManagerRoleIds, setWarehouseManagerRoleIds] = useState([]);
  const [warehouseManagerSaving, setWarehouseManagerSaving] = useState(false);
  const [serviceAdvisorRoleIds, setServiceAdvisorRoleIds] = useState([]);
  const [serviceAdvisorSaving, setServiceAdvisorSaving] = useState(false);
  const [selectedJobRoleId, setSelectedJobRoleId] = useState('');
  const [roleJobs, setRoleJobs] = useState([]);
  const [roleJobsLoading, setRoleJobsLoading] = useState(false);
  const [roleJobsSaving, setRoleJobsSaving] = useState(false);
  // Which columns each page can restrict, and which actions it actually has,
  // both as published by the API.
  const [fieldCatalog, setFieldCatalog] = useState({});
  const [pageCapabilities, setPageCapabilities] = useState({});
  const [actionLabels, setActionLabels] = useState({});
  // The screen catalog: table columns, drawer rows and buttons, form
  // shortcuts and dropdowns per page (constants/pageCatalog.js on the server).
  const [pageCatalog, setPageCatalog] = useState({});
  const [dropdownModes, setDropdownModes] = useState(['all', 'own', 'selected_roles', 'selected_users', 'none']);
  const [dropdownModeLabels, setDropdownModeLabels] = useState({});
  // Which of a card's screen sections are unfolded: "pageKey:section".
  const [openJobSections, setOpenJobSections] = useState({});
  // Optional modules (Custom tab).
  const [modules, setModules] = useState([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const { refreshUser } = useAuth();
  // Every page is listed now, so the screen needs a way to narrow it down.
  const [roleJobSearch, setRoleJobSearch] = useState('');
  const [roleJobShowAll, setRoleJobShowAll] = useState(false);
  const [showLeadAssignmentRoleModal, setShowLeadAssignmentRoleModal] = useState(false);
  const [leadAssignmentRoleModalLoading, setLeadAssignmentRoleModalLoading] = useState(false);
  const [logRoleSearch, setLogRoleSearch] = useState("");
  const [showLogUserPicker, setShowLogUserPicker] = useState(false);
  const [showLogRolePicker, setShowLogRolePicker] = useState(false);
  const [assetDeleteTarget, setAssetDeleteTarget] = useState(null);
  const [activeLogPanel, setActiveLogPanel] = useState("role");
  const [savingSidebar, setSavingSidebar] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingUserPermissions, setSavingUserPermissions] = useState(false);
  const [savingLogRolePermissions, setSavingLogRolePermissions] =
    useState(false);
  const [savingLogUserPermissions, setSavingLogUserPermissions] =
    useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [savingAssetDelete, setSavingAssetDelete] = useState(false);
  const savingRef = useRef({});

  const pagesArr = asArray(pages);
  const roleArr = asArray(roles);
  const userArr = asArray(users);
  const assetArr = asArray(assets);

  // Data-visibility pickers never offer the super admin: that account sees
  // everything by definition, so granting another role sight of its data would
  // quietly hand over the whole system.
  const isSuperAdminRole = (role) =>
    String(role?.name || "").toLowerCase().replace(/[\s-]+/g, "_") === "super_admin";
  const scopeRoleOptions = useMemo(
    () => roleArr.filter((role) => !isSuperAdminRole(role)),
    [roleArr],
  );
  const scopeUserOptions = useMemo(
    () => userArr.filter((person) => !isSuperAdminRole(person?.role) && !person?.isSuperAdmin),
    [userArr],
  );
  const activePagesArr = useMemo(
    () => pagesArr.filter((page) => page.isActive !== false),
    [pagesArr],
  );

  const filteredUsers = useMemo(() => {
    let result = userArr;
    const q = userSearch.toLowerCase().trim();
    if (q) {
      result = result.filter((u) => {
        const name = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
        const email = (u.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }
    if (userRoleFilter) {
      result = result.filter((u) => {
        const roleId = u.role?._id || u.role?.id || u.role;
        return String(roleId) === String(userRoleFilter);
      });
    }
    return result;
  }, [userArr, userSearch, userRoleFilter]);

  const filteredActivePages = useMemo(() => {
    const q = rolePageSearch.toLowerCase().trim();
    if (!q) return activePagesArr;
    return activePagesArr.filter((page) => {
      const label = (page.label || "").toLowerCase();
      const name = (page.name || "").toLowerCase();
      const path = (page.path || "").toLowerCase();
      const module = (page.module || "").toLowerCase();
      const group = (page.group || "").toLowerCase();
      return (
        label.includes(q) ||
        name.includes(q) ||
        path.includes(q) ||
        module.includes(q) ||
        group.includes(q)
      );
    });
  }, [activePagesArr, rolePageSearch]);

  const brandingFormats = useMemo(() => {
    const formats = new Set();
    assetArr.forEach((a) => {
      const name = a.originalName || a.fileName || "";
      const ext = name.split(".").pop()?.toLowerCase();
      if (ext) formats.add(ext);
    });
    return Array.from(formats).sort();
  }, [assetArr]);

  const filteredAssets = useMemo(() => {
    let result = assetArr;
    const sq = brandingAssetSearch.toLowerCase().trim();
    if (sq) {
      result = result.filter((a) => {
        const fileName = (a.originalName || a.fileName || "").toLowerCase();
        const placement = (a.placement || "").toLowerCase();
        const uploadedBy = (
          a.uploadedBy?.name ||
          a.uploadedBy ||
          ""
        ).toLowerCase();
        return (
          fileName.includes(sq) ||
          placement.includes(sq) ||
          uploadedBy.includes(sq)
        );
      });
    }
    if (brandingFormatFilter) {
      result = result.filter((a) => {
        const name = a.originalName || a.fileName || "";
        const ext = name.split(".").pop()?.toLowerCase();
        return ext === brandingFormatFilter;
      });
    }
    return result;
  }, [assetArr, brandingAssetSearch, brandingFormatFilter]);

  const selectedRole = roleArr.find(
    (role) => getRoleId(role) === selectedRoleId,
  );
  const selectedRoleIsSuperAdmin = selectedRole?.name === "super_admin";
  const selectedUser = userArr.find(
    (user) => (user._id || user.id) === selectedUserId,
  );
  const selectedUserIsSuperAdmin =
    selectedUser?.role?.name === "super_admin" ||
    selectedUser?.role === "super_admin";

  const performLoadData = async () => {
    setLoading(true);
    try {
      await loadData();
      setPages(pageList);
      setRoles(roleList);
      setUsers(userList);
      const { data: lar } = await serverManagementAPI.getLeadAssignmentRoles();
      if (lar?.data?.roles) setLeadAssignmentRoleIds(lar.data.roles);

      const { data: crc } = await customerRoleConfigAPI.get();
      if (crc?.data) {
        setCustomerConfigActiveRoleId(crc.data.activeRoleId || '');
        setCustomerConfigAvailableRoleIds(Array.isArray(crc.data.availableRoleIds) ? crc.data.availableRoleIds : []);
      }
      const { data: erc } = await employeeRoleConfigAPI.get();
      if (erc?.data) setEmployeeConfigActiveRoleId(erc.data.activeRoleId || '');

      const { data: wmr } = await warehouseManagerRolesAPI.get();
      if (Array.isArray(wmr?.data?.roles)) setWarehouseManagerRoleIds(wmr.data.roles);

      const { data: sar } = await serviceAdvisorRolesAPI.get();
      if (Array.isArray(sar?.data?.roles)) setServiceAdvisorRoleIds(sar.data.roles);
    } catch (error) {
      showApiError(error, "Failed to load server management data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    performLoadData();
  }, []);

  useEffect(() => {
    setBrandingDraft(branding);
    setAssets(brandingAssets);
  }, [branding, brandingAssets]);

  useEffect(() => {
    setPages(pageList);
  }, [pageList]);

  useEffect(() => {
    setRoles(roleList);
  }, [roleList]);

  useEffect(() => {
    setUsers(userList);
  }, [userList]);

  const updatePage = (index, field, value) => {
    setPages((current) =>
      asArray(current).map((page, pageIndex) =>
        pageIndex === index ? { ...page, [field]: value } : page,
      ),
    );
  };

  /**
   * Re-sequence the sort numbers 0…n-1 in list order. Called after every
   * move, insert or typed number, so the Sort column always reads as the
   * sidebar will show it and no two pages can share a number.
   */
  const renumber = (list) => list.map((page, index) => (page.sortOrder === index ? page : { ...page, sortOrder: index }));

  /** Move the page at `from` to sit at `to` (both list indexes), then renumber. */
  const movePage = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    setPages((current) => {
      const list = asArray(current).slice();
      if (from >= list.length || to >= list.length) return current;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return renumber(list);
    });
  };

  /**
   * A typed sort number moves the row to that position (clamped) rather than
   * storing a free number that could collide with another row.
   */
  const setSortNumber = (index, raw) => {
    const target = Math.max(0, Math.min(pagesArr.length - 1, Number(raw) || 0));
    movePage(index, target);
  };

  // ── Drag & drop rows ────────────────────────────────────────────────────
  const [dragIndex, setDragIndex] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { index, edge: 'before'|'after' }
  const dragRow = (index) => ({
    draggable: true,
    onDragStart: (event) => { setDragIndex(index); event.dataTransfer.effectAllowed = 'move'; try { event.dataTransfer.setData('text/plain', String(index)); } catch { /* IE */ } },
    onDragEnd: () => { setDragIndex(null); setDropTarget(null); },
    onDragOver: (event) => {
      if (dragIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      const edge = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
      if (dropTarget?.index !== index || dropTarget?.edge !== edge) setDropTarget({ index, edge });
    },
    onDrop: (event) => {
      event.preventDefault();
      if (dragIndex === null) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const edge = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
      let to = edge === 'before' ? index : index + 1;
      if (dragIndex < to) to -= 1;
      movePage(dragIndex, to);
      setDragIndex(null); setDropTarget(null);
    },
  });
  const dropClass = (index) => (dropTarget?.index === index ? ` sm-drop-${dropTarget.edge}` : '') + (dragIndex === index ? ' sm-dragging' : '');

  const openPageModal = (position = pagesArr.length, neighbour = null) => {
    // "+ Add page here" between two rows: the new page lands at that position
    // and inherits the group of the row above, so it files itself sensibly.
    setPageDraft({ ...blankPage, sortOrder: position, group: neighbour?.group || '', module: neighbour?.module || neighbour?.group || '' });
    setShowPageModal(true);
  };

  const saveNewPage = async (event) => {
    event?.preventDefault?.();
    if (savingRef.current.page) return;
    if (!pageDraft.name || !pageDraft.label || !pageDraft.path) {
      toast.error("Name, label and path are required");
      return;
    }
    savingRef.current.page = true;
    setSavingPage(true);
    try {
      await createPage(pageDraft);
      setShowPageModal(false);
      setPageDraft(blankPage);
    } finally {
      savingRef.current.page = false;
      setSavingPage(false);
    }
  };

  const handleCreateUserFromModal = async (formData) => {
    setUserModalLoading(true);
    const result = await ctxCreateUser(formData);
    if (result.success) {
      setShowUserModal(false);
    }
    setUserModalLoading(false);
  };

  const saveSidebar = async (event) => {
    event?.preventDefault?.();
    if (savingRef.current.sidebar) return;
    savingRef.current.sidebar = true;
    setSavingSidebar(true);
    try {
      await ctxSaveSidebar(pagesArr);
    } finally {
      savingRef.current.sidebar = false;
      setSavingSidebar(false);
    }
  };

  const handleUploadAssets = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const result = await uploadAssets(files);
    if (result.success) {
      setAssets((prev) => [...result.assets, ...prev]);
    }
    event.target.value = "";
  };

  const handleUploadSidebarBackground = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const result = await uploadAssets(files.slice(0, 1));
    if (result.success && result.assets?.[0]) {
      setAssets((prev) => [...result.assets, ...prev]);
      setBrandingDraft((current) => ({ ...current, sidebarBackgroundImage: result.assets[0], sidebarBackgroundType: "image" }));
    }
  };

  const handleSaveBranding = async (event) => {
    event?.preventDefault?.();
    if (savingRef.current.branding) return;
    savingRef.current.branding = true;
    setSavingBranding(true);
    try {
      const result = await saveBranding(brandingDraft);
      if (result.success) {
        setAssets(result.data.assets);
        setBrandingDraft(result.data.setting);
        await refreshBranding();
        window.dispatchEvent(new Event("ams:sidebar-refresh"));
      }
    } finally {
      savingRef.current.branding = false;
      setSavingBranding(false);
    }
  };

  const saveFrontendManagement = async (event) => {
    event?.preventDefault?.();
    await saveSidebar(event);
    await handleSaveBranding(event);
  };

  const confirmDeleteAsset = async () => {
    if (savingRef.current.assetDelete) return;
    if (!assetDeleteTarget?._id) return;
    savingRef.current.assetDelete = true;
    setSavingAssetDelete(true);
    try {
      const result = await deleteAsset(assetDeleteTarget._id);
      if (result.success) {
        await refreshBranding();
        window.dispatchEvent(new Event("ams:sidebar-refresh"));
      }
      setAssetDeleteTarget(null);
    } finally {
      savingRef.current.assetDelete = false;
      setSavingAssetDelete(false);
    }
  };

  const handleReplaceAssetFile = async (asset, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !asset?._id) return;
    const result = await replaceAsset(asset._id, file);
    if (result.success) {
      await refreshBranding();
      window.dispatchEvent(new Event("ams:sidebar-refresh"));
    }
  };

  const chooseAsset = (field, assetId) => {
    const asset = assetArr.find((item) => item._id === assetId) || null;
    setBrandingDraft((current) => ({ ...current, [field]: asset }));
  };

  const startCreateRole = () => {
    setSelectedRoleId("");
    setRoleDraft({
      ...blankRole,
      permissions: activePagesArr.map((page) => viewPermission(page, false)),
    });
  };

  const selectRole = (roleId) => {
    const role = roleArr.find((item) => getRoleId(item) === roleId);
    setSelectedRoleId(roleId);
    setRoleDraft(
      role
        ? {
            ...role,
            permissions: activePagesArr.map((page) =>
              viewPermission(page, hasView(role.permissions, page)),
            ),
          }
        : blankRole,
    );
  };

  const toggleRolePage = (page, checked) => {
    setRoleDraft((current) => ({
      ...current,
      permissions: activePagesArr.map((item) =>
        item.path === page.path
          ? viewPermission(item, checked)
          : viewPermission(item, hasView(current.permissions, item)),
      ),
    }));
  };

  const setAllRolePages = (enabled) => {
    setRoleDraft((current) => ({
      ...current,
      permissions: activePagesArr.map((page) => viewPermission(page, enabled)),
    }));
  };

  const saveRole = async (event) => {
    event?.preventDefault?.();
    if (savingRef.current.role) return;
    if (!roleDraft.displayName || (!selectedRoleId && !roleDraft.name)) {
      toast.error("Role name and display name are required");
      return;
    }

    const payload = {
      ...roleDraft,
      permissions: activePagesArr.map((page) =>
        viewPermission(page, hasView(roleDraft.permissions, page)),
      ),
    };

    savingRef.current.role = true;
    setSavingRole(true);
    try {
      if (selectedRoleId) {
        await updateRole(payload);
      } else {
        await createRole(payload);
      }
    } finally {
      savingRef.current.role = false;
      setSavingRole(false);
    }
  };

  const selectUser = (userId) => {
    const user = userArr.find((item) => (item._id || item.id) === userId);
    setSelectedUserId(userId);
    const userPerms = user?.customPermissions || [];
    setUserPermissionDraft(
      activePagesArr.map((page) =>
        viewPermission(page, hasView(userPerms, page)),
      ),
    );
  };

  const toggleUserPage = (page, checked) => {
    setUserPermissionDraft((current) =>
      activePagesArr.map((item) =>
        item.path === page.path
          ? viewPermission(item, checked)
          : viewPermission(item, hasView(current, item)),
      ),
    );
  };

  const setAllUserPages = (enabled) => {
    setUserPermissionDraft(
      activePagesArr.map((page) => viewPermission(page, enabled)),
    );
  };

  const saveUserPermissions = async (event) => {
    event?.preventDefault?.();
    if (savingRef.current.userPermissions) return;
    if (!selectedUserId) return;
    savingRef.current.userPermissions = true;
    setSavingUserPermissions(true);
    try {
      await ctxUpdateUserPermissions(selectedUserId, userPermissionDraft);
    } finally {
      savingRef.current.userPermissions = false;
      setSavingUserPermissions(false);
    }
  };

  const saveRolePermissions = async (event) => {
    event?.preventDefault?.();
    if (!selectedRoleId || selectedRoleIsSuperAdmin) return;
    const perms = activePagesArr.map((page) =>
      viewPermission(page, hasView(roleDraft.permissions, page)),
    );
    await ctxUpdateRolePermissions(selectedRoleId, perms);
  };

  const isAnySectionSaving =
    savingSidebar ||
    savingBranding ||
    savingRole ||
    savingUserPermissions ||
    savingLogRolePermissions ||
    savingLogUserPermissions ||
    savingPage ||
    savingAssetDelete ||
    userModalLoading ||
    loading;

  const isEnterSaveIgnoredTarget = (target) => {
    if (!target) return false;
    if (target.tagName === "TEXTAREA") return true;
    if (target.type === "file") return true;
    if (target.closest?.(".filter-bar")) return true;
    if (target.closest?.(".sm-picker-dropdown")) return true;
    if (target.closest?.(".sm-icon-dropdown")) return true;
    if (target.closest?.(".ss-portal-dropdown")) return true;
    if (target.closest?.(".search-dropdown")) return true;
    if (target.closest?.('[data-enter-submit="false"]')) return true;
    if (target.closest?.("[data-no-enter-submit]")) return true;
    return false;
  };

  const isDropdownOpen = () =>
    Boolean(
      document.querySelector(
        ".sm-picker-dropdown, .sm-icon-dropdown, .ss-portal-dropdown, .search-dropdown",
      ),
    );

  const renderPages = () => (
    <form className="sm-panel" onSubmit={saveFrontendManagement}>
      <div className="sm-panel-header">
        <div>
          <h2>Frontend Management</h2>
          <p>Mongo Pages are the runtime source for the sidebar.</p>
        </div>
        <div className="sm-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => openPageModal()}
          >
            Add Page
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={savingSidebar}
          >
            Save Frontend
          </button>
        </div>
      </div>
      <p className="sm-pages-hint">Drag a row by its handle to move it up or down. Hover between two rows for “+ Add page here”. Sort numbers renumber themselves — save to apply.</p>
      <div className="sm-table-wrapper sm-table-desktop">
        <table className="sm-table sm-pages-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>Visible</th>
              <th>Label</th>
              <th>Path</th>
              <th>Group</th>
              <th>Icon</th>
              <th>Sort</th>
            </tr>
          </thead>
          <tbody>
            {pagesArr.map((page, index) => (<React.Fragment key={page._id || page.path}>
              {/* Insert affordance above this row (hover reveals it). */}
              <tr className="sm-insert-row" onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setDropTarget({ index, edge: 'before' }); } }} onDrop={(e) => { e.preventDefault(); if (dragIndex === null) return; let to = index; if (dragIndex < to) to -= 1; movePage(dragIndex, to); setDragIndex(null); setDropTarget(null); }}>
                <td colSpan={7}>
                  <div className={`sm-insert-line${dropTarget?.index === index && dropTarget?.edge === 'before' ? ' sm-insert-active' : ''}`}>
                    <button type="button" className="sm-insert-btn" onClick={() => openPageModal(index, pagesArr[index - 1] || page)} title={`Insert a page at position ${index}`}>+ Add page here</button>
                  </div>
                </td>
              </tr>
              <tr className={`sm-page-row${dropClass(index)}`} {...dragRow(index)}>
                <td className="sm-drag-cell" title="Drag to reorder">
                  <span className="sm-drag-handle" aria-label="Drag to reorder">⋮⋮</span>
                  <span className="sm-move-btns">
                    <button type="button" className="sm-move-btn" onClick={() => movePage(index, index - 1)} disabled={index === 0} title="Move up">▲</button>
                    <button type="button" className="sm-move-btn" onClick={() => movePage(index, index + 1)} disabled={index === pagesArr.length - 1} title="Move down">▼</button>
                  </span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={page.isActive !== false}
                    onChange={(event) =>
                      updatePage(index, "isActive", event.target.checked)
                    }
                  />
                </td>
                <td>
                  <input
                    className="form-input"
                    value={page.label || ""}
                    onChange={(event) =>
                      updatePage(index, "label", event.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className="form-input"
                    value={page.path || ""}
                    onChange={(event) =>
                      updatePage(index, "path", event.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className="form-input"
                    value={page.group || ""}
                    onChange={(event) =>
                      updatePage(index, "group", event.target.value)
                    }
                  />
                </td>
                <td className="sm-icon-cell">
                  <IconPicker
                    value={page.icon}
                    onChange={(value) => updatePage(index, "icon", value)}
                  />
                </td>
                <td>
                  <input
                    className="form-input sm-sort-input"
                    type="number"
                    min="0"
                    max={Math.max(0, pagesArr.length - 1)}
                    value={index}
                    title="Type a position; the row moves there and everything renumbers"
                    onChange={(event) => setSortNumber(index, event.target.value)}
                  />
                </td>
              </tr>
            </React.Fragment>))}
            {/* Insert affordance after the last row. */}
            <tr className="sm-insert-row" onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setDropTarget({ index: pagesArr.length, edge: 'before' }); } }} onDrop={(e) => { e.preventDefault(); if (dragIndex === null) return; movePage(dragIndex, pagesArr.length - 1); setDragIndex(null); setDropTarget(null); }}>
              <td colSpan={7}>
                <div className={`sm-insert-line${dropTarget?.index === pagesArr.length ? ' sm-insert-active' : ''}`}>
                  <button type="button" className="sm-insert-btn" onClick={() => openPageModal(pagesArr.length, pagesArr[pagesArr.length - 1])}>+ Add page at the end</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="sm-cards-mobile">
        {pagesArr.map((page, index) => (
          <div key={page._id || page.path} className="sm-card">
            <div className="sm-card-row">
              <label className="sm-card-toggle">
                <input
                  type="checkbox"
                  checked={page.isActive !== false}
                  onChange={(event) =>
                    updatePage(index, "isActive", event.target.checked)
                  }
                />
                Visible
              </label>
              <span className="sm-card-sort">
                Sort: {index}
                <button type="button" className="sm-move-btn" onClick={() => movePage(index, index - 1)} disabled={index === 0} title="Move up">▲</button>
                <button type="button" className="sm-move-btn" onClick={() => movePage(index, index + 1)} disabled={index === pagesArr.length - 1} title="Move down">▼</button>
              </span>
            </div>
            <div className="sm-card-field">
              <span className="sm-card-label">Label</span>
              <input
                className="form-input"
                value={page.label || ""}
                onChange={(event) =>
                  updatePage(index, "label", event.target.value)
                }
              />
            </div>
            <div className="sm-card-field">
              <span className="sm-card-label">Path</span>
              <input
                className="form-input"
                value={page.path || ""}
                onChange={(event) =>
                  updatePage(index, "path", event.target.value)
                }
              />
            </div>
            <div className="sm-card-field">
              <span className="sm-card-label">Group</span>
              <input
                className="form-input"
                value={page.group || ""}
                onChange={(event) =>
                  updatePage(index, "group", event.target.value)
                }
              />
            </div>
            <div className="sm-card-field">
              <span className="sm-card-label">Icon</span>
              <IconPicker
                value={page.icon}
                onChange={(value) => updatePage(index, "icon", value)}
              />
            </div>
          </div>
        ))}
      </div>
      <section className="sm-sidebar-appearance">
        <div className="sm-section-heading">
          <div><h3>Sidebar Appearance</h3><p>Choose a solid colour, gradient, or uploaded image. Changes apply live after saving.</p></div>
        </div>
        <div className="sm-form-grid">
          <label>Background Type
            <select className="form-input" value={brandingDraft?.sidebarBackgroundType || "gradient"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarBackgroundType: e.target.value }))}>
              <option value="solid">Solid Colour</option><option value="gradient">Linear Gradient</option><option value="image">Background Image</option>
            </select>
          </label>
          {brandingDraft?.sidebarBackgroundType === "solid" && <label>Sidebar Colour<input type="color" className="form-input sm-color-input" value={brandingDraft?.sidebarBackgroundColor || "#1e3a5f"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarBackgroundColor: e.target.value }))} /></label>}
          {brandingDraft?.sidebarBackgroundType === "gradient" && <>
            <label>Gradient From<input type="color" className="form-input sm-color-input" value={brandingDraft?.sidebarGradientFrom || "#1e3a5f"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarGradientFrom: e.target.value }))} /></label>
            <label>Gradient To<input type="color" className="form-input sm-color-input" value={brandingDraft?.sidebarGradientTo || "#0f172a"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarGradientTo: e.target.value }))} /></label>
            <label>Angle ({brandingDraft?.sidebarGradientAngle ?? 180}°)<input type="range" min="0" max="360" value={brandingDraft?.sidebarGradientAngle ?? 180} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarGradientAngle: Number(e.target.value) }))} /></label>
          </>}
          {brandingDraft?.sidebarBackgroundType === "image" && <>
            <label>Background Image<select className="form-input" value={brandingDraft?.sidebarBackgroundImage?._id || brandingDraft?.sidebarBackgroundImage || ""} onChange={(e) => chooseAsset("sidebarBackgroundImage", e.target.value)}><option value="">Select image</option>{assetArr.map((asset) => <option key={asset._id} value={asset._id}>{asset.originalName || asset.fileName}</option>)}</select></label>
            <label>Object Fit<select className="form-input" value={brandingDraft?.sidebarBackgroundSize || "cover"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarBackgroundSize: e.target.value }))}><option value="cover">Cover</option><option value="contain">Contain</option><option value="auto">Original / Auto</option></select></label>
            <label>Position<select className="form-input" value={brandingDraft?.sidebarBackgroundPosition || "center center"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarBackgroundPosition: e.target.value }))}>{sidebarPositions.map((position) => <option key={position} value={position}>{position.replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}</select></label>
            <label>Repeat<select className="form-input" value={brandingDraft?.sidebarBackgroundRepeat || "no-repeat"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarBackgroundRepeat: e.target.value }))}><option value="no-repeat">No Repeat</option><option value="repeat">Repeat</option><option value="repeat-x">Repeat Horizontally</option><option value="repeat-y">Repeat Vertically</option></select></label>
          </>}
          <label>Text Colour<input type="color" className="form-input sm-color-input" value={brandingDraft?.sidebarTextColor || "#e2e8f0"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarTextColor: e.target.value }))} /></label>
          <label>Heading Colour<input type="color" className="form-input sm-color-input" value={brandingDraft?.sidebarHeadingColor || "#ffffff"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarHeadingColor: e.target.value }))} /></label>
          <label>Active Item Colour<input type="color" className="form-input sm-color-input" value={brandingDraft?.sidebarActiveColor || "#2563eb"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarActiveColor: e.target.value }))} /></label>
          {brandingDraft?.sidebarBackgroundType === "image" && <><label>Overlay Colour<input type="color" className="form-input sm-color-input" value={brandingDraft?.sidebarOverlayColor || "#0f172a"} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarOverlayColor: e.target.value }))} /></label><label>Overlay ({Math.round(Number(brandingDraft?.sidebarOverlayOpacity ?? .2) * 100)}%)<input type="range" min="0" max="1" step="0.05" value={brandingDraft?.sidebarOverlayOpacity ?? .2} onChange={(e) => setBrandingDraft((v) => ({ ...v, sidebarOverlayOpacity: Number(e.target.value) }))} /></label></>}
        </div>
        {brandingDraft?.sidebarBackgroundType === "gradient" && <div className="sm-gradient-presets">{sidebarGradientPresets.map(([name, from, to]) => <button type="button" key={name} onClick={() => setBrandingDraft((v) => ({ ...v, sidebarGradientFrom: from, sidebarGradientTo: to }))} style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>{name}</button>)}</div>}
        <div className="sm-sidebar-actions"><label className="btn btn-secondary sm-upload-btn">Upload Sidebar Image<input type="file" accept="image/*" onChange={handleUploadSidebarBackground} hidden /></label><button type="submit" className="btn btn-primary" disabled={savingSidebar || savingBranding}>Save Sidebar Appearance</button></div>
      </section>
    </form>
  );

  const renderPageModal = () =>
    showPageModal && (
      <div
        className="sm-modal-backdrop"
        onClick={() => setShowPageModal(false)}
      >
        <form
          className="sm-modal"
          onClick={(event) => event.stopPropagation()}
          onSubmit={saveNewPage}
        >
          <div className="sm-page-modal-header">
            <div>
              <h2>Add Page</h2>
              <p>Create a Mongo Page for sidebar and permission management.</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowPageModal(false)}
            >
              Close
            </button>
          </div>
          <div className="sm-page-modal-body">
            <div className="sm-page-modal-grid">
            <label>
              Name
              <input
                className="form-input"
                value={pageDraft.name}
                onChange={(event) =>
                  setPageDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Label
              <input
                className="form-input"
                value={pageDraft.label}
                onChange={(event) =>
                  setPageDraft((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Path
              <input
                className="form-input"
                value={pageDraft.path}
                onChange={(event) =>
                  setPageDraft((current) => ({
                    ...current,
                    path: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Module
              <input
                className="form-input"
                value={pageDraft.module}
                onChange={(event) =>
                  setPageDraft((current) => ({
                    ...current,
                    module: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Group
              <input
                className="form-input"
                value={pageDraft.group}
                onChange={(event) =>
                  setPageDraft((current) => ({
                    ...current,
                    group: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Sort Order
              <input
                className="form-input"
                type="number"
                value={pageDraft.sortOrder}
                onChange={(event) =>
                  setPageDraft((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              Description
              <input
                className="form-input"
                value={pageDraft.description}
                onChange={(event) =>
                  setPageDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <label className="sm-inline-toggle">
              Active
              <input
                type="checkbox"
                checked={pageDraft.isActive}
                onChange={(event) =>
                  setPageDraft((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
              />
            </label>
            <label>
              Icon
              <IconPicker
                value={pageDraft.icon}
                onChange={(value) =>
                  setPageDraft((current) => ({ ...current, icon: value }))
                }
              />
            </label>
            </div>
          </div>
          <div className="sm-page-modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowPageModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={savingPage}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    );

  const renderBranding = () => (
    <div className="sm-grid">
      <form className="sm-panel" onSubmit={handleSaveBranding}>
        <div className="sm-panel-header">
          <div>
            <h2>Branding</h2>
            <p>
              Saved branding updates the app title, logos, and favicon live.
            </p>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={savingBranding}
          >
            Save Branding
          </button>
        </div>
        <div className="sm-form-grid">
          <label>
            Application Name
            <input
              className="form-input"
              value={brandingDraft?.applicationName || ""}
              onChange={(event) =>
                setBrandingDraft((current) => ({
                  ...current,
                  applicationName: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Browser Title
            <input
              className="form-input"
              value={brandingDraft?.browserTitle || ""}
              onChange={(event) =>
                setBrandingDraft((current) => ({
                  ...current,
                  browserTitle: event.target.value,
                }))
              }
            />
          </label>
          {assetFields.map(([field, label]) => (
            <label key={field}>
              {label}
              <select
                className="form-input"
                value={
                  brandingDraft?.[field]?._id || brandingDraft?.[field] || ""
                }
                onChange={(event) => chooseAsset(field, event.target.value)}
              >
                <option value="">Default</option>
                {assetArr.map((asset) => (
                  <option key={asset._id} value={asset._id}>
                    {asset.originalName || asset.fileName}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="btn btn-secondary sm-upload-btn">
          Upload Images
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleUploadAssets}
            hidden
          />
        </label>
      </form>
      <div className="sm-panel">
        <h2>Assets</h2>
        <FilterBar>
          <SearchInput
            placeholder="Search assets..."
            value={brandingAssetSearch}
            onChange={setBrandingAssetSearch}
          />
          <select
            className="form-control"
            value={brandingFormatFilter}
            onChange={(e) => setBrandingFormatFilter(e.target.value)}
            style={{ width: "auto", minWidth: "100px" }}
          >
            <option value="">All Formats</option>
            {brandingFormats.map((ext) => (
              <option key={ext} value={ext}>
                {ext.toUpperCase()}
              </option>
            ))}
          </select>
          <ResetFiltersButton
            count={
              (brandingAssetSearch ? 1 : 0) + (brandingFormatFilter ? 1 : 0)
            }
            onClick={() => {
              setBrandingAssetSearch("");
              setBrandingFormatFilter("");
            }}
          />
        </FilterBar>
        <div className="sm-assets-grid">
          {filteredAssets.length === 0 ? (
            <p className="sm-empty">No assets found</p>
          ) : (
            filteredAssets.map((asset) => (
              <div key={asset._id} className="sm-asset-card">
                <div className="sm-asset-actions">
                  <label
                    className="btn btn-secondary btn-sm"
                    title="Edit asset"
                  >
                    Edit
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => handleReplaceAssetFile(asset, event)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setAssetDeleteTarget(asset)}
                  >
                    Delete
                  </button>
                </div>
                <img
                  src={asset.publicUrl || asset.url}
                  alt={asset.originalName || asset.fileName}
                />
                <span>{asset.originalName || asset.fileName}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderPermissions = (
    permissions,
    onToggle,
    onSelectAll,
    onDeselectAll,
    pages,
  ) => {
    const pageList = pages || activePagesArr;
    return (
      <>
        <div className="sm-actions sm-permission-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onSelectAll(true)}
          >
            Select All Pages
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onDeselectAll(false)}
          >
            Deselect All Pages
          </button>
        </div>
        <div className="sm-permission-grid">
          {pageList.length === 0 ? (
            <p className="sm-empty">No pages match search</p>
          ) : (
            pageList.map((page) => (
              <label key={page._id || page.path} className="sm-permission-row">
                <span>{page.label}</span>
                <input
                  type="checkbox"
                  checked={hasView(permissions, page)}
                  onChange={(event) => onToggle(page, event.target.checked)}
                />
              </label>
            ))
          )}
        </div>
      </>
    );
  };

  const renderSuperAdminInfo = () => (
    <div className="sm-info-panel">
      <h3>Super Administrator</h3>
      <p>Permissions are managed internally.</p>
      <p>This role always has unrestricted access.</p>
      <p>Permissions cannot be modified.</p>
    </div>
  );

  const renderRoles = () => (
    <div className="sm-grid">
      <div className="sm-panel">
        <div className="sm-panel-header">
          <h2>Roles</h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={startCreateRole}
          >
            New Role
          </button>
        </div>
        <div className="sm-list">
          {roleArr.map((role) => (
            <button
              type="button"
              key={getRoleId(role)}
              className={selectedRoleId === getRoleId(role) ? "active" : ""}
              onClick={() => selectRole(getRoleId(role))}
            >
              <span>{role.displayName || role.name}</span>
              <small>
                {role.editable === false
                  ? "Locked"
                  : `${(role.permissions || []).filter((permission) => permission.canView).length} pages`}
              </small>
            </button>
          ))}
        </div>
      </div>
      <form
        className="sm-panel"
        onSubmit={saveRole}
        onKeyDownCapture={handleServerManagementEnterSave}
      >
        <div className="sm-panel-header">
          <h2>{selectedRole ? "Edit Role" : "Create Role"}</h2>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={selectedRoleIsSuperAdmin || savingRole}
          >
            Save Role
          </button>
        </div>
        <div className="sm-form-grid">
          <input
            className="form-input"
            placeholder="role_name"
            value={roleDraft.name || ""}
            disabled={Boolean(selectedRoleId) || selectedRoleIsSuperAdmin}
            onChange={(event) =>
              setRoleDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
          <input
            className="form-input"
            placeholder="Display name"
            value={roleDraft.displayName || ""}
            disabled={selectedRoleIsSuperAdmin}
            onChange={(event) =>
              setRoleDraft((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
          />
        </div>
        {selectedRoleIsSuperAdmin ? (
          renderSuperAdminInfo()
        ) : (
          <>
            {renderPermissions(
              roleDraft.permissions,
              toggleRolePage,
              setAllRolePages,
              setAllRolePages,
              filteredActivePages,
            )}
          </>
        )}
      </form>
    </div>
  );

  const renderUserPermissions = () => (
    <div className="sm-grid">
      <div className="sm-panel">
        <div className="sm-panel-header">
          <div>
            <h2>Users</h2>
            <p>Select a user to manage their page permissions</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowUserModal(true)}
          >
            Create User
          </button>
        </div>
        <FilterBar>
          <SearchInput
            placeholder="Search users..."
            value={userSearch}
            onChange={setUserSearch}
          />
          <select
            className="form-control"
            value={userRoleFilter}
            onChange={(e) => setUserRoleFilter(e.target.value)}
            style={{ width: "auto", minWidth: "140px" }}
          >
            <option value="">All Roles</option>
            {roleArr.map((role) => (
              <option key={getRoleId(role)} value={getRoleId(role)}>
                {role.displayName || role.name}
              </option>
            ))}
          </select>
          <ResetFiltersButton
            count={(userSearch ? 1 : 0) + (userRoleFilter ? 1 : 0)}
            onClick={() => {
              setUserSearch("");
              setUserRoleFilter("");
            }}
          />
        </FilterBar>
        <div className="sm-list">
          {filteredUsers.length === 0 ? (
            <p className="sm-empty">No users found</p>
          ) : (
            filteredUsers.map((user) => (
              <button
                type="button"
                key={user._id || user.id}
                className={
                  selectedUserId === (user._id || user.id) ? "active" : ""
                }
                onClick={() => selectUser(user._id || user.id)}
              >
                <span>
                  {user.firstName} {user.lastName}
                </span>
                <small>
                  {user.role?.displayName || user.role?.name || user.email}
                </small>
              </button>
            ))
          )}
        </div>
      </div>
      <form
        className="sm-panel"
        onSubmit={saveUserPermissions}
        onKeyDownCapture={handleServerManagementEnterSave}
      >
        <div className="sm-panel-header">
          <h2>
            {selectedUser
              ? `${selectedUser.firstName} ${selectedUser.lastName}`
              : "User Permissions"}
          </h2>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              !selectedUserId ||
              selectedUserIsSuperAdmin ||
              savingUserPermissions
            }
          >
            Save Permissions
          </button>
        </div>
        {selectedUserIsSuperAdmin ? (
          renderSuperAdminInfo()
        ) : selectedUser &&
          (!selectedUser.customPermissions ||
            !selectedUser.customPermissions.length) ? (
          <>
            <div className="sm-info-panel compact">
              <p>
                This user is currently using role permissions. Saving here will
                create custom user permissions.
              </p>
            </div>
            {renderPermissions(
              userPermissionDraft,
              toggleUserPage,
              setAllUserPages,
              setAllUserPages,
            )}
          </>
        ) : selectedUser ? (
          renderPermissions(
            userPermissionDraft,
            toggleUserPage,
            setAllUserPages,
            setAllUserPages,
          )
        ) : null}
      </form>
    </div>
  );

  const selectLogRole = (roleId) => {
    const role = roleArr.find((item) => getRoleId(item) === roleId);
    setActiveLogPanel("role");
    setSelectedLogRoleId(roleId);
    setLogRoleDraft(normalizeLogDraft(role?.logsPermissions, "own"));
  };

  const selectLogUser = (userId) => {
    const user = userArr.find((item) => (item._id || item.id) === userId);
    setActiveLogPanel("user");
    setSelectedLogUserId(userId);
    setLogUserSource(user?.logPermissionSource === "user" ? "user" : "role");
    setLogUserDraft(normalizeLogDraft(user?.logsPermissions, "own"));
  };

  const saveLogRolePermissions = async (event) => {
    event?.preventDefault?.();
    if (savingRef.current.logRole) return;
    if (!selectedLogRoleId) return;
    savingRef.current.logRole = true;
    setSavingLogRolePermissions(true);
    try {
      const res = await serverManagementAPI.updateRoleLogsPermissions(
        selectedLogRoleId,
        {
          logsPermissions: buildLogPermissionsConfig(logRoleDraft),
        },
      );
      if (res?.data?.success === true) {
        const updatedRole = res.data?.data?.role;
        if (updatedRole) {
          setRoles((prev) =>
            prev.map((r) =>
              getRoleId(r) === selectedLogRoleId
                ? { ...r, logsPermissions: updatedRole.logsPermissions }
                : r,
            ),
          );
        }
        showApiSuccess(res, "Log permissions saved");
      } else {
        throw new Error(res?.data?.message || "Failed to save log permissions");
      }
    } catch (err) {
      showApiError(err, "Failed to save log permissions");
    } finally {
      savingRef.current.logRole = false;
      setSavingLogRolePermissions(false);
    }
  };

  const saveLogUserPermissions = async (event) => {
    event?.preventDefault?.();
    if (savingRef.current.logUser) return;
    if (!selectedLogUserId) return;
    savingRef.current.logUser = true;
    setSavingLogUserPermissions(true);
    try {
      const res = await serverManagementAPI.updateUserLogsPermissions(
        selectedLogUserId,
        {
          logPermissionSource: logUserSource,
          logsPermissions: buildLogPermissionsConfig(logUserDraft),
        },
      );
      if (res?.data?.success === true) {
        const updatedUser = res.data?.data?.user;
        if (updatedUser) {
          setUsers((prev) =>
            prev.map((u) =>
              (u._id || u.id) === selectedLogUserId
                ? { ...u, ...updatedUser }
                : u,
            ),
          );
        }
        showApiSuccess(res, "Log permissions saved");
      } else {
        throw new Error(res?.data?.message || "Failed to save log permissions");
      }
    } catch (err) {
      showApiError(err, "Failed to save log permissions");
    } finally {
      savingRef.current.logUser = false;
      setSavingLogUserPermissions(false);
    }
  };

  const handleServerManagementEnterSave = (event) => {
    if (event.key !== "Enter") return;
    if (
      event.defaultPrevented ||
      event.shiftKey ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    )
      return;
    if (showUserModal) return;
    if (showLeadAssignmentRoleModal) return;
    if (isAnySectionSaving) return;

    if (assetDeleteTarget) {
      event.preventDefault();
      confirmDeleteAsset(event);
      return;
    }

    if (showPageModal) {
      event.preventDefault();
      saveNewPage(event);
      return;
    }

    // Check active tab before ignored-target filter so checkbox/label focus doesn't block Enter
    if (activeTab === "Frontend Management") {
      event.preventDefault();
      saveFrontendManagement(event);
      return;
    } else if (activeTab === "Branding") {
      event.preventDefault();
      handleSaveBranding(event);
      return;
    } else if (activeTab === "Roles Permissions") {
      event.preventDefault();
      saveRole(event);
      return;
    } else if (activeTab === "User Permissions") {
      event.preventDefault();
      saveUserPermissions(event);
      return;
    } else if (activeTab === "Log Permissions") {
      const target = event.target;
      event.preventDefault();
      if (target?.closest?.('[data-log-panel="role"]')) {
        saveLogRolePermissions(event);
      } else if (target?.closest?.('[data-log-panel="user"]')) {
        saveLogUserPermissions(event);
      } else if (activeLogPanel === "role") {
        saveLogRolePermissions(event);
      } else {
        saveLogUserPermissions(event);
      }
      return;
    } else if (activeTab === "Role Jobs") {
      if (isDropdownOpen()) return;
      event.preventDefault();
      saveRoleJobs();
      return;
    } else if (activeTab === "Role Usage") {
      const target = event.target;
      if (isDropdownOpen()) return;
      event.preventDefault();
      const panel = target?.closest?.('[data-role-usage-panel]')?.dataset?.roleUsagePanel;
      if (panel === "customer") {
        saveCustomerConfig(event);
      } else if (panel === "employee") {
        saveEmployeeConfig(event);
      } else {
        saveLeadAssignment(event);
      }
      return;
    }

    // Fallback: check ignored target for sections not handled above
    const target = event.target;
    if (isEnterSaveIgnoredTarget(target) || isDropdownOpen()) return;
    event.preventDefault();
  };

  const toggleLogUserSelection = (uid, target) => {
    const setter = target === "role" ? setLogRoleDraft : setLogUserDraft;
    const current = target === "role" ? logRoleDraft : logUserDraft;
    setter((prev) => {
      const ids = prev.selectedUserIds.includes(uid)
        ? prev.selectedUserIds.filter((id) => id !== uid)
        : [...prev.selectedUserIds, uid];
      return { ...prev, selectedUserIds: ids, viewType: "users" };
    });
  };

  const toggleLogRoleSelection = (rid, target) => {
    const setter = target === "role" ? setLogRoleDraft : setLogUserDraft;
    setter((prev) => {
      const ids = prev.selectedRoleIds.includes(rid)
        ? prev.selectedRoleIds.filter((id) => id !== rid)
        : [...prev.selectedRoleIds, rid];
      return { ...prev, selectedRoleIds: ids, viewType: "roles" };
    });
  };

  const logViewOptions = [
    { value: "own", label: "Own Logs" },
    { value: "users", label: "Selected Users" },
    { value: "roles", label: "Selected Roles" },
    { value: "all", label: "All Users" },
  ];

  const filteredLogUsers = userArr.filter((u) => {
    if (u.role?.name === "super_admin" || u.role === "super_admin")
      return false;
    const q = logUserSearch.toLowerCase().trim();
    if (!q) return true;
    const name = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
    const email = (u.email || "").toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  const filteredLogRoles = roleArr.filter((r) => {
    if (r.name === "super_admin") return false;
    const q = logRoleSearch.toLowerCase().trim();
    if (!q) return true;
    const name = (r.displayName || r.name || "").toLowerCase();
    return name.includes(q);
  });

  const renderUserPicker = (selectedIds, onToggle, target) => (
    <div className="sm-picker-wrapper">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ margin: "0 0 10px 0" }}
        onClick={() => {
          if (target === "role") setShowLogUserPicker(!showLogUserPicker);
          else setShowLogUserPicker(!showLogUserPicker);
        }}
      >
        {selectedIds.length > 0
          ? `${selectedIds.length} user(s) selected`
          : "Select Users"}
      </button>
      {showLogUserPicker && (
        <div className="sm-picker-dropdown">
          <input
            className="form-input"
            placeholder="Search users..."
            value={logUserSearch}
            onChange={(e) => setLogUserSearch(e.target.value)}
            autoFocus
          />
          <div className="sm-picker-list">
            {filteredLogUsers.length === 0 ? (
              <p className="sm-empty">No users found</p>
            ) : (
              filteredLogUsers.map((u) => {
                const uid = u._id || u.id;
                const checked = selectedIds.includes(uid);
                return (
                  <label key={uid} className="sm-picker-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(uid, target)}
                    />
                    <span>
                      {u.firstName} {u.lastName}{" "}
                      <small>
                        {u.role?.displayName || u.role?.name || u.email}
                      </small>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderRolePicker = (selectedIds, onToggle, target) => (
    <div className="sm-picker-wrapper">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ margin: "0 0 10px 0" }}
        onClick={() => {
          if (target === "role") setShowLogRolePicker(!showLogRolePicker);
          else setShowLogRolePicker(!showLogRolePicker);
        }}
      >
        {selectedIds.length > 0
          ? `${selectedIds.length} role(s) selected`
          : "Select Roles"}
      </button>
      {showLogRolePicker && (
        <div className="sm-picker-dropdown">
          <input
            className="form-input"
            placeholder="Search roles..."
            value={logRoleSearch}
            onChange={(e) => setLogRoleSearch(e.target.value)}
            autoFocus
          />
          <div className="sm-picker-list">
            {filteredLogRoles.length === 0 ? (
              <p className="sm-empty">No roles found</p>
            ) : (
              filteredLogRoles.map((r) => {
                const rid = getRoleId(r);
                const checked = selectedIds.includes(rid);
                return (
                  <label key={rid} className="sm-picker-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(rid, target)}
                    />
                    <span>{r.displayName || r.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderLogPermissionsConfig = (draft, setter, target) => (
    <div className="sm-form-grid">
      <label>
        Can View
        <select
          className="form-input"
          value={draft.viewType}
          onChange={(e) =>
            setter((prev) => ({ ...prev, viewType: e.target.value }))
          }
        >
          {logViewOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {draft.viewType === "users" &&
        renderUserPicker(draft.selectedUserIds, toggleLogUserSelection, target)}
      {draft.viewType === "roles" &&
        renderRolePicker(draft.selectedRoleIds, toggleLogRoleSelection, target)}
    </div>
  );

  const renderUserLogPermissionsConfig = () => (
    <div className="sm-form-grid">
      <label>
        Permission Source
        <select
          className="form-input"
          value={logUserSource}
          onChange={(event) => setLogUserSource(event.target.value)}
        >
          <option value="role">Use Role Log Permissions</option>
          <option value="user">Use User Custom Log Permissions</option>
        </select>
      </label>
      {logUserSource === "role" ? (
        <div className="sm-info-panel compact">
          <p>This user will use log permissions from their assigned role.</p>
        </div>
      ) : (
        renderLogPermissionsConfig(logUserDraft, setLogUserDraft, "user")
      )}
    </div>
  );

  const renderLogPermissions = () => (
    <>
      <div className="sm-grid sm-log-permissions-grid">
        <div className="sm-panel">
          <div className="sm-panel-header">
            <h2>Role Log Permissions</h2>
            <p>Log access configuration per role</p>
          </div>
          <div className="sm-list">
            {roleArr
              .filter((r) => r.name !== "super_admin")
              .map((role) => (
                <button
                  type="button"
                  key={getRoleId(role)}
                  className={
                    selectedLogRoleId === getRoleId(role) ? "active" : ""
                  }
                  onClick={() => selectLogRole(getRoleId(role))}
                >
                  <span>{role.displayName || role.name}</span>
                </button>
              ))}
          </div>
        </div>
        <form
          className="sm-panel"
          data-log-panel="role"
          onSubmit={saveLogRolePermissions}
          onKeyDownCapture={handleServerManagementEnterSave}
          onFocus={() => setActiveLogPanel("role")}
          onClick={() => setActiveLogPanel("role")}
        >
          <div className="sm-panel-header">
            <h2>
              {selectedLogRoleId
                ? roleArr.find((r) => getRoleId(r) === selectedLogRoleId)
                    ?.displayName || "Role"
                : "Select a Role"}
            </h2>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!selectedLogRoleId || savingLogRolePermissions}
            >
              Save
            </button>
          </div>
          {selectedLogRoleId &&
            renderLogPermissionsConfig(logRoleDraft, setLogRoleDraft, "role")}
        </form>
        <div className="sm-panel">
          <div className="sm-panel-header">
            <h2>User Log Permissions</h2>
            <p>Override log access per user</p>
          </div>
          <div className="sm-list">
            {userArr
              .filter((u) => u.role?.name !== "super_admin")
              .map((user) => (
                <button
                  type="button"
                  key={user._id || user.id}
                  className={
                    selectedLogUserId === (user._id || user.id) ? "active" : ""
                  }
                  onClick={() => selectLogUser(user._id || user.id)}
                >
                  <span>
                    {user.firstName} {user.lastName}
                  </span>
                  <small>
                    {user.role?.displayName || user.role?.name || user.email}
                  </small>
                </button>
              ))}
          </div>
        </div>
        <form
          className="sm-panel"
          data-log-panel="user"
          onSubmit={saveLogUserPermissions}
          onKeyDownCapture={handleServerManagementEnterSave}
          onFocus={() => setActiveLogPanel("user")}
          onClick={() => setActiveLogPanel("user")}
        >
          <div className="sm-panel-header">
            <h2>
              {selectedLogUserId
                ? userArr.find((u) => (u._id || u.id) === selectedLogUserId)
                    ?.firstName || "User"
                : "Select a User"}
            </h2>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!selectedLogUserId || savingLogUserPermissions}
            >
              Save
            </button>
          </div>
          {selectedLogUserId && renderUserLogPermissionsConfig()}
        </form>
      </div>
    </>
  );

  useEffect(() => {
    if (roleArr.length > 0) {
      setLeadAssignmentSelectedRoles(
        leadAssignmentRoleIds.map((id) => String(id)),
      );
    }
  }, [leadAssignmentRoleIds, roleArr]);

  const toggleLeadAssignmentRole = (roleId) => {
    const id = String(roleId);
    setLeadAssignmentSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const saveLeadAssignment = async () => {
    if (savingRef.current.leadAssignment) return;
    savingRef.current.leadAssignment = true;
    setLeadAssignmentSaving(true);
    try {
      const { data: res } = await serverManagementAPI.updateLeadAssignmentRoles(
        leadAssignmentSelectedRoles,
      );
      if (res?.success) {
        showApiSuccess(res, "Lead assignment roles saved");
        setLeadAssignmentRoleIds(leadAssignmentSelectedRoles);
      } else {
        throw new Error(res?.message || "Failed to save");
      }
    } catch (err) {
      showApiError(err, "Failed to save lead assignment roles");
    } finally {
      savingRef.current.leadAssignment = false;
      setLeadAssignmentSaving(false);
    }
  };

  const handleCreateRoleFromModal = async (formData) => {
    setLeadAssignmentRoleModalLoading(true);
    try {
      const { data: res } = await serverManagementAPI.createRole(formData);
      if (res?.success) {
        showApiSuccess(res, "Role created");
        setShowLeadAssignmentRoleModal(false);
        const { data: rolesData } = await serverManagementAPI.getRoles();
        if (rolesData?.data?.roles) setRoles(rolesData.data.roles);
      } else {
        throw new Error(res?.message || "Failed to create role");
      }
    } catch (err) {
      showApiError(err, "Failed to create role");
    } finally {
      setLeadAssignmentRoleModalLoading(false);
    }
  };

  const saveCustomerConfig = async (event) => {
    if (savingRef.current.customerConfig) return;
    savingRef.current.customerConfig = true;
    setCustomerConfigSaving(true);
    try {
      const { data: res } = await customerRoleConfigAPI.update({
        activeRoleId: customerConfigActiveRoleId,
        availableRoleIds: customerConfigAvailableRoleIds,
      });
      if (res?.success) {
        showApiSuccess(res, 'Customer config saved');
      } else {
        throw new Error(res?.message || 'Failed to save');
      }
    } catch (err) {
      showApiError(err, 'Failed to save customer config');
    } finally {
      savingRef.current.customerConfig = false;
      setCustomerConfigSaving(false);
    }
  };

  const saveEmployeeConfig = async () => {
    if (savingRef.current.employeeConfig) return;
    savingRef.current.employeeConfig = true;
    setEmployeeConfigSaving(true);
    try {
      const { data: res } = await employeeRoleConfigAPI.update({ activeRoleId: employeeConfigActiveRoleId });
      if (res?.success) showApiSuccess(res, 'Employee role config saved');
      else throw new Error(res?.message || 'Failed to save');
    } catch (err) {
      showApiError(err, 'Failed to save employee role config');
    } finally {
      savingRef.current.employeeConfig = false;
      setEmployeeConfigSaving(false);
    }
  };

  const saveWarehouseManagerRoles = async () => {
    if (savingRef.current.warehouseManagerRoles) return;
    savingRef.current.warehouseManagerRoles = true;
    setWarehouseManagerSaving(true);
    try {
      const { data: res } = await warehouseManagerRolesAPI.update(warehouseManagerRoleIds);
      if (res?.success) showApiSuccess(res, 'Warehouse manager roles saved');
      else throw new Error(res?.message || 'Failed to save');
    } catch (err) {
      showApiError(err, 'Failed to save warehouse manager roles');
    } finally {
      savingRef.current.warehouseManagerRoles = false;
      setWarehouseManagerSaving(false);
    }
  };

  const saveServiceAdvisorRoles = async () => {
    if (savingRef.current.serviceAdvisorRoles) return;
    savingRef.current.serviceAdvisorRoles = true;
    setServiceAdvisorSaving(true);
    try {
      const { data: res } = await serviceAdvisorRolesAPI.update(serviceAdvisorRoleIds);
      if (res?.success) showApiSuccess(res, 'Service advisor roles saved');
      else throw new Error(res?.message || 'Failed to save');
    } catch (err) {
      showApiError(err, 'Failed to save service advisor roles');
    } finally {
      savingRef.current.serviceAdvisorRoles = false;
      setServiceAdvisorSaving(false);
    }
  };

  const loadRoleJobs = async (roleId) => {
    setSelectedJobRoleId(roleId);
    if (!roleId) { setRoleJobs([]); return; }
    setRoleJobsLoading(true);
    try {
      const { data: res } = await serverManagementAPI.getRoleJobs(roleId);
      const role = res?.data?.role;
      const saved = res?.data?.jobs || [];
      const catalog = Object.fromEntries((res?.data?.fieldCatalog || []).map((page) => [page.pageKey, page.fields || []]));
      setFieldCatalog(catalog);
      setPageCapabilities(res?.data?.capabilities || {});
      setActionLabels(res?.data?.actionLabels || {});
      const screenCatalog = res?.data?.catalog || {};
      setPageCatalog(screenCatalog);
      if (Array.isArray(res?.data?.dropdownModes)) setDropdownModes(res.data.dropdownModes);
      setDropdownModeLabels(res?.data?.dropdownModeLabels || {});
      // "all" is stored as an empty allow-list; the screen shows it as
      // everything ticked so unticking one is one click.
      const allowListOf = (block, keys) => (block?.mode === 'selected'
        ? { mode: 'selected', allowed: (block.allowed || []).map(String) }
        : { mode: 'all', allowed: keys });
      // The document pages used to live behind one "sales" permission. A role
      // still carrying that row keeps access to all four.
      const LEGACY_SALES = ['quotations', 'bookings', 'sales_orders', 'invoices'];
      const grantedKeys = new Set(
        (role?.permissions || [])
          .filter((item) => item.canView && item.isActive !== false)
          .flatMap((item) => (item.pageKey === 'sales' ? LEGACY_SALES : [item.pageKey])),
      );

      // Every active page is listed, granted or not, so access can be given
      // here rather than sending the administrator back to Roles Permissions.
      setRoleJobs((res?.data?.pages || []).map((page) => {
        const current = saved.find((job) => job.pageKey === page.name) || {};
        return {
          pageKey: page.name,
          module: page.module || page.name,
          label: page.label || page.name,
          group: page.group || 'Other',
          allowed: grantedKeys.has(page.name),
          actions: { view: true, create: false, edit: false, delete: false, sendEmail: false, downloadPdf: false, export: false, ...(current.actions || {}) },
          dataScope: { mode: current.dataScope?.mode || 'own', roles: (current.dataScope?.roles || []).map((item) => String(item._id || item)), users: (current.dataScope?.users || []).map((item) => String(item._id || item)) },
          // "all" is stored whenever nothing is withheld, so a page whose
          // catalog later grows keeps showing the new columns.
          fields: current.fields?.mode === 'selected'
            ? { mode: 'selected', allowed: (current.fields.allowed || []).map(String) }
            : { mode: 'all', allowed: (catalog[page.name] || []).map((field) => field.key) },
          columns: allowListOf(current.columns, (screenCatalog[page.name]?.columns || []).map((column) => column.key)),
          drawerFields: allowListOf(current.drawerFields, (screenCatalog[page.name]?.drawer?.fields || []).map((field) => field.key)),
          drawerExtras: allowListOf(current.drawerExtras, (screenCatalog[page.name]?.drawer?.extras || []).map((extra) => extra.key)),
          quickCreate: current.quickCreate?.mode === 'selected'
            ? { mode: 'selected', create: (current.quickCreate.create || []).map(String), edit: (current.quickCreate.edit || []).map(String) }
            : {
              mode: 'all',
              create: (screenCatalog[page.name]?.forms?.create?.quickCreate || []).map((item) => item.key),
              edit: (screenCatalog[page.name]?.forms?.edit?.quickCreate || []).map((item) => item.key),
            },
          dropdowns: (current.dropdowns || []).map((row) => ({
            key: row.key,
            form: row.form || 'create',
            mode: row.mode || 'all',
            roles: (row.roles || []).map((item) => String(item._id || item)),
            users: (row.users || []).map((item) => String(item._id || item)),
          })),
        };
      }));
    } catch (err) { showApiError(err, 'Failed to load role jobs'); }
    finally { setRoleJobsLoading(false); }
  };

  const updateRoleJob = (pageKey, updater) => setRoleJobs((items) => items.map((item) => item.pageKey === pageKey ? updater(item) : item));
  const saveRoleJobs = async () => {
    if (!selectedJobRoleId || savingRef.current.roleJobs) return;
    savingRef.current.roleJobs = true; setRoleJobsSaving(true);
    try {
      const { data: res } = await serverManagementAPI.updateRoleJobs(selectedJobRoleId, roleJobs);
      if (!res?.success) throw new Error(res?.message || 'Failed to save');
      showApiSuccess(res, 'Role jobs saved');
    } catch (err) { showApiError(err, 'Failed to save role jobs'); }
    finally { savingRef.current.roleJobs = false; setRoleJobsSaving(false); }
  };

  /** Toggle one restrictable column on or off for a page. */
  const toggleJobField = (pageKey, fieldKey) => updateRoleJob(pageKey, (item) => {
    const allowed = item.fields.allowed.includes(fieldKey)
      ? item.fields.allowed.filter((key) => key !== fieldKey)
      : [...item.fields.allowed, fieldKey];
    const catalogKeys = (fieldCatalog[pageKey] || []).map((field) => field.key);
    return { ...item, fields: { mode: allowed.length === catalogKeys.length ? 'all' : 'selected', allowed } };
  });

  const setAllJobFields = (pageKey, on) => updateRoleJob(pageKey, (item) => {
    const catalogKeys = (fieldCatalog[pageKey] || []).map((field) => field.key);
    return { ...item, fields: on ? { mode: 'all', allowed: catalogKeys } : { mode: 'selected', allowed: [] } };
  });

  /**
   * The "which columns may this role read" block of one page card. Pages with
   * nothing restrictable (a dashboard, a master-data screen) say so instead of
   * rendering an empty box.
   */
  const renderJobFields = (job) => {
    const catalog = fieldCatalog[job.pageKey] || [];
    if (!catalog.length) return <p className="sm-role-job-note">No per-field settings for this page — access to the page shows all of its data.</p>;

    const groups = catalog.reduce((acc, field) => {
      (acc[field.group || 'Other'] = acc[field.group || 'Other'] || []).push(field);
      return acc;
    }, {});
    const allOn = job.fields.mode === 'all';
    const selectedCount = allOn ? catalog.length : job.fields.allowed.length;

    return (
      <div className="sm-role-job-fields">
        <div className="sm-role-job-fields-head">
          <label>Visible data fields <span className="sm-field-count">{selectedCount} of {catalog.length}</span></label>
          <span className="sm-field-bulk">
            <button type="button" className="btn-link" onClick={() => setAllJobFields(job.pageKey, true)}>Select all</button>
            <button type="button" className="btn-link" onClick={() => setAllJobFields(job.pageKey, false)}>Clear all</button>
          </span>
        </div>
        {Object.entries(groups).map(([group, fields]) => (
          <div className="sm-field-group" key={group}>
            <span className="sm-field-group-name">{group}</span>
            <div className="sm-scope-options">
              {fields.map((field) => (
                <label key={field.key}>
                  <input
                    type="checkbox"
                    checked={allOn || job.fields.allowed.includes(field.key)}
                    onChange={() => toggleJobField(job.pageKey, field.key)}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /** What a page can be permitted to do; an unknown page gets everything. */
  const capabilityOf = (pageKey) => pageCapabilities[pageKey] || { actions: Object.keys(actionLabels), dataScope: true };

  // ── Screen-level sections: columns, drawer, forms ────────────────────────
  // Every list below is drawn from the catalog the API sent, so a page that
  // gains a column or a shortcut shows the new checkbox with no change here.

  const isSectionOpen = (pageKey, section) => openJobSections[`${pageKey}:${section}`] === true;
  const toggleSection = (pageKey, section) => setOpenJobSections((prev) => {
    const id = `${pageKey}:${section}`;
    return { ...prev, [id]: !prev[id] };
  });

  /** Toggle one key in an allow-list block (columns / drawerFields / drawerExtras). */
  const toggleAllowKey = (pageKey, block, key, allKeys) => updateRoleJob(pageKey, (item) => {
    const current = item[block]?.allowed || [];
    const allowed = current.includes(key) ? current.filter((value) => value !== key) : [...current, key];
    return { ...item, [block]: { mode: allowed.length === allKeys.length ? 'all' : 'selected', allowed } };
  });
  const setAllAllowKeys = (pageKey, block, allKeys, on) => updateRoleJob(pageKey, (item) => ({
    ...item, [block]: on ? { mode: 'all', allowed: allKeys } : { mode: 'selected', allowed: [] },
  }));

  const renderAllowList = (job, block, title, entries, note) => {
    if (!entries.length) return null;
    const allKeys = entries.map((entry) => entry.key);
    const setting = job[block] || { mode: 'all', allowed: allKeys };
    const allOn = setting.mode === 'all';
    const count = allOn ? allKeys.length : setting.allowed.length;
    return (
      <div className="sm-role-job-fields">
        <div className="sm-role-job-fields-head">
          <label>{title} <span className="sm-field-count">{count} of {allKeys.length}</span></label>
          <span className="sm-field-bulk">
            <button type="button" className="btn-link" onClick={() => setAllAllowKeys(job.pageKey, block, allKeys, true)}>Select all</button>
            <button type="button" className="btn-link" onClick={() => setAllAllowKeys(job.pageKey, block, allKeys, false)}>Clear all</button>
          </span>
        </div>
        {note && <p className="sm-role-job-note">{note}</p>}
        <div className="sm-scope-options">
          {entries.map((entry) => (
            <label key={entry.key}>
              <input
                type="checkbox"
                checked={allOn || setting.allowed.includes(entry.key)}
                onChange={() => toggleAllowKey(job.pageKey, block, entry.key, allKeys)}
              />
              {entry.label}
            </label>
          ))}
        </div>
      </div>
    );
  };

  /** Quick-create shortcuts of one form. */
  const toggleQuickCreate = (pageKey, form, key) => updateRoleJob(pageKey, (item) => {
    const catalog = pageCatalog[pageKey]?.forms || {};
    const allCreate = (catalog.create?.quickCreate || []).map((entry) => entry.key);
    const allEdit = (catalog.edit?.quickCreate || []).map((entry) => entry.key);
    const current = item.quickCreate || { mode: 'all', create: allCreate, edit: allEdit };
    const list = current[form] || [];
    const nextList = list.includes(key) ? list.filter((value) => value !== key) : [...list, key];
    const next = { ...current, [form]: nextList };
    const everything = next.create.length === allCreate.length && next.edit.length === allEdit.length;
    return { ...item, quickCreate: { ...next, mode: everything ? 'all' : 'selected' } };
  });

  /** One dropdown's rule on one form. */
  const setDropdownRule = (pageKey, form, key, patchIn) => updateRoleJob(pageKey, (item) => {
    const rows = item.dropdowns || [];
    const at = rows.findIndex((row) => row.key === key && row.form === form);
    const base = at >= 0 ? rows[at] : { key, form, mode: 'all', roles: [], users: [] };
    const next = { ...base, ...patchIn };
    const others = rows.filter((row, index) => index !== at);
    // "all" is the default; not storing it keeps the row list a list of exceptions.
    return { ...item, dropdowns: next.mode === 'all' ? others : [...others, next] };
  });
  const dropdownRuleOf = (job, form, key) => (job.dropdowns || []).find((row) => row.key === key && row.form === form) || { mode: 'all', roles: [], users: [] };
  const toggleDropdownMember = (pageKey, form, key, kind, id) => updateRoleJob(pageKey, (item) => {
    const rows = item.dropdowns || [];
    const at = rows.findIndex((row) => row.key === key && row.form === form);
    if (at < 0) return item;
    const row = rows[at];
    const list = row[kind] || [];
    const nextRow = { ...row, [kind]: list.includes(id) ? list.filter((value) => value !== id) : [...list, id] };
    return { ...item, dropdowns: rows.map((entry, index) => (index === at ? nextRow : entry)) };
  });

  const FORM_TITLES = { create: 'Create form', edit: 'Edit form', filters: 'Filter bar' };

  const renderFormsSection = (job) => {
    const forms = pageCatalog[job.pageKey]?.forms || {};
    const formKeys = ['create', 'edit', 'filters'].filter((form) => (forms[form]?.quickCreate || []).length || (forms[form]?.dropdowns || []).length);
    if (!formKeys.length) return null;
    return (
      <div className="sm-role-job-forms">
        {formKeys.map((form) => {
          const quick = forms[form]?.quickCreate || [];
          const dropdowns = forms[form]?.dropdowns || [];
          const quickSetting = job.quickCreate || { mode: 'all', create: quick.map((entry) => entry.key), edit: quick.map((entry) => entry.key) };
          return (
            <div className="sm-role-job-form" key={form}>
              <div className="sm-role-job-form-title">{FORM_TITLES[form]}</div>
              {quick.length > 0 && form !== 'filters' && (
                <div className="sm-role-job-form-block">
                  <span className="sm-field-group-name">Quick-create shortcuts</span>
                  <div className="sm-scope-options">
                    {quick.map((entry) => (
                      <label key={entry.key} title={'Also needs Create on ' + entry.owner}>
                        <input
                          type="checkbox"
                          checked={quickSetting.mode === 'all' || (quickSetting[form] || []).includes(entry.key)}
                          onChange={() => toggleQuickCreate(job.pageKey, form, entry.key)}
                        />
                        {entry.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {dropdowns.length > 0 && (
                <div className="sm-role-job-form-block">
                  <span className="sm-field-group-name">Dropdowns — whose data they offer</span>
                  <div className="sm-dropdown-rules">
                    {dropdowns.map((entry) => {
                      const rule = dropdownRuleOf(job, form, entry.key);
                      const modes = entry.scope ? dropdownModes : ['all', 'none'];
                      return (
                        <div className="sm-dropdown-rule" key={entry.key}>
                          <span className="sm-dropdown-rule-name" title={'From ' + entry.model}>{entry.label}</span>
                          <select
                            value={rule.mode}
                            onChange={(event) => setDropdownRule(job.pageKey, form, entry.key, { mode: event.target.value })}
                          >
                            {modes.map((mode) => <option key={mode} value={mode}>{dropdownModeLabels[mode] || mode}</option>)}
                          </select>
                          {rule.mode === 'selected_roles' && (
                            <div className="sm-scope-options sm-dropdown-members">
                              {scopeRoleOptions
                                .filter((role) => String(getRoleId(role)) !== String(selectedJobRoleId))
                                .map((role) => {
                                  const id = String(getRoleId(role));
                                  return (
                                    <label key={id}>
                                      <input type="checkbox" checked={(rule.roles || []).includes(id)} onChange={() => toggleDropdownMember(job.pageKey, form, entry.key, 'roles', id)} />
                                      {role.displayName || role.name}
                                    </label>
                                  );
                                })}
                            </div>
                          )}
                          {rule.mode === 'selected_users' && (
                            <div className="sm-scope-options sm-dropdown-members">
                              {scopeUserOptions.map((person) => {
                                const id = String(person._id || person.id);
                                return (
                                  <label key={id}>
                                    <input type="checkbox" checked={(rule.users || []).includes(id)} onChange={() => toggleDropdownMember(job.pageKey, form, entry.key, 'users', id)} />
                                    {person.firstName} {person.lastName}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * The screen-level part of a card, folded by default so the list of forty
   * cards stays readable: Table columns · Drawer · Forms.
   */
  const renderScreenSections = (job) => {
    const entry = pageCatalog[job.pageKey];
    if (!entry) return null;
    const columns = entry.columns || [];
    const drawerFields = entry.drawer?.fields || [];
    const drawerExtras = entry.drawer?.extras || [];
    const forms = entry.forms || {};
    const hasForms = ['create', 'edit', 'filters'].some((form) => (forms[form]?.quickCreate || []).length || (forms[form]?.dropdowns || []).length);
    const shown = (block, all) => (job[block]?.mode === 'all' ? all.length : (job[block]?.allowed || []).length);
    const sections = [
      columns.length && { key: 'columns', title: 'Table columns', count: shown('columns', columns) + ' of ' + columns.length },
      (drawerFields.length || drawerExtras.length) && { key: 'drawer', title: 'Drawer', count: shown('drawerFields', drawerFields) + ' of ' + drawerFields.length + ' rows' },
      hasForms && { key: 'forms', title: 'Forms — shortcuts & dropdowns', count: (job.dropdowns || []).length ? (job.dropdowns || []).length + ' dropdown rule(s)' : (job.quickCreate?.mode === 'selected' ? 'shortcuts limited' : 'default') },
    ].filter(Boolean);
    if (!sections.length) return null;
    return (
      <div className="sm-role-job-screen">
        {sections.map((section) => (
          <div className="sm-role-job-section" key={section.key}>
            <button type="button" className="sm-role-job-section-toggle" onClick={() => toggleSection(job.pageKey, section.key)}>
              <span>{isSectionOpen(job.pageKey, section.key) ? '▾' : '▸'} {section.title}</span>
              <span className="sm-field-count">{section.count}</span>
            </button>
            {isSectionOpen(job.pageKey, section.key) && (
              <div className="sm-role-job-section-body">
                {section.key === 'columns' && renderAllowList(job, 'columns', 'Visible table columns', columns, 'Unticked columns are hidden from the table on this page. "Visible data fields" above still decides which data the API sends at all.')}
                {section.key === 'drawer' && (<>
                  {renderAllowList(job, 'drawerFields', 'Drawer rows & sections', drawerFields)}
                  {renderAllowList(job, 'drawerExtras', 'Buttons inside the drawer', drawerExtras)}
                </>)}
                {section.key === 'forms' && renderFormsSection(job)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  /**
   * One page's card: what the role may do there, whose records it sees, and
   * which columns of those records it may read.
   *
   * Only the actions the page really implements are offered. A screen with no
   * write endpoints (the dashboard, a report) is view-only by construction, and
   * a shared reference list has no "whose data" question to answer — showing
   * either control would promise a restriction nothing applies.
   */
  const renderRoleJobCard = (job) => {
    const capability = capabilityOf(job.pageKey);
    const toggleScopeMember = (kind, id) => updateRoleJob(job.pageKey, (item) => ({
      ...item,
      dataScope: {
        ...item.dataScope,
        [kind]: item.dataScope[kind].includes(id)
          ? item.dataScope[kind].filter((value) => value !== id)
          : [...item.dataScope[kind], id],
      },
    }));

    return (
      <section
        className={`sm-role-job-card ${job.allowed ? '' : 'sm-role-job-card-off'}`}
        key={job.pageKey}
        data-role-job={job.pageKey}
        tabIndex="-1"
      >
        <div className="sm-role-job-heading">
          <div><strong>{job.label}</strong><span>{job.module}</span></div>
          <div className="sm-role-job-headright">
            {/* Named on the card too, so an administrator scanning the list can
                see which granted pages are still look-but-don't-touch. */}
            {job.allowed && capability.actions.length > 0
              && !capability.actions.some((key) => job.actions[key] === true)
              && <span className="sm-role-job-viewonly">View only</span>}
            {job.allowed && capability.dataScope && <span className="sm-own-data">Own data always visible</span>}
            <label className="sm-page-toggle">
              <input
                type="checkbox"
                checked={job.allowed}
                onChange={() => updateRoleJob(job.pageKey, (item) => ({ ...item, allowed: !item.allowed }))}
              />
              <span>Allow this page</span>
            </label>
          </div>
        </div>

        {!job.allowed ? (
          <p className="sm-role-job-note">This role cannot open {job.label}. Turn on “Allow this page” to configure it.</p>
        ) : (<>
        {capability.actions.length > 0 ? (
          <div className="sm-role-job-actions">
            {capability.actions.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={job.actions[key] === true}
                  onChange={() => updateRoleJob(job.pageKey, (item) => ({ ...item, actions: { ...item.actions, [key]: !item.actions[key] } }))}
                />
                <span>{actionLabels[key] || key}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="sm-role-job-note">This page is read-only — granting it is the whole permission.</p>
        )}

        {capability.dataScope && (
          <div className="sm-role-job-scope">
            <label>Additional data visibility</label>
            <select
              value={job.dataScope.mode}
              onChange={(event) => updateRoleJob(job.pageKey, (item) => ({ ...item, dataScope: { ...item.dataScope, mode: event.target.value } }))}
            >
              <option value="own">Own only</option>
              <option value="selected_roles">Own + selected roles</option>
              <option value="selected_users">Own + selected users</option>
              <option value="all">All data</option>
            </select>
            {job.dataScope.mode === 'selected_roles' && (
              <div className="sm-scope-options">
                {scopeRoleOptions
                  .filter((role) => String(getRoleId(role)) !== String(selectedJobRoleId))
                  .map((role) => {
                    const id = String(getRoleId(role));
                    return (
                      <label key={id}>
                        <input type="checkbox" checked={job.dataScope.roles.includes(id)} onChange={() => toggleScopeMember('roles', id)} />
                        {role.displayName || role.name}
                      </label>
                    );
                  })}
              </div>
            )}
            {job.dataScope.mode === 'selected_users' && (
              <div className="sm-scope-options">
                {scopeUserOptions.map((person) => {
                  const id = String(person._id || person.id);
                  return (
                    <label key={id}>
                      <input type="checkbox" checked={job.dataScope.users.includes(id)} onChange={() => toggleScopeMember('users', id)} />
                      {person.firstName} {person.lastName}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {renderJobFields(job)}
        {renderScreenSections(job)}
        </>)}
      </section>
    );
  };

  const renderRoleJobs = () => {
    const needle = roleJobSearch.trim().toLowerCase();
    const matchesSearch = (job) => `${job.label} ${job.pageKey} ${job.group}`.toLowerCase().includes(needle);
    // Searching for a page names it, so it has to be found whether or not the
    // role can open it yet. Filtering the search by "allowed" hid exactly the
    // page an administrator comes here to grant: an operator told to have
    // "Create" ticked on Parts Scan searched for it and was told no page
    // matched, because the role had never been given the page in the first
    // place. Without a search the toggle still decides how long the list is.
    const visible = roleJobs.filter((job) => (needle ? matchesSearch(job) : roleJobShowAll || job.allowed));
    // Say so when the search is what put an unheld page on screen, so the
    // "Allow this page" switch on it does not look like a state that was saved.
    const revealedBySearch = needle && !roleJobShowAll ? visible.filter((job) => !job.allowed).length : 0;
    const allowedCount = roleJobs.filter((job) => job.allowed).length;
    // Page access alone is read-only: a role can hold every page in the system
    // and still be refused every Create, because the actions live here and
    // nowhere else. Roles carried over from before this screen existed look
    // fully granted on Roles Permissions and have no ticked action at all, which
    // reads to an administrator as "Create is on but the user is denied". Count
    // what is actually ticked so the screen can say which it is.
    const hasAction = (job) => Object.entries(job.actions || {})
      .some(([key, on]) => key !== 'view' && on === true && capabilityOf(job.pageKey).actions.includes(key));
    const actionableCount = roleJobs.filter((job) => job.allowed && hasAction(job)).length;
    // Cards keep the sidebar's own grouping, so a page is where the
    // administrator already expects to find it.
    const grouped = visible.reduce((acc, job) => {
      (acc[job.group] = acc[job.group] || []).push(job);
      return acc;
    }, {});

    return <form className="sm-panel" onSubmit={(event) => { event.preventDefault(); saveRoleJobs(); }}>
      <div className="sm-panel-header">
        <div>
          <h2>Role Jobs</h2>
          <p>Give a role its pages, then set what it can do there, whose business data it can see, and which fields of that data it may read. Own data is always included.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setShowLeadAssignmentRoleModal(true)}>+ Create Role</button>
          <button className="btn btn-primary" disabled={!selectedJobRoleId || roleJobsSaving}>{roleJobsSaving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>

      <div className="sm-form-grid sm-form-stack">
        <label>Management Role</label>
        <select className="form-input" value={selectedJobRoleId} onChange={(event) => loadRoleJobs(event.target.value)} style={{ maxWidth: 420 }}>
          <option value="">Select a role</option>
          {roleArr.filter((role) => role.name !== 'super_admin').map((role) => (
            <option key={getRoleId(role)} value={getRoleId(role)}>{role.displayName || role.name}</option>
          ))}
        </select>
      </div>

      {selectedJobRoleId && !roleJobsLoading && (
        <div className="sm-role-job-toolbar">
          <input
            type="search"
            className="form-input"
            placeholder="Find a page — try “scan”"
            value={roleJobSearch}
            onChange={(event) => setRoleJobSearch(event.target.value)}
          />
          <label className="sm-page-toggle">
            <input type="checkbox" checked={roleJobShowAll} onChange={() => setRoleJobShowAll((on) => !on)} />
            <span>Show pages this role cannot open</span>
          </label>
          <span className="sm-role-job-count">
            {allowedCount} of {roleJobs.length} pages allowed · {actionableCount} with actions
          </span>
        </div>
      )}

      {/* The state that produces "Create is ticked but the user is denied": the
          role opens pages but nothing on them was ever ticked here. */}
      {selectedJobRoleId && !roleJobsLoading && allowedCount > 0 && actionableCount === 0 && (
        <p className="sm-role-job-warning">
          This role can open {allowedCount} {allowedCount === 1 ? 'page' : 'pages'} but has no action ticked on any of
          them, so its users can only look — every Create, Edit and Delete will be refused. Page access on
          “Roles Permissions” does not grant actions; tick them on the cards below and Save.
        </p>
      )}

      {revealedBySearch > 0 && (
        <p className="sm-role-job-revealed">
          {revealedBySearch === 1 ? '1 matching page is' : `${revealedBySearch} matching pages are`} not granted to this role yet —
          turn on “Allow this page” to configure {revealedBySearch === 1 ? 'it' : 'them'}.
        </p>
      )}

      {roleJobsLoading
        ? <p className="sm-empty">Loading role jobs...</p>
        : !selectedJobRoleId
          ? <p className="sm-empty">Select a role to configure it.</p>
          : visible.length === 0
            ? <p className="sm-empty">{needle ? `No page matches “${roleJobSearch}”.` : 'This role has no pages yet — tick “Show pages this role cannot open” to grant some.'}</p>
            : <div className="sm-role-job-groups">
              {Object.entries(grouped).map(([group, jobs]) => (
                <div className="sm-role-job-group" key={group}>
                  <h3 className="sm-role-job-group-name">{group}</h3>
                  <div className="sm-role-job-list">{jobs.map(renderRoleJobCard)}</div>
                </div>
              ))}
            </div>}
    </form>;
  };

  const renderEmployeeConfig = () => (
    <form className="sm-panel" data-role-usage-panel="employee" onSubmit={(e) => { e.preventDefault(); saveEmployeeConfig(); }}>
      <div className="sm-panel-header">
        <div>
          <h2>Employee Config</h2>
          <p>Select the role automatically assigned whenever a new employee is created.</p>
        </div>
        <button type="submit" className="btn btn-primary" disabled={employeeConfigSaving || !employeeConfigActiveRoleId}>
          {employeeConfigSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div className="sm-form-grid sm-form-stack">
        <label>New Employee Role</label>
        <select className="form-input" value={employeeConfigActiveRoleId} onChange={(e) => setEmployeeConfigActiveRoleId(e.target.value)} style={{ maxWidth: '400px' }}>
          <option value="">Select a role</option>
          {roleArr.filter((r) => r.name !== 'super_admin').map((role) => (
            <option key={getRoleId(role)} value={getRoleId(role)}>{role.displayName || role.name}</option>
          ))}
        </select>
      </div>
    </form>
  );



  /** Shared "pick the roles that staff this field" panel. */
  const renderRoleUsagePicker = ({
    panel, heading, blurb, label, selected, setSelected, saving, onSave,
  }) => (
    <form
      className="sm-panel"
      data-role-usage-panel={panel}
      onSubmit={(e) => { e.preventDefault(); onSave(); }}
    >
      <div className="sm-panel-header">
        <div>
          <h2>{heading}</h2>
          <p>{blurb}</p>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div className="sm-form-grid sm-form-stack">
        <label>{label}</label>
        {roleArr.length === 0 ? (
          <p className="sm-empty">
            No roles found. Create roles first in the Roles Permissions tab.
          </p>
        ) : (
          <div
            className="sm-checkbox-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '8px',
            }}
          >
            {roleArr
              .filter((r) => r.name !== 'super_admin')
              .map((role) => {
                const rid = String(getRoleId(role));
                return (
                  <label
                    key={rid}
                    className="sm-permission-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(rid)}
                      onChange={() => setSelected((prev) => (
                        prev.includes(rid) ? prev.filter((id) => id !== rid) : [...prev, rid]
                      ))}
                    />
                    <span>{role.displayName || role.name}</span>
                  </label>
                );
              })}
          </div>
        )}
      </div>
    </form>
  );

  // ── Custom modules ───────────────────────────────────────────────────────
  const loadModules = async () => {
    setModulesLoading(true);
    try {
      const { data: res } = await modulesAPI.getAll();
      setModules(res?.data || []);
    } catch (err) { showApiError(err, 'Failed to load modules'); }
    finally { setModulesLoading(false); }
  };
  useEffect(() => { if (activeTab === 'Custom') loadModules(); }, [activeTab]);

  const toggleModule = async (key, enabled) => {
    // Optimistic: the switch answers at once, and is put back if the save fails.
    setModules((items) => items.map((item) => (item.key === key ? { ...item, enabled } : item)));
    try {
      const { data: res } = await modulesAPI.update(key, enabled);
      showApiSuccess(res, enabled ? 'Module enabled' : 'Module disabled');
      // The sidebar and the session both carry the flags; refresh them.
      if (typeof refreshUser === 'function') refreshUser();
      window.dispatchEvent(new Event('ams:sidebar-refresh'));
    } catch (err) {
      showApiError(err, 'Failed to update module');
      setModules((items) => items.map((item) => (item.key === key ? { ...item, enabled: !enabled } : item)));
    }
  };

  const renderCustom = () => (
    <div className="sm-panel">
      <div className="sm-panel-head">
        <div>
          <h2>Custom documents</h2>
          <p>Quote, book and invoice anything that is neither a vehicle nor a part — free-text lines, no stock. Each screen is hidden, and its API closed, until its switch is on. Grant the pages in Role Jobs as usual.</p>
        </div>
      </div>
      {modulesLoading ? <p className="sm-role-job-note">Loading…</p> : (
        <div className="sm-module-list">
          {modules.map((item) => (
            <div className="sm-module-row" key={item.key}>
              <div>
                <strong>{item.label}</strong>
                <span className="sm-module-page">/{item.pages.join(', /')} — page key <code>{item.pages[0]}</code></span>
              </div>
              <div className="sm-module-switch">
                <span className={item.enabled ? 'sm-module-on' : 'sm-module-off'}>{item.enabled ? 'On' : 'Off'}</span>
                <ToggleSwitch checked={item.enabled} onChange={(checked) => toggleModule(item.key, checked)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderRoleUsage = () => (
    <div className="sm-role-usage">
      <form
        className="sm-panel"
        onSubmit={(e) => {
          e.preventDefault();
          saveLeadAssignment();
        }}
      >
        <div className="sm-panel-header">
          <div>
            <h2>Role Usage</h2>
            <p>
              Configure which roles are used for lead assignment and customer
              management.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowLeadAssignmentRoleModal(true)}
            >
              + Create Role
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={leadAssignmentSaving}
            >
              {leadAssignmentSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <div className="sm-form-grid sm-form-stack" data-role-usage-panel="lead" style={{ marginBottom: "24px" }}>
          <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
            Lead Assignment Roles
          </label>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "-8px 0 12px 0" }}>
            Select which roles can be assigned as lead assignees. Only users with these roles will appear in the lead assignee dropdown.
          </p>
          {roleArr.length === 0 ? (
            <p className="sm-empty">
              No roles found. Create roles first in the Roles Permissions tab.
            </p>
          ) : (
            <div
              className="sm-checkbox-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: "8px",
              }}
            >
              {roleArr
                .filter((r) => r.name !== "super_admin")
                .map((role) => {
                  const rid = String(getRoleId(role));
                  const checked = leadAssignmentSelectedRoles.includes(rid);
                  return (
                    <label
                      key={rid}
                      className="sm-permission-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        border: "1px solid var(--border-light)",
                        borderRadius: "8px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLeadAssignmentRole(rid)}
                      />
                      <span>{role.displayName || role.name}</span>
                    </label>
                  );
                })}
            </div>
          )}
        </div>
        <div data-role-usage-panel="customer" style={{ borderTop: "1px solid var(--border-light)", paddingTop: "20px" }}>
          <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)", display: "block", marginBottom: "4px" }}>
            Customer Role Config
          </label>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 16px 0" }}>
            Select which role is assigned to newly converted customers and which roles are considered customer roles.
          </p>
          <div className="sm-form-grid sm-form-stack" style={{ marginBottom: "16px" }}>
            <label>Active Customer Role</label>
            <select
              className="form-input"
              value={customerConfigActiveRoleId}
              onChange={(e) => setCustomerConfigActiveRoleId(e.target.value)}
              style={{ maxWidth: "400px" }}
            >
              <option value="">Select a role</option>
              {roleArr
                .filter((r) => r.name !== "super_admin")
                .map((role) => (
                  <option key={getRoleId(role)} value={getRoleId(role)}>
                    {role.displayName || role.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="sm-form-grid sm-form-stack">
            <label>Available Customer Roles</label>
            {roleArr.length === 0 ? (
              <p className="sm-empty">No roles found. Create roles first in the Roles Permissions tab.</p>
            ) : (
              <div
                className="sm-checkbox-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: "8px",
                }}
              >
                {roleArr
                  .filter((r) => r.name !== "super_admin")
                  .map((role) => {
                    const rid = String(getRoleId(role));
                    const checked = customerConfigAvailableRoleIds.includes(rid);
                    return (
                      <label
                        key={rid}
                        className="sm-permission-row"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 12px",
                          border: "1px solid var(--border-light)",
                          borderRadius: "8px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setCustomerConfigAvailableRoleIds((prev) =>
                              prev.includes(rid)
                                ? prev.filter((r) => r !== rid)
                                : [...prev, rid],
                            );
                          }}
                        />
                        <span>{role.displayName || role.name}</span>
                      </label>
                    );
                  })}
              </div>
            )}
          </div>
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={customerConfigSaving}
              onClick={saveCustomerConfig}
            >
              {customerConfigSaving ? "Saving..." : "Save Customer Config"}
            </button>
          </div>
        </div>
      </form>
      {renderEmployeeConfig()}
      {renderRoleUsagePicker({
        panel: 'warehouse-manager',
        heading: 'Warehouse Manager Roles',
        blurb: 'Select which roles can be assigned as warehouse managers. Only active users with these roles appear in the Warehouse Management manager dropdown.',
        label: 'Warehouse Manager Roles',
        selected: warehouseManagerRoleIds,
        setSelected: setWarehouseManagerRoleIds,
        saving: warehouseManagerSaving,
        onSave: saveWarehouseManagerRoles,
      })}
      {renderRoleUsagePicker({
        panel: 'service-advisor',
        heading: 'Service Advisor Roles',
        blurb: 'Select which roles act as service advisors. Only active users with these roles appear in the Service page advisor dropdown.',
        label: 'Service Advisor Roles',
        selected: serviceAdvisorRoleIds,
        setSelected: setServiceAdvisorRoleIds,
        saving: serviceAdvisorSaving,
        onSave: saveServiceAdvisorRoles,
      })}
    </div>
  );

  useModalKeyboard(showPageModal, () => setShowPageModal(false), null);
  useModalKeyboard(
    Boolean(assetDeleteTarget),
    () => setAssetDeleteTarget(null),
    null,
  );
  useModalKeyboard(
    showLeadAssignmentRoleModal,
    () => setShowLeadAssignmentRoleModal(false),
    null,
  );

  if (loading) {
    return (
      <div className="server-management">
        <div className="sm-panel">Loading server management...</div>
      </div>
    );
  }

  return (
    <div
      className="server-management"
      onKeyDownCapture={handleServerManagementEnterSave}
    >
      <div className="sm-page-header">
        <div>
          <h1>Server Management</h1>
          <p>
            Manage sidebar, branding, roles, permissions and server settings.
          </p>
        </div>
      </div>

      <div className="sm-tabs">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Frontend Management" && renderPages()}
      {activeTab === "Branding" && renderBranding()}
      {activeTab === "Roles Permissions" && renderRoles()}
      {activeTab === "User Permissions" && renderUserPermissions()}
      {activeTab === "Log Permissions" && renderLogPermissions()}
      {activeTab === "Role Jobs" && renderRoleJobs()}
      {activeTab === "Role Usage" && renderRoleUsage()}
      {activeTab === "Custom" && renderCustom()}
      {renderPageModal()}
      <UserFormModal
        isOpen={showUserModal}
        mode="create"
        initialData={null}
        roles={roleArr}
        departments={[]}
        onClose={() => setShowUserModal(false)}
        onSubmit={handleCreateUserFromModal}
        loading={userModalLoading}
      />
      {assetDeleteTarget && (
        <div
          className="sm-modal-backdrop"
          onClick={() => setAssetDeleteTarget(null)}
        >
          <div
            className="sm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sm-modal-header">
              <h3>Delete Asset</h3>
              <button
                type="button"
                className="sm-modal-close"
                onClick={() => setAssetDeleteTarget(null)}
              >
                &times;
              </button>
            </div>
            <div className="sm-modal-body">
              <p>
                Delete "
                {assetDeleteTarget.originalName || assetDeleteTarget.fileName}"?
                Assigned branding will fall back to default.
              </p>
            </div>
            <div className="sm-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAssetDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDeleteAsset}
                disabled={savingAssetDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <RoleFormModal
        isOpen={showLeadAssignmentRoleModal}
        onClose={() => setShowLeadAssignmentRoleModal(false)}
        onSubmit={handleCreateRoleFromModal}
        loading={leadAssignmentRoleModalLoading}
      />
    </div>
  );
}

export default ServerManagement;
