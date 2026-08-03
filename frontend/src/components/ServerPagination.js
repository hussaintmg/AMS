import React from 'react';

const PAGE_SIZES = [20, 100, 1000];

const ServerPagination = ({ page = 1, totalPages = 1, total = 0, limit = 20, onPageChange, onPageSizeChange, loading = false }) => {
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    if (totalPages <= 5) return index + 1;
    if (page <= 3) return index + 1;
    if (page >= totalPages - 2) return totalPages - 4 + index;
    return page - 2 + index;
  });
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const changeSize = (event) => {
    const size = Math.min(1000, Number(event.target.value) || 20);
    if (onPageSizeChange) onPageSizeChange(size);
    else onPageChange?.(1, size);
  };
  return <div className="server-pagination">
    <div className="server-pagination-info">
      <span className="server-pagination-summary">Showing {total ? start : 0}-{end} of {total}</span>
      <label className="page-size-control">Rows per page<select value={limit} disabled={loading} onChange={changeSize}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
    </div>
    {totalPages > 1 && <div className="server-pagination-actions">
      <button className="btn-page" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
      {pages.map((number) => <button key={number} className={`btn-page ${page === number ? 'active' : ''}`} disabled={loading} onClick={() => onPageChange(number)}>{number}</button>)}
      <button className="btn-page" disabled={loading || page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
    </div>}
  </div>;
};

export default ServerPagination;
