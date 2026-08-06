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
const { formatCurrency } = require('./pdfFormat.cjs');

const PAGE = { size: 'A4', margin: 40 };
const INK = '#1e293b';
const MUTED = '#64748b';
const LINE = '#cbd5e1';
const HEAD_BG = '#f1f5f9';
const SECTION_BG = '#e2e8f0';

const TITLES = {
  quotation: 'QUOTATION',
  booking: 'BOOKING CONFIRMATION',
  order: 'SALES ORDER',
  invoice: 'SALES TAX INVOICE',
};

const fmtMoney = (value) => (value == null || value === '' ? '' : formatCurrency(value));
const fmtDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB');
};
const clean = (value) => String(value == null ? '' : value).trim();

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

function renderQuotation(doc, data) {
  const d = data.document || {};
  return [
    { label: 'Valid Until', value: fmtDate(d.validUntil) },
    { label: 'Validity', value: d.validityDays ? `${d.validityDays} days` : '' },
    { label: 'Quotation Date', value: fmtDate(d.date) },
  ];
}
function renderBooking(doc, data) {
  const d = data.document || {};
  return [
    { label: 'Booking Date', value: fmtDate(d.bookingDate) },
    { label: 'Expected Delivery', value: fmtDate(d.deliveryDate) },
    { label: 'Priority', value: clean(d.priority) },
  ];
}
function renderOrder(doc, data) {
  const d = data.document || {};
  return [
    { label: 'Order Date', value: fmtDate(d.orderDate) },
    { label: 'Delivery', value: fmtDate(d.deliveryDate) },
    { label: 'Payment Mode', value: clean(d.paymentMode) },
  ];
}
function renderInvoice(doc, data) {
  const d = data.document || {};
  return [
    { label: 'Invoice Date', value: fmtDate(d.invoiceDate) },
    { label: 'Due Date', value: fmtDate(d.dueDate) },
    { label: 'Sale Person', value: clean(d.salePerson) },
  ];
}
const META_BY_TYPE = { quotation: renderQuotation, booking: renderBooking, order: renderOrder, invoice: renderInvoice };

const NOTE_BY_TYPE = {
  quotation: 'This is a quotation, not an invoice. Prices hold until the validity date shown. Stock is neither reserved nor consumed by this document.',
  booking: 'Reserved units are held against this booking. Stock is released only when the invoice is raised.',
  order: 'Goods are billed on the invoice raised against this order. Please quote the order number in all correspondence.',
  invoice: 'Goods leave stock against this invoice. Sales tax, where applicable, is charged on the retail price exclusive of sales tax.',
};

/** Document-specific rows for the bottom-right SUMMARY box, label + amount. */
function summaryRows(type, data) {
  const d = data.document || {};
  const rows = [];
  if (data.vehicleItems?.count) rows.push(['Total Vehicles', data.vehicleItems.subtotalText]);
  if (data.partItems?.count) rows.push(['Total Parts', data.partItems.subtotalText]);
  if (type === 'quotation') {
    if (d.discountAmount) rows.push(['Less; Discount', fmtMoney(d.discountAmount)]);
    if (d.taxAmount) rows.push(['Add; Tax', fmtMoney(d.taxAmount)]);
    if (d.additionalCharges) rows.push(['Add; Other Charges', fmtMoney(d.additionalCharges)]);
    rows.push(['NET', fmtMoney(d.totalAmount)]);
  } else if (type === 'booking') {
    rows.push(['Total Amount', fmtMoney(d.totalAmount)]);
    rows.push(['Deposit Received', fmtMoney(d.bookingAmount)]);
    rows.push(['NET', fmtMoney(d.balanceAmount)]);
  } else if (type === 'order') {
    if (d.discountAmount) rows.push(['Less; Discount', fmtMoney(d.discountAmount)]);
    if (d.taxAmount) rows.push(['Add; Tax', fmtMoney(d.taxAmount)]);
    rows.push(['Gross Amount', fmtMoney(d.totalAmount)]);
    rows.push(['Paid', fmtMoney(d.paidAmount)]);
    rows.push(['NET', fmtMoney(d.balanceAmount)]);
  } else {
    if (d.discountAmount) rows.push(['Less; Discount', fmtMoney(d.discountAmount)]);
    if (d.taxAmount) rows.push(['Add; Sales Tax', fmtMoney(d.taxAmount)]);
    rows.push(['Gross Amount', fmtMoney(d.totalAmount)]);
    rows.push(['Paid', fmtMoney(d.paidAmount)]);
    if (d.changeDue) rows.push(['Change Returned', fmtMoney(d.changeDue)]);
    rows.push(['NET', fmtMoney(d.balanceAmount)]);
  }
  return rows;
}

