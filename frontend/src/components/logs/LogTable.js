import React from "react";

const formatDate = (d) => {
  if (!d) return "-";
  const date = new Date(d);
  return isNaN(date.getTime())
    ? d
    : date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
};

const severityClass = (s) => {
  switch ((s || "").toLowerCase()) {
    case "error":
      return "log-severity-error";
    case "warning":
      return "log-severity-warning";
    case "critical":
      return "log-severity-critical";
    default:
      return "log-severity-info";
  }
};

const statusBadgeClass = (code) => {
  if (!code) return "log-badge-warning";
  if (code < 400) return "log-badge-success";
  if (code < 500) return "log-badge-warning";
  return "log-badge-danger";
};

const methodClass = (m) => {
  switch ((m || "").toUpperCase()) {
    case "GET":
      return "method-get";
    case "POST":
      return "method-post";
    case "PUT":
      return "method-put";
    case "PATCH":
      return "method-patch";
    case "DELETE":
      return "method-delete";
    default:
      return "";
  }
};

const getUserName = (log) => {
  if (log.userName) return log.userName;
  if (log.user) {
    const u = log.user;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
    if (name) return name;
    if (u.email) return u.email;
    if (u.id) return u.id;
  }
  if (log.userEmail) return log.userEmail;
  if (log.serverError === true || log.userName === "Server Errors") {
    return "Server";
  }
  const logFilePath = String(log.logFilePath || '');
  const logParts = logFilePath.split('\\log\\')[1]?.split('\\') || [];
  return logParts[0] === "Server-Errors" ? "Server" : "-";
};

export default function LogTable({ logs = [], onView, onDelete, loading }) {
  if (loading) {
    return (
      <div className="log-table-wrapper">
        <div className="log-table-loading">
          <div className="spinner" />
          <span>Loading logs...</span>
        </div>
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="log-table-wrapper">
        <div className="log-table-empty">
          <div className="log-empty-icon">&#128196;</div>
          <span>No logs found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="log-table-wrapper">
      <table className="log-table log-table-desktop">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Status</th>
            <th>Severity</th>
            <th>User</th>
            <th>Duration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const id = log._id || log.id;
            return (
              <tr key={id} className="log-row" onClick={() => onView?.(log)}>
                <td className="log-cell-timestamp">{formatDate(log.createdAt)}</td>
                <td>
                  <span className={`log-method-badge ${methodClass(log.method)}`}>
                    {log.method || "-"}
                  </span>
                </td>
                <td className="log-cell-endpoint" title={log.endpoint || log.apiName}>
                  {log.endpoint || log.apiName || "-"}
                </td>
                <td>
                  <span className={`log-badge ${statusBadgeClass(log.statusCode)}`}>
                    {log.statusCode ?? "-"}
                  </span>
                </td>
                <td>
                  <span className={severityClass(log.severity)}>
                    {log.severity || "info"}
                  </span>
                </td>
                <td className="log-cell-user" title={getUserName(log)}>
                  {getUserName(log)}
                </td>
                <td className="log-cell-duration">
                  {log.executionTime != null
                    ? `${log.executionTime}ms`
                    : log.durationMs != null
                      ? `${log.durationMs}ms`
                      : "-"}
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onView?.(log);
                    }}
                  >
                    View
                  </button>
                  {onDelete && (
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ marginLeft: 4 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(log);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="log-cards-mobile">
        {logs.map((log) => {
          const id = log._id || log.id;
          return (
            <div key={id} className="log-card" onClick={() => onView?.(log)}>
              <div className="log-card-header">
                <span className={`log-method-badge ${methodClass(log.method)}`}>
                  {log.method || "-"}
                </span>
                <span className={`log-badge ${statusBadgeClass(log.statusCode)}`}>
                  {log.statusCode ?? "-"}
                </span>
                <span className={severityClass(log.severity)}>
                  {log.severity || "info"}
                </span>
                <div className="log-card-actions">
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onView?.(log);
                    }}
                  >
                    View
                  </button>
                  {onDelete && (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(log);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <div className="log-card-body">
                <div className="log-card-row">
                  <span className="log-card-label">Endpoint</span>
                  <span className="log-card-value">{log.endpoint || log.apiName || "-"}</span>
                </div>
                <div className="log-card-row">
                  <span className="log-card-label">Time</span>
                  <span className="log-cell-timestamp">{formatDate(log.createdAt)}</span>
                </div>
                <div className="log-card-row">
                  <span className="log-card-label">User</span>
                  <span className="log-card-value">{getUserName(log)}</span>
                </div>
                <div className="log-card-row">
                  <span className="log-card-label">Duration</span>
                  <span className="log-cell-duration">
                    {log.executionTime != null
                      ? `${log.executionTime}ms`
                      : log.durationMs != null
                        ? `${log.durationMs}ms`
                        : "-"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
