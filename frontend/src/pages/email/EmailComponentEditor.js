import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Code, Eye } from 'lucide-react';
import { emailAPI } from '../../services/api';
import VariablePicker from '../../components/VariablePicker';
import EmailComposerCore from './EmailComposerCore';

const PARAMETER_TYPES = ['text', 'textarea', 'number', 'color', 'url', 'image', 'boolean', 'date', 'email', 'phone', 'richtext', 'select'];

function normalizeParameters(params = []) {
  return params.map((param, index) => {
    const key = (param.key || `param_${index + 1}`).trim();
    const name = (param.name || param.label || key || `Parameter ${index + 1}`).trim();
    return {
      ...param,
      key,
      name,
      label: param.label || name,
      order: param.order ?? index,
    };
  });
}

export default function EmailComponentEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editorRef = useRef(null);
  const htmlRef = useRef(null);
  const cssRef = useRef(null);
  const previewTimerRef = useRef(null);

  const [component, setComponent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [html, setHtml] = useState('');
  const [css, setCss] = useState('');
  const [parameters, setParameters] = useState([]);
  const [paramValues, setParamValues] = useState({});
  const [previewHtml, setPreviewHtml] = useState('');
  const [showVarPicker, setShowVarPicker] = useState(false);
  const [activeField, setActiveField] = useState('html');
  const [showPreview, setShowPreview] = useState(false);
  const [editorMode, setEditorMode] = useState('wysiwyg');

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const r = await emailAPI.getComponent(id);
        const c = r.data?.data?.component || r.data?.data;
        if (c) {
          setComponent(c);
          setHtml(c.html || '');
          setCss(c.css || '');
          setParameters(c.parameters || []);
          const defaults = {};
          (c.parameters || []).forEach(p => {
            defaults[p.key] = p.defaultValue !== undefined ? p.defaultValue : '';
          });
          setParamValues(defaults);
        }
      } catch (e) {
        toast.error('Failed to load component');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const refreshPreview = useCallback(async (h, c, pv, draftParameters) => {
    try {
      const r = await emailAPI.previewComponent(id, {
        parameterValues: pv,
        parameters: draftParameters,
        html: h,
        css: c,
        variableValues: {},
      });
      setPreviewHtml(r.data?.data?.html || '');
    } catch {
      // silent
    }
  }, [id]);

  useEffect(() => {
    if (!id || loading) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      refreshPreview(html, css, paramValues, normalizeParameters(parameters));
    }, 300);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [html, css, paramValues, parameters, id, loading]);

  const handleHtmlChange = useCallback((newHtml) => {
    setHtml(newHtml);
  }, []);

  const handleCssChange = useCallback((newCss) => {
    setCss(newCss);
  }, []);

  const handleSave = async () => {
    if (!component) return;
    setSaving(true);
    const varRegex = /\{\{([^}]+)\}\}/g;
    const used = new Set();
    let m;
    const contentHtml = editorMode === 'wysiwyg' ? (editorRef.current?.innerHTML || '') : html;
    while ((m = varRegex.exec(contentHtml)) !== null) {
      const v = m[1].trim();
      if (!v.startsWith('param.') && !v.startsWith('param:') && !v.startsWith('component:')) used.add(v);
    }
    varRegex.lastIndex = 0;
    while ((m = varRegex.exec(css)) !== null) {
      const v = m[1].trim();
      if (!v.startsWith('param.') && !v.startsWith('param:') && !v.startsWith('component:')) used.add(v);
    }
    try {
      await emailAPI.updateComponent(component._id, {
        html: contentHtml,
        css,
        parameters: normalizeParameters(parameters),
        variablesUsed: [...used],
      });
      toast.success('Component saved');
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addParameter = () => {
    const key = `param_${Date.now()}`;
    setParameters(prev => [...prev, { name: '', key, type: 'text', label: '', defaultValue: '', required: false, options: [], placeholder: '', order: prev.length }]);
    setParamValues(prev => ({ ...prev, [key]: '' }));
  };

  const updateParameter = (index, data) => {
    setParameters(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...data };
      return next;
    });
    if (data.key && data.defaultValue !== undefined) {
      setParamValues(prev => ({ ...prev, [data.key]: data.defaultValue }));
    }
  };

  const removeParameter = (index) => {
    setParameters(prev => prev.filter((_, i) => i !== index));
  };

  const handleParamValueChange = (key, value) => {
    setParamValues(prev => ({ ...prev, [key]: value }));
  };

  const handleVariableSelect = (ref) => {
    if (editorMode === 'wysiwyg') {
      const editor = editorRef.current;
      if (!editor) return;
      const sel = window.getSelection();
      const doc = editor.ownerDocument;
      const span = doc.createElement('span');
      span.className = 'email-var-placeholder';
      span.contentEditable = 'false';
      span.textContent = `{{${ref}}}`;
      if (sel.rangeCount && editor.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(span);
        range.setStartAfter(span);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        editor.appendChild(span);
        editor.appendChild(doc.createTextNode(' '));
      }
      editor.focus();
      setHtml(editor.innerHTML);
    } else {
      const textarea = activeField === 'html' ? htmlRef.current : cssRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = activeField === 'html' ? html : css;
      const newText = text.substring(0, start) + `{{${ref}}}` + text.substring(end);
      if (activeField === 'html') setHtml(newText);
      else setCss(newText);
      setTimeout(() => {
        textarea.focus();
        const pos = start + ref.length + 4;
        textarea.setSelectionRange(pos, pos);
      }, 0);
    }
  };

  const insertTextIntoActiveField = (textToInsert) => {
    const textarea = activeField === 'html' ? htmlRef.current : cssRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = activeField === 'html' ? html : css;
    const newText = text.substring(0, start) + textToInsert + text.substring(end);
    if (activeField === 'html') setHtml(newText);
    else setCss(newText);
    setTimeout(() => {
      textarea.focus();
      const pos = start + textToInsert.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleTextDrop = (e, field) => {
    const ref = e.dataTransfer.getData('application/x-email-variable') || e.dataTransfer.getData('text/plain').replace(/[{}]/g, '');
    if (!ref) return;
    e.preventDefault();
    const textarea = field === 'html' ? htmlRef.current : cssRef.current;
    const value = field === 'html' ? html : css;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    const next = value.substring(0, start) + `{{${ref}}}` + value.substring(end);
    if (field === 'html') setHtml(next);
    else setCss(next);
  };

  const handleParamDrop = (e, key) => {
    const ref = e.dataTransfer.getData('application/x-email-variable') || e.dataTransfer.getData('text/plain').replace(/[{}]/g, '');
    if (!ref) return;
    e.preventDefault();
    setParamValues(prev => ({ ...prev, [key]: `${prev[key] || ''}{{${ref}}}` }));
  };

  const currentHtml = editorMode === 'wysiwyg' ? (editorRef.current?.innerHTML || html) : html;

  if (loading) {
    return <div className="email-module" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}><div className="spinner" /></div>;
  }

  if (!component) {
    return <div className="email-module"><div className="email-empty-state">Component not found</div></div>;
  }

  return (
    <div className="email-module">
      <div className="email-module-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0 }}>{component.name}</h2>
          <span className="email-card-badge" style={{ background: '#e3f2fd', color: '#1565c0' }}>{component.category}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="toolbar-group" style={{ border: '1px solid var(--gray-200)', borderRadius: 6, padding: 2 }}>
            <button
              className={`toolbar-btn${editorMode === 'wysiwyg' ? ' active' : ''}`}
              onClick={() => {
                if (editorRef.current) {
                  setHtml(editorRef.current.innerHTML);
                }
                setEditorMode('wysiwyg');
              }}
              title="Visual Editor"
            >
              <Eye size={14} />
            </button>
            <button
              className={`toolbar-btn${editorMode === 'source' ? ' active' : ''}`}
              onClick={() => {
                if (editorRef.current) {
                  setHtml(editorRef.current.innerHTML);
                }
                setEditorMode('source');
              }}
              title="Source Editor"
            >
              <Code size={14} />
            </button>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner-mini"></span> Saving...</> : 'Save'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/email/components')}>Back</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 250px)', minHeight: 450 }}>
        {/* LEFT: Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {editorMode === 'wysiwyg' ? (
            <EmailComposerCore
              editorRef={editorRef}
              html={html}
              onHtmlChange={handleHtmlChange}
              css={css}
              onCssChange={handleCssChange}
              toolbarButtons={{
                onOpenVarPicker: () => setShowVarPicker(true),
              }}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button className={`btn btn-sm ${activeField === 'html' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveField('html')}>HTML</button>
                <button className={`btn btn-sm ${activeField === 'css' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveField('css')}>CSS</button>
                <button className="btn btn-sm btn-secondary" onClick={() => setShowVarPicker(true)} style={{ marginLeft: 'auto' }}>+ Var</button>
              </div>
              {activeField === 'html' ? (
                <textarea ref={htmlRef} className="form-control" style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', resize: 'none' }}
                  value={html} onChange={e => setHtml(e.target.value)} onDrop={e => handleTextDrop(e, 'html')} onDragOver={e => e.preventDefault()} placeholder="<div>{{content}}</div>" />
              ) : (
                <textarea ref={cssRef} className="form-control" style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem', resize: 'none' }}
                  value={css} onChange={e => setCss(e.target.value)} onDrop={e => handleTextDrop(e, 'css')} onDragOver={e => e.preventDefault()} placeholder=".class { color: red; }" />
              )}
            </div>
          )}
        </div>

        {/* CENTER: Live Preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#666' }}>Live Preview</div>
          <div style={{ flex: 1, border: '1px solid var(--gray-200)', borderRadius: 6, overflow: 'hidden', background: '#f8f9fa' }}>
            {previewHtml ? (
              <iframe srcDoc={previewHtml} title="Component Preview" style={{ width: '100%', height: '100%', border: 'none' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '0.85rem' }}>
                Preview will appear here
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Parameters + Variables */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Parameters
            <button className="btn btn-sm btn-primary" onClick={addParameter}>+ Add</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--gray-200)', borderRadius: 6, padding: 8 }}>
            {parameters.length === 0 && (
              <div style={{ color: '#999', fontSize: '0.8rem', textAlign: 'center', padding: 12 }}>No parameters defined</div>
            )}
            {parameters.map((p, i) => (
              <div key={i} style={{ marginBottom: 8, padding: 8, border: '1px solid var(--gray-100)', borderRadius: 4, background: '#fafafa' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <input className="form-control" style={{ flex: 1, fontSize: '0.75rem' }} placeholder="Key"
                    value={p.key} onChange={e => updateParameter(i, { key: e.target.value })} />
                  <select className="form-control" style={{ width: 90, fontSize: '0.75rem' }} value={p.type}
                    onChange={e => updateParameter(i, { type: e.target.value })}>
                    {PARAMETER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="btn btn-sm btn-danger" style={{ padding: '2px 6px', fontSize: '0.7rem' }} onClick={() => removeParameter(i)}>&times;</button>
                </div>
                <button type="button" className="btn btn-sm btn-secondary" style={{ width: '100%', marginBottom: 4, fontSize: '0.72rem' }}
                  onClick={() => insertTextIntoActiveField(`{{param.${p.key}}}`)} disabled={!p.key}>
                  Insert {'{{param.key}}'}
                </button>
                <input className="form-control" style={{ fontSize: '0.75rem', marginBottom: 4 }} placeholder="Name/Label"
                  value={p.name} onChange={e => updateParameter(i, { name: e.target.value })} />
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="form-control" style={{ flex: 1, fontSize: '0.75rem' }} placeholder="Default"
                    value={p.defaultValue || ''} onChange={e => updateParameter(i, { defaultValue: e.target.value })} />
                  <label style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={p.required} onChange={e => updateParameter(i, { required: e.target.checked })} /> Req
                  </label>
                </div>
                {p.type === 'select' && (
                  <input className="form-control" style={{ fontSize: '0.75rem', marginTop: 4 }} placeholder="Option1,Option2"
                    value={(p.options || []).join(', ')} onChange={e => updateParameter(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                )}
                <div style={{ marginTop: 4 }}>
                  <input className="form-control" style={{ fontSize: '0.75rem' }} placeholder="Sample value for preview"
                    value={paramValues[p.key] !== undefined ? paramValues[p.key] : ''}
                    onChange={e => handleParamValueChange(p.key, e.target.value)}
                    onDrop={e => handleParamDrop(e, p.key)}
                    onDragOver={e => e.preventDefault()} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <VariablePicker
        isOpen={showVarPicker}
        onClose={() => setShowVarPicker(false)}
        onSelect={handleVariableSelect}
        variant="floating"
        title="Insert Variable Into Component"
      />
    </div>
  );
}
