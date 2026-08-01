/**
 * Single source of truth for PDF document types, the data bag that feeds token
 * resolution, and the variable catalog shown in the editor. Keeping the catalog
 * and the data bag in the same file guarantees every advertised variable
 * actually resolves against a real schema field (no dangling variables).
 */
const { Quotation, Booking, SalesOrder, Invoice, BrandingSetting } = require('../models');

const TYPES = {
  quotation: { label: 'Quotation', Model: Quotation, number: 'quotationNumber' },
  booking: { label: 'Booking', Model: Booking, number: 'bookingNumber' },
  order: { label: 'Sales Order', Model: SalesOrder, number: 'orderNumber' },
  invoice: { label: 'Invoice', Model: Invoice, number: 'invoiceNumber' },
};

const join = (...parts) => parts.filter(Boolean).join(' ').trim();

function flattenVehicle(vehicle) {
  if (!vehicle || typeof vehicle !== 'object') return { name: '', make: '', model: '', variant: '', color: '', year: '', vin: '' };
  const make = vehicle.make?.name || '';
  const model = vehicle.model?.name || '';
  const variant = vehicle.variant?.name || '';
  return {
    name: join(make, model, variant),
    make, model, variant,
    color: vehicle.color?.name || '',
    year: vehicle.year || vehicle.model?.yearFrom || '',
    vin: vehicle.vin || '',
  };
}

function itemName(record) {
  if (record.itemDescription) return record.itemDescription;
  const first = Array.isArray(record.lineItems) && record.lineItems.length ? record.lineItems[0] : null;
  if (first) return first.description || first.name || '';
  const legacy = Array.isArray(record.items) ? record.items[0] : null;
  return legacy?.description || '';
}

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `PKR ${number.toLocaleString('en-PK')}` : '';
};

/**
 * Every sellable line as a flat row, for `{{#each items}}` in a template.
 * Falls back to the legacy single-line `items[]` so templates written before
 * multi-product documents still print the same rows.
 */
function buildItemRows(record) {
  const source = Array.isArray(record.lineItems) && record.lineItems.length
    ? record.lineItems
    : (Array.isArray(record.items) ? record.items : []);
  return source.map((line, index) => {
    const quantity = Number(line.quantity) || 1;
    const unitPrice = Number(line.unitPrice) || 0;
    const totalPrice = Number(line.totalPrice) || unitPrice * quantity;
    return {
      index: index + 1,
      number: index + 1,
      type: line.itemType || line.type || '',
      code: line.code || '',
      barcode: line.barcode || '',
      name: line.name || line.description || '',
      description: line.description || line.name || '',
      quantity,
      unitPrice,
      unitPriceText: money(unitPrice),
      discountAmount: Number(line.discountAmount) || 0,
      discountAmountText: money(Number(line.discountAmount) || 0),
      taxAmount: Number(line.taxAmount) || 0,
      taxAmountText: money(Number(line.taxAmount) || 0),
      totalPrice,
      totalPriceText: money(totalPrice),
    };
  });
}

/**
 * A complete items table as HTML, so a template can print every product with a
 * single `{{items.table}}` token without writing an #each block by hand.
 */
