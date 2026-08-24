import React, { useEffect, useCallback, useRef, useState } from "react";
import { useLogs } from "../context/LogsContext";
import { useAuth } from "../context/AuthContext";
import { pageActions } from "../utils/roleJobs";
import LogTable from "../components/logs/LogTable";
import FilterBar, {
  SearchInput,
  SelectFilter,
  ResetFiltersButton,
} from "../components/filters/FilterBar";
import DetailsDrawer from "../components/logs/DetailsDrawer";
import StatisticsCards from "../components/logs/StatisticsCards";
import "../styles/logs.css";
import "../styles/filters.css";

const defaultFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  timeFrom: "",
  timeTo: "",
  severity: "",
  method: "",
  statusCode: "",
  logsOf: "",
  role: "",
  roleName: "",
  endpoint: "",
  requestId: "",
  success: "",
  page: 1,
  limit: 25,
};

const buildLogQueryParams = (filterState, page = 1) => {
  const params = {
    search: filterState.search,
    dateFrom: filterState.dateFrom,
    timeFrom: filterState.timeFrom,
    dateTo: filterState.dateTo,
    timeTo: filterState.timeTo,
    logsOf: filterState.logsOf,
    roleName: filterState.roleName || filterState.role,
    method: filterState.method,
    statusCode: filterState.statusCode,
    severity: filterState.severity,
    endpoint: filterState.endpoint,
    requestId: filterState.requestId,
    success: filterState.success,
    page,
    limit: filterState.limit || 25,
  };
  const hasDateFilter = params.dateFrom || params.dateTo || params.timeFrom || params.timeTo;
  if (hasDateFilter) {
    params.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
  return params;
};

const getActiveFilterCount = (f) => {
  let count = 0;
  if (f.search) count++;
  if (f.dateFrom || f.dateTo || f.timeFrom || f.timeTo) count++;
  if (f.severity) count++;
  if (f.method) count++;
  if (f.statusCode) count++;
  if (f.logsOf) count++;
  if (f.roleName || f.role) count++;
  if (f.endpoint) count++;
  if (f.requestId) count++;
  if (f.success) count++;
  return count;
};

export default function Logs() {
  const {
    logs,
    stats,
    filterOptions,
    pagination,
    loading,
    tableLoading,
    statsLoading,
    error,
    accessDenied,
    loadLogs,
    removeLog,
    loadStats,
    socketConnected,
    newLogsAvailable,
    hiddenLiveCount,
    showNewLogs,
  } = useLogs();

  const [filters, setFilters] = useState(defaultFilters);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const appliedFiltersRef = useRef(defaultFilters);

  const activeFilterCount = getActiveFilterCount(filters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);

  const load = useCallback(
    async (page = 1, extraParams = {}) => {
      const params = { ...buildLogQueryParams(appliedFiltersRef.current, page), ...extraParams };
      await loadLogs(params);
      if (page === 1) {
        loadStats(params);
      }
    },
    [loadLogs, loadStats],
  );

  useEffect(() => {
    appliedFiltersRef.current = appliedFilters;
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      load(1, { includeFilters: true }).finally(() => setInitialLoading(false));
    } else {
      load(1);
    }
  }, [appliedFilters, load]);

  const handleApplyFilters = (event) => {
    event?.preventDefault?.();
    setAppliedFilters({ ...filters, page: 1 });
  };

  const handleResetFilters = () => {
    const reset = { ...defaultFilters };
    setFilters(reset);
    setAppliedFilters(reset);
  };

  const handlePageChange = (page) => {
    if (page < 1 || page > (pagination.totalPages || 1)) return;
    load(page);
  };

  const handleViewLog = async (log) => {
    setSelectedLog(log);
    setShowDrawer(true);
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setSelectedLog(null);
  };

  // LogTable draws its Delete only when it is handed a handler, so withholding
  // the handler withholds the button. The endpoint asks for the same grant.
  const canDeleteLog = pageActions(useAuth().user, 'logs')('delete');

  const handleDeleteLog = (log) => {
    setConfirmDeleteId(log._id || log.id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    const success = await removeLog(confirmDeleteId);
    if (success) {
      load(pagination.page);
    }
    setConfirmDeleteId(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") setConfirmDeleteId(null);
    if (e.key === "Enter" && confirmDeleteId) confirmDelete();
  };

  useEffect(() => {
    if (confirmDeleteId) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [confirmDeleteId]);

  return (
    <div className="logs-page">
      <div className="page-header">
        <h1>Logs</h1>
        <div className="page-header-actions">
          {socketConnected && (
            <span className="socket-indicator" title="Live updates active">Live</span>
          )}
          <button
            className="btn btn-primary"
            onClick={() => load(pagination.page)}
            disabled={tableLoading}
          >
            {tableLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <StatisticsCards stats={stats} />

      <form onSubmit={handleApplyFilters}>
        <FilterBar>
          <div className="filter-group">
            <label className="filter-label">Search Logs</label>
            <SearchInput
              placeholder="Search endpoint, user, action..."
              value={filters.search}
              onChange={(v) => setFilters((prev) => ({ ...prev, search: v }))}
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">Logs Of</label>
            <SelectFilter
              value={filters.logsOf}
              onChange={(v) =>
                setFilters((prev) => ({ ...prev, logsOf: v, userId: "" }))
              }
              allLabel="All Allowed Logs"
            >
              {filterOptions.includeServerErrors && (
                <option value="server">Server</option>
              )}
              {filterOptions.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email || u.id}
                </option>
              ))}
            </SelectFilter>
          </div>
          <div className="filter-group">
            <label className="filter-label">Date From</label>
            <input
              type="date"
              className="form-control"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
              }
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">Time From</label>
            <input
              type="time"
              className="form-control"
              value={filters.timeFrom}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, timeFrom: e.target.value }))
              }
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">Date To</label>
            <input
              type="date"
              className="form-control"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
              }
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">Time To</label>
            <input
              type="time"
              className="form-control"
              value={filters.timeTo}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, timeTo: e.target.value }))
              }
            />
          </div>
          <div className="filter-group">
            <label className="filter-label">Role</label>
            <SelectFilter
              value={filters.roleName || filters.role}
              onChange={(v) =>
                setFilters((prev) => ({ ...prev, role: "", roleName: v }))
              }
              allLabel="All Roles"
            >
              {filterOptions.roles.map((r) => (
                <option key={r.id || r.name} value={r.name}>
                  {r.displayName || r.name}
                </option>
              ))}
            </SelectFilter>
          </div>
          <div className="filter-group">
            <label className="filter-label">Method</label>
            <SelectFilter
              value={filters.method}
              onChange={(v) => setFilters((prev) => ({ ...prev, method: v }))}
              allLabel="All Methods"
            >
              {filterOptions.methods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </SelectFilter>
          </div>
          <div className="filter-group">
            <label className="filter-label">Success Status</label>
            <SelectFilter
              value={filters.success}
              onChange={(v) =>
                setFilters((prev) => ({ ...prev, success: v }))
              }
              allLabel="All Statuses"
            >
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </SelectFilter>
          </div>
          <div className="filter-group">
            <label className="filter-label">Severity</label>
            <SelectFilter
              value={filters.severity}
              onChange={(v) => setFilters((prev) => ({ ...prev, severity: v }))}
              allLabel="All Severities"
            >
              {filterOptions.severities.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </SelectFilter>
          </div>
          <div className="filter-group">
            <label className="filter-label">Status Code</label>
            <SelectFilter
              value={filters.statusCode}
              onChange={(v) =>
                setFilters((prev) => ({ ...prev, statusCode: v }))
              }
              allLabel="All Status Codes"
            >
              {filterOptions.statusCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </SelectFilter>
          </div>
          <div className="filter-group">
            <label className="filter-label">API Endpoint</label>
            <input
              className="form-control"
              list="log-endpoints"
              placeholder="Filter by path..."
              value={filters.endpoint}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, endpoint: e.target.value }))
              }
            />
            <datalist id="log-endpoints">
              {filterOptions.endpoints.map((endpoint) => (
                <option key={endpoint} value={endpoint} />
              ))}
            </datalist>
          </div>
          <div className="filter-group">
            <label className="filter-label">Request ID</label>
            <input
              className="form-control"
              list="log-request-ids"
              placeholder="Filter by request ID..."
              value={filters.requestId}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, requestId: e.target.value }))
              }
            />
            <datalist id="log-request-ids">
              {filterOptions.requestIds.map((requestId) => (
                <option key={requestId} value={requestId} />
              ))}
            </datalist>
          </div>
          <div className="filter-actions">
            <button type="submit" className="btn btn-primary btn-sm" style={{marginRight:"10px"}}>
              Apply Filters
            </button>
            <ResetFiltersButton
              count={activeFilterCount}
              onClick={handleResetFilters}
            />
          </div>
        </FilterBar>
      </form>

      {initialLoading && (
        <div className="log-table-loader">Loading logs...</div>
      )}

      {error && !initialLoading && (
        <div className="log-error-banner">
          <span>{error}</span>
          <button onClick={() => load(pagination.page)}>Retry</button>
        </div>
      )}

      <LogTable
        logs={logs}
        onView={handleViewLog}
        onDelete={canDeleteLog ? handleDeleteLog : undefined}
        loading={tableLoading}
      />

      {pagination.totalPages > 1 && (
        <div className="log-pagination">
          <button
            className="btn btn-sm btn-outline"
            disabled={pagination.page <= 1}
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            Previous
          </button>
          <span className="log-pagination-info">
            Page {pagination.page} of {pagination.totalPages} (
            {pagination.total} total)
          </span>
          <button
            className="btn btn-sm btn-outline"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {showDrawer && selectedLog && (
        <DetailsDrawer log={selectedLog} onClose={handleCloseDrawer} />
      )}

      {confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button
                className="modal-close"
                onClick={() => setConfirmDeleteId(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete this log? This action cannot be
                undone.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-outline"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
