import React, { useState, useEffect } from 'react';
import { Code, X } from 'lucide-react';

export default function EmailCodeEditor({ html, onChange, onCompile, onClose }) {
  const [localHtml, setLocalHtml] = useState(html);

  useEffect(() => { setLocalHtml(html); }, [html]);

  const handleChange = (e) => {
    setLocalHtml(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div className="email-code-editor email-code-editor-light">
      <div className="email-code-editor-header email-popup-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Code size={16} />
          <h3>HTML Source</h3>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={onCompile}>Compile</button>
          <button type="button" className="email-overlay-close" onClick={onClose}><X size={18} /></button>
        </div>
      </div>
      <textarea
        className="email-code-editor-textarea"
        value={localHtml}
        onChange={handleChange}
        spellCheck="false"
        placeholder="<div>{{content}}</div>"
      />
    </div>
  );
}
