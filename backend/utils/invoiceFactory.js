/**
 * Invoice factory — builds invoices from other documents (sales orders,
 * job cards) so the "invoice ready" rule is enforced everywhere a sale
 * happens. Shared by sales, service and invoice controllers.
 */
const SalesOrder = require('../models/SalesOrder.model');
const Invoice = require('../models/Invoice.model');
const { nextDocNumber } = require('./docNumber');
const { recordCustomerActivity } = require('./customerSync');
const { currentAudit } = require('../services/imports/importDebugAudit');
const { applyInvoiceStock } = require('../services/stockLedger.service');
const logger = require('./logger');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function statusForPayment(totalAmount, paidAmount) {
  if (totalAmount > 0 && paidAmount >= totalAmount) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'draft';
}

/**
 * Create an invoice for a sales order (idempotent — returns the existing
 * active invoice if one was already generated for the order).
 */
async function createInvoiceForOrder(order, {
  dueDays = 30,
  userId = null,
  session = null,
  invoiceDate = null,
  externalInvoiceNumber = '',
  seller = null,
  sellerEmployee = null,
  salePerson = '',
  importKey = '',
} = {}) {
  let existingQuery = Invoice.findOne({ salesOrder: order._id, status: { $ne: 'cancelled' } });
  if (session) existingQuery = existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) {
    if (!order.invoice || String(order.invoice) !== String(existing._id)) {
      let linkQuery = SalesOrder.findByIdAndUpdate(order._id, { $set: { invoice: existing._id } }, { returnDocument: 'after' });
      if (session) linkQuery = linkQuery.session(session);
      await linkQuery;
    }
    return { invoice: existing, created: false };
  }

  // Every product on the order carries through to the invoice, keeping the
  // vehicle/part references so the invoice is what moves stock.
  const lineItems = (order.lineItems || []).map((line) => ({
    itemType: line.itemType,
    vehicle: line.vehicle || null,
    vehicleVariant: line.vehicleVariant || null,
    vehicleColor: line.vehicleColor || null,
    part: line.part || null,
    serviceType: line.serviceType || null,
    code: line.code || '',
    barcode: line.barcode || '',
    name: line.name || '',
    description: line.description || '',
    quantity: line.quantity || 1,
    unitPrice: line.unitPrice || 0,
    discountAmount: line.discountAmount || 0,
    taxAmount: line.taxAmount || 0,
    totalPrice: line.totalPrice || 0,
  }));

  const items = (lineItems.length ? lineItems : (order.items || [])).map((item) => ({
    description: item.description,
    quantity: item.quantity || 1,
    unitPrice: item.unitPrice || 0,
    taxAmount: item.taxAmount || 0,
    totalPrice: item.totalPrice || 0,
    type: item.itemType || item.type || order.saleType,
  }));

  const chargeLines = [
    ['Accessories', order.accessoriesTotal],
    ['Registration charges', order.registrationCharges],
    ['Insurance charges', order.insuranceCharges],
    ['Other charges', order.otherCharges],
  ];
  chargeLines.forEach(([description, value]) => {
    const amount = Number(value) || 0;
    if (amount > 0) {
      items.push({ description, quantity: 1, unitPrice: amount, taxAmount: 0, totalPrice: amount, type: 'charge' });
    }
  });

  const subtotal = round2(items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0));
  const discountAmount = round2((Number(order.discountAmount) || 0) + (Number(order.exchangeValue) || 0));
  const taxAmount = round2(Number(order.taxAmount) || 0);
  const totalAmount = round2(order.totalAmount != null ? order.totalAmount : subtotal - discountAmount + taxAmount);
  const paidAmount = round2(Number(order.paidAmount) || 0);
  const balanceAmount = round2(totalAmount - paidAmount);

  const invoiceNumber = await nextDocNumber(Invoice, 'invoiceNumber', 'INV', 6, { session });
  const now = invoiceDate || new Date();

  const resolvedSeller = seller || order.seller || null;
  const resolvedSellerEmployee = sellerEmployee || order.sellerEmployee || null;
  const resolvedSalePerson = String(salePerson || order.salePerson || '').trim();

  const invoiceDocument = {
    invoiceNumber,
    importKey,
    externalInvoiceNumber,
    invoiceType: order.saleType === 'parts' ? 'parts' : 'sales',
    salesOrder: order._id,
    customer: order.customer,
    // A counter sale carries its buyer through to the invoice; without this the
    // printed invoice would name the shared walk-in record instead.
    walkIn: order.walkIn === true,
    walkInName: order.walkInName || '',
    walkInPhone: order.walkInPhone || '',
    seller: resolvedSeller,
    sellerEmployee: resolvedSellerEmployee,
    salePerson: resolvedSalePerson,
    status: statusForPayment(totalAmount, paidAmount),
    invoiceDate: now,
    dueDate: new Date(now.getTime() + (Number(dueDays) || 30) * 24 * 60 * 60 * 1000),
    subtotal,
    taxAmount,
    discountAmount,
    totalAmount,
    paidAmount,
    balanceAmount,
    items,
    lineItems,
    notes: order.exchangeVehicleDetails ? `Trade-in: ${order.exchangeVehicleDetails}` : '',
    createdBy: userId,
  };
  const invoice = session
    ? (await Invoice.create([invoiceDocument], { session }))[0]
    : await Invoice.create(invoiceDocument);

  // The invoice is the point of sale: parts leave stock and vehicles become
  // sold here, exactly once (guarded by Invoice.stockApplied).
  try {
    const result = await applyInvoiceStock(invoice, { userId, session });
    if (result.applied) {
      invoice.stockApplied = true;
      invoice.stockAppliedAt = new Date();
      await invoice.save({ session });
    }
  } catch (stockError) {
    // Nothing was consumed if this threw, so the invoice must not stand either.
    await Invoice.deleteOne({ _id: invoice._id }).session(session || null);
    throw stockError;
  }
  let linkQuery = SalesOrder.findByIdAndUpdate(order._id, { $set: { invoice: invoice._id } }, { returnDocument: 'after' });
  if (session) linkQuery = linkQuery.session(session);
  await linkQuery;

  await recordCustomerActivity({
    customerId: order.customer,
    docType: 'invoice',
    docId: invoice._id,
    number: invoiceNumber,
    amount: totalAmount,
    description: `Invoice ${invoiceNumber} for sales order ${order.orderNumber}`,
    userId,
    outstandingDelta: balanceAmount,
    session,
  });

  // One line per invoice is useful for a single sale and unreadable for a 1,300-row
  // import, where the batch result already reports how many invoices were created.
  if (!currentAudit()) {
    logger.info(`Invoice ${invoiceNumber} generated for sales order ${order.orderNumber}`);
  }
  return { invoice, created: true };
}

