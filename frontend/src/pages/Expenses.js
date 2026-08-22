import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useExpenses } from "../context/ExpensesContext";
import toast from "react-hot-toast";
import ErrorPopup from "../components/ErrorPopup";
import ConfirmModal from "../components/ConfirmModal";
import ActionButtons from "../components/ActionButtons";
import ExpenseFormModal from "./ExpenseFormModal";
import { accountsAPI } from "../services/api";
import CategoryFormModal from "./CategoryFormModal";
import ExpenseDrawer from "./ExpenseDrawer";
import CategoryDrawer from "./CategoryDrawer";
import BulkSelectionBar from "../components/BulkSelectionBar";
import { Search } from "lucide-react";
import { fieldAccessor, pageActions, getRoleJob } from "../utils/roleJobs";
import "../styles/userManagement.css";

const GROUP_LABELS = {
  workshop: "Workshop",
  general: "General",
  salary: "Salary",
};

const Expenses = () => {
  const { user: currentUser, hasRole } = useAuth();
  // New Expense, New Category and every row action were drawn unconditionally.
  const can = pageActions(currentUser, 'expenses');
  const {
    expenses: ctxExpenses,
    categories,
    employees,
    stats,
    loading: ctxLoading,
    saving,
    loadExpenses,
    loadReferenceData,
    createExpense,
    updateExpense,
    deleteExpense,
    setExpenseStatus,
    postExpense,
    bulkDeleteExpenses,
    bulkDeactivateExpenses,
    createCategory,
    updateCategory,
    setExpenses,
  } = useExpenses();

  const [loading, setLoading] = useState(true);
  const [errorPopup, setErrorPopup] = useState(null);
  const location = useLocation();
  // Which columns this role may read. The API already strips what it withholds,
  // so this only stops us drawing a column that would always be blank.
  const showField = fieldAccessor(currentUser, "expenses");

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") || "";

  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tab, setTab] = useState("expenses");

  // The money accounts an expense can be paid from. Posting refuses an
  // expense that names none, so the form has to offer them.
  const [accounts, setAccounts] = useState([]);
  useEffect(() => { accountsAPI.getForPayments().then(setAccounts); }, []);

  const [showExpModal, setShowExpModal] = useState(false);
  const [expModalMode, setExpModalMode] = useState("create");
  const [selectedExpense, setSelectedExpense] = useState(null);

  const [showCatModal, setShowCatModal] = useState(false);
  const [catModalMode, setCatModalMode] = useState("create");
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [drawerExpense, setDrawerExpense] = useState(null);
  const [drawerCategory, setDrawerCategory] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);
  const toggleSelected = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allSelected =
    ctxExpenses.length > 0 &&
    ctxExpenses.every((item) => selectedIds.has(item._id || item.id));
  const toggleAll = () =>
    setSelectedIds(
      allSelected
        ? new Set()
        : new Set(ctxExpenses.map((item) => item._id || item.id)),
    );
  const handleBulkAction = async () => {
    const result =
      bulkAction === "delete"
        ? await bulkDeleteExpenses([...selectedIds])
        : await bulkDeactivateExpenses([...selectedIds]);
    if (result.success) {
      setSelectedIds(new Set());
      setBulkAction(null);
      fetchExpenses();
      loadReferenceData();
    } else if (result.error) setErrorPopup(result.error);
  };

  // Posting an expense to the ledger is guarded on the server as an edit.
  // Posting to the ledger is its own grant (Role Jobs → Expenses → Post to
  // ledger); the role list is only the fallback for an unconfigured role.
  const canPost = getRoleJob(currentUser, 'expenses') ? can('postLedger') : (can('edit') && hasRole(["super_admin", "admin", "accountant"]));

  useEffect(() => {
    const h = (location.hash || "").replace(/^#/, "");
    if (h === "categories") setTab("categories");
  }, [location.pathname, location.hash]);

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(categoryFilter && { category: categoryFilter }),
      };
      const response = await loadExpenses(params);
      if (response) {
        const list = response.expenses || [];
        setExpenses(list);
        setTotalPages(Math.ceil(response.pagination?.total / limit) || 1);
        setTotal(response.pagination?.total || 0);
      }
    } catch (err) {
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    search,
    statusFilter,
    categoryFilter,
    loadExpenses,
    setExpenses,
  ]);

  useEffect(() => {
    if (currentUser) fetchExpenses();
  }, [currentUser, fetchExpenses]);

  useEffect(() => {
    if (currentUser) loadReferenceData().catch(() => {});
  }, [currentUser, loadReferenceData]);

  useEffect(() => {
    if (urlSearch) setSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => { if (searchParams.get('action') === 'create') openExpModal('create'); }, []);

  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      setPage(1);
      fetchExpenses();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentUser, search, statusFilter, categoryFilter, fetchExpenses]);

  const openExpModal = (mode, exp = null) => {
    setExpModalMode(mode);
    setSelectedExpense(exp);
    setShowExpModal(true);
  };
  const closeExpModal = () => {
    setShowExpModal(false);
    setSelectedExpense(null);
  };

  const openCatModal = (mode, cat = null) => {
    setCatModalMode(mode);
    setSelectedCategory(cat);
    setShowCatModal(true);
  };
  const closeCatModal = () => {
    setShowCatModal(false);
    setSelectedCategory(null);
  };

  const handleCreateExpense = async (formData) => {
    const result = await createExpense(formData);
    if (result.success) {
      closeExpModal();
      fetchExpenses();
    } else if (result.error) setErrorPopup(result.error);
  };

  const handleUpdateExpense = async (formData) => {
    const id = selectedExpense?._id || selectedExpense?.id;
    const result = await updateExpense(id, formData);
    if (result.success) {
      closeExpModal();
      fetchExpenses();
    } else if (result.error) setErrorPopup(result.error);
  };

  const handleDeleteExpense = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete._id || confirmDelete.id;
    const result = await deleteExpense(id);
    if (result.success) {
      setConfirmDelete(null);
      fetchExpenses();
    } else if (result.error) setErrorPopup(result.error);
  };

  const handlePostExpense = async (id) => {
    const result = await postExpense(id);
    if (!result.success && result.error) setErrorPopup(result.error);
    if (result.success) fetchExpenses();
  };

  const handleCreateCategory = async (formData) => {
    const result = await createCategory(formData);
    if (result.success) {
      closeCatModal();
    } else if (result.error) setErrorPopup(result.error);
  };

  const handleUpdateCategory = async (formData) => {
    const id = selectedCategory?._id || selectedCategory?.id;
    const result = await updateCategory(id, formData);
    if (result.success) {
      closeCatModal();
    } else if (result.error) setErrorPopup(result.error);
  };

  return (
    <div className="user-management-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Expenses</h1>
          <p className="subtitle">
            Workshop, general, and salary-linked expenses
          </p>
        </div>
        <div className="header-actions">
          <button
            className={`btn ${tab === "expenses" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTab("expenses")}
          >
            Expenses
          </button>
          <button
            className={`btn ${tab === "categories" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTab("categories")}
          >
            Categories
          </button>
          {tab === "expenses" && can('create') && (
            <button
              className="btn btn-primary btn-create"
              onClick={() => openExpModal("create")}
            >
              <span className="icon">+</span> New Expense
            </button>
          )}
          {tab === "categories" && can('create') && (
            <button
              className="btn btn-primary btn-create"
              onClick={() => openCatModal("create")}
            >
              <span className="icon">+</span> New Category
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-total">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <span className="stat-value">{stats.total || 0}</span>
            <span className="stat-label">Total</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div className="stat-icon">📝</div>
          <div className="stat-content">
            <span className="stat-value">{stats.draft || 0}</span>
            <span className="stat-label">Draft</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #3b82f6" }}>
          <div className="stat-icon">📤</div>
          <div className="stat-content">
            <span className="stat-value">{stats.submitted || 0}</span>
            <span className="stat-label">Submitted</span>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #22c55e" }}>
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <span className="stat-value">{stats.approved || 0}</span>
            <span className="stat-label">Approved</span>
          </div>
        </div>
      </div>

      <ErrorPopup error={errorPopup} onClose={() => setErrorPopup(null)} />

      {tab === "expenses" && (
        <>
          <div className="filters-bar">
            <div className="search-box">
              <span className="search-icon">
                <Search size={18} style={{ color: "#9ca3af" }} />
              </span>
              <input
                type="text"
                placeholder="Search by description, vendor..."
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
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="posted">Posted</option>
            </select>
            <span className="results-count">{total} expenses found</span>
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
                <p>Loading expenses...</p>
              </div>
            ) : ctxExpenses.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💸</div>
                <h3>No Expenses Found</h3>
                <p>No expenses match your search criteria.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="selection-cell">
                      <input
                        type="checkbox"
                        aria-label="Select all expenses on this page"
                        checked={allSelected}
                        onChange={toggleAll}
                      />
                    </th>
                    {showField("document") && <th>Expense #</th>}
                    {showField("document") && <th>Date</th>}
                    {showField("classification") && <th>Category</th>}
                    {showField("amount") && <th>Amount</th>}
                    {showField("vendor") && <th>Vendor</th>}
                    {showField("document") && <th>Status</th>}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ctxExpenses.map((exp) => {
                    const id = exp._id || exp.id;
                    const isPosted = exp.status === "posted";
                    return (
                      <tr
                        key={id}
                        className={isPosted ? "row-inactive" : ""}
                        onClick={() => setDrawerExpense(exp)}
                        style={{ cursor: "pointer" }}
                      >
                        <td
                          className="selection-cell"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${exp.expenseNumber || "expense"}`}
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSelected(id)}
                            disabled={isPosted}
                          />
                        </td>
                        {showField("document") && (
                          <td>{exp.expenseNumber || "-"}</td>
                        )}
                        {showField("document") && (
                          <td>
                            {exp.expenseDate
                              ? new Date(exp.expenseDate).toLocaleDateString(
                                  "en-GB",
                                )
                              : "-"}
                          </td>
                        )}
                        {showField("classification") && (
                          <td>
                            <span className="badge badge-info">
                              {exp.category || "-"}
                            </span>
                          </td>
                        )}
                        {showField("amount") && (
                          <td>
                            {exp.amount != null
                              ? Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : "-"}
                          </td>
                        )}
                        {showField("vendor") && <td>{exp.vendor || "-"}</td>}
                        {showField("document") && (
                          <td>
                            <span
                              className={`badge ${exp.status === "posted" ? "badge-success" : "badge-secondary"}`}
                            >
                              {exp.status || "-"}
                            </span>
                          </td>
                        )}
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="action-buttons">
                            {!isPosted && (
                              <ActionButtons
                                onEdit={can('edit') ? () => openExpModal("edit", exp) : null}
                                onDelete={can('delete') ? () => setConfirmDelete(exp) : null}
                                showEdit={can('edit')}
                                showDelete={can('delete')}
                              />
                            )}
                            {canPost && !isPosted && exp.status !== "draft" && (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handlePostExpense(id)}
                              >
                                Post
                              </button>
                            )}
                            {isPosted && (
                              <span className="badge badge-success">
                                Posted
                              </span>
                            )}
                          </div>
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
                <p>Loading expenses...</p>
              </div>
            ) : ctxExpenses.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💸</div>
                <h3>No Expenses Found</h3>
              </div>
            ) : (
              <div className="cards-grid">
                {ctxExpenses.map((exp) => {
                  const id = exp._id || exp.id;
                  const s = (exp.status || "").toLowerCase();
                  return (
                    <div
                      key={id}
                      className="data-card"
                      onClick={() => setDrawerExpense(exp)}
                    >
                      <input
                        type="checkbox"
                        className="card-select-checkbox"
                        aria-label={`Select ${exp.expenseNumber || "expense"}`}
                        checked={selectedIds.has(id)}
                        onChange={() => toggleSelected(id)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={s === "posted"}
                      />
                      <div className="data-card-top">
                        <div className="data-card-avatar">💸</div>
                        <div className="data-card-info">
                          {showField("document") && (
                            <span className="data-card-title">
                              {exp.expenseNumber || "-"}
                            </span>
                          )}
                          {showField("vendor") && (
                            <span className="data-card-subtitle">
                              {exp.vendor || "-"}
                            </span>
                          )}
                        </div>
                        {showField("document") && (
                          <span className={`badge-pill status-${s}`}>
                            {exp.status || "-"}
                          </span>
                        )}
                      </div>
                      <div className="data-card-body">
                        {showField("document") && (
                          <div className="data-card-row">
                            <span className="row-icon">📅</span>
                            <span className="row-label">Date</span>
                            <span className="row-value">
                              {exp.expenseDate
                                ? new Date(exp.expenseDate).toLocaleDateString(
                                    "en-GB",
                                  )
                                : "-"}
                            </span>
                          </div>
                        )}
                        {showField("amount") && (
                          <div className="data-card-row">
                            <span className="row-icon">💰</span>
                            <span className="row-label">Amount</span>
                            <span className="row-value">
                              {exp.amount != null
                                ? Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "-"}
                            </span>
                          </div>
                        )}
                        {showField("classification") && (
                          <div className="data-card-row">
                            <span className="row-icon">🏷</span>
                            <span className="row-label">Category</span>
                            <span className="row-value">
                              {exp.category || "-"}
                            </span>
                          </div>
                        )}
                      </div>
                      <div
                        className="data-card-footer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canPost && s !== "posted" && s !== "draft" && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handlePostExpense(id)}
                            style={{ marginRight: "auto" }}
                          >
                            Post
                          </button>
                        )}
                        {s !== "posted" && (
                          <ActionButtons
                            onEdit={can('edit') ? () => openExpModal("edit", exp) : null}
                            onDelete={can('delete') ? () => setConfirmDelete(exp) : null}
                            showEdit={can('edit')}
                            showDelete={can('delete')}
                          />
                        )}
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
              bulkAction === "delete"
                ? "Delete Expenses"
                : "Deactivate Expenses"
            }
            message={`${bulkAction === "delete" ? "Delete" : "Deactivate"} ${selectedIds.size} selected expense(s)?`}
            confirmText={bulkAction === "delete" ? "Delete" : "Deactivate"}
            onConfirm={handleBulkAction}
            onCancel={() => setBulkAction(null)}
          />

          <ConfirmModal
            isOpen={!!confirmDelete}
            title="Delete Expense"
            message="Delete this expense?"
            confirmText="Delete"
            onConfirm={handleDeleteExpense}
            onCancel={() => setConfirmDelete(null)}
          />

          <ExpenseFormModal
            isOpen={showExpModal}
            mode={expModalMode}
            initialData={selectedExpense}
            categories={categories}
            employees={employees}
            accounts={accounts}
            onClose={closeExpModal}
            onSubmit={
              expModalMode === "create"
                ? handleCreateExpense
                : handleUpdateExpense
            }
            loading={saving}
            onCategoryCreated={loadReferenceData}
          />
        </>
      )}

      {tab === "categories" && (
        <>
          <div className="table-container desktop-only">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Group</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const id = cat._id || cat.id;
                  return (
                    <tr
                      key={id}
                      onClick={() => setDrawerCategory(cat)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{cat.name || "-"}</td>
                      <td>
                        <code>{cat.code || "-"}</code>
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {GROUP_LABELS[cat.categoryGroup] ||
                            cat.categoryGroup ||
                            "-"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${cat.isActive ? "badge-success" : "badge-secondary"}`}
                        >
                          {cat.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <ActionButtons
                          onEdit={can('edit') ? () => openCatModal("edit", cat) : null}
                          showEdit={can('edit')}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mobile-only">
            <div className="cards-grid">
              {categories.map((cat) => {
                const id = cat._id || cat.id;
                return (
                  <div
                    key={id}
                    className="data-card"
                    onClick={() => setDrawerCategory(cat)}
                  >
                    <div className="data-card-top">
                      <div className="data-card-info">
                        <span className="data-card-title">
                          {cat.name || "-"}
                        </span>
                        <span className="data-card-subtitle">
                          {cat.code || "-"}
                        </span>
                      </div>
                      <span
                        className={`badge ${cat.isActive ? "badge-success" : "badge-secondary"}`}
                      >
                        {cat.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="data-card-body">
                      <div className="data-card-row">
                        <span className="row-label">Group</span>
                        <span className="row-value">
                          {GROUP_LABELS[cat.categoryGroup] ||
                            cat.categoryGroup ||
                            "-"}
                        </span>
                      </div>
                    </div>
                    <div
                      className="data-card-footer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ActionButtons
                        onEdit={can('edit') ? () => openCatModal("edit", cat) : null}
                        showEdit={can('edit')}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <CategoryFormModal
        isOpen={showCatModal}
        mode={catModalMode}
        initialData={selectedCategory}
        onClose={closeCatModal}
        onSubmit={
          catModalMode === "create"
            ? handleCreateCategory
            : handleUpdateCategory
        }
        loading={saving}
      />

      <ExpenseDrawer
        isOpen={!!drawerExpense}
        onClose={() => setDrawerExpense(null)}
        expense={drawerExpense}
      />
      <CategoryDrawer
        isOpen={!!drawerCategory}
        onClose={() => setDrawerCategory(null)}
        category={drawerCategory}
      />
    </div>
  );
};

export default Expenses;
