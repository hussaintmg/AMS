'use strict';
/**
 * The layout facts a sales document is made of — titles, the meta cells in the
 * "Billed To" grid, the standing note, the product columns and the SUMMARY
 * rows.
 *
 * Two renderers consume this: pdfKitRenderer.service.js (the downloaded PDF)
 * and salesDocumentHtml.service.js (what the screen shows and what Print
 * sends to the printer). Keeping the facts here is what guarantees the three
 * outputs stay identical — previously each one described the document in its
 * own way and they drifted apart.
 */
const { formatCurrency } = require('./pdfFormat.cjs');

const TITLES = {
  quotation: 'QUOTATION',
  booking: 'BOOKING CONFIRMATION',
  order: 'SALES ORDER',
  invoice: 'SALES TAX INVOICE',
};

/** The word in front of the number in the top-right block. */
const NUMBER_LABELS = {
  quotation: 'Quotation',
  booking: 'Booking',
  order: 'Order',
  invoice: 'Invoice',
};

const NOTE_BY_TYPE = {
  quotation: 'This is a quotation, not an invoice. Prices hold until the validity date shown. Stock is neither reserved nor consumed by this document.',
  booking: 'Reserved units are held against this booking. Stock is released only when the invoice is raised.',
  order: 'Goods are billed on the invoice raised against this order. Please quote the order number in all correspondence.',
  invoice: 'Goods leave stock against this invoice. Sales tax, where applicable, is charged on the retail price exclusive of sales tax.',
};

const fmtMoney = (value) => (value == null || value === '' ? '' : formatCurrency(value));
const fmtDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB');
};
const clean = (value) => String(value == null ? '' : value).trim();

/** The three document-specific cells down the right column of the Billed To grid. */
const META_BY_TYPE = {
  quotation: (d) => [
    { label: 'Valid Until', value: fmtDate(d.validUntil) },
    { label: 'Validity', value: d.validityDays ? `${d.validityDays} days` : '' },
    { label: 'Quotation Date', value: fmtDate(d.date) },
  ],
  booking: (d) => [
    { label: 'Booking Date', value: fmtDate(d.bookingDate) },
    { label: 'Expected Delivery', value: fmtDate(d.deliveryDate) },
    { label: 'Priority', value: clean(d.priority) },
  ],
  order: (d) => [
    { label: 'Order Date', value: fmtDate(d.orderDate) },
    { label: 'Delivery', value: fmtDate(d.deliveryDate) },
    { label: 'Payment Mode', value: clean(d.paymentMode) },
  ],
  invoice: (d) => [
    { label: 'Invoice Date', value: fmtDate(d.invoiceDate) },
    { label: 'Due Date', value: fmtDate(d.dueDate) },
    { label: 'Sale Person', value: clean(d.salePerson) },
  ],
};

function metaRows(type, data) {
  const build = META_BY_TYPE[type];
  return build ? build(data.document || {}) : [];
}

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

/**
 * The four cells of the Billed To grid, row by row. Every cell is a
 * self-contained "Label : value" so none of them depends on a neighbour to
 * make sense — the same shape as the DMS documents this ERP replaces.
 */
function billedToGrid(type, data) {
  const customer = data.customer || {};
  const meta = metaRows(type, data);
  const metaCell = (i) => (meta[i]?.label ? `${meta[i].label} : ${meta[i].value || ''}` : '');
  return [
    ['Billed To :', `Prepared By : ${clean(data.generator?.fullName)}`, metaCell(0)],
    [`Customer : ${customer.fullName || ''}`, `Contact # : ${customer.phone || ''}`, metaCell(1)],
    [`Address : ${[customer.address, customer.city].filter(Boolean).join(' ')}`, `Email : ${customer.email || ''}`, metaCell(2)],
    [`Company : ${customer.companyName || ''}`, `Customer # : ${customer.customerCode || ''}`, ''],
  ];
}

/** The top-right block: document number, date and status. */
function headerMeta(type, data) {
  const d = data.document || {};
  return [
    d.number ? `${NUMBER_LABELS[type] || 'Document'} # : ${d.number}` : '',
    `Date : ${fmtDate(d.date)}`,
    `Status : ${clean(d.status).toUpperCase()}`,
  ].filter(Boolean);
}

// `width` is used by the PDF renderer only; the HTML renderer turns it into a
// percentage of the table so both come out with the same proportions.
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

/** The two product tables, in printing order, each already told whether it has rows. */
function productSections(data) {
  return [
    {
      title: 'Vehicles',
      rows: data.vehicleItems || [],
      columns: VEHICLE_COLUMNS,
      totalLabel: 'Total Vehicles Rs. :',
      totalText: data.vehicleItems?.subtotalText || '',
    },
    {
      title: 'Spare Parts & Lubricants',
      rows: data.partItems || [],
      columns: PART_COLUMNS,
      totalLabel: 'Total Spare Parts Rs. :',
      totalText: data.partItems?.subtotalText || '',
    },
  ].filter((section) => section.rows.length);
}

module.exports = {
  TITLES, NUMBER_LABELS, NOTE_BY_TYPE,
  VEHICLE_COLUMNS, PART_COLUMNS,
  fmtMoney, fmtDate, clean,
  metaRows, summaryRows, billedToGrid, headerMeta, productSections,
};
