/**
 * Sales-document PDFs drawn directly with pdfkit — no headless browser, no
 * native shared-library dependency, nothing to install beyond `npm install`.
 *
 * This replaced a Puppeteer/Chromium pipeline that could not be made to work
 * reliably on shared hosting: every fix (bundling Chromium, installing system
 * libraries) hit another missing native dependency the host didn't have and
 * couldn't be given root access to fix. pdfkit draws vector PDF content
 * directly in Node with pure JavaScript, so there is no browser binary that
 * can be missing.
 *
 * The trade-off against the old HTML/CSS template system: layout here is
 * fixed in code per document type rather than freely editable in the PDF
 * Management designer/HTML editor. It mirrors the same DMS-style layout
 * (bordered "Billed To" grid, a table per product type, amount in words, a
 * totals box) that the HTML templates were built to match.
 */
const PDFDocument = require('pdfkit');
const {
  TITLES, NOTE_BY_TYPE, clean,
  summaryRows, billedToGrid, headerMeta, productSections,
} = require('./salesDocumentLayout.cjs');

const PAGE = { size: 'A4', margin: 40 };
const INK = '#1e293b';
const MUTED = '#64748b';
const LINE = '#cbd5e1';
const HEAD_BG = '#f1f5f9';
const SECTION_BG = '#e2e8f0';

/** Bottom of the usable page area; content past this needs a new page. */
function pageBottom(doc) {
  return doc.page.height - doc.page.margins.bottom;
}

/** Start a fresh page when a block of the given height would not fit. */
function ensureRoom(doc, height) {
  if (doc.y + height > pageBottom(doc)) doc.addPage();
}

/**
 * How tall one row needs to be: the tallest of its cells once each has
 * wrapped inside its own column width. A fixed row height is what made a
 * long vehicle name or a wrapped email address overflow into — and get
 * struck through by — the row below it; every row is measured before it is
 * drawn instead, whatever its actual content turns out to be.
 */
function measureRowHeight(doc, cells, colWidths, fontSize, minHeight) {
  doc.fontSize(fontSize);
  const tallest = cells.reduce((max, cell, i) => {
    const h = doc.heightOfString(clean(cell), { width: colWidths[i] - 8 });
    return Math.max(max, h);
  }, 0);
  return Math.max(minHeight, tallest + 10);
}

/**
 * One bordered grid table: a header row (optional) plus data rows, columns
 * given as `{ label, width, align }`. Rows are drawn top-down, each sized to
 * fit its own wrapped text (see measureRowHeight), and kept off the very
 * bottom edge by ensureRoom before each row.
 */
function drawTable(doc, x, columns, rows, { headerBg = HEAD_BG, fontSize = 9 } = {}) {
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const colWidths = columns.map((c) => c.width);

  const drawRow = (cells, { bold = false, bg = null } = {}) => {
    const rowHeight = measureRowHeight(doc, cells, colWidths, fontSize, 20);
    ensureRoom(doc, rowHeight);
    const y = doc.y;
    if (bg) doc.rect(x, y, totalWidth, rowHeight).fill(bg);
    doc.fillColor(INK).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    let cx = x;
    columns.forEach((col, i) => {
      doc.text(clean(cells[i]), cx + 4, y + 5, { width: col.width - 8, align: col.align || 'left' });
      cx += col.width;
    });
    doc.rect(x, y, totalWidth, rowHeight).stroke(LINE);
    cx = x;
    columns.forEach((col) => { doc.moveTo(cx, y).lineTo(cx, y + rowHeight).stroke(LINE); cx += col.width; });
    doc.moveTo(cx, y).lineTo(cx, y + rowHeight).stroke(LINE);
    doc.y = y + rowHeight;
  };

  drawRow(columns.map((c) => c.label), { bold: true, bg: headerBg });
  rows.forEach((row) => drawRow(row));
  doc.moveDown(0.6);
}

/** The "Vehicles" or "Spare Parts & Lubricants" product table, with its own
 *  section title bar and a bold total row — skipped entirely when empty. */
function drawProductSection(doc, x, width, title, rows, columns, totalLabel, totalText) {
  if (!rows.length) return;
  ensureRoom(doc, 24);
  doc.rect(x, doc.y, width, 20).fill(SECTION_BG);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(title, x, doc.y + 5, { width, align: 'center' });
  doc.y += 20;
  drawTable(doc, x, columns, rows.map((r) => columns.map((c) => c.get(r))));
  ensureRoom(doc, 20);
  const y = doc.y;
  doc.rect(x, y, width, 20).fillAndStroke(HEAD_BG, LINE);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9)
    .text(totalLabel, x, y + 6, { width: width - 90, align: 'right' })
    .text(totalText, x + width - 90, y + 6, { width: 86, align: 'right' });
  doc.y = y + 20;
  doc.moveDown(0.6);
}

/** A labelled bordered box of key/value lines — used for the amount-in-words
 *  note and, doubled up, for the Notes/Terms panel. */
function drawBox(doc, x, y, width, height, draw) {
  doc.rect(x, y, width, height).stroke(LINE);
  draw(x + 8, y + 8, width - 16);
}

/**
 * Draw one sales document (quotation/booking/order/invoice) and resolve to a
 * PDF Buffer. `data` is exactly services/pdfData.service.js's buildDataBag()
 * output — the same data every HTML template token used to resolve against.
 */
