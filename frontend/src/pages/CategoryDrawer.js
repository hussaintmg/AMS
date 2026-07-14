import React, { useEffect, useRef } from 'react';

const GROUP_LABELS = { workshop: 'Workshop', general: 'General', salary: 'Salary' };

export default function CategoryDrawer({ isOpen, onClose, category }) {
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
          <h3>Category Detail</h3>
          <button className="email-drawer-close" onClick={onClose}>&times;</button>
        </div>
        <div className="email-drawer-body">
          <div className="email-drawer-section">
            <h4>Category Information</h4>
            <div className="email-drawer-grid">
              <div className="email-drawer-row">
                <span className="email-drawer-label">Name</span>
                <span className="email-drawer-value">{category?.name || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Code</span>
                <span className="email-drawer-value">{category?.code || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Group</span>
                <span className="email-drawer-value">{GROUP_LABELS[category?.categoryGroup] || category?.categoryGroup || '-'}</span>
              </div>
              <div className="email-drawer-row">
                <span className="email-drawer-label">Active</span>
                <span className={`email-drawer-value`}>
                  <span className={`badge ${category?.isActive ? 'badge-success' : 'badge-secondary'}`}>
                    {category?.isActive ? 'Active' : 'Inactive'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
