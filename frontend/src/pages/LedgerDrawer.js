import React, { useEffect, useRef } from 'react';

export default function LedgerDrawer({ isOpen, onClose, entry }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="email-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="email-drawer" ref={drawerRef} onClick={e => e.stopPropagation()}
        style={{ '--drawer-width': '50%' }}>
        <div className="email-drawer-header">
          <h3>Transaction Detail</h3>
          <button className="email-drawer-close" onClick={onClose}>&times;</button>
        </div>
        <div className="email-drawer-body">
          <div className="email-drawer-section">
            <h4>Transaction Information</h4>
            <div className="email-drawer-grid">
              <div className="email-drawer-row">
                <span className="email-drawer-label">Date</span>
                <span className="email-drawer-value">{entry?.transactionDate ? new Date(entry.transactionDate).toLocaleDateString('en-GB') : '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Reference</span>
                <span className="email-drawer-value">{entry?.referenceType || '-'} #{entry?.referenceId || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Account</span>
                <span className="email-drawer-value">{entry?.account || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Debit</span>
                <span className="email-drawer-value">{entry?.debit ? Number(entry.debit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Credit</span>
                <span className="email-drawer-value">{entry?.credit ? Number(entry.credit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0'}</span>
              </div>
              <div className="email-drawer-row email-drawer-row-full">
                <span className="email-drawer-label">Description</span>
                <span className="email-drawer-value">{entry?.description || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
