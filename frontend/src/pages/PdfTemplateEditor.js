import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Type, Square, Minus, Trash2, Copy, Plus, Search, ChevronDown, Image, FilePlus2, Link, QrCode, Variable, PanelLeftOpen, PanelRightOpen, Code } from 'lucide-react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/themes/prism-tomorrow.css';
import { pdfManagementAPI } from '../services/api';
import '../styles/pdfManagement.css';

const FORMATS = { A4: { width: 794, height: 1123 }, A3: { width: 1123, height: 1587 }, A5: { width: 559, height: 794 }, LETTER: { width: 816, height: 1056 }, LEGAL: { width: 816, height: 1344 }, CUSTOM: { width: 800, height: 1000 } };
const uid = () => Math.random().toString(36).slice(2, 10);
const cssObject = (css = []) => Object.fromEntries((Array.isArray(css) ? css : []).filter(Boolean).map(x => [x.property, x.value]));
const cssArray = obj => Object.entries(obj).map(([property, value]) => ({ property, value: String(value) }));
// Two sample vehicle lines and two sample part lines, so a template that
// prints `{{#each vehicleItems}}`/`{{#each partItems}}` has something real to
// loop over in the live preview — the same shape services/pdfData.service.js
// builds for the actual PDF.
const SAMPLE_VEHICLE_ITEMS = [
  { number: 1, type: 'vehicle', code: 'VIN-SAMPLE-001', name: 'Toyota Corolla XLI', description: 'Toyota Corolla XLI', quantity: 1, unitPriceText: 'PKR 5,000,000', discountAmountText: 'PKR 0', taxAmountText: 'PKR 0', totalPriceText: 'PKR 5,000,000' },
];
const SAMPLE_PART_ITEMS = [
  { number: 1, type: 'part', code: 'SPARE-001', name: 'Brake Pad Set', description: 'Brake Pad Set (SPARE-001)', quantity: 2, unitPriceText: 'PKR 15,000', discountAmountText: 'PKR 0', taxAmountText: 'PKR 2,700', totalPriceText: 'PKR 32,700' },
  { number: 2, type: 'part', code: 'SPARE-014', name: 'Oil Filter', description: 'Oil Filter (SPARE-014)', quantity: 1, unitPriceText: 'PKR 2,500', discountAmountText: 'PKR 0', taxAmountText: 'PKR 450', totalPriceText: 'PKR 2,950' },
];
const withGroupMeta = rows => Object.assign(rows.slice(), {
  count: rows.length,
  subtotalText: `PKR ${rows.reduce((s, r) => s + Number(String(r.totalPriceText).replace(/[^\d.]/g, '')), 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
});
const sample = {
  document: { title: 'QUOTATION', number: 'QT-2026-000001', status: 'draft', date: '15/07/2026', totalAmount: 'PKR 5,250,000', taxAmount: 'PKR 250,000', subtotal: 'PKR 5,000,000', discountAmount: 'PKR 20,000', discountPercentage: '5', additionalCharges: 'PKR 0', vehiclePrice: 'PKR 5,000,000', validUntil: '22/07/2026', validityDays: '7', bookingDate: '15/07/2026', bookingAmount: 'PKR 500,000', deliveryDate: '30/07/2026', priority: 'high', orderDate: '15/07/2026', paymentMode: 'cash', invoiceDate: '15/07/2026', dueDate: '14/08/2026', paidAmount: 'PKR 2,000,000', balanceAmount: 'PKR 3,250,000', amountTendered: 'PKR 2,000,000', changeDue: '', salePerson: 'Hussain Admin', notes: 'Thank you for your business.', termsAndConditions: 'Payment within 30 days of delivery.', itemName: 'Toyota Corolla XLI', totalInWords: 'RUPEES FIFTY TWO LAKH FIFTY THOUSAND ONLY' },
  customer: { fullName: 'Muhammad Ahmed', firstName: 'Muhammad', lastName: 'Ahmed', companyName: 'Ahmed Motors', email: 'customer@example.com', phone: '0300-0000000', alternatePhone: '0321-1111111', customerCode: 'CUS-000001', address: 'Fareed Durrani Road', city: 'Karachi', state: 'Sindh', country: 'Pakistan', zipCode: '75730' },
  vehicle: { name: 'Toyota Corolla XLI', make: 'Toyota', model: 'Corolla', variant: 'XLI', color: 'White', year: '2025', vin: 'VIN-SAMPLE-001' },
  generator: { fullName: 'Hussain Admin', email: 'sales@company.com', phone: '+92 300 0000000' },
  company: { name: 'OMODA | JAECOO', phone: '0302-5227979', address: '120A-E1 Hali Road Gulberg 3', city: 'Lahore', ntn: '9556854', email: 'info@company.com' },
  item: { name: 'Toyota Corolla XLI', list: 'Toyota Corolla XLI, Accessories' },
  items: [...SAMPLE_VEHICLE_ITEMS, ...SAMPLE_PART_ITEMS],
  vehicleItems: withGroupMeta(SAMPLE_VEHICLE_ITEMS),
  partItems: withGroupMeta(SAMPLE_PART_ITEMS),
};

/**
 * Same block-helper semantics as backend/services/templateLoops.cjs, ported
 * so the live preview can actually show `{{#each items}}` / `{{#if x}}`
 * instead of leaving the raw block markup on screen. The real PDF is built
 * server-side by that file; this copy exists only so the preview agrees with
 * it — keep the two in sync if the syntax ever changes.
 */
const BLOCK_RE = /\{\{\s*#(each|if|unless)\s+([^}]+?)\s*\}\}([\s\S]*?)\{\{\s*\/\1\s*\}\}/;
const getPath = (source, key) => String(key).split('.').reduce((v, p) => (v == null ? undefined : (p === 'this' || p === '.' ? v : v[p])), source);
const isEmptyValue = v => v == null || v === false || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && v === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
/** `{{this.x}}`, `{{x}}` and `{{@meta}}` resolved against one loop row. */
function substituteRow(body, row, meta) {
  return body.replace(/\{\{\s*([^#/{}][^}]*?)\s*\}\}/g, (match, rawKey) => {
    const key = String(rawKey).trim();
    if (key.startsWith('@')) return String(meta[key.slice(1)] ?? match);
    const looksLikeRowField = key === 'this' || key.startsWith('this.')
      || (row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, key.split('.')[0]));
    if (!looksLikeRowField) return match;
    const value = key === 'this' ? row : getPath(row, key);
    return value === undefined ? '' : String(value);
  });
}
function expandBlocks(text, data = {}) {
  let out = String(text == null ? '' : text);
  for (let pass = 0; pass < 100; pass += 1) {
    const match = BLOCK_RE.exec(out);
    if (!match) break;
    const [full, helper, rawPath, body] = match;
    const value = getPath(data, rawPath.trim());
    let replacement = '';
    if (helper === 'each') {
      const rows = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.values(value) : []);
      replacement = rows.map((row, index) => {
        const meta = { index, number: index + 1, first: index === 0, last: index === rows.length - 1, count: rows.length };
        const rowData = row && typeof row === 'object' ? { ...data, ...row, this: row } : data;
        const inner = expandBlocks(body, rowData);
        return substituteRow(inner, row, meta);
      }).join('');
    } else if (helper === 'if') {
      replacement = isEmptyValue(value) ? '' : expandBlocks(body, data);
    } else if (helper === 'unless') {
      replacement = isEmptyValue(value) ? expandBlocks(body, data) : '';
    }
    out = out.slice(0, match.index) + replacement + out.slice(match.index + full.length);
  }
  return out;
}
const resolve = text => {
  const expanded = expandBlocks(text, sample);
  return expanded.replace(/\{\{\s*([^#/{}][^}]*?)\s*\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    const v = key === 'this' ? undefined : getPath(sample, key);
    if (v === undefined) return key.startsWith('this.') ? '' : match;
    return typeof v === 'object' ? '' : String(v);
  });
};
const newPage = () => ({ config: { format: 'A4', width: 794, height: 1123, backgroundColor: '#ffffff' }, backgroundImage: '', bgSize: 'cover', bgPosition: 'center center', elements: [] });
const normalizePage = p => ({ ...newPage(), ...p, config: { ...newPage().config, ...(p?.config || {}) }, elements: Array.isArray(p?.elements) ? p.elements.map(e => ({ ...e, id: e.id || uid(), css: Array.isArray(e.css) ? e.css : [] })) : [] });

const highlightHtml = code => Prism.highlight(code, Prism.languages.markup, 'markup');
const highlightCss = code => Prism.highlight(code, Prism.languages.css, 'css');

const escHtml = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (v) => escHtml(v).replace(/"/g, '&quot;');
const STYLE_PROPS = ['left', 'top', 'width', 'height', 'font-size', 'font-weight', 'font-family', 'font-style', 'letter-spacing', 'color', 'text-align', 'background-color', 'border-radius', 'opacity', 'line-height', 'padding', 'border'];

/**
 * Compile the visual design of a page into raw HTML + CSS. Tokens like
 * {{customer.fullName}} are kept RAW (not resolved) so the HTML is editable and
 * can be parsed back into the design. `data-el` markers make the round-trip
 * lossless for designer-authored templates.
 */
function compileDesignToHtml(page) {
  if (!page) return { html: '', css: '' };
  const cfg = page.config || {};
  const w = cfg.width || 794, h = cfg.height || 1123;
  let css = `* { box-sizing: border-box; margin: 0; padding: 0; }\n`;
  css += `.pdf-page { position: relative; width: ${w}px; height: ${h}px; background: ${cfg.backgroundColor || '#ffffff'}; overflow: hidden; font-family: Arial, Helvetica, sans-serif; }\n`;
  let bodyHtml = '<div class="pdf-page">\n';
  (page.elements || []).forEach(el => {
    const s = cssObject(el.css);
    const pos = STYLE_PROPS.map(p => s[p] != null ? `${p}: ${s[p]}` : null).filter(Boolean).join('; ');
    const style = `position: absolute; ${pos}`;
    switch (el.type) {
      case 'image': bodyHtml += `  <img data-el="image" src="${escAttr(el.imageUrl || '')}" style="${style}" />\n`; break;
      case 'link': bodyHtml += `  <a data-el="link" href="${escAttr(el.url || '#')}" style="${style}">${escHtml(el.text || el.url || '')}</a>\n`; break;
      case 'qr': bodyHtml += `  <div data-el="qr" data-qr="${escAttr(el.qrValue || '')}" style="${style}"></div>\n`; break;
      case 'rectangle': bodyHtml += `  <div data-el="rectangle" style="${style}"></div>\n`; break;
      case 'line': bodyHtml += `  <hr data-el="line" style="${style}" />\n`; break;
      default: bodyHtml += `  <div data-el="text" style="${style}">${escHtml(el.text || '')}</div>\n`;
    }
  });
  bodyHtml += '</div>';
  return { html: bodyHtml, css };
}

/** Parse an inline style string into a css object (dropping `position`). */
function parseInlineStyle(styleStr) {
  const obj = {};
  String(styleStr || '').split(';').forEach(decl => {
    const i = decl.indexOf(':');
    if (i < 1) return;
    const prop = decl.slice(0, i).trim(), val = decl.slice(i + 1).trim();
    if (prop && val && prop !== 'position') obj[prop] = val;
  });
  return obj;
}

/**
 * True when the HTML uses `{{#each}}` / `{{#if}}` / `{{#unless}}` — a table
 * that repeats once per line item, or a block that only sometimes prints.
 * Designer mode is a fixed canvas of absolute-positioned elements; it has no
 * way to draw "one row per product" or "only if there's a discount", so a
 * template built on these blocks cannot be represented there at all.
 */
const hasBlockHelpers = (html) => /\{\{\s*#(each|if|unless)\s+/.test(String(html || ''));

/**
 * True when this markup came out of compileDesignToHtml — a `.pdf-page` wrapper
 * whose children all carry the `data-el` marker it writes.
 *
 * Only that markup survives the round trip through Designer unchanged. Anything
 * else — hand-written HTML, a seeded document layout, flowing tables — is
 * approximated when converted, so the editor warns before doing it.
 */
function isDesignerAuthored(html) {
  const source = String(html || '').trim();
  if (!source) return true; // nothing to lose
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const page = doc.querySelector('.pdf-page');
    if (!page) return false;
    const children = Array.from(page.children);
    return children.length > 0 && children.every((node) => node.hasAttribute('data-el'));
  } catch {
    return false;
  }
}

/**
 * Inverse of compileDesignToHtml: parse raw HTML back into page elements so the
 * designer reflects edits made in the HTML view. Keeps the existing page config.
 * Falls back to tag/content heuristics when `data-el` markers are absent.
 *
 * Only compileDesignToHtml's own output carries `left`/`top` on every element
 * — hand-written or DMS-style flow HTML (tables, headers, paragraphs) has
 * none. Leaving those blank would stack every element on top of the last at
 * (0, 0); instead they are placed one under another in document order so
 * they land somewhere sane and stay individually visible and draggable.
 */
function htmlToDesign(html, baseConfig) {
  const config = { ...baseConfig };
  let elements = [];
  try {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    const container = doc.querySelector('.pdf-page') || doc.body;
    let stackTop = 24;
    elements = Array.from(container.children).map(node => {
      const tag = node.tagName.toLowerCase();
      const marker = node.getAttribute('data-el');
      const css = parseInlineStyle(node.getAttribute('style'));
      // No inline position (this node was never placed on the canvas): stack
      // it below whatever came before, full-width, sized to its own content.
      if (css.left == null && css.top == null) {
        const text = (node.textContent || '').trim();
        const rows = Math.max(1, Math.ceil(text.length / 90)) + (node.tagName === 'TABLE' ? (node.rows?.length || 3) : 0);
        const height = Math.min(400, 22 * rows);
        css.left = '24px';
        css.top = `${stackTop}px`;
        css.width = css.width || '740px';
        stackTop += height + 10;
      }
      const finalCss = cssArray(css);
      const base = { id: uid(), text: '', imageUrl: '', url: '', qrValue: '', css: finalCss };
      if (marker === 'image' || tag === 'img') return { ...base, type: 'image', imageUrl: node.getAttribute('src') || '' };
      if (marker === 'link' || tag === 'a') return { ...base, type: 'link', url: node.getAttribute('href') || '', text: node.textContent || '' };
      if (marker === 'line' || tag === 'hr') return { ...base, type: 'line' };
      if (marker === 'qr') return { ...base, type: 'qr', qrValue: node.getAttribute('data-qr') || '' };
      if (marker === 'rectangle') return { ...base, type: 'rectangle' };
      // Unmarked <div>/<table>/etc.: decide by content.
      const text = (node.textContent || '').trim();
      if (marker === 'text' || text) return { ...base, type: 'text', text: node.textContent || '' };
      return { ...base, type: 'rectangle' };
    });
  } catch { elements = Array.isArray(baseConfig?.elements) ? baseConfig.elements : []; }
  return { ...config, elements };
}

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
  const [varMenuPos, setVarMenuPos] = useState(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [showCodeView, setShowCodeView] = useState(false);
  const [showDesignerPreview, setShowDesignerPreview] = useState(false);
  const htmlRef = useRef(null);
  const sidebarVarBtnRef = useRef(null);
  // Pristine html/css captured the moment a block-helper template is sent to
  // Designer, so switching back can restore it byte-for-byte instead of
  // compiling from Designer's lossy static approximation. See switchMode.
  const preDesignerRef = useRef(null);

  // Open the Variables popover anchored to its trigger. Using fixed positioning
  // lets the menu escape the sidebar's overflow:auto (no more clipping).
  const toggleSidebarVars = () => {
    setSidebarVarOpen(open => {
      if (!open && sidebarVarBtnRef.current) {
        const r = sidebarVarBtnRef.current.getBoundingClientRect();
        const width = 300;
        const left = Math.min(r.left, window.innerWidth - width - 12);
        setVarMenuPos({ top: r.bottom + 4, left: Math.max(8, left), maxHeight: window.innerHeight - r.bottom - 16, width });
      }
      return !open;
    });
  };

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
  const compiled = useMemo(() => !isHtml && page ? compileDesignToHtml(page) : null, [isHtml, page]);

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
        'background-color': type === 'rectangle' ? '#e2e8f0' : type === 'line' ? '#334155' : 'transparent',
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
  const nudge = (dx, dy) => selectedId && mutateElement(selectedId, el => { const o = cssObject(el.css); o.left = `${Math.max(0, (parseFloat(o.left) || 0) + dx)}px`; o.top = `${Math.max(0, (parseFloat(o.top) || 0) + dy)}px`; el.css = cssArray(o); });

  // Keyboard shortcuts on the canvas: Delete removes, arrows nudge (Shift = 10px).
  useEffect(() => {
    if (isHtml) return undefined;
    const onKey = e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (!selectedId) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeElement(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, isHtml, pageIndex]);

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

  /**
   * Save exactly what is on screen.
   *
   * This used to compile one representation into the other on every save, in
   * whichever direction the current mode implied — and that is what wrecked
   * templates. Saving an HTML template rebuilt its designData from the markup;
   * saving in Designer overwrote the real HTML with Designer's flattened
   * approximation of it. So a template written in HTML could be destroyed just
   * by opening Designer to look at it and pressing Save, and the damage was
   * permanent because the original markup had already been overwritten.
   *
   * The mode a template is in is the mode it renders from (the server reads
   * `html` for an HTML template and `designData` for a designer one), so each
   * representation is now left alone unless the user explicitly converts it
   * with the mode toggle below.
   */
  const save = async () => {
    setSaving(true);
    try {
      await pdfManagementAPI.updateTemplate(id, {
        name: template.name,
        status: template.status,
        description: template.description,
        designData: template.designData,
        mode: template.mode || 'designer',
        html: template.html || '',
        css: template.css || '',
      });
      toast.success('Template saved');
    }
    catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const switchMode = (newMode) => {
    const current = template.mode || 'designer';
    if (newMode === current) return;
    setSelectedId(null);

    if (newMode === 'designer') {
      // HTML → Designer is a lossy conversion for anything not authored in
      // Designer in the first place. Designer is a fixed canvas of
      // absolutely-positioned boxes: it has no way to express a table that
      // repeats per product, a block that only sometimes prints, or ordinary
      // flowing markup, so all of that collapses into stacked static boxes.
      const lossy = hasBlockHelpers(template.html) || !isDesignerAuthored(template.html);
      if (lossy && !window.confirm(
        'Designer can only show a flat, static snapshot of this template.\n\n'
        + (hasBlockHelpers(template.html)
          ? 'It repeats rows per product or shows sections conditionally (#each / #if), and those blocks will collapse to a single static copy.\n\n'
          : 'Its layout is written as flowing HTML, which Designer will break into separate positioned boxes.\n\n')
        + 'Your HTML is kept safe either way — switching back to HTML restores it, '
        + 'and saving from Designer no longer overwrites it.\n\nOpen Designer anyway?'
      )) return;

      setTemplate(t => {
        const nextPages = t.designData.pages.map((p, i) => i === pageIndex ? htmlToDesign(t.html, p) : p);
        // Remember the exact source, and the design it produced, so switching
        // back can tell "the user only looked" from "the user edited".
        preDesignerRef.current = {
          html: t.html,
          css: t.css,
          designSignature: JSON.stringify(nextPages),
        };
        return { ...t, mode: 'designer', designData: { ...t.designData, pages: nextPages } };
      });
      return;
    }

    // Designer → HTML.
    const snapshot = preDesignerRef.current;
    if (snapshot) {
      const untouched = JSON.stringify(template.designData.pages) === snapshot.designSignature;
      // Nothing was moved on the canvas, so there is nothing to carry back —
      // hand the original markup straight back, byte for byte.
      if (untouched) {
        preDesignerRef.current = null;
        setTemplate(t => ({ ...t, mode: 'html', html: snapshot.html, css: snapshot.css }));
        return;
      }
      // The canvas was edited. Compiling it replaces the real markup with
      // Designer's flat version, which for a product-loop template throws the
      // loop away — so this is the user's call, not ours.
      if (!window.confirm(
        'You have moved things around in Designer.\n\n'
        + 'Keeping those changes means rewriting the HTML as Designer\'s flat, '
        + 'positioned version of it'
        + (hasBlockHelpers(snapshot.html) ? ', which discards the per-product loop this template is built on' : '')
        + '.\n\nOK — keep the Designer changes and rewrite the HTML.\n'
        + 'Cancel — discard them and restore the original HTML.'
      )) {
        preDesignerRef.current = null;
        setTemplate(t => ({ ...t, mode: 'html', html: snapshot.html, css: snapshot.css }));
        return;
      }
    }
    preDesignerRef.current = null;
    const c = compileDesignToHtml(page);
    setTemplate(t => ({ ...t, mode: 'html', html: c.html, css: c.css }));
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
        <input className="pdf-name-input" value={template.name} onChange={e => setTemplate({ ...template, name: e.target.value })} placeholder="Template name" />

        {/* Clear Designer / HTML mode toggle */}
        <div className="pdf-mode-toggle" role="tablist">
          <button type="button" className={!isHtml ? 'active' : ''} onClick={() => switchMode('designer')} title="Drag-and-drop designer">
            <PanelLeftOpen size={15} />Designer
          </button>
          <button type="button" className={isHtml ? 'active' : ''} onClick={() => switchMode('html')} title="Write raw HTML & CSS">
            <Code size={15} />HTML
          </button>
        </div>

        {!isHtml && (
          <button className={`icon-btn pdf-codeview-btn ${showCodeView ? 'active' : ''}`} title={showCodeView ? 'Hide compiled code' : 'View compiled HTML/CSS'} onClick={() => setShowCodeView(v => !v)}>
            <Code size={17} />
          </button>
        )}

        <label className="pdf-status-field" title="Template status">
          <span>Status</span>
          <select value={template.status} onChange={e => setTemplate({ ...template, status: e.target.value })}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <button className="btn btn-primary pdf-save-btn" onClick={save} disabled={saving}><Save size={17} />{saving ? 'Saving...' : 'Save'}</button>
      </header>

      {/* ── Left Sidebar ── */}
      <aside className={`pdf-tools${leftOpen ? ' open' : ''}`}>
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
          <button ref={sidebarVarBtnRef} className="pdf-variable-trigger" onClick={toggleSidebarVars}>
            <span><Search size={16} />Variables</span>
            <ChevronDown size={16} className={sidebarVarOpen ? 'rotated' : ''} />
          </button>
          {sidebarVarOpen && varMenuPos && (
            <>
              <div className="pdf-var-popover-backdrop" onClick={() => setSidebarVarOpen(false)} />
              <div className="pdf-variable-menu floating" style={{ position: 'fixed', top: varMenuPos.top, left: varMenuPos.left, width: varMenuPos.width, maxHeight: varMenuPos.maxHeight }}>
                <div className="pdf-variable-search">
                  <Search size={15} />
                  <input autoFocus placeholder="Search variables" value={sidebarVarSearch} onChange={e => setSidebarVarSearch(e.target.value)} />
                </div>
                <div className="pdf-variable-results">
                  {filteredSidebarVars.map(v => (
                    <button key={v.key} draggable onDragStart={e => e.dataTransfer.setData('application/pdf-variable', v.reference)} onClick={() => { insertVariable(v); setSidebarVarOpen(false); }}>
                      <code>{v.reference}</code>
                      <small>{v.label || v.category}</small>
                    </button>
                  ))}
                  {!filteredSidebarVars.length && <p>No variables found</p>}
                </div>
              </div>
            </>
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
              <Editor
                value={template.html || ''}
                onValueChange={code => setTemplateField('html', code)}
                highlight={code => highlightHtml(code)}
                padding={12}
                className="pdf-code-editor"
                placeholder={'<div class="doc">\n  <h1>{{document.title}}</h1>\n  <p>{{customer.fullName}}</p>\n</div>'}
                textareaClassName="pdf-code-textarea"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, lineHeight: 1.6, minHeight: 200 }}
              />
            </label>
            <label>CSS
              <Editor
                value={template.css || ''}
                onValueChange={code => setTemplateField('css', code)}
                highlight={code => highlightCss(code)}
                padding={12}
                className="pdf-code-editor"
                placeholder={'.doc { font-family: Arial, sans-serif; padding: 32px; }\nh1 { color: #111827; }'}
                textareaClassName="pdf-code-textarea"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, lineHeight: 1.6, minHeight: 200 }}
              />
            </label>
          </div>
          <div className="pdf-html-preview">
            <div className="pdf-page-meta">Live preview (sample data)</div>
            <iframe title="Template preview" sandbox="" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${template.css || ''}</style></head><body>${resolve(template.html || '')}</body></html>`} />
          </div>
        </main>
      ) : (
        <main className="pdf-canvas-area" onMouseDown={() => { setLeftOpen(false); setRightOpen(false); }}>
          <div className="pdf-page-meta">Page {pageIndex + 1} of {pages.length} - {page.config.format}</div>
          <div className="pdf-canvas" style={canvasStyle} onDragOver={e => e.preventDefault()} onDrop={dropVariable} onMouseDown={e => { if (e.target === e.currentTarget) { setSelectedId(null); setLeftOpen(false); setRightOpen(false); } }}>
            {page.elements.map(el => {
              const s = cssObject(el.css);
              return (
                <div key={el.id} className={`pdf-element ${selectedId === el.id ? 'selected' : ''} ${el.type}`} onMouseDown={e => beginMove(e, el)} style={{ left: s.left, top: s.top, width: s.width, height: s.height, fontSize: s['font-size'], fontWeight: s['font-weight'], fontFamily: s['font-family'], fontStyle: s['font-style'], letterSpacing: s['letter-spacing'], color: s.color, textAlign: s['text-align'], backgroundColor: s['background-color'], borderRadius: s['border-radius'], opacity: s.opacity, lineHeight: s['line-height'], padding: s.padding, border: s.border }}>
                  {el.type === 'text' ? resolve(el.text) : el.type === 'image' ? (el.imageUrl ? <img src={resolve(el.imageUrl)} alt="Template element" /> : <span className="pdf-image-placeholder"><Image size={28} />Choose image</span>) : el.type === 'link' ? <a href={resolve(el.url)} onClick={e => e.preventDefault()}>{resolve(el.text) || resolve(el.url)}</a> : el.type === 'qr' ? <QrPreview value={el.qrValue} /> : null}
                </div>
              );
            })}
          </div>
          {showCodeView && compiled && (
            <div className="pdf-designer-code-panel">
              <div className="pdf-designer-code-tabs">
                <span className="pdf-code-tab active">Compiled HTML</span>
              </div>
              <Editor
                value={compiled.html}
                onValueChange={() => {}}
                highlight={code => highlightHtml(code)}
                padding={12}
                className="pdf-code-editor read-only"
                textareaClassName="pdf-code-textarea"
                readOnly
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, lineHeight: 1.6, minHeight: 150 }}
              />
              <div className="pdf-designer-code-tabs">
                <span className="pdf-code-tab active">Compiled CSS</span>
              </div>
              <Editor
                value={compiled.css}
                onValueChange={() => {}}
                highlight={code => highlightCss(code)}
                padding={12}
                className="pdf-code-editor read-only"
                textareaClassName="pdf-code-textarea"
                readOnly
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, lineHeight: 1.6, minHeight: 100 }}
              />
            </div>
          )}
        </main>
      )}

      {/* ── Right Properties Panel ── */}
      {!isHtml && (
        <aside className={`pdf-properties${rightOpen ? ' open' : ''}`}>
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
              <label>Font style<select value={style['font-style'] || 'normal'} onChange={e => setStyle('font-style', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="italic">Italic</option>
              </select></label>
              <label>Font family<select value={style['font-family'] || ''} onChange={e => setStyle('font-family', e.target.value)}>
                <option value="">Default (Sans)</option>
                <option value="Helvetica, Arial, sans-serif">Sans (Helvetica)</option>
                <option value="Georgia, 'Times New Roman', serif">Serif (Georgia/Times)</option>
                <option value="'Courier New', monospace">Monospace (Courier)</option>
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

      {/* ── Mobile Toggle Buttons ── */}
      {!isHtml && (
        <>
          <button className="pdf-mobile-toggle" style={{ left: 16 }} onClick={() => { setLeftOpen(o => !o); setRightOpen(false); }} title="Toggle tools">
            <PanelLeftOpen size={20} />
          </button>
          <button className="pdf-mobile-toggle" style={{ left: 68 }} onClick={() => { setRightOpen(o => !o); setLeftOpen(false); }} title="Toggle properties">
            <PanelRightOpen size={20} />
          </button>
        </>
      )}
    </div>
  );
}
