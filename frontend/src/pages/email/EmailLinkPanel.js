import React from 'react';
import { Link2, X, Check } from 'lucide-react';
import EmailColorPicker from './EmailColorPicker';
import DraggablePopup, { DraggableHeader } from '../../components/EmailDraggablePopup';

const LINK_COLORS = ['#000000', '#ffffff', '#dc2626', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#1e293b', 'transparent'];

export default function EmailLinkPanel({ linkData, setLinkData, onInsert, onRemove, onClose }) {
  const [activePicker, setActivePicker] = React.useState(null);

  const closePicker = () => setActivePicker(null);

  return (
    <form onSubmit={e => { e.preventDefault(); if (linkData.url) onInsert(); }}>
      <div className="email-link-panel-header email-popup-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={16} className="email-link-icon" />
          <h3>Insert Link</h3>
        </div>
        <button type="button" className="email-overlay-close" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="email-link-panel-body">
        <div className="form-group">
          <label>URL</label>
          <input className="form-control" placeholder="https://..." value={linkData.url} onChange={e => setLinkData(p => ({ ...p, url: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Link Text</label>
          <input className="form-control" placeholder="Selected text or custom" value={linkData.text} onChange={e => setLinkData(p => ({ ...p, text: e.target.value }))} />
        </div>
        <div className="email-link-colors">
          <div className="form-group">
            <label>Text Color</label>
            <button
              type="button"
              className="email-css-color-btn"
              style={{ background: linkData.color }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActivePicker('linkText');
              }}
            >
              {linkData.color}
            </button>
          </div>
          {linkData.isButton && (
            <div className="form-group">
              <label>Button BG</label>
              <button
                type="button"
                className="email-css-color-btn"
                style={{ background: linkData.bg, color: '#fff' }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActivePicker('linkBg');
                }}
              >
                {linkData.bg}
              </button>
            </div>
          )}
        </div>
        <label
          className="email-link-toggle"
          onClick={(e) => {
            e.preventDefault();
            setLinkData(p => ({ ...p, isButton: !p.isButton }));
          }}
        >
          <div className={`email-checkbox ${linkData.isButton ? 'checked' : ''}`}>
            {linkData.isButton && <Check size={12} />}
          </div>
          <span>Format as Button</span>
        </label>
      </div>
      <div className="email-link-panel-footer">
        {onRemove && <button type="button" className="btn btn-danger" onClick={onRemove}>Remove Link</button>}
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={!linkData.url}>Apply</button>
      </div>

      {activePicker && (
        <DraggablePopup isOpen={true} onClose={closePicker} style={{ maxWidth: 300 }}>
          <DraggableHeader onClose={closePicker}>
            <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Pick Color</h4>
          </DraggableHeader>
          <div style={{ padding: '8px 12px 12px' }}>
            <EmailColorPicker
              colors={LINK_COLORS}
              onSelect={c => {
                setLinkData(p => ({ ...p, [activePicker === 'linkText' ? 'color' : 'bg']: c }));
                closePicker();
              }}
              onClose={closePicker}
            />
          </div>
        </DraggablePopup>
      )}
    </form>
  );
}
