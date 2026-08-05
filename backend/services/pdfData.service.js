/**
 * Single source of truth for PDF document types, the data bag that feeds token
 * resolution, and the variable catalog shown in the editor. Keeping the catalog
 * and the data bag in the same file guarantees every advertised variable
 * actually resolves against a real schema field (no dangling variables).
 */
const {
  Quotation, Booking, SalesOrder, Invoice,
  PartQuotation, PartBooking, PartSalesOrder, PartInvoice,
  BrandingSetting,
} = require('../models');
const mongoose = require('mongoose');

/**
 * Vehicles and parts deliberately share one document type each.
 *
 * A parts quotation prints from the same `quotation` template as a vehicle
 * quotation — there is one template to design, one to assign and one to keep in
 * step. `altModel` is the parts twin of the same document; a lookup tries the
 * primary collection and then that one. Ids are ObjectIds, so a document can
 * only ever be found in one of them.
 *
 * `Model` stays the vehicle model on purpose: it is what the variable catalog
 * is built from, and the catalog must advertise the vehicle fields too.
 */
const TYPES = {
  quotation: { label: 'Quotation', Model: Quotation, altModel: PartQuotation, number: 'quotationNumber' },
  booking: { label: 'Booking', Model: Booking, altModel: PartBooking, number: 'bookingNumber' },
  order: { label: 'Sales Order', Model: SalesOrder, altModel: PartSalesOrder, number: 'orderNumber' },
  invoice: { label: 'Invoice', Model: Invoice, altModel: PartInvoice, number: 'invoiceNumber' },
};

/**
 * Load one document of `type` by id, from whichever side of the business it
 * belongs to. `populate` is applied per model so a field the parts twin does
 * not have (vehicle) is simply skipped rather than throwing.
 */
async function findDocument(type, id, populate = []) {
  const config = TYPES[type];
  if (!config) return null;
  for (const Model of [config.Model, config.altModel].filter(Boolean)) {
    let query = Model.findById(id);
    populate.forEach(({ path, select }) => {
      if (Model.schema.path(path)) query = query.populate(path, select);
    });
    const record = await query.lean();
    if (record) return { record, Model, isParts: Model === config.altModel };
  }
  return null;
}

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
 * "12,506" → "RUPEES TWELVE THOUSAND FIVE HUNDRED AND SIX ONLY" — the line
 * every printed tax document carries under its grand total.
 */
function amountInWords(value) {
  const number = Math.round(Math.abs(Number(value)));
  if (!Number.isFinite(number)) return '';
  if (number === 0) return 'RUPEES ZERO ONLY';
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  const below100 = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const below1000 = (n) => {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    return [hundred ? `${ones[hundred]} HUNDRED` : '', rest ? `${hundred ? 'AND ' : ''}${below100(rest)}` : '']
      .filter(Boolean).join(' ');
  };
  // Pakistani grouping: crore, lakh, thousand.
  const parts = [];
  const crore = Math.floor(number / 10000000);
  const lakh = Math.floor((number % 10000000) / 100000);
  const thousand = Math.floor((number % 100000) / 1000);
  const rest = number % 1000;
  if (crore) parts.push(`${below100(crore)} CRORE`);
  if (lakh) parts.push(`${below100(lakh)} LAKH`);
  if (thousand) parts.push(`${below100(thousand)} THOUSAND`);
  if (rest) parts.push(below1000(rest));
  return `RUPEES ${parts.join(' ')} ONLY`;
}

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
      // Parts documents store part-only lines, which carry no itemType — the
      // presence of a part reference is what identifies them.
      type: line.itemType || line.type || (line.part ? 'part' : ''),
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
  // Vehicles and parts print in separate sections — `{{#each vehicleItems}}`
  // and `{{#each partItems}}` let a template draw each group its own table,
  // like the Dealer Pro documents this ERP replaces.
  const withGroupMeta = (rows) => Object.assign(rows.slice(), {
    count: rows.length,
    totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    subtotal: rows.reduce((sum, row) => sum + row.totalPrice, 0),
    subtotalText: money(rows.reduce((sum, row) => sum + row.totalPrice, 0)),
  });
  const vehicleItems = withGroupMeta(itemRows.filter((row) => row.type !== 'part'));
  const partItems = withGroupMeta(itemRows.filter((row) => row.type === 'part'));
  return {
    // `{{#each items}}` iterates this; `{{items.table}}` prints the whole table.
    items: Object.assign(itemRows.slice(), {
      table: itemsTable,
      count: itemRows.length,
      totalQuantity: itemRows.reduce((sum, row) => sum + row.quantity, 0),
    }),
    lineItems: itemRows,
    vehicleItems,
    partItems,
    // Spreading the raw record first means any real schema field is reachable
    // as document.<field> even if it is not in the curated catalog below.
    document: {
      ...record,
      title: config.label || '',
      number: record[config.number] || '',
      date: record.createdAt,
      itemName: itemName(record),
      totalInWords: amountInWords(record.totalAmount),
    },
    // A walk-in sale is booked against the shared walk-in record, but the
    // document must print the buyer who actually stood at the counter.
    customer: {
      ...customer,
      ...(record.walkIn ? { phone: record.walkInPhone || customer.phone || '' } : {}),
      fullName: (record.walkIn && record.walkInName)
        || join(customer.firstName, customer.lastName) || customer.companyName || '',
      name: (record.walkIn && record.walkInName)
        || join(customer.firstName, customer.lastName) || customer.companyName || '',
    },
    vehicle: flattenVehicle(record.vehicle),
    generator: {
      ...generator,
      fullName: generator.fullName || join(generator.firstName, generator.lastName),
    },
    company: {
      name: extras.companyName || '',
      phone: '', address: '', city: '', ntn: '', email: '',
      ...(extras.company || {}),
    },
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
  ['{{#each vehicleItems}}…{{/each}}', 'Repeat per VEHICLE line only — same row fields as items'],
  ['{{#each partItems}}…{{/each}}', 'Repeat per PART line only — same row fields as items'],
  ['vehicleItems.count', 'Number of vehicle lines'],
  ['vehicleItems.subtotalText', 'Vehicles subtotal (formatted)'],
  ['partItems.count', 'Number of part lines'],
  ['partItems.subtotalText', 'Parts subtotal (formatted)'],
  ['document.totalInWords', 'Total amount in words'],
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
  ['company.phone', 'Company phone'],
  ['company.address', 'Company address'],
  ['company.city', 'Company city'],
  ['company.ntn', 'Company NTN / tax id'],
  ['company.email', 'Company email'],
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

/**
 * The letterhead block: the active ERP-settings company wins (it carries the
 * phone, address and NTN a printed document needs); branding only supplies a
 * fallback name.
 */
async function companyInfo() {
  const Company = mongoose.models.Company;
  const active = Company ? await Company.findOne({ isActive: true }).sort({ createdAt: 1 }).lean().catch(() => null) : null;
  const fallbackName = await companyName();
  return {
    name: active?.companyName || fallbackName,
    legalName: active?.legalName || '',
    phone: active?.phone || '',
    email: active?.email || '',
    address: active?.address || '',
    city: active?.city || '',
    ntn: active?.taxId || '',
    website: active?.website || '',
  };
}

module.exports = {
  TYPES, findDocument, buildDataBag, variableCatalog, companyName, companyInfo,
  flattenVehicle, buildItemRows, buildItemsTable, amountInWords,
};
