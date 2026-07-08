import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { emailAPI } from '../../services/api';
import useModalKeyboard from '../../hooks/useModalKeyboard';

export default function EmailBulkImportModal({ isOpen, onClose, onImported }) {
  const [mode, setMode] = useState('csv');
  const [file, setFile] = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { toast.error('File must have header + data'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1, 6).map(line => {
        const vals = [];
        let cur = '', inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
          cur += ch;
        }
        vals.push(cur.trim());
        const row = {};
        headers.forEach((h, i) => { row[h] = vals[i] || ''; });
        return row;
      });
      setPreview(rows);
      setResult(null);
    };
    reader.readAsText(f);
  };

  const handleJsonChange = (val) => {
    setJsonText(val);
    setResult(null);
    try {
      const parsed = JSON.parse(val);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      setPreview(arr.slice(0, 5));
    } catch {
      setPreview([]);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      let r;
      if (mode === 'csv' && file) {
        const formData = new FormData();
        formData.append('file', file);
        r = await emailAPI.importVariables(formData);
      } else if (mode === 'json' && jsonText.trim()) {
        r = await emailAPI.importVariables({ records: JSON.parse(jsonText) });
      } else {
        toast.error('No data to import');
        setImporting(false);
        return;
      }
      setResult(r.data?.data || r.data);
      toast.success(r.data?.message || 'Import completed');
      if (onImported) onImported();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => { setFile(null); setJsonText(''); setPreview([]); setResult(null); setMode('csv'); };

  useModalKeyboard(isOpen, onClose, null, importing);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>Import Variables</h3>
          <button className="modal-close" onClick={onClose} type="button">&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className={`btn btn-sm ${mode === 'csv' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setMode('csv'); reset(); }}>Import CSV</button>
            <button className={`btn btn-sm ${mode === 'json' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setMode('json'); reset(); }}>Import JSON</button>
          </div>

          {mode === 'csv' && (
            <div className="form-group">
              <label>Upload CSV File</label>
              <input type="file" className="form-control" accept=".csv" ref={fileRef} onChange={handleFileChange} />
              <small style={{ color: '#666' }}>CSV columns: name, reference, description, category, isActive</small>
            </div>
          )}

          {mode === 'json' && (
            <div className="form-group">
              <label>Paste JSON</label>
              <textarea className="form-control" style={{ fontFamily: 'monospace', fontSize: '0.8rem', minHeight: 120 }}
                value={jsonText} onChange={e => handleJsonChange(e.target.value)}
                placeholder='[{"name":"Company Name","reference":"company.name","category":"Company"}]' />
            </div>
          )}

          {preview.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong>Preview ({preview.length} rows):</strong>
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--gray-200)', borderRadius: 6, marginTop: 8, fontSize: '0.8rem' }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      {Object.keys(preview[0]).map(k => <th key={k}>{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => <td key={j} data-label={Object.keys(row)[j]}>{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 6, background: result.errors?.length > 0 ? '#fff3cd' : '#d4edda', border: `1px solid ${result.errors?.length > 0 ? '#ffc107' : '#28a745'}` }}>
              <strong>Result:</strong> Created: {result.created}, Skipped: {result.skipped}, Errors: {result.errors?.length || 0}
              {result.errors?.length > 0 && (
                <ul style={{ margin: '8px 0 0', fontSize: '0.8rem' }}>
                  {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={importing}>Close</button>
          <button type="button" className="btn btn-primary" onClick={handleImport} disabled={importing || (mode === 'csv' ? !file : !jsonText.trim())}>
            {importing ? <><span className="spinner-mini"></span> Importing...</> : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
