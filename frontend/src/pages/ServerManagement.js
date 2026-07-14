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
import { serverManagementAPI, adminAPI, customerRoleConfigAPI } from "../services/api";
import { showApiSuccess, showApiError } from "../utils/toastResponse";
import "../styles/serverManagement.css";
import "../styles/filters.css";

const tabs = [
  "Frontend Management",
  "Branding",
  "Roles Permissions",
  "User Permissions",
  "Log Permissions",
  "Lead Assignment",
  "Customer Config",
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

  const openPageModal = () => {
    setPageDraft({ ...blankPage, sortOrder: pagesArr.length });
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
    <form className="sm-panel" onSubmit={saveSidebar}>
      <div className="sm-panel-header">
        <div>
          <h2>Frontend Management</h2>
          <p>Mongo Pages are the runtime source for the sidebar.</p>
        </div>
        <div className="sm-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={openPageModal}
          >
            Add Page
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={savingSidebar}
          >
            Save Sidebar
          </button>
        </div>
      </div>
      <div className="sm-table-wrapper sm-table-desktop">
        <table className="sm-table">
          <thead>
            <tr>
              <th>Visible</th>
              <th>Label</th>
              <th>Path</th>
              <th>Group</th>
              <th>Icon</th>
              <th>Sort</th>
            </tr>
          </thead>
          <tbody>
            {pagesArr.map((page, index) => (
              <tr key={page._id || page.path}>
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
                    className="form-input"
                    type="number"
                    value={page.sortOrder || 0}
                    onChange={(event) =>
                      updatePage(index, "sortOrder", Number(event.target.value))
                    }
                  />
                </td>
              </tr>
            ))}
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
              <span className="sm-card-sort">Sort: {page.sortOrder || 0}</span>
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
          <div className="sm-panel-header">
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
          <div className="sm-form-grid">
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
          <div className="sm-actions">
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
      saveSidebar(event);
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
    } else if (activeTab === "Lead Assignment") {
      event.preventDefault();
      saveLeadAssignment(event);
      return;
    } else if (activeTab === "Customer Config") {
      event.preventDefault();
      saveCustomerConfig(event);
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

  const renderCustomerConfig = () => (
    <form
      className="sm-panel"
      onSubmit={(e) => {
        e.preventDefault();
        saveCustomerConfig();
      }}
    >
      <div className="sm-panel-header">
        <div>
          <h2>Customer Role Config</h2>
          <p>
            Select which role is assigned to newly converted customers and which roles are considered customer roles.
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
            disabled={customerConfigSaving}
          >
            {customerConfigSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      <div className="sm-form-grid">
        <label>Active Customer Role</label>
        <select className="form-input" value={customerConfigActiveRoleId} onChange={(e) => setCustomerConfigActiveRoleId(e.target.value)} style={{ maxWidth: '400px' }}>
          <option value="">Select a role</option>
          {roleArr.filter((r) => r.name !== 'super_admin').map((role) => (
            <option key={getRoleId(role)} value={getRoleId(role)}>{role.displayName || role.name}</option>
          ))}
        </select>
      </div>
      <div className="sm-form-grid">
        <label>Available Customer Roles</label>
        {roleArr.length === 0 ? (
          <p className="sm-empty">No roles found. Create roles first in the Roles Permissions tab.</p>
        ) : (
          <div className="sm-checkbox-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "8px" }}>
            {roleArr.filter((r) => r.name !== 'super_admin').map((role) => {
              const rid = String(getRoleId(role));
              const checked = customerConfigAvailableRoleIds.includes(rid);
              return (
                <label key={rid} className="sm-permission-row" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", border: "1px solid var(--border-light)", borderRadius: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setCustomerConfigAvailableRoleIds((prev) =>
                        prev.includes(rid) ? prev.filter((r) => r !== rid) : [...prev, rid]
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
    </form>
  );

  const renderLeadAssignment = () => (
    <form
      className="sm-panel"
      onSubmit={(e) => {
        e.preventDefault();
        saveLeadAssignment();
      }}
    >
      <div className="sm-panel-header">
        <div>
          <h2>Lead Assignment</h2>
          <p>
            Select which roles can be assigned as lead assignees. Only users
            with these roles will appear in the lead assignee dropdown.
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
      <div className="sm-form-grid">
        <label>Roles Allowed for Lead Assignment</label>
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
    </form>
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
      {activeTab === "Lead Assignment" && renderLeadAssignment()}
      {activeTab === "Customer Config" && renderCustomerConfig()}
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
