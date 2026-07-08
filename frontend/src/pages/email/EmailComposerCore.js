import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { emailAPI } from '../../services/api';
import EmailComposerToolbar from './EmailComposerToolbar';
import EmailCssPanel from './EmailCssPanel';
import EmailLinkPanel from './EmailLinkPanel';
import EmailCodeEditor from './EmailCodeEditor';
import EmailPreview from './EmailPreview';
import EmailColorPicker from './EmailColorPicker';
import DraggablePopup, { DraggableHeader } from '../../components/EmailDraggablePopup';

const BLOCK_TAGS = ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'SECTION', 'ARTICLE', 'BLOCKQUOTE'];
const FONT_FAMILIES = [
  { name: 'Default', value: 'system-ui, sans-serif' },
  { name: 'Serif', value: "'Times New Roman', serif" },
  { name: 'Mono', value: "'Courier New', monospace" },
];

const INLINE_STYLE_MAP = {
  bold: { fontWeight: 'bold', property: 'fontWeight', value: 'bold' },
  italic: { fontStyle: 'italic', property: 'fontStyle', value: 'italic' },
  underline: { textDecoration: 'underline', property: 'textDecoration', value: 'underline' },
  strikethrough: { textDecoration: 'line-through', property: 'textDecoration', value: 'line-through' },
  justifyLeft: { textAlign: 'left', property: 'textAlign', value: 'left' },
  justifyCenter: { textAlign: 'center', property: 'textAlign', value: 'center' },
  justifyRight: { textAlign: 'right', property: 'textAlign', value: 'right' },
};

function hasBlockDescendant(node) {
  if (!node) return false;
  if (node.nodeType !== 1) return false;
  if (BLOCK_TAGS.includes(node.tagName)) return true;
  let child = node.firstChild;
  while (child) {
    if (hasBlockDescendant(child)) return true;
    child = child.nextSibling;
  }
  return false;
}

function wrapRangeContents(range, wrapper, styleOnly) {
  const doc = range.startContainer.ownerDocument;
  const fragment = range.extractContents();

  if (hasBlockDescendant(fragment)) {
    const children = Array.from(fragment.childNodes);
    const container = doc.createDocumentFragment();
    for (const child of children) {
      if (child.nodeType === 1 && BLOCK_TAGS.includes(child.tagName)) {
        if (styleOnly) {
          Object.assign(child.style, wrapper.style);
          container.appendChild(child);
        } else {
          const w = wrapper.cloneNode(true);
          w.innerHTML = '';
          w.appendChild(child.cloneNode(true));
          container.appendChild(w);
        }
      } else {
        const w = wrapper.cloneNode(true);
        w.appendChild(child);
        container.appendChild(w);
      }
    }
    range.insertNode(container);
    return container;
  } else {
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    return wrapper;
  }
}

function selectNodeContents(doc, sel, node) {
  const nr = doc.createRange();
  nr.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(nr);
}

function hasStyle(node, property, value) {
  if (!node || node.nodeType !== 1) return false;
  if (node.style && node.style[property] === value) return true;
  if (node.parentElement && hasStyle(node.parentElement, property, value)) return true;
  return false;
}

