import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Type, Square, Minus, Trash2, Copy, Plus, Search, ChevronDown, Image, FilePlus2, Link, QrCode, Variable } from 'lucide-react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { pdfManagementAPI } from '../services/api';
import '../styles/pdfManagement.css';

const FORMATS = { A4: { width: 794, height: 1123 }, A3: { width: 1123, height: 1587 }, A5: { width: 559, height: 794 }, LETTER: { width: 816, height: 1056 }, LEGAL: { width: 816, height: 1344 }, CUSTOM: { width: 800, height: 1000 } };
const uid = () => Math.random().toString(36).slice(2, 10);
const cssObject = (css = []) => Object.fromEntries((Array.isArray(css) ? css : []).filter(Boolean).map(x => [x.property, x.value]));
const cssArray = obj => Object.entries(obj).map(([property, value]) => ({ property, value: String(value) }));
const sample = { document: { title: 'QUOTATION', number: 'QT-2026-0001', status: 'draft', totalAmount: 'PKR 5,250,000', taxAmount: 'PKR 250,000', createdAt: '15/07/2026' }, customer: { fullName: 'Muhammad Ahmed', email: 'customer@example.com', phone: '0300-0000000' } };
const resolve = text => String(text || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => key.trim().split('.').reduce((v, p) => v?.[p], sample) ?? `{{${key}}}`);
const newPage = () => ({ config: { format: 'A4', width: 794, height: 1123, backgroundColor: '#ffffff' }, backgroundImage: '', bgSize: 'cover', bgPosition: 'center center', elements: [] });
const normalizePage = p => ({ ...newPage(), ...p, config: { ...newPage().config, ...(p?.config || {}) }, elements: Array.isArray(p?.elements) ? p.elements.map(e => ({ ...e, id: e.id || uid(), css: Array.isArray(e.css) ? e.css : [] })) : [] });

function QrPreview({ value }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(resolve(value) || 'https://example.com', { margin: 1, width: 300 }).then(setSrc).catch(() => setSrc('')); }, [value]);
  return src ? <img src={src} alt="QR code" /> : null;
}