/**
 * Create a service invoice for a completed job card (idempotent).
 */
async function createInvoiceForJobCard(jobCard, { dueDays = 30, userId = null } = {}) {
  const existing = await Invoice.findOne({ jobCard: jobCard._id, status: { $ne: 'cancelled' } });
  if (existing) return { invoice: existing, created: false };

  const items = [];
  (jobCard.services || []).forEach((service) => {
    items.push({
      description: service.description || 'Labor',
      quantity: 1,
      unitPrice: Number(service.total) || 0,
      taxAmount: 0,
      totalPrice: Number(service.total) || 0,
      type: 'service',
    });
  });
  (jobCard.parts || []).forEach((part) => {
    if (part.isWarranty) return;
    items.push({
      description: `${part.name || 'Part'}${part.partCode ? ` (${part.partCode})` : ''}`,
      quantity: Number(part.quantity) || 1,
      unitPrice: Number(part.unitPrice) || 0,
      taxAmount: 0,
      totalPrice: Number(part.totalPrice) || 0,
      type: 'parts',
    });
  });

  const subtotal = round2(items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0));
  const discountAmount = round2(Number(jobCard.discount) || 0);
  const taxAmount = round2(Number(jobCard.taxAmount) || 0);
  const totalAmount = round2(subtotal - discountAmount + taxAmount);

  const invoiceNumber = await nextDocNumber(Invoice, 'invoiceNumber', 'INV');
  const now = new Date();

  const invoice = await Invoice.create({
    invoiceNumber,
    invoiceType: 'service',
    jobCard: jobCard._id,
    customer: jobCard.customer,
    status: 'draft',
    invoiceDate: now,
    dueDate: new Date(now.getTime() + (Number(dueDays) || 30) * 24 * 60 * 60 * 1000),
    subtotal,
    taxAmount,
    discountAmount,
    totalAmount,
    paidAmount: 0,
    balanceAmount: totalAmount,
    items,
    notes: `Service job card ${jobCard.jobCardNumber}`,
    createdBy: userId,
  });

  await recordCustomerActivity({
    customerId: jobCard.customer,
    docType: 'invoice',
    docId: invoice._id,
    number: invoiceNumber,
    amount: totalAmount,
    description: `Service invoice ${invoiceNumber} for job card ${jobCard.jobCardNumber}`,
    userId,
    outstandingDelta: totalAmount,
  });

  logger.info(`Service invoice ${invoiceNumber} generated for job card ${jobCard.jobCardNumber}`);
  return { invoice, created: true };
}

module.exports = { createInvoiceForOrder, createInvoiceForJobCard, statusForPayment, round2 };