const VEHICLE_COLUMNS = [
  { label: '#', width: 24, get: (r) => r.number },
  { label: 'Vehicle', width: 210, get: (r) => r.description },
  { label: 'Chassis No.', width: 110, get: (r) => r.code },
  { label: 'Qty', width: 34, align: 'right', get: (r) => r.quantity },
  { label: 'Unit Price', width: 80, align: 'right', get: (r) => r.unitPriceText },
  { label: 'Amount', width: 87, align: 'right', get: (r) => r.totalPriceText },
];
const PART_COLUMNS = [
  { label: 'Part #', width: 80, get: (r) => r.code },
  { label: 'Part Name', width: 160, get: (r) => r.name || r.description },
  { label: 'Qty', width: 30, align: 'right', get: (r) => r.quantity },
  { label: 'Unit Price', width: 75, align: 'right', get: (r) => r.unitPriceText },
  { label: 'Discount', width: 65, align: 'right', get: (r) => r.discountAmountText },
  { label: 'Tax', width: 65, align: 'right', get: (r) => r.taxAmountText },
  { label: 'Total', width: 70, align: 'right', get: (r) => r.totalPriceText },
];

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
    const customer = data.customer || {};

    // ── Header: centred company block, document number/date top-right ──
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK)
      .text(company.name || '', left, doc.y, { width, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    [company.phone && `Tel: ${company.phone}`, company.address && `Address: ${company.address}`, company.ntn && `NTN Number: ${company.ntn}`]
      .filter(Boolean).forEach((line) => doc.text(line, left, doc.y, { width, align: 'center' }));

    const headerRight = `${d.number ? `${type === 'invoice' ? 'Invoice' : type === 'order' ? 'Order' : type === 'booking' ? 'Booking' : 'Quotation'} # : ${d.number}` : ''}\nDate : ${fmtDate(d.date)}\nStatus : ${clean(d.status).toUpperCase()}`;
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(headerRight, left + width - 180, 40, { width: 180, align: 'right' });

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(TITLES[type] || 'DOCUMENT', left, doc.y, { width, align: 'center' });
    doc.moveDown(0.6);

    // ── Billed To grid — every cell is a self-contained "Label : value",
    // exactly like the DMS reference invoice, so no cell depends on another
    // row or column to make sense on its own. ──
    const metaRows = (META_BY_TYPE[type] || (() => []))(doc, data);
    const metaCell = (i) => (metaRows[i]?.label ? `${metaRows[i].label} : ${metaRows[i].value || ''}` : '');
    const gridRows = [
      ['Billed To :', `Prepared By : ${clean(data.generator?.fullName)}`, metaCell(0)],
      [`Customer : ${customer.fullName || ''}`, `Contact # : ${customer.phone || ''}`, metaCell(1)],
      [`Address : ${[customer.address, customer.city].filter(Boolean).join(' ')}`, `Email : ${customer.email || ''}`, metaCell(2)],
      [`Company : ${customer.companyName || ''}`, `Customer # : ${customer.customerCode || ''}`, ''],
    ];
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
    drawProductSection(doc, left, width, 'Vehicles', data.vehicleItems || [], VEHICLE_COLUMNS, 'Total Vehicles Rs. :', data.vehicleItems?.subtotalText || '');
    drawProductSection(doc, left, width, 'Spare Parts & Lubricants', data.partItems || [], PART_COLUMNS, 'Total Spare Parts Rs. :', data.partItems?.subtotalText || '');

    // ── Note + amount in words, side by side ──
    const noteWidth = width * 0.58, wordsWidth = width - noteWidth - 12;
    ensureRoom(doc, 46);
    const rowY = doc.y;
    drawBox(doc, left, rowY, noteWidth, 46, (x, y, w) => doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(NOTE_BY_TYPE[type] || '', x, y, { width: w }));
    drawBox(doc, left + noteWidth + 12, rowY, wordsWidth, 46, (x, y, w) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Total amount in words:', x, y, { width: w });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(d.totalInWords || '', x, y + 12, { width: w, underline: true });
    });
    doc.y = rowY + 46 + 10;

    // ── Notes/Terms on the left, SUMMARY box on the right ──
    const rows = summaryRows(type, data);
    const summaryHeight = 24 + rows.length * 18;
    ensureRoom(doc, summaryHeight);
    const bottomY = doc.y;
    const notesWidth = width * 0.55, summaryWidth = width - notesWidth - 12;
    let noteY = bottomY;
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    if (d.notes) {
      doc.font('Helvetica-Bold').fontSize(10).text('Notes', left, noteY, { width: notesWidth });
      noteY = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(clean(d.notes), left, noteY, { width: notesWidth });
      noteY = doc.y + 6;
    }
    if (d.termsAndConditions) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Terms & Conditions', left, noteY, { width: notesWidth });
      noteY = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(clean(d.termsAndConditions), left, noteY, { width: notesWidth });
    }

    const sx = left + notesWidth + 12;
    doc.rect(sx, bottomY, summaryWidth, 20).fillAndStroke(HEAD_BG, LINE);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('SUMMARY', sx, bottomY + 5, { width: summaryWidth, align: 'center' });
    let sy = bottomY + 20;
    rows.forEach(([label, value], i) => {
      const isNet = label === 'NET';
      doc.rect(sx, sy, summaryWidth, 18).stroke(LINE);
      doc.font(isNet ? 'Helvetica-Bold' : 'Helvetica').fontSize(isNet ? 10 : 9).fillColor(INK)
        .text(isNet ? 'Net Amount' : label, sx + 6, sy + 4, { width: summaryWidth * 0.55, lineBreak: false })
        .text(value, sx + summaryWidth * 0.55, sy + 4, { width: summaryWidth * 0.45 - 6, align: 'right', lineBreak: false });
      sy += 18;
    });

    doc.end();
  });
}

module.exports = { renderDocumentPdf, TITLES };
