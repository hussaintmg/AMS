import React from 'react';

const ServerPagination = ({ page = 1, totalPages = 1, total = 0, limit = 20, onPageChange, loading = false }) => {
  if (totalPages <= 1) return total ? <div className="server-pagination-summary">Showing {total} record{total === 1 ? '' : 's'}</div> : null;
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    if (totalPages <= 5) return index + 1;
    if (page <= 3) return index + 1;
    if (page >= totalPages - 2) return totalPages - 4 + index;
    return page - 2 + index;
  });
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return <div className="server-pagination">
    <span className="server-pagination-summary">Showing {start}–{end} of {total}</span>
    <div className="server-pagination-actions">
      <button className="btn-page" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>← Previous</button>
      {pages.map(number => <button key={number} className={`btn-page ${page === number ? 'active' : ''}`} disabled={loading} onClick={() => onPageChange(number)}>{number}</button>)}
      <button className="btn-page" disabled={loading || page >= totalPages} onClick={() => onPageChange(page + 1)}>Next →</button>
    </div>
  </div>;
};

export default ServerPagination;
