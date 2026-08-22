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
const { CustomQuotation, CustomBooking, CustomInvoice } = require('../models/CustomDocument.model');
// `extraModels`: the custom (free-text) documents print as ordinary
// quotations / bookings / invoices — same templates, same variables.
const TYPES = {
  quotation: { label: 'Quotation', Model: Quotation, altModel: PartQuotation, extraModels: [CustomQuotation], number: 'quotationNumber' },
  booking: { label: 'Booking', Model: Booking, altModel: PartBooking, extraModels: [CustomBooking], number: 'bookingNumber' },
  order: { label: 'Sales Order', Model: SalesOrder, altModel: PartSalesOrder, number: 'orderNumber' },
  invoice: { label: 'Invoice', Model: Invoice, altModel: PartInvoice, extraModels: [CustomInvoice], number: 'invoiceNumber' },
};

/**
 * Load one document of `type` by id, from whichever side of the business it
 * belongs to. `populate` is applied per model so a field the parts twin does
 * not have (vehicle) is simply skipped rather than throwing.
 */
async function findDocument(type, id, populate = []) {
  const config = TYPES[type];
  if (!config) return null;
  for (const Model of [config.Model, config.altModel, ...(config.extraModels || [])].filter(Boolean)) {
    let query = Model.findById(id);
    populate.forEach(({ path, select }) => {
      if (Model.schema.path(path)) query = query.populate(path, select);
    });
    const record = await query.lean();
    if (record) return { record, Model, isParts: Model === config.altModel, isCustom: (config.extraModels || []).includes(Model) };
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

// Always two decimals. Left to its own devices toLocaleString prints 1250.5
// for a price of 1250.50 and 1250 for 1250.00, so the same column on one
// printed invoice showed some prices with paisa and some without.
const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? `PKR ${number.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';
};

/**
 * "12,506" → "RUPEES TWELVE THOUSAND FIVE HUNDRED AND SIX ONLY" — the line
 * every printed tax document carries under its grand total.
 */
function amountInWords(value) {
  const total = Math.abs(Number(value));
  if (!Number.isFinite(total)) return '';
  const number = Math.floor(total);
  // Prices carry paisa now, and rounding them away made the words disagree
  // with the figure printed directly above them.
  const paisa = Math.round((total - number) * 100);
  if (number === 0 && !paisa) return 'RUPEES ZERO ONLY';
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
  const rupees = parts.length ? parts.join(' ') : 'ZERO';
  return paisa
    ? `RUPEES ${rupees} AND ${below100(paisa)} PAISA ONLY`
    : `RUPEES ${rupees} ONLY`;
}

/**
 * Every sellable line as a flat row, for `{{#each items}}` in a template.
 * Falls back to the legacy single-line `items[]` so templates written before
 * multi-product documents still print the same rows.
 */
function buildItemRows(record, { isCustom = false } = {}) {
  const source = Array.isArray(record.lineItems) && record.lineItems.length
    ? record.lineItems
    : (Array.isArray(record.items) ? record.items : []);
  // Service charges print as their own rows under the products, type
  // 'service', so `{{#each items}}` and `{{items.table}}` show the whole bill.
  const services = (Array.isArray(record.serviceCharges) ? record.serviceCharges : []).map((row) => ({
    itemType: 'service',
    code: '',
    barcode: '',
    name: row.name || 'Service charge',
    description: [row.name, row.description].filter(Boolean).join(' — '),
    // The typed note on its own, so the service-charges table can show it in
    // its own column instead of repeating the service name.
    note: row.description || '',
    quantity: Number(row.quantity) || 1,
    unitPrice: Number(row.amount) || 0,
    discountAmount: 0,
    taxAmount: Number(row.taxAmount) || 0,
    totalPrice: Number(row.total) || 0,
  }));
  // A custom document's lines are free text — no part, no vehicle, no chassis
  // number. Marking them here is what keeps them out of the "Vehicles" table
  // they used to be printed in for want of anywhere else to put them.
  const typed = source.map((line) => (isCustom && !line.part && !line.itemType ? { ...line, itemType: 'custom' } : line));
  return [...typed, ...services].map((line, index) => {
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
      note: line.note || '',
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
  const itemRows = buildItemRows(record, { isCustom: extras.isCustom === true });
  const itemsTable = buildItemsTable(itemRows);
  // Vehicles and parts print in separate sections — `{{#each vehicleItems}}`
  // and `{{#each partItems}}` let a template draw each group its own table,
  // like the Dealer Pro documents this ERP replaces.
  // Each group counts from 1: the first service charge on a document reads "1",
  // not "2" because a part happened to be listed above it. `index` keeps the
  // document-wide position for templates that want it.
  const withGroupMeta = (rows) => Object.assign(
    rows.map((row, position) => ({ ...row, number: position + 1 })),
    {
      count: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      subtotal: rows.reduce((sum, row) => sum + row.totalPrice, 0),
      subtotalText: money(rows.reduce((sum, row) => sum + row.totalPrice, 0)),
    },
  );
  const vehicleItems = withGroupMeta(itemRows.filter((row) => !['part', 'service', 'custom'].includes(row.type)));
  const partItems = withGroupMeta(itemRows.filter((row) => row.type === 'part'));
  // `{{#each serviceItems}}` prints the service charges block on its own.
  const serviceItems = withGroupMeta(itemRows.filter((row) => row.type === 'service'));
  // Free-text lines from a custom document: their own "Items" table, because
  // they are neither a vehicle with a chassis number nor a part with a code.
  const otherItems = withGroupMeta(itemRows.filter((row) => row.type === 'custom'));
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
    serviceItems,
    otherItems,
    // Spreading the raw record first means any real schema field is reachable
    // as document.<field> even if it is not in the curated catalog below.
    document: {
      ...record,
      title: config.label || '',
      number: record[config.number] || '',
      date: record.createdAt,
      itemName: itemName(record),
      totalInWords: amountInWords(record.totalAmount),
      // Paid vs credit, spelled out for the printed page. A credit invoice
      // prints like any other, marked CREDIT with its balance due and date.
      paymentTermLabel: record.paymentTerm === 'credit' ? 'CREDIT' : 'PAID',
      isCredit: record.paymentTerm === 'credit',
      creditDueDate: record.creditDueDate || null,
      creditStatusLabel: record.paymentTerm === 'credit' ? String(record.creditStatus || 'open').toUpperCase() : '',
      creditBand: record.paymentTerm === 'credit'
        ? `CREDIT INVOICE — Balance due ${Number(record.balanceAmount || 0).toLocaleString('en-PK')}${record.creditDueDate ? ` by ${new Date(record.creditDueDate).toLocaleDateString('en-GB')}` : ''}`
        : '',
    },
    // A walk-in sale is booked against the shared walk-in record, but the
    // document must print the buyer who actually stood at the counter.
    customer: {
      ...customer,
      ...(record.walkIn ? { phone: record.walkInPhone || customer.phone || '' } : {}),
      // The customer's email as their record holds it.
      //
      // `extras.customerEmail` is the caller's already-resolved answer, which
      // can see further than this function can — it may have recovered a real
      // address from the lead the customer was converted from when their own
      // record only carries the one the import invented. Absent that, the
      // record's own value prints.
      //
      // A walk-in is the one exception: that sale is booked against the shared
      // walk-in record, whose email would belong to nobody in particular.
      email: record.walkIn ? '' : (extras.customerEmail || customer.email || ''),
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
  ['{{#each serviceItems}}…{{/each}}', 'Repeat per SERVICE CHARGE line only — same row fields as items'],
  ['{{#each otherItems}}…{{/each}}', 'Repeat per free-text (custom document) line only'],
  ['vehicleItems.count', 'Number of vehicle lines'],
  ['vehicleItems.subtotalText', 'Vehicles subtotal (formatted)'],
  ['partItems.count', 'Number of part lines'],
  ['partItems.subtotalText', 'Parts subtotal (formatted)'],
  ['serviceItems.count', 'Number of service-charge lines'],
  ['serviceItems.subtotalText', 'Service charges subtotal (formatted)'],
  ['otherItems.count', 'Number of free-text lines'],
  ['otherItems.subtotalText', 'Free-text lines subtotal (formatted)'],
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
    ['document.paymentTermLabel', 'Payment terms (PAID / CREDIT)'],
    ['document.creditDueDate', 'Credit due date'],
    ['document.creditStatusLabel', 'Credit status'],
    ['document.creditBand', 'Credit band ("CREDIT INVOICE — Balance due …")'],
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
