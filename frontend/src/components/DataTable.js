import React from 'react';
import './DataTable.css';
import ServerPagination from './ServerPagination';

const DataTable = ({
  columns = [],
  data = [],
  loading = false,
  onRowClick,
  pagination,
  onPageChange,
  onPageSizeChange,
  emptyMessage = 'No data found',
  className = '',
  rowClassName,
  children,
  tableOnly = false,
}) => {
  const renderCell = (row, col) => {
    if (col.render) return col.render(row, row);
    const val = col.accessor ? row[col.accessor] : null;
    if (col.badge) {
      const badgeClass = col.badge(row) || '';
      return <span className={`badge ${badgeClass}`}>{val || '-'}</span>;
    }
    return val != null ? val : '-';
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const getRowClass = (row) => {
    let cls = '';
    if (rowClassName) cls += ' ' + (typeof rowClassName === 'function' ? rowClassName(row) : rowClassName);
    if (!row.isActive && !row.is_active) cls += ' inactive-row';
    return cls.trim();
  };

  const displayData = data;

  return (
    <div className={`data-table-wrapper ${className}`}>
      {!tableOnly && children}

      {/* Desktop Table */}
      <div className="table-container desktop-only">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.accessor || col.header} style={col.style}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayData.map((row, i) => (
                <tr
                  key={row._id || row.id || i}
                  onClick={() => onRowClick && onRowClick(row)}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  className={getRowClass(row)}
                >
                  {columns.map((col) => (
                    <td key={col.accessor || col.header}>{renderCell(row, col)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="mobile-cards-container mobile-only">
        {displayData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            {emptyMessage}
          </div>
        ) : (
          displayData.map((row, i) => {
            // Skip the checkbox column (non-string header) and pull the actions
            // column into a footer so the card reads like the rest of the app.
            const bodyCols = columns.filter(
              (c) => !c.hideOnMobile && typeof c.header === 'string' && c.header && c.header !== 'Actions'
            );
            const actionCol = columns.find((c) => c.header === 'Actions');
            return (
              <div
                key={row._id || row.id || i}
                className="user-card"
                onClick={() => onRowClick && onRowClick(row)}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                <div className="user-card-body">
                  {bodyCols.map((col) => (
                    <div key={col.accessor || col.header} className="user-card-field">
                      <span className="field-label">{col.header}</span>
                      <span>{renderCell(row, col)}</span>
                    </div>
                  ))}
                </div>
                {actionCol && (
                  <div className="user-card-actions" onClick={(e) => e.stopPropagation()}>
                    {renderCell(row, actionCol)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {pagination && onPageChange && <ServerPagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total || 0} limit={pagination.limit || 20} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} loading={loading} />}
    </div>
  );
};

export default DataTable;
