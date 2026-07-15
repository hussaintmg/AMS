'use strict';
const { workerData, parentPort } = require('worker_threads');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const FORMATS = { A4: [595, 842], A3: [842, 1191], A5: [420, 595], LETTER: [612, 792], LEGAL: [612, 1008] };
const px = (value, fallback = 0) => Number.parseFloat(value) * 0.75 || fallback;
const getValue = (source, key) => key.split('.').reduce((value, part) => value == null ? undefined : value[part], source);
const formatValue = (value, key) => {
  if (value == null) return '';
  if (value instanceof Date || /date|until|createdAt|updatedAt/i.test(key)) {
    const date = new Date(value); if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('en-GB');
  }
  if (typeof value === 'object') return Array.isArray(value) ? value.map((item) => item.description || item.name || JSON.stringify(item)).join(', ') : JSON.stringify(value);
  return String(value);
};
const resolve = (text, data) => String(text || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => formatValue(getValue(data, key.trim()), key));
const cssMap = (css = []) => Object.fromEntries(css.map(({ property, value }) => [property, value]));
async function imageBuffer(source) {
  if (!source) return null;
  if (/^data:image\//.test(source)) return Buffer.from(source.split(',')[1] || '', 'base64');
  if (/^https?:\/\//i.test(source)) { const response = await fetch(source); if (response.ok) return Buffer.from(await response.arrayBuffer()); }
  return null;
}

async function main() {
  try {
    const chunks = [];
    const first = workerData.pages?.[0]?.config || {};
    const doc = new PDFDocument({ autoFirstPage: false, info: { Title: workerData.title || 'Document' } });
    doc.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise((resolveDone, reject) => { doc.on('end', resolveDone); doc.on('error', reject); });
    for (const page of workerData.pages || []) {
      const config = page.config || first;
      const size = config.format === 'CUSTOM' ? [px(config.width || config.customWidth, 595), px(config.height || config.customHeight, 842)] : (FORMATS[config.format] || FORMATS.A4);
      doc.addPage({ size, margin: 0 });
      if (config.backgroundColor && config.backgroundColor !== '#ffffff') {
        doc.save().fillColor(config.backgroundColor).rect(0, 0, size[0], size[1]).fill().restore();
      }
      if (page.backgroundImage && /^data:image\//.test(page.backgroundImage)) {
        const base64 = page.backgroundImage.split(',')[1];
        if (base64) {
          const options = page.bgSize === 'contain' ? { fit: size, align: 'center', valign: 'center' } : { cover: size, align: 'center', valign: page.bgPosition?.startsWith('top') ? 'top' : page.bgPosition?.startsWith('bottom') ? 'bottom' : 'center' };
          doc.image(Buffer.from(base64, 'base64'), 0, 0, options);
        }
      }
      for (const element of page.elements || []) {
        const css = cssMap(element.css);
        const x = px(css.left, 24), y = px(css.top, 24), width = px(css.width, size[0] - x - 24), height = px(css.height, 40);
        if (element.type === 'line') {
          doc.save().strokeColor(css.color || '#cbd5e1').lineWidth(px(css['border-width'], 1)).moveTo(x, y).lineTo(x + width, y).stroke().restore();
          continue;
        }
        if (element.type === 'rectangle') {
          doc.save().fillColor(css['background-color'] || '#ffffff').rect(x, y, width, height).fill();
          if (css.border) doc.strokeColor(css['border-color'] || '#cbd5e1').rect(x, y, width, height).stroke();
          doc.restore(); continue;
        }
        if (element.type === 'image') {
          const buffer = await imageBuffer(resolve(element.imageUrl || element.src, workerData.data));
          if (buffer?.length) doc.image(buffer, x, y, { fit: [width, height], align: 'center', valign: 'center' });
          continue;
        }
        if (element.type === 'qr') {
          const value = resolve(element.qrValue, workerData.data) || 'https://example.com';
          const buffer = await QRCode.toBuffer(value, { type: 'png', margin: 1, width: Math.max(80, Math.round(width * 2)) });
          doc.image(buffer, x, y, { fit: [width, height] });
          continue;
        }
        if (element.type === 'link') {
          const url = resolve(element.url, workerData.data);
          doc.save().font(css['font-weight'] === 'bold' || Number(css['font-weight']) >= 600 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(px(css['font-size'], 12)).fillColor(css.color || '#2563eb')
            .text(resolve(element.text, workerData.data) || url, x, y, { width, height, align: css['text-align'] || 'left', link: url, underline: true });
          doc.restore();
          continue;
        }
        doc.save().font(css['font-weight'] === 'bold' || Number(css['font-weight']) >= 600 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(px(css['font-size'], 12)).fillColor(css.color || '#111827')
          .text(resolve(element.text, workerData.data), x, y, { width, height, align: css['text-align'] || 'left', lineGap: px(css['line-height'], 2) });
        doc.restore();
      }
    }
    doc.end(); await done;
    parentPort.postMessage({ success: true, buffer: Buffer.concat(chunks) });
  } catch (error) { parentPort.postMessage({ success: false, error: error.stack || error.message }); }
}
main();