function renderDocumentPdf(type, data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument(PAGE);
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const d = data.document || {};
    const company = data.company || {};

    // ── Header: centred company block, document number/date top-right ──
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK)
      .text(company.name || '', left, doc.y, { width, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    // The company's own email belongs on the letterhead — it is how the customer
    // replies to the document. It is configured in ERP Settings and has always
    // been in the data bag, but neither renderer drew it, so every document went
    // out with no email address on it anywhere.
    [
      company.phone && `Tel: ${company.phone}`,
      company.email && `Email: ${company.email}`,
      company.address && `Address: ${company.address}`,
      company.ntn && `NTN Number: ${company.ntn}`,
    ].filter(Boolean).forEach((line) => doc.text(line, left, doc.y, { width, align: 'center' }));

    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(headerMeta(type, data).join('\n'), left + width - 180, 40, { width: 180, align: 'right' });

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(TITLES[type] || 'DOCUMENT', left, doc.y, { width, align: 'center' });
    doc.moveDown(0.6);

    // ── Billed To grid — every cell is a self-contained "Label : value",
    // exactly like the DMS reference invoice, so no cell depends on another
    // row or column to make sense on its own. ──
    const gridRows = billedToGrid(type, data);
    const colW = width / 3;
    const colWidths = [colW, colW, colW];
    doc.font('Helvetica').fontSize(9);
    gridRows.forEach((cols) => {
      const rowHeight = measureRowHeight(doc, cols, colWidths, 9, 20);
      ensureRoom(doc, rowHeight);
      const y = doc.y;
      doc.rect(left, y, width, rowHeight).stroke(LINE);
      doc.moveTo(left + colW, y).lineTo(left + colW, y + rowHeight).stroke(LINE);
      doc.moveTo(left + colW * 2, y).lineTo(left + colW * 2, y + rowHeight).stroke(LINE);
      cols.forEach((text, i) => doc.fillColor(INK).text(clean(text), left + colW * i + 4, y + 5, { width: colW - 8 }));
      doc.y = y + rowHeight;
    });
    doc.moveDown(0.6);

    // ── Product sections: vehicles, then parts — either may be absent ──
    productSections(data).forEach((section) => {
      drawProductSection(doc, left, width, section.title, section.rows, section.columns, section.totalLabel, section.totalText);
    });

    // ── Note + amount in words, side by side. Both boxes are measured before
    // they are drawn: a fixed 46pt height silently clipped a long standing note
    // (and, on a busy page, the whole row). ──
    const noteWidth = width * 0.58, wordsWidth = width - noteWidth - 12;
    const standingNote = NOTE_BY_TYPE[type] || '';
    doc.font('Helvetica-Bold').fontSize(8);
    const boxHeight = Math.max(
      46,
      doc.heightOfString(standingNote, { width: noteWidth - 16 }) + 16,
      doc.heightOfString(d.totalInWords || '', { width: wordsWidth - 16 }) + 28,
    );
    ensureRoom(doc, boxHeight);
    const rowY = doc.y;
    drawBox(doc, left, rowY, noteWidth, boxHeight, (x, y, w) => doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(standingNote, x, y, { width: w }));
    drawBox(doc, left + noteWidth + 12, rowY, wordsWidth, boxHeight, (x, y, w) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Total amount in words:', x, y, { width: w });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(d.totalInWords || '', x, y + 12, { width: w, underline: true });
    });
    doc.y = rowY + boxHeight + 10;

    // ── Notes/Terms on the left, SUMMARY box on the right ──
    //
    // Both columns start on the same line, so the page must have room for the
    // taller of the two before either is drawn. Reserving only the summary's
    // height is what used to lose the Notes: a document whose notes did not fit
    // in what was left of the page had pdfkit break to a new page part-way
    // through drawing them, after which the summary box — still positioned at
    // the old y — was painted over the continuation. Quotations and bookings
    // felt it most, their summaries being the shortest, so the least room was
    // reserved. The summary is also drawn first now, so even notes longer than
    // a full page flow on underneath it instead of through it.
    const rows = summaryRows(type, data);
    const summaryHeight = 24 + rows.length * 18;
    const notesWidth = width * 0.55, summaryWidth = width - notesWidth - 12;
    const notesBlocks = [
      { title: 'Notes', body: clean(d.notes) },
      { title: 'Terms & Conditions', body: clean(d.termsAndConditions) },
    ].filter((block) => block.body);
    const notesHeight = notesBlocks.reduce((total, block) => {
      doc.font('Helvetica-Bold').fontSize(10);
      const titleHeight = doc.heightOfString(block.title, { width: notesWidth });
      doc.font('Helvetica').fontSize(9);
      return total + titleHeight + doc.heightOfString(block.body, { width: notesWidth }) + 6;
    }, 0);
    ensureRoom(doc, Math.max(summaryHeight, notesHeight));
    const bottomY = doc.y;

    const sx = left + notesWidth + 12;
    doc.rect(sx, bottomY, summaryWidth, 20).fillAndStroke(HEAD_BG, LINE);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('SUMMARY', sx, bottomY + 5, { width: summaryWidth, align: 'center' });
    let sy = bottomY + 20;
    rows.forEach(([label, value]) => {
      const isNet = label === 'NET';
      doc.rect(sx, sy, summaryWidth, 18).stroke(LINE);
      doc.font(isNet ? 'Helvetica-Bold' : 'Helvetica').fontSize(isNet ? 10 : 9).fillColor(INK)
        .text(isNet ? 'Net Amount' : label, sx + 6, sy + 4, { width: summaryWidth * 0.55, lineBreak: false })
        .text(value, sx + summaryWidth * 0.55, sy + 4, { width: summaryWidth * 0.45 - 6, align: 'right', lineBreak: false });
      sy += 18;
    });

    let noteY = bottomY;
    notesBlocks.forEach((block) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(block.title, left, noteY, { width: notesWidth });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(block.body, left, doc.y, { width: notesWidth });
      noteY = doc.y + 6;
    });

    doc.y = Math.max(sy, noteY);
    doc.end();
  });
}

module.exports = { renderDocumentPdf, TITLES };
