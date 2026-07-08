import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { emailAPI } from '../../services/api';
import { useEmailComponentsContext } from '../../context/EmailComponentsContext';
import VariablePicker from '../../components/VariablePicker';
import EmailComposerCore from './EmailComposerCore';
import DraggablePopup, { DraggableHeader } from '../../components/EmailDraggablePopup';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildComponentHtml(component, values = {}) {
  let html = component.html || '';
  (component.parameters || []).forEach((param) => {
    const value = values[param.key] !== undefined && values[param.key] !== '' ? values[param.key] : (param.defaultValue || '');
    html = html
      .replace(new RegExp(`\\{\\{param\\.${escapeRegex(param.key)}\\}\\}`, 'g'), value)
      .replace(new RegExp(`\\{\\{param:${escapeRegex(param.key)}\\}\\}`, 'g'), value);
  });
  return component.css ? `<style type="text/css">${component.css}</style>${html}` : html;
}

function insertHtmlAtCursor(html, editorEl) {
  if (!editorEl) return;
  const sel = window.getSelection();
  const doc = editorEl.ownerDocument;
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = html;
  const fragment = doc.createDocumentFragment();
  while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild);
  if (sel.rangeCount && editorEl.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) { range.setStartAfter(lastNode); range.collapse(true); }
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editorEl.appendChild(fragment);
    editorEl.appendChild(doc.createTextNode(' '));
  }
  editorEl.focus();
}

