import React from 'react';

const BulkSelectionBar = ({ count, onDeactivate, onDelete, disabled = false }) => {
  if (!count) return null;
  return (
    <div className="bulk-selection-bar" role="status">
      <strong>{count} selected</strong>
      <div className="bulk-selection-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDeactivate} disabled={disabled}>Deactivate selected</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={disabled}>Delete selected</button>
      </div>
    </div>
  );
};

export default BulkSelectionBar;
