import React from "react";

const formatMs = (ms) => {
  if (ms == null) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export default function StatisticsCards({ stats }) {
  if (!stats) return null;

  return (
    <div className="log-stats-cards">
      <div className="log-stat-card" style={{ borderLeftColor: "#1e3a5f" }}>
        <div className="log-stat-value">{stats.total ?? 0}</div>
        <div className="log-stat-label">Total Logs</div>
      </div>
      <div className="log-stat-card" style={{ borderLeftColor: "#2e7d32" }}>
        <div className="log-stat-value">{stats.success ?? 0}</div>
        <div className="log-stat-label">Success</div>
      </div>
      <div className="log-stat-card" style={{ borderLeftColor: "#c62828" }}>
        <div className="log-stat-value">{stats.errors ?? 0}</div>
        <div className="log-stat-label">Errors</div>
      </div>
      {(stats.serverErrors != null) && (
        <div className="log-stat-card" style={{ borderLeftColor: "#6a1b9a" }}>
          <div className="log-stat-value">{stats.serverErrors}</div>
          <div className="log-stat-label">Server</div>
        </div>
      )}
      <div className="log-stat-card" style={{ borderLeftColor: "#e65100" }}>
        <div className="log-stat-value">{formatMs(stats.avgExecutionTime)}</div>
        <div className="log-stat-label">Avg Duration</div>
      </div>
      {(stats.maxExecutionTime != null) && (
        <div className="log-stat-card" style={{ borderLeftColor: "#1565c0" }}>
          <div className="log-stat-value">{formatMs(stats.maxExecutionTime)}</div>
          <div className="log-stat-label">Max Duration</div>
        </div>
      )}
    </div>
  );
}