export default function EmailBuilder({ templateId }) {
  const navigate = useNavigate();
  const { components, loadComponents } = useEmailComponentsContext();
  const editorRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState([]);
  const [status, setStatus] = useState('draft');
  const [css, setCss] = useState('');
  const [showVarPicker, setShowVarPicker] = useState(false);
  const [showCompPicker, setShowCompPicker] = useState(false);
  const [componentForm, setComponentForm] = useState(null);
  const [componentParamValues, setComponentParamValues] = useState({});
  const [activeComponentParam, setActiveComponentParam] = useState('');
  const [componentParamUploading, setComponentParamUploading] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [contentVersion, setContentVersion] = useState(0);
  const contentDirtyRef = useRef(false);
  const autosaveRef = useRef(null);
  const htmlRef = useRef('');

  const markDirty = useCallback(() => {
    contentDirtyRef.current = true;
    setContentVersion(v => v + 1);
  }, []);

  useEffect(() => {
    loadComponents().catch(() => {});
  }, []);

  useEffect(() => {
    if (!templateId) return;
    (async () => {
      setLoading(true);
      try {
        const r = await emailAPI.getTemplate(templateId);
        const t = r.data?.data?.template;
        if (t) {
          setTitle(t.templateName || t.name || '');
          setSubject(t.subject || '');
          setDescription(t.description || '');
          setTags(Array.isArray(t.tags) ? t.tags : []);
          setStatus(t.status || 'draft');
          setCss(t.css || '');
          htmlRef.current = t.html || '';
          if (editorRef.current) {
            editorRef.current.innerHTML = t.html || '';
          }
        }
      } catch (e) {
        toast.error('Failed to load template');
      } finally {
        setLoading(false);
      }
    })();
  }, [templateId]);

  const getContent = useCallback(() => {
    return editorRef.current?.innerHTML || '';
  }, []);

  const handleHtmlChange = useCallback((newHtml) => {
    htmlRef.current = newHtml;
    markDirty();
  }, [markDirty]);

  const handleSave = useCallback(async (newStatus) => {
    if (!templateId || loading) return false;
    setSaving(true);
    try {
      const html = getContent();
      const data = { templateName: title, subject, description, tags, html, css, status: newStatus || status };
      await emailAPI.updateTemplate(templateId, data);
      setStatus(data.status);
      setLastSaved(new Date());
      contentDirtyRef.current = false;
      toast.success('Template saved');
      return true;
    } catch (e) {
      toast.error('Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  }, [title, subject, description, tags, css, status, getContent, templateId, loading]);

  const handleClose = useCallback(async () => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    if (contentDirtyRef.current) {
      const saved = await handleSave(status);
      if (!saved) return;
    }
    navigate('/email/templates');
  }, [handleSave, navigate, status]);

  useEffect(() => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    if (!templateId || !title || loading || !contentDirtyRef.current) return;
    autosaveRef.current = setTimeout(() => { handleSave('draft'); }, 5000);
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); };
  }, [title, subject, contentVersion, templateId, handleSave, loading]);

  const handleEditorDrop = (e) => {
    const variableKey = e.dataTransfer.getData('application/x-email-variable');
    const text = e.dataTransfer.getData('text/plain');
    if (!variableKey && !text) return;
    e.preventDefault();
    editorRef.current?.focus();
    const range = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(e.clientX, e.clientY)
      : null;
    const selection = window.getSelection();
    if (range && selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    insertVariable(variableKey || text.replace(/[{}]/g, ''));
    markDirty();
  };

  function insertVariable(name) {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    const doc = editor.ownerDocument;
    // If cursor is inside an anchor, insert as plain text to avoid browser issues
    const insideAnchor = sel.rangeCount && editor.contains(sel.anchorNode) && (
      sel.anchorNode.nodeType === 3
        ? sel.anchorNode.parentElement?.closest?.('a')
        : sel.anchorNode.closest?.('a')
    );
    if (insideAnchor) {
      const text = doc.createTextNode(`{{${name}}}`);
      if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(text);
        range.setStartAfter(text);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        editor.appendChild(text);
      }
      editor.focus();
      markDirty();
      return;
    }
    const span = doc.createElement('span');
    span.className = 'email-var-placeholder';
    span.contentEditable = 'false';
    span.textContent = `{{${name}}}`;
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
    markDirty();
  }

  function insertComponentReference(componentKey) {
    insertHtmlAtCursor(
      `<span class="email-component-placeholder" contenteditable="false">{{component:${componentKey}}}</span>`,
      editorRef.current
    );
    markDirty();
  }

  const uploadEmailImage = async (file) => {
    const formData = new FormData();
    formData.append('files', file);
    formData.append('category', 'inline-image');
    const r = await emailAPI.uploadAssets(formData);
    return r.data?.data?.assets?.[0];
  };

  const handleComponentParamImageUpload = async (paramKey, file) => {
    if (!file) return;
    setComponentParamUploading(prev => ({ ...prev, [paramKey]: true }));
    try {
      const asset = await uploadEmailImage(file);
      if (!asset?.publicUrl) throw new Error('Upload did not return an image URL');
      setComponentParamValues(prev => ({ ...prev, [paramKey]: asset.publicUrl }));
      setActiveComponentParam(paramKey);
      toast.success('Image uploaded');
    } catch (e) {
      toast.error(e.message || 'Image upload failed');
    } finally {
      setComponentParamUploading(prev => ({ ...prev, [paramKey]: false }));
    }
  };

  const handleComponentParamDrop = (e, key) => {
    const variableKey = e.dataTransfer.getData('application/x-email-variable') || e.dataTransfer.getData('text/plain').replace(/[{}]/g, '');
    if (!variableKey) return;
    e.preventDefault();
    setComponentParamValues(prev => ({ ...prev, [key]: `${prev[key] || ''}{{${variableKey}}}` }));
  };

  const openComponentForm = (component) => {
    const defaults = {};
    (component.parameters || []).forEach((param) => {
      defaults[param.key] = param.defaultValue || '';
    });
    setComponentParamValues(defaults);
    setActiveComponentParam((component.parameters || [])[0]?.key || '');
    setComponentForm(component);
    setShowCompPicker(false);
  };

  const insertConfiguredComponent = () => {
    if (!componentForm) return;
    insertHtmlAtCursor(buildComponentHtml(componentForm, componentParamValues), editorRef.current);
    markDirty();
    setComponentForm(null);
    setComponentParamValues({});
    setActiveComponentParam('');
  };

  const handleVariablePick = (ref) => {
    if (componentForm && activeComponentParam) {
      setComponentParamValues(prev => ({ ...prev, [activeComponentParam]: `${prev[activeComponentParam] || ''}{{${ref}}}` }));
      return;
    }
    insertVariable(ref);
  };

  const renderComponentParamControl = (param) => {
    const value = componentParamValues[param.key] || '';
    const commonProps = {
      className: 'form-control',
      value,
      placeholder: param.placeholder || `Drop {{variable}} or enter ${param.type}`,
      onChange: e => setComponentParamValues(prev => ({ ...prev, [param.key]: e.target.value })),
      onFocus: () => setActiveComponentParam(param.key),
      onDrop: e => handleComponentParamDrop(e, param.key),
      onDragOver: e => e.preventDefault(),
    };

    if (param.type === 'textarea' || param.type === 'richtext') {
      return <textarea {...commonProps} rows={3} />;
    }
    if (param.type === 'select' && Array.isArray(param.options) && param.options.length > 0) {
      return (
        <select {...commonProps}>
          <option value="">Select...</option>
          {param.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    if (param.type === 'boolean') {
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={value === true || value === 'true'}
            onChange={e => setComponentParamValues(prev => ({ ...prev, [param.key]: e.target.checked ? 'true' : 'false' }))}
            onFocus={() => setActiveComponentParam(param.key)} />
          Enabled
        </label>
      );
    }
    if (param.type === 'color') {
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <input {...commonProps} style={{ flex: 1 }} />
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
            onChange={e => setComponentParamValues(prev => ({ ...prev, [param.key]: e.target.value }))}
            onFocus={() => setActiveComponentParam(param.key)} style={{ width: 44, height: 38, padding: 2 }} />
        </div>
      );
    }
    if (param.type === 'image') {
      const uploading = !!componentParamUploading[param.key];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input {...commonProps} />
          <input className="form-control" type="file" accept="image/*" disabled={uploading}
            onFocus={() => setActiveComponentParam(param.key)}
            onChange={e => handleComponentParamImageUpload(param.key, e.target.files?.[0])} />
          {uploading && <small style={{ color: '#666' }}>Uploading...</small>}
        </div>
      );
    }
    return <input {...commonProps} type={param.type === 'number' ? 'number' : 'text'} />;
  };

  if (loading) {
    return <div className="email-module" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}><div className="spinner" /></div>;
  }

  return (
    <div className="email-builder">
      <div className="email-builder-header">
        <div className="email-builder-fields">
          <input className="form-control" placeholder="Template Name *" value={title} onChange={e => { setTitle(e.target.value); markDirty(); }} style={{ flex: 2 }} />
          <input className="form-control" placeholder="Email Subject (e.g. Welcome {{customer_name}})" value={subject} onChange={e => { setSubject(e.target.value); markDirty(); }} style={{ flex: 3 }} />
          <select className="form-control" value={status} onChange={e => { setStatus(e.target.value); markDirty(); }} style={{ width: 120 }}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="email-builder-actions">
          <button className="btn btn-sm btn-secondary" onClick={() => handleSave(status)} disabled={saving || !title}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => handleSave('published')} disabled={saving || !title}>
            Publish
          </button>
          {lastSaved && <span className="email-builder-saved">Saved {lastSaved.toLocaleTimeString()}</span>}
          <button className="btn btn-sm btn-secondary" onClick={handleClose} disabled={saving}>Close</button>
        </div>
      </div>

      <EmailComposerCore
        editorRef={editorRef}
        html={htmlRef.current}
        onHtmlChange={handleHtmlChange}
        css={css}
        onCssChange={setCss}
        toolbarButtons={{
          onOpenVarPicker: () => setShowVarPicker(true),
          onOpenCompPicker: () => setShowCompPicker(true),
          onEditorDrop: handleEditorDrop,
        }}
      >
      </EmailComposerCore>

      {componentForm && (
        <DraggablePopup isOpen={!!componentForm} onClose={() => setComponentForm(null)} style={{ maxWidth: 500 }}>
          <DraggableHeader onClose={() => setComponentForm(null)}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>{componentForm.name}</h3>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowVarPicker(true)}>+ Var</button>
          </DraggableHeader>
          <div className="modal-body" style={{ maxHeight: '50vh', overflow: 'auto' }}>
            {(componentForm.parameters || []).map(param => (
              <div className="form-group" key={param.key}>
                <label>{param.label || param.name || param.key}{param.required ? ' *' : ''}</label>
                {renderComponentParamControl(param)}
              </div>
            ))}
          </div>
          <div className="email-link-panel-footer">
            <button className="btn btn-secondary" onClick={() => setComponentForm(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={insertConfiguredComponent}>Insert</button>
          </div>
        </DraggablePopup>
      )}

      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-sm btn-secondary" onClick={() => setShowVarPicker(true)}>+ Variable</button>
        <button className="btn btn-sm btn-secondary" onClick={() => setShowCompPicker(true)}>+ Component</button>
      </div>

      <VariablePicker
        isOpen={showVarPicker}
        onClose={() => setShowVarPicker(false)}
        onSelect={handleVariablePick}
        variant="floating"
        title={componentForm ? 'Drag Variable Into Component' : 'Insert Variable'}
      />

      {showCompPicker && (
        <DraggablePopup isOpen={showCompPicker} onClose={() => setShowCompPicker(false)} style={{ maxWidth: 480 }}>
          <DraggableHeader onClose={() => setShowCompPicker(false)}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Insert Component Reference</h3>
          </DraggableHeader>
          <div className="modal-body">
            <div className="email-variable-selector">
              {components.filter(c => c.isActive !== false).map(c => (
                <div key={c._id} className="email-variable-item" onClick={() => {
                  if ((c.parameters || []).length > 0) openComponentForm(c);
                  else { insertComponentReference(c.key); setShowCompPicker(false); }
                }}>
                  <code>{`{{component:${c.key}}}`}</code>
                  <span className="var-label">{c.category} - {c.description || c.name}</span>
                </div>
              ))}
              {components.length === 0 && <div style={{ padding: 16, color: '#999', textAlign: 'center' }}>No components available</div>}
            </div>
          </div>
        </DraggablePopup>
      )}
    </div>
  );
}