function VariableDropInput({ label, placeholder, value, onChange, variables, type = 'input' }) {
  const inputRef = useRef(null);
  const [varOpen, setVarOpen] = useState(false);
  const [varSearch, setVarSearch] = useState('');

  const insertAtCursor = useCallback((ref) => {
    const el = inputRef.current;
    const current = value || '';
    if (!el) { onChange(current + ref); return; }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? start;
    const next = current.slice(0, start) + ref + current.slice(end);
    onChange(next);
    setVarOpen(false);
    setVarSearch('');
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + ref.length, start + ref.length); });
  }, [value, onChange]);

  const filtered = useMemo(() => variables.filter(v => `${v.key} ${v.label || ''}`.toLowerCase().includes(varSearch.toLowerCase())), [variables, varSearch]);

  return (
    <label className="pdf-input-wrap">
      <span className="pdf-input-label">{label}</span>
      <div className="pdf-input-row">
        {type === 'textarea'
          ? <textarea ref={inputRef} rows="4" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
          : <input ref={inputRef} type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}
      </div>
      <div className="pdf-var-dropdown">
        <button type="button" className="pdf-var-dropdown-btn" onClick={() => setVarOpen(o => !o)}>
          <Variable size={13} />Insert variable
        </button>
        {varOpen && (
          <div className="pdf-var-dropdown-menu">
            <div className="pdf-var-dropdown-search">
              <Search size={12} />
              <input autoFocus placeholder="Search..." value={varSearch} onChange={e => setVarSearch(e.target.value)} />
            </div>
            <div className="pdf-var-dropdown-list">
              {filtered.map(v => (
                <button key={v.key} type="button" onClick={() => insertAtCursor(v.reference)}>
                  <code>{v.reference}</code><small>{v.label || v.category}</small>
                </button>
              ))}
              {!filtered.length && <p className="pdf-var-dropdown-empty">No variables found</p>}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}

export default function PdfTemplateEditor() {
  const { id } = useParams(), navigate = useNavigate(), fileRef = useRef(null);
  const [template, setTemplate] = useState(null), [pageIndex, setPageIndex] = useState(0), [selectedId, setSelectedId] = useState(null), [variables, setVariables] = useState([]), [saving, setSaving] = useState(false), [elementOpen, setElementOpen] = useState(true);
  const [sidebarVarOpen, setSidebarVarOpen] = useState(false);
  const [sidebarVarSearch, setSidebarVarSearch] = useState('');
  const htmlRef = useRef(null);

  useEffect(() => {
    let live = true;
    pdfManagementAPI.getTemplate(id).then(r => {
      const t = r.data?.data?.template;
      if (!t) throw new Error();
      const pages = (t.designData?.pages || []).map(normalizePage);
      const fixed = { ...t, mode: t.mode || 'designer', html: t.html || '', css: t.css || '', designData: { ...(t.designData || {}), pages: pages.length ? pages : [newPage()] } };
      if (live) setTemplate(fixed);
      return pdfManagementAPI.getVariables(t.documentType);
    }).then(r => { if (live) setVariables(r.data?.data?.variables || []); }).catch(() => toast.error('Failed to load template'));
    return () => { live = false; };
  }, [id]);

  const pages = template?.designData?.pages || [], page = pages[pageIndex] || null, selected = page?.elements?.find(e => e.id === selectedId) || null, style = cssObject(selected?.css);
  const isHtml = template?.mode === 'html';
  const filteredSidebarVars = useMemo(() => variables.filter(v => `${v.key} ${v.label || ''}`.toLowerCase().includes(sidebarVarSearch.toLowerCase())), [variables, sidebarVarSearch]);

  const mutatePage = (index, fn) => setTemplate(t => { if (!t) return t; const next = structuredClone(t), target = next.designData.pages[index]; if (!target) return t; fn(target); return next; });
  const mutateElement = (elementId, fn, index = pageIndex) => mutatePage(index, p => { const el = p.elements.find(x => x.id === elementId); if (el) fn(el); });
  const setTemplateField = (key, value) => setTemplate(t => ({ ...t, [key]: value }));

  const addElement = (type, text = '', position = {}) => {
    const el = {
      id: uid(), type,
      text: type === 'link' ? 'Open link' : text,
      imageUrl: '',
      url: type === 'link' ? 'https://example.com' : '',
      qrValue: type === 'qr' ? 'https://example.com' : '',
      css: cssArray({
        left: `${position.x ?? 60}px`, top: `${position.y ?? 80}px`,
        width: type === 'line' ? '670px' : type === 'rectangle' ? '240px' : type === 'qr' ? '140px' : type === 'image' ? '220px' : '300px',
        height: type === 'rectangle' ? '120px' : type === 'line' ? '1px' : type === 'qr' ? '140px' : type === 'image' ? '160px' : '44px',
        'font-size': '16px', 'font-weight': '400',
        color: type === 'link' ? '#2563eb' : '#111827',
        'background-color': type === 'rectangle' ? '#e2e8f0' : 'transparent',
        'text-align': 'left', 'border-radius': '0px', opacity: '1'
      })
    };
    mutatePage(pageIndex, p => p.elements.push(el));
    setSelectedId(el.id);
  };

  const cssText = useMemo(() => Object.entries(cssObject(selected?.css)).map(([k, v]) => `${k}: ${v};`).join('\n'), [selected]);
  const applyCssText = text => selectedId && mutateElement(selectedId, el => {
    const obj = {};
    String(text || '').split(/[;\n]/).forEach(line => {
      const i = line.indexOf(':'); if (i < 1) return;
      const prop = line.slice(0, i).trim(), val = line.slice(i + 1).trim();
      if (prop && val) obj[prop] = val;
    });
    el.css = cssArray(obj);
  });

  const insertIntoHtml = ref => {
    const el = htmlRef.current;
    if (!el) { setTemplateField('html', `${template.html || ''}${ref}`); return; }
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start;
    const next = `${el.value.slice(0, start)}${ref}${el.value.slice(end)}`;
    setTemplateField('html', next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + ref.length, start + ref.length); });
  };

  const setStyle = (property, value) => selectedId && mutateElement(selectedId, el => { const obj = cssObject(el.css); obj[property] = value; el.css = cssArray(obj); });
  const setText = text => selectedId && mutateElement(selectedId, el => { el.text = text; });
  const setField = (key, value) => selectedId && mutateElement(selectedId, el => { el[key] = value; });
  const removeElement = () => { if (!selectedId) return; mutatePage(pageIndex, p => { p.elements = p.elements.filter(e => e.id !== selectedId); }); setSelectedId(null); };

  const insertVariable = v => {
    if (isHtml) { insertIntoHtml(v.reference); return; }
    if (selected?.type === 'text') setText(`${selected.text || ''}${v.reference}`);
    else if (selected?.type === 'image') setField('imageUrl', `${selected.imageUrl || ''}${v.reference}`);
    else if (selected?.type === 'link') setField('url', selected.url === 'https://example.com' ? v.reference : `${selected.url || ''}${v.reference}`);
    else if (selected?.type === 'qr') setField('qrValue', selected.qrValue === 'https://example.com' ? v.reference : `${selected.qrValue || ''}${v.reference}`);
    else addElement('text', v.reference);
  };

  const dropVariable = e => {
    e.preventDefault();
    const ref = e.dataTransfer.getData('application/pdf-variable');
    if (!ref) return;
    const rect = e.currentTarget.getBoundingClientRect();
    addElement('text', ref, { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) });
  };

  const beginMove = (ev, el) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    setSelectedId(el.id);
    const s = cssObject(el.css), sx = ev.clientX, sy = ev.clientY, left = parseFloat(s.left) || 0, top = parseFloat(s.top) || 0, elementId = el.id, index = pageIndex;
    const move = e => mutateElement(elementId, target => { const o = cssObject(target.css); o.left = `${Math.max(0, left + e.clientX - sx)}px`; o.top = `${Math.max(0, top + e.clientY - sy)}px`; target.css = cssArray(o); }, index);
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const save = async () => {
    setSaving(true);
    try { await pdfManagementAPI.updateTemplate(id, { name: template.name, status: template.status, description: template.description, designData: template.designData, mode: template.mode || 'designer', html: template.html || '', css: template.css || '' }); toast.success('Template saved'); }
    catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const addPage = () => { setTemplate(t => ({ ...t, designData: { ...t.designData, pages: [...t.designData.pages, newPage()] } })); setPageIndex(pages.length); setSelectedId(null); };
  const duplicatePage = () => { const copy = structuredClone(page); copy.elements = copy.elements.map(e => ({ ...e, id: uid() })); setTemplate(t => ({ ...t, designData: { ...t.designData, pages: [...t.designData.pages.slice(0, pageIndex + 1), copy, ...t.designData.pages.slice(pageIndex + 1)] } })); setPageIndex(pageIndex + 1); setSelectedId(null); };
  const deletePage = () => { if (pages.length === 1) return toast.error('At least one page is required'); setTemplate(t => ({ ...t, designData: { ...t.designData, pages: t.designData.pages.filter((_, i) => i !== pageIndex) } })); setPageIndex(Math.max(0, pageIndex - 1)); setSelectedId(null); };
  const updatePageConfig = (key, value) => mutatePage(pageIndex, p => { p.config[key] = value; });
  const setFormat = format => { const size = FORMATS[format]; mutatePage(pageIndex, p => { p.config = { ...p.config, format, width: size.width, height: size.height }; }); };
  const uploadBackground = e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => mutatePage(pageIndex, p => { p.backgroundImage = reader.result; }); reader.readAsDataURL(file); e.target.value = ''; };
  const uploadElementImage = e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setField('imageUrl', reader.result); reader.readAsDataURL(file); e.target.value = ''; };

  if (!template) return <div className="pdf-editor-loading">Loading editor...</div>;
  if (!isHtml && !page) return <div className="pdf-editor-loading">Loading editor...</div>;
  const canvasStyle = page ? { width: page.config.width, height: page.config.height, backgroundColor: page.config.backgroundColor || '#fff', backgroundImage: page.backgroundImage ? `url(${page.backgroundImage})` : undefined, backgroundSize: page.bgSize || 'cover', backgroundPosition: page.bgPosition || 'center center', backgroundRepeat: 'no-repeat' } : {};

  return (
    <div className={`pdf-editor${isHtml ? ' html-mode' : ''}`}>
      {/* ── Header ── */}
      <header className="pdf-editor-header">
        <button className="icon-btn" title="Back" onClick={() => navigate('/pdf-management')}><ArrowLeft size={19} /></button>
        <input value={template.name} onChange={e => setTemplate({ ...template, name: e.target.value })} />
        <select value={template.status} onChange={e => setTemplate({ ...template, status: e.target.value })}>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select title="Authoring mode" value={template.mode || 'designer'} onChange={e => setTemplateField('mode', e.target.value)}>
          <option value="designer">Designer</option>
          <option value="html">HTML / CSS</option>
        </select>
        <button className="btn btn-primary" onClick={save} disabled={saving}><Save size={17} />{saving ? 'Saving...' : 'Save'}</button>
      </header>

      {/* ── Left Sidebar ── */}
      <aside className="pdf-tools">
        <button className="pdf-add-element-trigger" onClick={() => setElementOpen(v => !v)}>
          <span><Plus size={17} />Add Element</span>
          <ChevronDown size={16} className={elementOpen ? 'rotated' : ''} />
        </button>
        {elementOpen && (
          <div className="pdf-tool-grid">
            <button onClick={() => addElement('text', 'Text block')}><Type size={18} />Text</button>
            <button onClick={() => addElement('image')}><Image size={18} />Image</button>
            <button onClick={() => addElement('link')}><Link size={18} />Link</button>
            <button onClick={() => addElement('qr')}><QrCode size={18} />QR code</button>
            <button onClick={() => addElement('rectangle')}><Square size={18} />Shape</button>
            <button onClick={() => addElement('line')}><Minus size={18} />Line</button>
          </div>
        )}

        {/* Sidebar Variables */}
        <div className="pdf-variable-picker">
          <button className="pdf-variable-trigger" onClick={() => setSidebarVarOpen(v => !v)}>
            <span><Search size={16} />Variables</span>
            <ChevronDown size={16} className={sidebarVarOpen ? 'rotated' : ''} />
          </button>
          {sidebarVarOpen && (
            <div className="pdf-variable-menu">
              <div className="pdf-variable-search">
                <Search size={15} />
                <input autoFocus placeholder="Search variables" value={sidebarVarSearch} onChange={e => setSidebarVarSearch(e.target.value)} />
              </div>
              <div className="pdf-variable-results">
                {filteredSidebarVars.map(v => (
                  <button key={v.key} draggable onDragStart={e => e.dataTransfer.setData('application/pdf-variable', v.reference)} onClick={() => insertVariable(v)}>
                    <code>{v.reference}</code>
                    <small>{v.label || v.category}</small>
                  </button>
                ))}
                {!filteredSidebarVars.length && <p>No variables found</p>}
              </div>
            </div>
          )}
        </div>

        {/* Pages */}
        <h3>Pages</h3>
        <div className="pdf-page-list">
          {pages.map((_, i) => (
            <button className={i === pageIndex ? 'active' : ''} onClick={() => { setPageIndex(i); setSelectedId(null); }} key={i}>
              <FilePlus2 size={15} />Page {i + 1}
            </button>
          ))}
        </div>
        <button onClick={addPage}><Plus size={17} />Add page</button>
        <button onClick={duplicatePage}><Copy size={17} />Duplicate page</button>
        <button className="danger" onClick={deletePage}><Trash2 size={17} />Delete page</button>
      </aside>

      {/* ── Main Canvas / HTML Editor ── */}
      {isHtml ? (
        <main className="pdf-canvas-area pdf-html-area">
          <div className="pdf-html-editors">
            <label>HTML
              <textarea ref={htmlRef} spellCheck={false} value={template.html || ''} onChange={e => setTemplateField('html', e.target.value)} placeholder={'<div class="doc">\n  <h1>{{document.title}}</h1>\n  <p>{{customer.fullName}}</p>\n</div>'} />
            </label>
            <label>CSS
              <textarea spellCheck={false} value={template.css || ''} onChange={e => setTemplateField('css', e.target.value)} placeholder={'.doc { font-family: Arial, sans-serif; padding: 32px; }\nh1 { color: #111827; }'} />
            </label>
          </div>
          <div className="pdf-html-preview">
            <div className="pdf-page-meta">Live preview (sample data)</div>
            <iframe title="Template preview" sandbox="" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${template.css || ''}</style></head><body>${resolve(template.html || '')}</body></html>`} />
          </div>
        </main>
      ) : (
        <main className="pdf-canvas-area">
          <div className="pdf-page-meta">Page {pageIndex + 1} of {pages.length} - {page.config.format}</div>
          <div className="pdf-canvas" style={canvasStyle} onDragOver={e => e.preventDefault()} onDrop={dropVariable} onMouseDown={e => { if (e.target === e.currentTarget) setSelectedId(null); }}>
            {page.elements.map(el => {
              const s = cssObject(el.css);
              return (
                <div key={el.id} className={`pdf-element ${selectedId === el.id ? 'selected' : ''} ${el.type}`} onMouseDown={e => beginMove(e, el)} style={{ left: s.left, top: s.top, width: s.width, height: s.height, fontSize: s['font-size'], fontWeight: s['font-weight'], fontFamily: s['font-family'], color: s.color, textAlign: s['text-align'], backgroundColor: s['background-color'], borderRadius: s['border-radius'], opacity: s.opacity, lineHeight: s['line-height'], padding: s.padding, border: s.border }}>
                  {el.type === 'text' ? resolve(el.text) : el.type === 'image' ? (el.imageUrl ? <img src={resolve(el.imageUrl)} alt="Template element" /> : <span className="pdf-image-placeholder"><Image size={28} />Choose image</span>) : el.type === 'link' ? <a href={resolve(el.url)} onClick={e => e.preventDefault()}>{resolve(el.text) || resolve(el.url)}</a> : el.type === 'qr' ? <QrPreview value={el.qrValue} /> : null}
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ── Right Properties Panel ── */}
      {!isHtml && (
        <aside className="pdf-properties">
          {selected ? (
            <>
              <div className="property-title">
                <h3>{selected.type} element</h3>
                <div>
                  <button title="Duplicate" onClick={() => { const copy = { ...structuredClone(selected), id: uid() }; mutatePage(pageIndex, p => p.elements.push(copy)); setSelectedId(copy.id); }}><Copy size={16} /></button>
                  <button title="Delete" onClick={removeElement}><Trash2 size={16} /></button>
                </div>
              </div>
              <button className="btn btn-secondary pdf-back-to-list" onClick={() => setSelectedId(null)}>
                <ArrowLeft size={14} />Back to elements
              </button>

              {/* Element-specific fields with drag-drop + insert */}
              {selected.type === 'text' && (
                <VariableDropInput label="Content" placeholder="Type text or drop variable here..." value={selected.text || ''} onChange={setText} variables={variables} type="textarea" />
              )}

              {selected.type === 'image' && (
                <>
                  <VariableDropInput label="Image URL or variable" placeholder="https://... or {{customer.profileImage}}" value={selected.imageUrl || ''} onChange={v => setField('imageUrl', v)} variables={variables} />
                  <label>Upload image<input type="file" accept="image/*" onChange={uploadElementImage} /></label>
                </>
              )}

              {selected.type === 'link' && (
                <>
                  <VariableDropInput label="Link label" placeholder="Link text" value={selected.text || ''} onChange={setText} variables={variables} />
                  <VariableDropInput label="URL or variable" placeholder="https://.../{{document.number}}" value={selected.url || ''} onChange={v => setField('url', v)} variables={variables} />
                </>
              )}

              {selected.type === 'qr' && (
                <VariableDropInput label="QR URL / value / variable" placeholder="https://.../{{document.number}}" value={selected.qrValue || ''} onChange={v => setField('qrValue', v)} variables={variables} type="textarea" />
              )}

              {/* CSS Position & Size */}
              <div className="property-grid">
                {['left', 'top', 'width', 'height', 'font-size'].map(p => (
                  <label key={p}>{p}<input value={style[p] || ''} onChange={e => setStyle(p, e.target.value)} /></label>
                ))}
              </div>

              <label>Text color<input type="color" value={style.color || '#111827'} onChange={e => setStyle('color', e.target.value)} /></label>
              <label>Background<input type="color" value={style['background-color'] === 'transparent' ? '#ffffff' : style['background-color'] || '#ffffff'} onChange={e => setStyle('background-color', e.target.value)} /></label>
              <label>Alignment<select value={style['text-align'] || 'left'} onChange={e => setStyle('text-align', e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select></label>
              <label>Font weight<select value={style['font-weight'] || '400'} onChange={e => setStyle('font-weight', e.target.value)}>
                <option value="300">Light</option>
                <option value="400">Regular</option>
                <option value="600">Semi bold</option>
                <option value="700">Bold</option>
              </select></label>
              <label>Border radius<input value={style['border-radius'] || '0px'} onChange={e => setStyle('border-radius', e.target.value)} /></label>
              <label>Opacity<input type="range" min="0" max="1" step="0.05" value={style.opacity || '1'} onChange={e => setStyle('opacity', e.target.value)} /></label>
              <label>Line height<input value={style['line-height'] || ''} onChange={e => setStyle('line-height', e.target.value)} /></label>
              <label>Padding<input value={style.padding || ''} onChange={e => setStyle('padding', e.target.value)} /></label>
              <label>Border<input value={style.border || ''} onChange={e => setStyle('border', e.target.value)} placeholder="1px solid #000" /></label>

              {/* Free-form CSS */}
              <label className="pdf-css-label">Free CSS<textarea className="pdf-css-editor" rows="5" value={cssText} onChange={e => applyCssText(e.target.value)} placeholder={`left: 60px;\ntop: 80px;\nfont-family: Georgia, serif;\nletter-spacing: 0.5px;`} /></label>
              <small className="pdf-css-hint">One <code>property: value;</code> per line. Anything valid here is applied to the element.</small>
            </>
          ) : (
            <>
              <div className="property-title"><h3>Page setup</h3></div>
              <label>Page format<select value={page.config.format || 'A4'} onChange={e => setFormat(e.target.value)}>{Object.keys(FORMATS).map(f => <option key={f}>{f}</option>)}</select></label>
              {page.config.format === 'CUSTOM' && (
                <div className="property-grid">
                  <label>Width<input type="number" value={page.config.width} onChange={e => updatePageConfig('width', Number(e.target.value))} /></label>
                  <label>Height<input type="number" value={page.config.height} onChange={e => updatePageConfig('height', Number(e.target.value))} /></label>
                </div>
              )}
              <label>Page background<input type="color" value={page.config.backgroundColor || '#ffffff'} onChange={e => updatePageConfig('backgroundColor', e.target.value)} /></label>
              <label>Background image<input ref={fileRef} type="file" accept="image/*" onChange={uploadBackground} /></label>
              {page.backgroundImage && <button className="btn btn-secondary" onClick={() => mutatePage(pageIndex, p => { p.backgroundImage = ''; })}>Remove background</button>}
              <label>Image fit<select value={page.bgSize || 'cover'} onChange={e => mutatePage(pageIndex, p => { p.bgSize = e.target.value; })}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="100% 100%">Stretch</option>
              </select></label>
              <label>Image position<select value={page.bgPosition || 'center center'} onChange={e => mutatePage(pageIndex, p => { p.bgPosition = e.target.value; })}>
                <option value="center center">Center</option>
                <option value="top center">Top</option>
                <option value="bottom center">Bottom</option>
              </select></label>

              {/* Elements list */}
              <div className="pdf-elements-section">
                <div className="pdf-elements-header">
                  <h3>Elements ({page.elements.length})</h3>
                  <button className="btn btn-primary btn-sm" onClick={() => addElement('text', 'Text block')}><Plus size={15} />Add</button>
                </div>
                {page.elements.length === 0 ? (
                  <p className="pdf-elements-empty">No elements yet. Click "Add" or use the sidebar to add elements.</p>
                ) : (
                  <div className="pdf-elements-list">
                    {page.elements.map(el => {
                      const label = el.type === 'text' ? (el.text || 'Empty text').slice(0, 30) : el.type === 'image' ? 'Image' : el.type === 'link' ? (el.text || 'Link') : el.type === 'qr' ? 'QR Code' : el.type === 'rectangle' ? 'Shape' : el.type === 'line' ? 'Line' : el.type;
                      return (
                        <button key={el.id} className={`pdf-element-item ${selectedId === el.id ? 'active' : ''}`} onClick={() => setSelectedId(el.id)}>
                          <span className={`pdf-element-dot ${el.type}`} />
                          <span className="pdf-element-label">{label}{el.type === 'text' && el.text && el.text.length > 30 ? '...' : ''}</span>
                          <span className="pdf-element-type">{el.type}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
