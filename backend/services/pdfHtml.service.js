/**
 * Converts a template's designData (the same page/element model the editor
 * canvas uses) into a self-contained HTML document. Because the markup mirrors
 * the editor's absolutely-positioned elements 1:1, printing this HTML with a
 * headless browser yields a PDF that matches the on-screen design pixel-for-pixel.
 */
const QRCode = require('qrcode');
const { resolveTokens } = require('./pdfFormat.cjs');

const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cssMap = (css = []) => Object.fromEntries((Array.isArray(css) ? css : []).filter(Boolean).map((x) => [x.property, x.value]));

// Build the inline style for one element, mirroring the editor canvas styles.
function elementStyle(s) {
  const decls = {
    position: 'absolute',
    left: s.left || '0px',
    top: s.top || '0px',
    width: s.width || 'auto',
    height: s.height || 'auto',
    'font-size': s['font-size'] || '12px',
    'font-weight': s['font-weight'] || '400',
    'font-family': s['font-family'] || 'Helvetica, Arial, sans-serif',
    'font-style': s['font-style'] || 'normal',
    'letter-spacing': s['letter-spacing'] || 'normal',
    color: s.color || '#111827',
    'text-align': s['text-align'] || 'left',
    'background-color': s['background-color'] || 'transparent',
    'border-radius': s['border-radius'] || '0',
    opacity: s.opacity || '1',
    'line-height': s['line-height'] || 'normal',
    padding: s.padding || '0',
    border: s.border || 'none',
    'box-sizing': 'border-box',
    overflow: 'hidden',
    'white-space': 'pre-wrap',
    'word-break': 'break-word',
  };
  return Object.entries(decls).map(([k, v]) => `${k}:${v}`).join(';');
}

async function elementHtml(el, data) {
  const s = cssMap(el.css);
  const style = elementStyle(s);
  if (el.type === 'image') {
    const src = resolveTokens(el.imageUrl || el.src || '', data);
    const inner = src ? `<img src="${escapeHtml(src)}" style="width:100%;height:100%;object-fit:contain;display:block;" />` : '';
    return `<div style="${style}">${inner}</div>`;
  }
  if (el.type === 'qr') {
    const value = resolveTokens(el.qrValue || '', data) || 'https://example.com';
    let dataUrl = '';
    try { dataUrl = await QRCode.toDataURL(value, { margin: 1, width: 400 }); } catch { dataUrl = ''; }
    const inner = dataUrl ? `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:contain;display:block;" />` : '';
    return `<div style="${style}">${inner}</div>`;
  }
  if (el.type === 'link') {
    const url = resolveTokens(el.url || '', data);
    const label = resolveTokens(el.text || '', data) || url;
    return `<div style="${style}"><a href="${escapeHtml(url)}" style="color:inherit;text-decoration:underline;">${escapeHtml(label)}</a></div>`;
  }
  if (el.type === 'rectangle' || el.type === 'line') {
    return `<div style="${style}"></div>`;
  }
  // text (default)
  return `<div style="${style}">${escapeHtml(resolveTokens(el.text || '', data))}</div>`;
}

async function pageHtml(page, data) {
  const config = page.config || {};
  const width = config.width || 794;
  const height = config.height || 1123;
  const bgColor = config.backgroundColor || '#ffffff';
  const bgImage = page.backgroundImage
    ? `background-image:url('${page.backgroundImage}');background-size:${page.bgSize || 'cover'};background-position:${page.bgPosition || 'center center'};background-repeat:no-repeat;`
    : '';
  const els = await Promise.all((page.elements || []).map((el) => elementHtml(el, data)));
  return `<div class="pdf-page" style="position:relative;width:${width}px;height:${height}px;background:${bgColor};${bgImage}overflow:hidden;">${els.join('')}</div>`;
}

/** Build a full printable HTML document for all pages. */
async function buildHtml(pages = [], data = {}) {
  const first = pages[0]?.config || { width: 794, height: 1123 };
  const pagesHtml = (await Promise.all(pages.map((p) => pageHtml(p, data)))).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #ffffff; }
  @page { size: ${first.width}px ${first.height}px; margin: 0; }
  .pdf-page { page-break-after: always; }
  .pdf-page:last-child { page-break-after: auto; }
  img { max-width: none; }
</style></head><body>${pagesHtml}</body></html>`;
}

module.exports = { buildHtml };
