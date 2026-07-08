import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { emailAPI } from '../services/api';
import EmailVariableFormModal from '../pages/email/EmailVariableFormModal';

function useModalKeyboard(closeFn) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') closeFn(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeFn]);
}

function useDraggable(ref, isOpen) {
  useEffect(() => {
    if (!isOpen) return;
    const el = ref.current;
    if (!el) return;
    let offsetX = 0, offsetY = 0;
    let startX = 0, startY = 0;
    const header = el.querySelector('.email-popup-header');
    if (!header) return;
    function initDrag(cx, cy) {
      offsetX = parseFloat(el.dataset.dragX || '0') || 0;
      offsetY = parseFloat(el.dataset.dragY || '0') || 0;
      startX = cx; startY = cy;
    }
    const onMD = (e) => {
      if (e.target.closest('button,input,select,textarea')) return;
      e.preventDefault();
      initDrag(e.clientX, e.clientY);
      document.onmousemove = (ev) => {
        const nextX = offsetX + ev.clientX - startX;
        const nextY = offsetY + ev.clientY - startY;
        el.dataset.dragX = String(nextX);
        el.dataset.dragY = String(nextY);
        el.style.transform = `translate(calc(-50% + ${nextX}px), calc(-50% + ${nextY}px))`;
      };
      document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; };
    };
    header.addEventListener('mousedown', onMD);
    return () => header.removeEventListener('mousedown', onMD);
  }, [ref, isOpen]);
}

export default function VariablePicker({ isOpen, onClose, onSelect, closeOnSelect = true, variant = 'modal', title = 'Insert Variable', anchorRef }) {
  const [groups, setGroups] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const popupRef = useRef(null);

  useModalKeyboard(onClose);
  useDraggable(popupRef, isOpen);

  const loadVariables = useCallback(() => {
    setLoading(true);
    setSearch('');
    emailAPI.searchVariables('')
      .then(r => {
        const vars = r.data?.data?.variables || [];
        const grouped = vars.reduce((acc, v) => {
          const g = v.group || v.category || 'Other';
          if (!acc[g]) acc[g] = [];
          acc[g].push(v);
          return acc;
        }, {});
        setGroups(grouped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadVariables();

    if (variant === 'anchored' && anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - 460),
      });
    }
  }, [isOpen, variant, anchorRef, loadVariables]);

  const handleCreateVariable = useCallback(async (data) => {
    setCreating(true);
    try {
      await emailAPI.createVariable(data);
      setShowCreateForm(false);
      loadVariables();
    } catch (e) {
      throw e;
    } finally {
      setCreating(false);
    }
  }, [loadVariables]);

  const filteredGroups = search
    ? Object.entries(groups).reduce((acc, [g, vars]) => {
        const f = vars.filter(v =>
          (v.key || '').toLowerCase().includes(search.toLowerCase()) ||
          (v.label || '').toLowerCase().includes(search.toLowerCase()) ||
          (v.description || '').toLowerCase().includes(search.toLowerCase())
        );
        if (f.length) acc[g] = f;
        return acc;
      }, {})
    : groups;

  const handleSelect = (variable) => {
    if (onSelect) onSelect(variable.key || variable.name);
    if (closeOnSelect) onClose();
  };

  const handleDragStart = (event, variable) => {
    const key = variable.key || variable.name;
    event.dataTransfer.setData('text/plain', `{{${key}}}`);
    event.dataTransfer.setData('application/x-email-variable', key);
    event.dataTransfer.effectAllowed = 'copy';
  };

  if (!isOpen) return null;

  const content = (
    <>
      <div className="email-popup-header">
        <h3>{title}</h3>
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowCreateForm(true)} style={{ marginLeft: 'auto', marginRight: 8 }}>
          <Plus size={12} style={{ marginRight: 4 }} />Add Variable
        </button>
        <button type="button" className="email-overlay-close" onClick={onClose}>&times;</button>
      </div>
      <div className="modal-body" style={{ overflow: 'auto' }}>
        <div className="email-variable-search" style={{ marginBottom: 8 }}>
          <input className="form-control" placeholder="Search variables..." value={search}
            onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="email-variable-selector" style={{ maxHeight: 350 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>Loading...</div>
          ) : (
            Object.entries(filteredGroups).map(([group, vars]) => (
              <div key={group} className="email-variable-group">
                <div className="email-variable-group-header">{group}</div>
                {vars.map((v, i) => (
                  <div key={v.key || i} className="email-variable-item" draggable onDragStart={(e) => handleDragStart(e, v)} onClick={() => handleSelect(v)}
                    onDoubleClick={() => handleSelect(v)}>
                    <code>{`{{${v.key || v.name}}}`}</code>
                    <span className="var-label">{v.label || v.description || v.name}</span>
                    {v.defaultValue && <span className="var-label">Default: {v.defaultValue}</span>}
                  </div>
                ))}
              </div>
            ))
          )}
          {!loading && Object.keys(filteredGroups).length === 0 && (
            <div style={{ padding: 16, color: '#999', textAlign: 'center' }}>No variables found</div>
          )}
        </div>
      </div>

      {showCreateForm && createPortal(
        <EmailVariableFormModal
          isOpen={showCreateForm}
          onClose={() => setShowCreateForm(false)}
          mode="create"
          onSubmit={handleCreateVariable}
          loading={creating}
        />,
        document.body
      )}
    </>
  );

  if (variant === 'anchored') {
    return (
      <div ref={popupRef} className="email-draggable-popup" style={{ position: 'fixed', top: position.top, left: position.left, maxWidth: 450, zIndex: 5000 }}>
        {content}
      </div>
    );
  }

  if (variant === 'floating') {
    return (
      <div ref={popupRef} className="email-draggable-popup" style={{ maxWidth: 500, zIndex: 5000 }}>
        {content}
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal email-modal" onClick={e => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
