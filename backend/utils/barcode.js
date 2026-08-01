/**
 * Unique scannable codes for Parts and Vehicles, plus a Code 128-B renderer.
 *
 * Code 128-B is what handheld inventory scanners read out of the box and it
 * covers the whole printable ASCII range, so the human-readable code ("PRT-
 * 000042") and the scanned string are the same value — no lookup table, and a
 * code typed by hand behaves exactly like a scanned one.
 *
 * Rendered as SVG rather than PNG on purpose: it needs no native image
 * dependency, prints crisply at any label size, and the browser can rasterise
 * it if the user wants a PNG.
 */

// Bar/space module widths per Code 128 symbol value (0-106).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

const PREFIXES = { part: 'PRT', vehicle: 'VEH' };

const clean = (value) => String(value == null ? '' : value).trim();

/** Code 128-B accepts printable ASCII only; anything else cannot be encoded. */
function isEncodable(value) {
  const text = clean(value);
  if (!text) return false;
  return [...text].every((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code <= 126;
  });
}

/**
 * Render `value` as a Code 128-B SVG.
 * @param {string} value
 * @param {object} options  height (bar px), moduleWidth, showText, label
 */
function renderBarcodeSvg(value, options = {}) {
  const text = clean(value);
  if (!isEncodable(text)) throw new Error('Barcode value must be printable ASCII');

  const {
    moduleWidth = 2,
    height = 70,
    margin = 10,
    showText = true,
    fontSize = 13,
  } = options;

  const codes = [START_B];
  let checksum = START_B;
  [...text].forEach((char, index) => {
    const symbol = char.charCodeAt(0) - 32;
    codes.push(symbol);
    checksum += symbol * (index + 1);
  });
  codes.push(checksum % 103, STOP);

  let x = margin;
  const bars = [];
  codes.forEach((code) => {
    const pattern = PATTERNS[code];
    [...pattern].forEach((widthChar, index) => {
      const width = Number(widthChar) * moduleWidth;
      // Even positions are bars, odd are spaces.
      if (index % 2 === 0) bars.push(`<rect x="${x}" y="${margin}" width="${width}" height="${height}" fill="#000"/>`);
      x += width;
    });
  });

  const textHeight = showText ? fontSize + 6 : 0;
  const totalWidth = x + margin;
  const totalHeight = height + margin * 2 + textHeight;
  const caption = showText
    ? `<text x="${totalWidth / 2}" y="${height + margin + fontSize + 2}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" letter-spacing="1.5" fill="#000">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`
    + `<rect width="${totalWidth}" height="${totalHeight}" fill="#fff"/>${bars.join('')}${caption}</svg>`;
}

/**
 * A print-ready label: barcode plus the product's own identity, sized for a
 * standard 50x25mm thermal label but happy on A4 too.
 */
function renderBarcodeLabelHtml(value, { title = '', subtitle = '', price = '' } = {}) {
  const escape = (text) => String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(value)}</title>
<style>
  @page { margin: 8mm; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 12px; }
  .label { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; width: max-content; text-align: center; }
  .title { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
  .subtitle { font-size: 11px; color: #475569; margin-bottom: 8px; }
  .price { font-size: 13px; font-weight: bold; margin-top: 6px; }
  @media print { .no-print { display: none; } .label { border: none; } }
</style></head><body>
<div class="label">
  ${title ? `<div class="title">${escape(title)}</div>` : ''}
  ${subtitle ? `<div class="subtitle">${escape(subtitle)}</div>` : ''}
  ${renderBarcodeSvg(value)}
  ${price ? `<div class="price">${escape(price)}</div>` : ''}
</div>
<button class="no-print" style="margin-top:14px;padding:8px 16px;cursor:pointer" onclick="window.print()">Print label</button>
</body></html>`;
}

/**
 * Allocate the next free barcode for a collection.
 * Scans the highest existing `<PREFIX>-NNNNNN` and steps past it, then confirms
 * the candidate is unused so a manually typed code can never be duplicated.
 */
async function nextBarcode(Model, kind = 'part') {
  const prefix = PREFIXES[kind] || 'ITM';
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const latest = await Model.find({ barcode: { $regex: `^${prefix}-\\d+$` } })
    .select('barcode').sort({ barcode: -1 }).limit(1).lean();
  let next = 1;
  const match = latest[0]?.barcode?.match(pattern);
  if (match) next = Number(match[1]) + 1;

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = `${prefix}-${String(next).padStart(6, '0')}`;
    const taken = await Model.exists({ barcode: candidate });
    if (!taken) return candidate;
    next += 1;
  }
  throw new Error(`Could not allocate a free ${prefix} barcode`);
}

/**
 * Give every record of this model that has no barcode one. Used on demand from
 * the inventory screens so existing stock becomes scannable without a migration.
 */
async function backfillBarcodes(Model, kind = 'part') {
  const missing = await Model.find({ $or: [{ barcode: { $exists: false } }, { barcode: '' }, { barcode: null }] })
    .select('_id').lean();
  let assigned = 0;
  for (const record of missing) {
    const barcode = await nextBarcode(Model, kind);
    await Model.updateOne({ _id: record._id }, { $set: { barcode } });
    assigned += 1;
  }
  return assigned;
}

module.exports = {
  PREFIXES,
  isEncodable,
  renderBarcodeSvg,
  renderBarcodeLabelHtml,
  nextBarcode,
  backfillBarcodes,
};