function unwrapNode(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function findParentStyledSpan(range) {
  const sc = range.startContainer;
  return sc.nodeType === 3
    ? sc.parentElement?.closest?.('span')
    : sc.closest?.('span');
}

function applyStyle(command, value) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const doc = range.startContainer.ownerDocument;

  // Lists toggle
  if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
    const sc = range.startContainer;
    const existingList = sc.nodeType === 3
      ? sc.parentElement?.closest?.('ul,ol')
      : sc.closest?.('ul,ol');
    if (existingList) {
      const parent = existingList.parentNode;
      while (existingList.firstChild) {
        const li = existingList.firstChild;
        while (li.firstChild) parent.insertBefore(li.firstChild, existingList);
        parent.removeChild(li);
      }
      parent.removeChild(existingList);
      syncHtmlRef?.();
      return;
    }
    const listTag = command === 'insertOrderedList' ? 'ol' : 'ul';
    const fragment = range.extractContents();
    const list = doc.createElement(listTag);
    const children = Array.from(fragment.childNodes);
    if (children.length === 0) {
      const li = doc.createElement('li');
      li.appendChild(fragment);
      list.appendChild(li);
    } else {
      let currentLi = doc.createElement('li');
      for (const child of children) {
        if (child.nodeType === 1 && BLOCK_TAGS.includes(child.tagName)) {
          if (currentLi.hasChildNodes()) list.appendChild(currentLi);
          currentLi = doc.createElement('li');
          currentLi.appendChild(child.cloneNode(true));
          list.appendChild(currentLi);
          currentLi = doc.createElement('li');
        } else {
          currentLi.appendChild(child.cloneNode(true));
        }
      }
      if (currentLi.hasChildNodes()) list.appendChild(currentLi);
    }
    range.deleteContents();
    range.insertNode(list);
    const firstLi = list.querySelector('li');
    if (firstLi) selectNodeContents(doc, sel, firstLi);
    return;
  }

  // Link
  if (command === 'createLink') {
    const a = doc.createElement('a');
    a.href = value || '#';
    a.target = '_blank';
    const inserted = wrapRangeContents(range, a, false);
    if (inserted) selectNodeContents(doc, sel, inserted);
    return;
  }

  // Alignment → apply to nearest block parent directly
  if (command === 'justifyLeft' || command === 'justifyCenter' || command === 'justifyRight') {
    const alignValue = command === 'justifyLeft' ? 'left' : command === 'justifyCenter' ? 'center' : 'right';
    let n = range.startContainer;
    while (n && n.nodeType === 3) n = n.parentNode;
    while (n && n.nodeType === 1) {
      if (BLOCK_TAGS.includes(n.tagName)) {
        n.style.textAlign = alignValue;
        break;
      }
      n = n.parentElement;
    }
    return;
  }

  // Inline style toggle/update (for non-alignment styles)
  const styleDef = INLINE_STYLE_MAP[command];
  if (styleDef) {
    const parentSpan = findParentStyledSpan(range);
    if (parentSpan) {
      const existingVal = parentSpan.style[styleDef.property];
      if (existingVal === styleDef.value) {
        // Same style → toggle OFF: unwrap span entirely
        unwrapNode(parentSpan);
        syncHtmlRef?.();
        return;
      } else if (existingVal) {
        // Different value for same property → update in-place
        parentSpan.style[styleDef.property] = styleDef.value;
        syncHtmlRef?.();
        return;
      }
    }
  }

  const span = doc.createElement('span');
  switch (command) {
    case 'bold': span.style.fontWeight = 'bold'; break;
    case 'italic': span.style.fontStyle = 'italic'; break;
    case 'underline': span.style.textDecoration = 'underline'; break;
    case 'strikethrough': span.style.textDecoration = 'line-through'; break;
    case 'fontSize': span.style.fontSize = value; break;
    case 'fontFamily': span.style.fontFamily = value; break;
    case 'foreColor': span.style.color = value; break;
    case 'backColor': span.style.backgroundColor = value; break;
    default: return;
  }

  const styleOnly = !['fontSize', 'fontFamily', 'foreColor', 'backColor'].includes(command);
  const inserted = wrapRangeContents(range, span, styleOnly);
  if (inserted && inserted.nodeType === 1 && inserted.tagName === 'SPAN') {
    selectNodeContents(doc, sel, inserted);
  } else if (inserted) {
    const firstSpan = inserted.querySelector('span');
    if (firstSpan) selectNodeContents(doc, sel, firstSpan);
  }
}

let syncHtmlRef = null;

