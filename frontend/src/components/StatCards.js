import React from 'react';
import '../styles/leadManagement.css';

/**
 * A row of figure cards above a list — the same card the Leads, Customers and
 * Parts screens draw, so a new screen gets the look for free.
 *
 *   <StatCards items={[
 *     { key: 'total', label: 'Total invoices', value: 120, icon: <FileText />, color: '#3b82f6', bg: '#dbeafe' },
 *     …
 *   ]} />
 *
 * `onClick` on an item makes the card a filter button (e.g. the Credit card
 * switching to the Credit tab); `active` highlights it.
 */
export default function StatCards({ items = [], className = '' }) {
  if (!items.length) return null;
  return (
    <div className={`lead-stats-grid ${className}`.trim()} style={{ marginBottom: 16 }}>
      {items.map((item) => (
        <div
          key={item.key}
          className={`lead-stat-card${item.onClick ? ' stat-card-clickable' : ''}${item.active ? ' stat-card-active' : ''}`}
          style={{ borderLeftColor: item.color || '#3b82f6', cursor: item.onClick ? 'pointer' : 'default' }}
          onClick={item.onClick}
          role={item.onClick ? 'button' : undefined}
          title={item.hint}
        >
          <div className="lead-stat-icon" style={{ background: item.bg || '#dbeafe', color: item.color || '#3b82f6' }}>{item.icon}</div>
          <div className="lead-stat-info">
            <span className="lead-stat-value">{item.value ?? '—'}</span>
            <span className="lead-stat-label">{item.label}</span>
            {item.sub && <span className="stat-card-sub">{item.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
