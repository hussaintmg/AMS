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
  const first = Array.isArray(record.items) ? record.items[0] : null;
  return first?.description || '';
}

/** Build the nested data object that {{tokens}} resolve against. */
function buildDataBag(type, record, extras = {}) {
  const config = TYPES[type] || {};
  const customer = record.customer && typeof record.customer === 'object' ? record.customer : {};
  const generator = record.createdBy && typeof record.createdBy === 'object' ? record.createdBy : {};
  return {
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
      list: (Array.isArray(record.items) ? record.items : []).map((i) => i.description).filter(Boolean).join(', '),
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
  ['item.name', 'Item name'],
  ['item.list', 'All items'],
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

module.exports = { TYPES, buildDataBag, variableCatalog, companyName, flattenVehicle };