function buildItemsTable(rows) {
  if (!rows.length) return '';
  const cell = 'padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;';
  const head = 'padding:6px 8px;border-bottom:2px solid #0f172a;font-size:12px;text-align:left;font-weight:bold;';
  const escape = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = rows.map((row) => `<tr>
<td style="${cell}">${row.number}</td>
<td style="${cell}">${escape(row.description)}${row.code ? ` <span style="color:#64748b">(${escape(row.code)})</span>` : ''}</td>
<td style="${cell}text-align:right">${row.quantity}</td>
<td style="${cell}text-align:right">${row.unitPriceText}</td>
<td style="${cell}text-align:right">${row.totalPriceText}</td>
</tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse">
<thead><tr>
<th style="${head}">#</th><th style="${head}">Description</th>
<th style="${head}text-align:right">Qty</th><th style="${head}text-align:right">Unit Price</th>
<th style="${head}text-align:right">Amount</th>
</tr></thead>
<tbody>${body}</tbody></table>`;
}

/** Build the nested data object that {{tokens}} resolve against. */
function buildDataBag(type, record, extras = {}) {
  const config = TYPES[type] || {};
  const customer = record.customer && typeof record.customer === 'object' ? record.customer : {};
  const generator = record.createdBy && typeof record.createdBy === 'object' ? record.createdBy : {};
  const itemRows = buildItemRows(record);
  const itemsTable = buildItemsTable(itemRows);
  return {
    // `{{#each items}}` iterates this; `{{items.table}}` prints the whole table.
    items: Object.assign(itemRows.slice(), {
      table: itemsTable,
      count: itemRows.length,
      totalQuantity: itemRows.reduce((sum, row) => sum + row.quantity, 0),
    }),
    lineItems: itemRows,
    // Spreading the raw record first means any real schema field is reachable
    // as document.<field> even if it is not in the curated catalog below.
    document: {
      ...record,
      title: config.label || '',
      number: record[config.number] || '',
      date: record.createdAt,
      itemName: itemName(record),
    },
    customer: {
      ...customer,
      fullName: join(customer.firstName, customer.lastName) || customer.companyName || '',
      name: join(customer.firstName, customer.lastName) || customer.companyName || '',
    },
    vehicle: flattenVehicle(record.vehicle),
    generator: {
      ...generator,
      fullName: generator.fullName || join(generator.firstName, generator.lastName),
    },
    company: { name: extras.companyName || '' },
    item: {
      name: itemName(record),
      list: itemRows.map((row) => row.description).filter(Boolean).join(', '),
      count: itemRows.length,
      table: itemsTable,
    },
  };
}

const COMMON = [
  ['document.title', 'Document title'],
  ['document.number', 'Document number'],
  ['document.status', 'Status'],
  ['document.date', 'Created date'],
  ['document.totalAmount', 'Total amount'],
  ['document.taxAmount', 'Tax amount'],
  ['document.notes', 'Notes'],
  ['item.name', 'First item name'],
  ['item.list', 'All items (comma separated)'],
  ['item.count', 'Number of products'],
  ['items.table', 'Products table (ready-made HTML)'],
  ['items.totalQuantity', 'Total quantity across products'],
  ['{{#each items}}…{{/each}}', 'Repeat per product — inside use {{this.number}}, {{this.description}}, {{this.code}}, {{this.quantity}}, {{this.unitPriceText}}, {{this.totalPriceText}}'],
  ['customer.fullName', 'Customer name'],
  ['customer.firstName', 'Customer first name'],
  ['customer.lastName', 'Customer last name'],
  ['customer.companyName', 'Customer company'],
  ['customer.email', 'Customer email'],
  ['customer.phone', 'Customer phone'],
  ['customer.alternatePhone', 'Customer alt. phone'],
  ['customer.customerCode', 'Customer code'],
  ['customer.address', 'Customer address'],
  ['customer.city', 'Customer city'],
  ['customer.state', 'Customer state'],
  ['customer.country', 'Customer country'],
  ['customer.zipCode', 'Customer zip code'],
  ['generator.fullName', 'Prepared by'],
  ['generator.email', 'Preparer email'],
  ['generator.phone', 'Preparer phone'],
  ['company.name', 'Company name'],
];

// Only offered for document types whose schema actually references a vehicle.
const VEHICLE = [
  ['vehicle.name', 'Vehicle name'],
  ['vehicle.make', 'Vehicle make'],
  ['vehicle.model', 'Vehicle model'],
  ['vehicle.variant', 'Vehicle variant'],
  ['vehicle.color', 'Vehicle color'],
  ['vehicle.year', 'Vehicle year'],
  ['vehicle.vin', 'Vehicle VIN'],
];

const hasVehicle = (type) => Boolean(TYPES[type]?.Model?.schema?.path('vehicle'));

const EXTRA = {
  quotation: [
    ['document.validUntil', 'Valid until'],
    ['document.validityDays', 'Validity (days)'],
    ['document.vehiclePrice', 'Vehicle price'],
    ['document.discountAmount', 'Discount amount'],
    ['document.discountPercentage', 'Discount %'],
    ['document.additionalCharges', 'Additional charges'],
  ],
  booking: [
    ['document.bookingDate', 'Booking date'],
    ['document.deliveryDate', 'Delivery date'],
    ['document.bookingAmount', 'Booking amount'],
    ['document.priority', 'Priority'],
  ],
  order: [
    ['document.orderDate', 'Order date'],
    ['document.deliveryDate', 'Delivery date'],
    ['document.subtotal', 'Subtotal'],
    ['document.discountAmount', 'Discount amount'],
    ['document.paidAmount', 'Paid amount'],
    ['document.balanceAmount', 'Balance amount'],
    ['document.paymentMode', 'Payment mode'],
  ],
  invoice: [
    ['document.invoiceDate', 'Invoice date'],
    ['document.dueDate', 'Due date'],
    ['document.subtotal', 'Subtotal'],
    ['document.discountAmount', 'Discount amount'],
    ['document.paidAmount', 'Paid amount'],
    ['document.balanceAmount', 'Balance amount'],
  ],
};

/** Curated variable list for a document type (built-ins only). */
function variableCatalog(type) {
  const rows = [...COMMON, ...(hasVehicle(type) ? VEHICLE : []), ...(EXTRA[type] || [])];
  return rows.map(([key, label]) => ({ key, label, category: key.split('.')[0], reference: `{{${key}}}` }));
}

/** Resolve the company name once (from branding) for the data bag. */
async function companyName() {
  const branding = await BrandingSetting.findOne().lean().catch(() => null);
  return branding?.applicationName || '';
}

module.exports = { TYPES, buildDataBag, variableCatalog, companyName, flattenVehicle, buildItemRows, buildItemsTable };
