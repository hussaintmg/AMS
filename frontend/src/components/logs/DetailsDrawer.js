import React, { useEffect, useState } from "react";

const JSONViewer = ({ data, collapsed = false }) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  if (data === null || data === undefined) return <span className="json-null">null</span>;
  if (typeof data !== "object") {
    if (typeof data === "string") return <span className="json-string">"{data}"</span>;
    return <span className="json-number">{String(data)}</span>;
  }

  const isArray = Array.isArray(data);
  const entries = isArray ? data : Object.entries(data);
  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  if (isCollapsed) {
    return (
      <span>
        <span className="json-bracket">{bracketOpen}</span>
        <button className="json-toggle" onClick={() => setIsCollapsed(false)}>
          {isArray ? `${entries.length} items` : `${Object.keys(data).length} keys`}
        </button>
        <span className="json-bracket">{bracketClose}</span>
      </span>
    );
  }

  return (
    <span className="json-block">
      <span className="json-bracket">{bracketOpen}</span>
      <button className="json-toggle" onClick={() => setIsCollapsed(true)}>
        -
      </button>
      <div className="json-children">
        {isArray
          ? entries.map((item, idx) => (
              <div key={idx} className="json-entry">
                <span className="json-index">{idx}: </span>
                <JSONViewer data={item} collapsed />
              </div>
            ))
          : entries.map(([key, value]) => (
              <div key={key} className="json-entry">
                <span className="json-key">"{key}": </span>
                <JSONViewer data={value} collapsed />
              </div>
            ))}
      </div>
      <span className="json-bracket">{bracketClose}</span>
    </span>
  );
};

const formatDate = (d) => {
  if (!d) return "-";
  const date = new Date(d);
  return isNaN(date.getTime()) ? d : date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const getUserName = (user) => {
  if (!user) return "-";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return name || user.email || user.id || "-";
};

export default function DetailsDrawer({ log, onClose }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!log) return null;

  const user = log.user || log.userSummary || {};
  const requestBody = log.requestBody || log.request?.body;
  const responseBody = log.responseBody || log.response?.body;
  const error = log.error;

  return (
    <div className="log-drawer-overlay" onClick={onClose}>
      <div className="log-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="log-drawer-header">
          <h3>Log Details</h3>
          <button className="log-drawer-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="log-drawer-body">
          <table className="log-detail-table">
            <tbody>
              <tr>
                <td className="log-detail-label">Request ID</td>
                <td className="log-detail-value" style={{ fontFamily: "monospace" }}>
                  {log.requestId || "-"}
                </td>
              </tr>
              <tr>
                <td className="log-detail-label">Method</td>
                <td className="log-detail-value">
                  <span className={`log-method-badge ${`method-${(log.method || "").toLowerCase()}`}`}>
                    {log.method || "-"}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="log-detail-label">Endpoint</td>
                <td className="log-detail-value" style={{ fontFamily: "monospace" }}>
                  {log.endpoint || log.apiName || "-"}
                </td>
              </tr>
              <tr>
                <td className="log-detail-label">Status</td>
                <td className="log-detail-value">
                  <span className={`log-badge ${log.statusCode < 400 ? "log-badge-success" : log.statusCode < 500 ? "log-badge-warning" : "log-badge-danger"}`}>
                    {log.statusCode ?? "-"}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="log-detail-label">Severity</td>
                <td className="log-detail-value">
                  <span className={`log-severity-${log.severity || "info"}`}>
                    {log.severity || "info"}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="log-detail-label">Timestamp</td>
                <td className="log-detail-value">{formatDate(log.createdAt)}</td>
              </tr>
              <tr>
                <td className="log-detail-label">Duration</td>
                <td className="log-detail-value">
                  {log.executionTime != null
                    ? `${log.executionTime}ms`
                    : log.durationMs != null
                      ? `${log.durationMs}ms`
                      : "-"}
                </td>
              </tr>
              <tr>
                <td className="log-detail-label">Module</td>
                <td className="log-detail-value">{log.module || "-"}</td>
              </tr>
              <tr>
                <td className="log-detail-label">User</td>
                <td className="log-detail-value">{getUserName(user)}</td>
              </tr>
              <tr>
                <td className="log-detail-label">Email</td>
                <td className="log-detail-value">{user.email || "-"}</td>
              </tr>
              <tr>
                <td className="log-detail-label">Role</td>
                <td className="log-detail-value">{user.role || log.roleName || "-"}</td>
              </tr>
              <tr>
                <td className="log-detail-label">IP</td>
                <td className="log-detail-value" style={{ fontFamily: "monospace" }}>
                  {log.ip || log.ipAddress || "-"}
                </td>
              </tr>
              <tr>
                <td className="log-detail-label">User Agent</td>
                <td className="log-detail-value" style={{ fontSize: 12 }}>
                  {log.userAgent || "-"}
                </td>
              </tr>
            </tbody>
          </table>

          {requestBody && Object.keys(requestBody).length > 0 && (
            <div className="log-detail-section">
              <h4>Request Body</h4>
              <div className="json-block">
                <JSONViewer data={requestBody} />
              </div>
            </div>
          )}

          {responseBody && Object.keys(responseBody).length > 0 && (
            <div className="log-detail-section">
              <h4>Response Body</h4>
              <div className="json-block">
                <JSONViewer data={responseBody} />
              </div>
            </div>
          )}

          {error && (
            <div className="log-error-section">
              <h4>Error Details</h4>
              <table className="log-detail-table">
                <tbody>
                  <tr>
                    <td className="log-detail-label">Name</td>
                    <td className="log-detail-value">{error.name || "Error"}</td>
                  </tr>
                  <tr>
                    <td className="log-detail-label">Message</td>
                    <td className="log-detail-value">{error.message || "-"}</td>
                  </tr>
                  {error.stack && (
                    <tr>
                      <td className="log-detail-label">Stack</td>
                      <td className="log-detail-value">
                        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                          {error.stack}
                        </pre>
                      </td>
                    </tr>
                  )}
                  {error.code && (
                    <tr>
                      <td className="log-detail-label">Code</td>
                      <td className="log-detail-value">{error.code}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {log.query && Object.keys(log.query).length > 0 && (
            <div className="log-detail-section">
              <h4>Query Params</h4>
              <div className="json-block">
                <JSONViewer data={log.query} />
              </div>
            </div>
          )}

          {log.params && Object.keys(log.params).length > 0 && (
            <div className="log-detail-section">
              <h4>Route Params</h4>
              <div className="json-block">
                <JSONViewer data={log.params} />
              </div>
            </div>
          )}

          {log.logFilePath && (
            <div className="log-detail-section">
              <h4>Physical Log</h4>
              <p className="log-detail-value" style={{ fontFamily: "monospace", fontSize: 11 }}>
                {log.logFilePath}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
