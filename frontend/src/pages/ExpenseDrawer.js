import React, { useEffect, useRef } from 'react';

export default function ExpenseDrawer({ isOpen, onClose, expense }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const empName = expense?.employee ? `${expense.employee.firstName || ''} ${expense.employee.lastName || ''}`.trim() || '-' : '-';

  return (
    <div className="email-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="email-drawer" ref={drawerRef} onClick={e => e.stopPropagation()}
        style={{ '--drawer-width': '50%' }}>
        <div className="email-drawer-header">
          <h3>Expense Detail</h3>
          <button className="email-drawer-close" onClick={onClose}>&times;</button>
        </div>
        <div className="email-drawer-body">
          <div className="email-drawer-section">
            <h4>Expense Information</h4>
            <div className="email-drawer-grid">
              <div className="email-drawer-row">
                <span className="email-drawer-label">Expense Number</span>
                <span className="email-drawer-value">{expense?.expenseNumber || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Status</span>
                <span className={`email-drawer-value`}>
                  <span className={`badge ${expense?.status === 'posted' ? 'badge-success' : 'badge-secondary'}`}>
                    {expense?.status || '-'}
                  </span>
                </span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Category</span>
                <span className="email-drawer-value">{expense?.category || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Amount</span>
                <span className="email-drawer-value">{expense?.amount != null ? Number(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Expense Date</span>
                <span className="email-drawer-value">{expense?.expenseDate ? new Date(expense.expenseDate).toLocaleDateString('en-GB') : '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Vendor</span>
                <span className="email-drawer-value">{expense?.vendor || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Description</span>
                <span className="email-drawer-value">{expense?.description || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Employee</span>
                <span className="email-drawer-value">{empName}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