function toggleHeading(level) {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const doc = range.startContainer.ownerDocument;
  const tag = level === 0 ? 'p' : `h${level}`;
  const block = doc.createElement(tag);
  const inserted = wrapRangeContents(range, block, false);
  if (inserted) {
    const firstBlock = inserted.nodeType === 1 && BLOCK_TAGS.includes(inserted.tagName) ? inserted : inserted.querySelector?.(BLOCK_TAGS.join(','));
    if (firstBlock) selectNodeContents(doc, sel, firstBlock);
    else selectNodeContents(doc, sel, inserted);
  }
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

export default function EmailComposerCore({
  editorRef,
  html,
  onHtmlChange,
  css: appCss,
  onCssChange,
  toolbarButtons,
  children,
}) {
  const isHistoryAction = useRef(false);

  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isCssPanelOpen, setIsCssPanelOpen] = useState(false);
  const [isCodeEditorOpen, setIsCodeEditorOpen] = useState(false);
  const [isLinkPanelOpen, setIsLinkPanelOpen] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorType, setColorType] = useState('foreColor');
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [imageForm, setImageForm] = useState({ src: '', alt: '', width: '100%' });
  const [imageUploading, setImageUploading] = useState(false);
  const savedSelection = useRef(null);
  const editorSelectionRef = useRef(null);
  const linkEditingRef = useRef(null);

  const [linkData, setLinkData] = useState({
    url: 'https://',
    text: '',
    isButton: false,
    bg: '#3b82f6',
    color: '#ffffff',
    radius: '8',
  });

  const [cssState, setCssState] = useState({
    display: 'block', flexDir: 'column', flexWrap: 'nowrap',
    align: 'stretch', justify: 'flex-start', gap: '',
    pt: '', pr: '', pb: '', pl: '',
    mt: '', mr: '', mb: '', ml: '',
    rtl: '', rtr: '', rbr: '', rbl: '',
    btw: '', brw: '', bbw: '', blw: '', bs: 'solid',
    btc: '', brc: '', bbc: '', blc: '',
    bg: '', color: '',
    fw: '', fs: '', ff: '',
    width: '', height: '',
    zIndex: '1', pos: 'static',
    t: '', r: '', b: '', l: '', custom: '',
  });

  const getHtml = useCallback(() => editorRef.current?.innerHTML || '', [editorRef]);

  const saveHistory = useCallback((currentHtml) => {
    if (isHistoryAction.current) return;
    setUndoStack(prev => [...prev.slice(-49), currentHtml]);
    setRedoStack([]);
  }, []);

  const syncHtml = useCallback((skipHistory = false) => {
    const current = getHtml();
    onHtmlChange?.(current);
    if (!skipHistory) saveHistory(current);
  }, [getHtml, onHtmlChange, saveHistory]);

  syncHtmlRef = syncHtml;

  const saveEditorSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      editorSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, [editorRef]);

  const restoreEditorSelection = useCallback(() => {
    if (editorSelectionRef.current && editorRef.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(editorSelectionRef.current);
    }
  }, [editorRef]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!el.innerHTML && html) el.innerHTML = html;
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const handler = () => { syncHtml(); saveEditorSelection(); };
    el.addEventListener('input', handler);
    el.addEventListener('mouseup', saveEditorSelection);
    el.addEventListener('keyup', saveEditorSelection);
    return () => {
      el.removeEventListener('input', handler);
      el.removeEventListener('mouseup', saveEditorSelection);
      el.removeEventListener('keyup', saveEditorSelection);
    };
  }, [editorRef, syncHtml, saveEditorSelection]);

  const handleUndo = useCallback(() => {
    if (undoStack.length <= 1) return;
    isHistoryAction.current = true;
    const current = undoStack[undoStack.length - 1];
    const prev = undoStack[undoStack.length - 2];
    setRedoStack(r => [current, ...r]);
    setUndoStack(u => u.slice(0, -1));
    if (editorRef.current) {
      editorRef.current.innerHTML = prev;
      onHtmlChange?.(prev);
    }
    setTimeout(() => { isHistoryAction.current = false; }, 50);
  }, [undoStack, editorRef, onHtmlChange]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    isHistoryAction.current = true;
    const next = redoStack[0];
    setRedoStack(r => r.slice(1));
    setUndoStack(u => [...u, next]);
    if (editorRef.current) {
      editorRef.current.innerHTML = next;
      onHtmlChange?.(next);
    }
    setTimeout(() => { isHistoryAction.current = false; }, 50);
  }, [redoStack, editorRef, onHtmlChange]);

  const handleToolbarAction = useCallback((cmd, value) => {
    restoreEditorSelection();
    if (['heading1', 'heading2', 'heading3'].includes(cmd)) {
      const level = parseInt(cmd.replace('heading', ''));
      const tag = `H${level}`;
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.isCollapsed) {
        const r = sel.getRangeAt(0);
        const sc = r.startContainer;
        const parentBlock = sc.nodeType === 3
          ? sc.parentElement?.closest?.('h1,h2,h3,h4,h5,h6,p,div')
          : sc.closest?.('h1,h2,h3,h4,h5,h6,p,div');
        if (parentBlock && parentBlock.tagName === tag) {
          toggleHeading(0);
        } else {
          toggleHeading(level);
        }
      }
    } else if (cmd === 'paragraph') {
      toggleHeading(0);
    } else {
      applyStyle(cmd, value);
    }
    syncHtml();
    saveEditorSelection();
    editorRef.current?.focus();
  }, [syncHtml, editorRef, restoreEditorSelection, saveEditorSelection]);

  const openLinkPanel = useCallback((existingLink = null) => {
    const sel = window.getSelection();
    if (existingLink) {
      saveEditorSelection();
      const href = existingLink.getAttribute('href') || '';
      const style = existingLink.getAttribute('style') || '';
      const isBtn = style.includes('display:inline-block') || style.includes('padding:10px');
      const styleProps = style.split(';').map(s => s.trim());
      const colorProp = styleProps.find(p => /^color\s*:/i.test(p));
      const colorMatch = colorProp ? colorProp.match(/color\s*:\s*(.+)/i) : null;
      const bgMatch = style.match(/background-color:\s*([^;]+)/);
      const radiusMatch = style.match(/border-radius:\s*([^;]+)/);
      setLinkData({
        url: href,
        text: existingLink.textContent || '',
        isButton: isBtn,
        bg: bgMatch ? bgMatch[1] : '#3b82f6',
        color: colorMatch ? colorMatch[1] : '#ffffff',
        radius: radiusMatch ? parseFloat(radiusMatch[1]) || 8 : 8,
      });
      savedSelection.current = null;
      linkEditingRef.current = existingLink;
      setIsLinkPanelOpen(true);
      return;
    }
    // Ensure editor has focus/selection before saving
    if (!sel || !sel.rangeCount || !editorRef.current?.contains(sel.anchorNode)) {
      restoreEditorSelection();
    }
    const sel2 = window.getSelection();
    if (sel2 && sel2.rangeCount > 0 && editorRef.current?.contains(sel2.anchorNode)) {
      savedSelection.current = sel2.getRangeAt(0).cloneRange();
      setLinkData(p => ({ ...p, text: sel2.toString() }));
    } else {
      savedSelection.current = null;
    }
    linkEditingRef.current = null;
    setIsLinkPanelOpen(true);
  }, [saveEditorSelection, restoreEditorSelection, editorRef]);

  const insertLink = useCallback(() => {
    if (!linkData.url) return;
    const sel = window.getSelection();
    const doc = editorRef.current?.ownerDocument || document;

    // Editing existing link (no saved selection = came from double-click)
    const existingLink = linkEditingRef.current;
    if (!savedSelection.current && existingLink) {
      const bg = linkData.isButton ? linkData.bg : 'transparent';
      const clr = linkData.color;
      const rad = linkData.isButton ? `${linkData.radius}px` : '0';
      const pad = linkData.isButton ? '10px 20px' : '0';
      const td = linkData.isButton ? 'none' : 'underline';
      const fw = linkData.isButton ? '700' : '400';
      const disp = linkData.isButton ? 'inline-block' : 'inline';
      existingLink.href = linkData.url;
      const hasVariables = existingLink.querySelector('.email-var-placeholder');
      if (linkData.text && !hasVariables) existingLink.textContent = linkData.text;
      existingLink.setAttribute('style', `display:${disp};padding:${pad};background-color:${bg};color:${clr};text-decoration:${td};border-radius:${rad};font-weight:${fw};`);
      setLinkData({ url: 'https://', text: '', isButton: false, bg: '#3b82f6', color: '#ffffff', radius: '8' });
      linkEditingRef.current = null;
      setIsLinkPanelOpen(false);
      syncHtml();
      saveEditorSelection();
      editorRef.current?.focus();
      return;
    }

    if (savedSelection.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    } else if (editorSelectionRef.current) {
      sel.removeAllRanges();
      sel.addRange(editorSelectionRef.current);
    }
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    const link = doc.createElement('a');
    link.href = linkData.url;

    const bg = linkData.isButton ? linkData.bg : 'transparent';
    const clr = linkData.color;
    const rad = linkData.isButton ? `${linkData.radius}px` : '0';
    const pad = linkData.isButton ? '10px 20px' : '0';
    const td = linkData.isButton ? 'none' : 'underline';
    const fw = linkData.isButton ? '700' : '400';
    const disp = linkData.isButton ? 'inline-block' : 'inline';

    link.setAttribute('style', `display:${disp};padding:${pad};background-color:${bg};color:${clr};text-decoration:${td};border-radius:${rad};font-weight:${fw};`);

    if (range.collapsed) {
      link.textContent = linkData.text || linkData.url;
      range.insertNode(link);
    } else {
      wrapRangeContents(range, link, false);
    }

    setLinkData({ url: 'https://', text: '', isButton: false, bg: '#3b82f6', color: '#ffffff', radius: '8' });
    setIsLinkPanelOpen(false);
    syncHtml();
    saveEditorSelection();
    editorRef.current?.focus();
  }, [linkData, syncHtml, editorRef, saveEditorSelection]);

  const removeLink = useCallback(() => {
    const link = linkEditingRef.current;
    if (link && link.parentNode) {
      while (link.firstChild) link.parentNode.insertBefore(link.firstChild, link);
      link.parentNode.removeChild(link);
    }
    linkEditingRef.current = null;
    setLinkData({ url: 'https://', text: '', isButton: false, bg: '#3b82f6', color: '#ffffff', radius: '8' });
    setIsLinkPanelOpen(false);
    syncHtml();
    saveEditorSelection();
    editorRef.current?.focus();
  }, [syncHtml, editorRef, saveEditorSelection]);

  const handleColorChange = useCallback((type, color) => {
    if (type === 'pageBackground') {
      const nextCss = (appCss || '').replace(/body\s*\{[^}]*background-color\s*:\s*[^;}]+;?[^}]*\}/gi, '').trim();
      onCssChange?.(`${nextCss}\nbody { background-color: ${color}; }`.trim());
      if (editorRef.current) editorRef.current.style.backgroundColor = color;
      return;
    }
    restoreEditorSelection();
    applyStyle(type, color);
    syncHtml();
    saveEditorSelection();
    editorRef.current?.focus();
  }, [appCss, onCssChange, editorRef, syncHtml, restoreEditorSelection, saveEditorSelection]);

  const handleCssApply = useCallback((mode = 'block') => {
    const isInlineWrap = mode === 'inline';
    const s = [];
    const unit = (v) => {
      if (!v) return '';
      if (/^\d+$/.test(v)) return v + 'px';
      return v;
    };
    const pushIf = (k, v, isUnit = false) => {
      if (v) s.push(`${k}:${isUnit ? unit(v) : v}`);
    };

    const display = isInlineWrap
      ? (cssState.display === 'inline' || cssState.display === 'inline-block' ? cssState.display : '')
      : cssState.display;

    pushIf('display', display);
    if (display === 'flex' || display === 'grid') {
      pushIf('flex-direction', cssState.flexDir);
      pushIf('flex-wrap', cssState.flexWrap);
      pushIf('align-items', cssState.align);
      pushIf('justify-content', cssState.justify);
      pushIf('gap', cssState.gap, true);
    }
    if (!isInlineWrap || display === 'inline-block') {
      pushIf('width', cssState.width, true);
      pushIf('height', cssState.height, true);
    }
    pushIf('padding-top', cssState.pt, true);
    pushIf('padding-right', cssState.pr, true);
    pushIf('padding-bottom', cssState.pb, true);
    pushIf('padding-left', cssState.pl, true);
    pushIf('margin-top', cssState.mt, true);
    pushIf('margin-right', cssState.mr, true);
    pushIf('margin-bottom', cssState.mb, true);
    pushIf('margin-left', cssState.ml, true);
    pushIf('border-top-left-radius', cssState.rtl, true);
    pushIf('border-top-right-radius', cssState.rtr, true);
    pushIf('border-bottom-right-radius', cssState.rbr, true);
    pushIf('border-bottom-left-radius', cssState.rbl, true);

    const hasBorderWidth = cssState.btw || cssState.brw || cssState.bbw || cssState.blw;
    const hasBorderColor = cssState.btc || cssState.brc || cssState.bbc || cssState.blc;
    const hasBorder = hasBorderWidth || hasBorderColor || cssState.bs;
    const bs = cssState.bs || (hasBorder ? 'solid' : '');
    if (hasBorder && bs) {
      const defaultBorderWidth = hasBorderWidth ? '0' : '1';
      const defaultBorderColor = hasBorderColor ? '#000' : '#d1d5db';
      pushIf('border-top-width', cssState.btw || defaultBorderWidth, true);
      pushIf('border-right-width', cssState.brw || defaultBorderWidth, true);
      pushIf('border-bottom-width', cssState.bbw || defaultBorderWidth, true);
      pushIf('border-left-width', cssState.blw || defaultBorderWidth, true);
      pushIf('border-top-color', cssState.btc || defaultBorderColor);
      pushIf('border-right-color', cssState.brc || defaultBorderColor);
      pushIf('border-bottom-color', cssState.bbc || defaultBorderColor);
      pushIf('border-left-color', cssState.blc || defaultBorderColor);
      pushIf('border-style', bs);
    }
    pushIf('background-color', cssState.bg);
    pushIf('color', cssState.color);
    pushIf('font-family', cssState.ff);
    pushIf('font-size', cssState.fs, true);
    pushIf('font-weight', cssState.fw);

    const styleStr = s.join(';');
    restoreEditorSelection();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;

    if (isInlineWrap) {
      const wrapper = document.createElement('span');
      wrapper.setAttribute('style', styleStr);
      const currentRange = selection.getRangeAt(0);
      wrapRangeContents(currentRange, wrapper, false);
    } else {
      let n = selection.anchorNode;
      while (n && n !== editorRef.current) {
        if (n.nodeType === 1 && BLOCK_TAGS.includes(n.tagName)) {
          const existing = n.getAttribute('style') || '';
          const merged = existing ? existing.replace(/;\s*$/, '') + ';' + styleStr : styleStr;
          n.setAttribute('style', merged);
          break;
        }
        n = n.parentNode;
      }
    }
    syncHtml();
    saveEditorSelection();
  }, [cssState, editorRef, syncHtml, restoreEditorSelection, saveEditorSelection]);

  const handleImageUpload = useCallback(async (file) => {
    if (!file) return;
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('files', file);
      formData.append('category', 'inline-image');
      const r = await emailAPI.uploadAssets(formData);
      const asset = r.data?.data?.assets?.[0];
      if (asset?.publicUrl) {
        setImageForm(prev => ({ ...prev, src: asset.publicUrl }));
      } else {
        toast.error('Image upload did not return a URL');
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Image upload failed');
    } finally {
      setImageUploading(false);
    }
  }, []);

  const insertImage = useCallback(() => {
    if (!imageForm.src.trim()) return;
    insertHtmlAtCursor(
      `<img src="${imageForm.src.trim()}" alt="${imageForm.alt || ''}" style="max-width:100%;width:${imageForm.width || '100%'};height:auto;display:block;" />`,
      editorRef.current
    );
    setImageForm({ src: '', alt: '', width: '100%' });
    setShowImagePanel(false);
    syncHtml();
    saveEditorSelection();
  }, [imageForm, editorRef, syncHtml, saveEditorSelection]);

  const codeHtmlRef = useRef(html);

  useEffect(() => { codeHtmlRef.current = html; }, [html]);

  const handleCodeCompile = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = codeHtmlRef.current;
      syncHtml();
      saveEditorSelection();
    }
    setIsCodeEditorOpen(false);
  }, [editorRef, syncHtml, saveEditorSelection]);

  return (
    <div className="email-composer-core">
      <EmailComposerToolbar
        onAction={handleToolbarAction}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenCssPanel={() => setIsCssPanelOpen(p => !p)}
        onOpenCodeEditor={() => setIsCodeEditorOpen(p => !p)}
        onOpenLinkPanel={openLinkPanel}
        onOpenImagePanel={() => setShowImagePanel(true)}
        onOpenVarPicker={toolbarButtons?.onOpenVarPicker}
        onOpenCompPicker={toolbarButtons?.onOpenCompPicker}
        canUndo={undoStack.length > 1}
        canRedo={redoStack.length > 0}
        isCssPanelOpen={isCssPanelOpen}
        isCodeEditorOpen={isCodeEditorOpen}
        setShowColorPicker={setShowColorPicker}
        setColorType={setColorType}
      />

      <EmailCssPanel
        isOpen={isCssPanelOpen}
        css={cssState}
        setCss={setCssState}
        onApply={handleCssApply}
        onWrap={() => handleCssApply('inline')}
      />

      <div
        className="email-composer-editor"
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onDrop={toolbarButtons?.onEditorDrop}
        onDragOver={e => e.preventDefault()}
        onKeyDown={e => {
          if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertHTML', false, '&emsp;'); }
        }}
        onDoubleClick={e => {
          const link = e.target.closest?.('a');
          if (link) { openLinkPanel(link); setIsLinkPanelOpen(true); }
        }}
        onMouseUp={e => {
          const link = e.target.closest?.('a');
          if (link) { e.target.style.cursor = 'pointer'; }
        }}
      />

      {children}

      <DraggablePopup isOpen={showColorPicker} onClose={() => setShowColorPicker(false)} style={{ maxWidth: 300 }}>
        <DraggableHeader onClose={() => setShowColorPicker(false)}>
          <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Pick Color</h4>
        </DraggableHeader>
        <div style={{ padding: '8px 12px 12px' }}>
          <EmailColorPicker
            onSelect={(c) => { handleColorChange(colorType, c); setShowColorPicker(false); }}
            onClose={() => setShowColorPicker(false)}
          />
        </div>
      </DraggablePopup>

      <DraggablePopup isOpen={isLinkPanelOpen} onClose={() => { setIsLinkPanelOpen(false); linkEditingRef.current = null; savedSelection.current = null; }} style={{ maxWidth: 420 }}>
        <EmailLinkPanel
          linkData={linkData}
          setLinkData={setLinkData}
          onInsert={insertLink}
          onRemove={!savedSelection.current && isLinkPanelOpen ? removeLink : null}
          onClose={() => setIsLinkPanelOpen(false)}
        />
      </DraggablePopup>

      <DraggablePopup isOpen={showImagePanel} onClose={() => setShowImagePanel(false)} style={{ maxWidth: 420 }}>
        <DraggableHeader onClose={() => setShowImagePanel(false)}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Insert Image</h3>
        </DraggableHeader>
        <form onSubmit={e => { e.preventDefault(); insertImage(); }}>
          <div className="email-link-panel-body">
            <div className="form-group">
              <label>Image URL</label>
              <input className="form-control" value={imageForm.src} onChange={e => setImageForm(p => ({ ...p, src: e.target.value }))} placeholder="https://..." autoFocus />
            </div>
            <div className="form-group">
              <label>Upload Image</label>
              <input className="form-control" type="file" accept="image/*" disabled={imageUploading} onChange={e => handleImageUpload(e.target.files?.[0])} />
              {imageUploading && <small style={{ color: '#666' }}>Uploading...</small>}
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Alt Text</label>
                <input className="form-control" value={imageForm.alt} onChange={e => setImageForm(p => ({ ...p, alt: e.target.value }))} />
              </div>
              <div className="form-group" style={{ width: 100 }}>
                <label>Width</label>
                <input className="form-control" value={imageForm.width} onChange={e => setImageForm(p => ({ ...p, width: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="email-link-panel-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowImagePanel(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!imageForm.src.trim() || imageUploading}>Insert</button>
          </div>
        </form>
      </DraggablePopup>

      <DraggablePopup isOpen={isCodeEditorOpen} onClose={() => setIsCodeEditorOpen(false)} style={{ maxWidth: 700, height: '70vh', display: 'flex', flexDirection: 'column' }}>
        <EmailCodeEditor
          html={codeHtmlRef.current}
          onChange={(v) => { codeHtmlRef.current = v; }}
          onCompile={handleCodeCompile}
          onClose={() => setIsCodeEditorOpen(false)}
        />
      </DraggablePopup>

      <DraggablePopup isOpen={isPreviewVisible} onClose={() => setIsPreviewVisible(false)} style={{ maxWidth: 700, height: '80vh', display: 'flex', flexDirection: 'column' }}>
        <EmailPreview
          html={getHtml()}
          css={appCss}
          onClose={() => setIsPreviewVisible(false)}
        />
      </DraggablePopup>

      <div className="email-composer-actions">
        <button className="btn btn-sm btn-secondary" onClick={() => setIsPreviewVisible(true)}>
          <Eye size={14} style={{ marginRight: 4 }} />Preview
        </button>
      </div>
    </div>
  );
}
