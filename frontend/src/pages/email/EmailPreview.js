import React, { useRef, useEffect, useState } from 'react';
import { Eye, X, Monitor, Smartphone } from 'lucide-react';

export default function EmailPreview({ html, css, onClose }) {
  const iframeRef = useRef(null);
  const [device, setDevice] = useState('desktop');

  useEffect(() => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <style>
          body { margin: 0; padding: 20px; font-family: sans-serif; background: #e2e8f0; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
          .sim-wrap { width: 100%; max-width: ${device === 'mobile' ? '375px' : '600px'}; background: white; margin: 40px auto; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
          ${css || ''}
        </style>
        <div class="sim-wrap">${html || ''}</div>
      `);
      doc.close();
    }
  }, [html, css, device]);

  return (
    <div className="email-preview">
      <div className="email-preview-header email-popup-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={16} />
          <h3>Preview</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="email-preview-devices">
            <button className={`toolbar-btn${device === 'desktop' ? ' active' : ''}`} onClick={() => setDevice('desktop')} title="Desktop">
              <Monitor size={14} />
            </button>
            <button className={`toolbar-btn${device === 'mobile' ? ' active' : ''}`} onClick={() => setDevice('mobile')} title="Mobile">
              <Smartphone size={14} />
            </button>
          </div>
          <button type="button" className="email-overlay-close" onClick={onClose}><X size={18} /></button>
        </div>
      </div>
      <div className="email-preview-body">
        <iframe ref={iframeRef} title="Email Preview" className="email-preview-iframe" />
      </div>
    </div>
  );
}
