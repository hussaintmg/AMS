/**
 * Custom quotations, bookings and invoices — free-text documents for anything
 * that is neither a vehicle nor a part. See models/CustomDocument.model.js.
 *
 * One controller, three kinds. Every handler is built from `KINDS[kind]`, so
 * the three screens behave the same way and a rule fixed once is fixed for all
 * of them. Nothing here touches stock: a custom line is a description and a
 * price, never a part or a vehicle.
 *
 * Flow: quotation → (approve) → booking → (convert) → invoice, or straight to
 * an invoice. A custom invoice is paid at the counter or issued on credit
 * (models/paymentTerm.fields.js), exactly like the other invoices.
 */
const mongoose = require('mongoose');
const { CustomQuotation, CustomBooking, CustomInvoice, Customer, Payment, PaymentMethod } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { nextDocNumber } = require('../utils/docNumber');
const { allowedOwnerIds, canDo } = require('../utils/roleJobs');
const { parseServiceCharges, serviceChargeSummary } = require('../models/serviceCharges.fields');
const { invoiceSummary } = require('../models/paymentTerm.fields');
const { resolveDocumentCustomer } = require('../utils/walkInCustomer');
const { resolvePaymentMethod } = require('../utils/paymentMethod.util');
const { sendCustomerDocumentEmail } = require('../services/documentEmail.service');
const logger = require('../utils/logger');

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const round2 = (value) => Math.round(num(value) * 100) / 100;
const sanitizeId = (value) => (mongoose.Types.ObjectId.isValid(value) ? value : null);
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const KINDS = {
  quotations: { Model: CustomQuotation, page: 'custom_quotations', numberField: 'quotationNumber', prefix: 'CQT', label: 'Custom quotation', pdfType: 'quotation' },
  bookings: { Model: CustomBooking, page: 'custom_bookings', numberField: 'bookingNumber', prefix: 'CBK', label: 'Custom booking', pdfType: 'booking' },
  invoices: { Model: CustomInvoice, page: 'custom_invoices', numberField: 'invoiceNumber', prefix: 'CINV', label: 'Custom invoice', pdfType: 'invoice' },
};
const kindOf = (req) => {
  const kind = KINDS[req.params.kind];
  if (!kind) throw new AppError('Unknown custom document type', 404);
  return kind;
};

// ── Lines & totals ────────────────────────────────────────────────────────

function resolveLines(body = {}) {
  const raw = Array.isArray(body.lineItems) ? body.lineItems : (Array.isArray(body.items) ? body.items : []);
  const lines = raw
    .filter((line) => line && String(line.description || line.name || '').trim())
    .map((line) => {
      const quantity = Math.max(0, num(line.quantity, 1));
      const unitPrice = round2(num(line.unitPrice ?? line.unit_price ?? line.price));
      const discountAmount = round2(num(line.discountAmount ?? line.discount_amount));
      const net = round2(quantity * unitPrice - discountAmount);
      const taxPercent = Math.max(0, num(line.taxPercent ?? line.tax_percent));
      const taxAmount = line.taxAmount != null && line.taxAmount !== '' ? round2(num(line.taxAmount)) : round2(net * taxPercent / 100);
      return {
        description: String(line.description || line.name).trim(),
        unit: String(line.unit || '').trim(),
        quantity, unitPrice, discountAmount, taxPercent, taxAmount,
        totalPrice: round2(net + taxAmount),
      };
    });
  if (!lines.length) throw new AppError('Add at least one line', 400);
  return lines;
}

function documentTotals(body, lines) {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
  const lineDiscount = round2(lines.reduce((sum, line) => sum + line.discountAmount, 0));
  const lineTax = round2(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const discountAmount = round2(num(body.discountAmount) + lineDiscount);
  const taxAmount = round2(num(body.taxAmount) + lineTax);
  const additionalCharges = round2(num(body.additionalCharges) || num(body.otherCharges));
  const service = parseServiceCharges(body);
  const totalAmount = round2(subtotal - discountAmount + taxAmount + additionalCharges + service.grand);
  if (totalAmount < 0) throw new AppError('Discount cannot exceed the value of the lines', 400);
  return {
    subtotal, discountAmount, taxAmount, additionalCharges, totalAmount,
    hasServiceCharges: service.rows.length > 0,
    serviceCharges: service.rows,
    serviceChargesTotal: service.serviceChargesTotal,
    serviceTaxTotal: service.serviceTaxTotal,
  };
}

async function requireCustomer(customerId) {
  if (!sanitizeId(customerId)) throw new AppError('Customer is required', 400);
  const customer = await Customer.findOne({ _id: customerId, deletedAt: null }).lean();
  if (!customer) throw new AppError('Customer not found', 404);
  return customer;
}

// ── Mapping (snake_case, the shape the sales screens already read) ────────

const customerName = (customer) => (customer ? ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.companyName || '') : '');
const buyerName = (doc) => (doc.walkIn && doc.walkInName ? doc.walkInName : customerName(doc.customer));
const mapLine = (line) => ({
  id: line._id, description: line.description, name: line.description, unit: line.unit || '',
  quantity: line.quantity, unit_price: line.unitPrice, discount_amount: line.discountAmount,
  tax_percent: line.taxPercent, tax_amount: line.taxAmount, total_price: line.totalPrice, item_type: 'custom',
});
const commonFields = (doc) => ({
  id: doc._id,
  customer_id: doc.customer?._id || doc.customer || null,
  customer_name: buyerName(doc),
  customer_phone: doc.walkIn ? (doc.walkInPhone || '') : (doc.customer?.phone || ''),
  customer_email: doc.walkIn ? '' : (doc.customer?.email || ''),
  walk_in: doc.walkIn === true,
  walk_in_name: doc.walkInName || '',
  walk_in_phone: doc.walkInPhone || '',
  title: doc.title || '',
  sale_type: 'custom',
  line_items: (doc.lineItems || []).map(mapLine),
  items: (doc.lineItems || []).map(mapLine),
  item_count: (doc.lineItems || []).length,
  item_name: (doc.lineItems || []).map((line) => line.description).filter(Boolean).slice(0, 3).join(', '),
  subtotal: doc.subtotal || 0,
  discount_amount: doc.discountAmount || 0,
  tax_amount: doc.taxAmount || 0,
  additional_charges: doc.additionalCharges || 0,
  total_amount: doc.totalAmount || 0,
  ...serviceChargeSummary(doc),
  notes: doc.notes || '',
  terms_and_conditions: doc.termsAndConditions || '',
  sale_person: doc.salePerson || '',
  seller_id: doc.seller || null,
  status: doc.status,
  created_by: doc.createdBy || null,
  created_at: doc.createdAt,
  updated_at: doc.updatedAt,
});
const mapQuotation = (q) => ({
  ...commonFields(q),
  quotation_number: q.quotationNumber,
  approval_status: q.approvalStatus || 'pending',
  approved_at: q.approvedAt || null,
  approval_notes: q.approvalNotes || '',
  validity_days: q.validityDays,
  valid_until: q.validUntil,
  converted_booking_id: q.convertedBooking || null,
  converted_invoice_id: q.convertedInvoice || null,
});
const mapBooking = (b) => ({
  ...commonFields(b),
  booking_number: b.bookingNumber,
  quotation_id: b.quotation || null,
  priority: b.priority || 'normal',
  booking_amount: b.bookingAmount || 0,
  paid_amount: b.paidAmount || 0,
  balance_amount: b.balanceAmount || 0,
  booking_date: b.bookingDate,
  expected_delivery_date: b.expectedDeliveryDate || null,
  invoice_id: b.convertedInvoice || null,
});
const mapInvoice = (inv) => ({
  ...commonFields(inv),
  invoice_number: inv.invoiceNumber,
  invoice_type: 'custom',
  quotation_id: inv.quotation || null,
  booking_id: inv.booking || null,
  invoice_date: inv.invoiceDate,
  due_date: inv.dueDate,
  paid_amount: inv.paidAmount || 0,
  balance_amount: inv.balanceAmount || 0,
  payment_term: inv.paymentTerm || 'paid',
  credit_due_date: inv.creditDueDate || null,
  credit_status: inv.paymentTerm === 'credit' ? (inv.creditStatus || 'open') : null,
  amount_tendered: inv.amountTendered || 0,
  change_due: inv.changeDue || 0,
  payment_method_id: inv.paymentMethod || null,
  payment_method_name: inv.paymentMode || '',
});
const MAPPERS = { quotations: mapQuotation, bookings: mapBooking, invoices: mapInvoice };
const POPULATE = { path: 'customer', select: 'firstName lastName companyName phone email customerCode' };

// ── List / read ───────────────────────────────────────────────────────────

const list = async (req, res, next) => {
  try {
    const kind = kindOf(req);
    const { status, customerId, search, dateFrom, dateTo, sortBy = 'created_at', sortOrder = 'DESC', page = 1, limit = 20 } = req.query;
    const filter = { status: { $ne: 'cancelled' } };
    const ownerIds = await allowedOwnerIds(req.user, kind.page);
    if (ownerIds !== null) filter.createdBy = { $in: ownerIds };
    if (status) filter.status = status;
    if (req.query.paymentTerm === 'credit') filter.paymentTerm = 'credit';
    else if (req.query.paymentTerm === 'paid') filter.paymentTerm = { $ne: 'credit' };
    if (sanitizeId(customerId)) filter.customer = customerId;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); filter.createdAt.$lte = end; }
    }
    if (search) {
      const regex = new RegExp(String(search).trim().split(/\s+/).map(escapeRegex).join('|'), 'i');
      const customers = await Customer.find({ $or: [{ firstName: regex }, { lastName: regex }, { companyName: regex }, { phone: regex }] }).select('_id').lean();
      filter.$or = [{ [kind.numberField]: regex }, { title: regex }, { walkInName: regex }, { 'lineItems.description': regex }, { customer: { $in: customers.map((c) => c._id) } }];
    }
    const sortMap = { created_at: 'createdAt', total_amount: 'totalAmount', status: 'status', number: kind.numberField };
    const sortField = sortMap[sortBy] || 'createdAt';
    const skip = (Math.max(1, num(page, 1)) - 1) * Math.max(1, num(limit, 20));
    const [rows, total] = await Promise.all([
      kind.Model.find(filter).populate(POPULATE).sort({ [sortField]: String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1 }).skip(skip).limit(Math.max(1, num(limit, 20))).lean(),
      kind.Model.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows.map(MAPPERS[req.params.kind]), pagination: { page: num(page, 1), limit: num(limit, 20), total, totalPages: Math.ceil(total / Math.max(1, num(limit, 20))) } });
  } catch (error) { next(error); }
};

const getOne = async (req, res, next) => {
  try {
    const kind = kindOf(req);
    const doc = await kind.Model.findById(sanitizeId(req.params.id)).populate(POPULATE).lean();
    if (!doc) throw new AppError(`${kind.label} not found`, 404);
    const data = MAPPERS[req.params.kind](doc);
    if (req.params.kind === 'invoices') {
      const payments = await Payment.find({ invoice: doc._id }).sort({ paymentDate: -1 }).lean();
      data.payments = payments.map((p) => ({ id: p._id, amount: p.amount, date: p.paymentDate, method: p.method?.name || '', reference: p.referenceNumber || '', notes: p.notes || '' }));
    }
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

const summary = async (req, res, next) => {
  try {
    const kind = kindOf(req);
    const ownerIds = await allowedOwnerIds(req.user, kind.page);
    const match = { status: { $ne: 'cancelled' } };
    if (ownerIds !== null) match.createdBy = { $in: ownerIds.map((id) => new mongoose.Types.ObjectId(id)) };
    if (req.params.kind === 'invoices') return res.json({ success: true, data: await invoiceSummary(CustomInvoice, match) });
    const [row] = await kind.Model.aggregate([
      { $match: match },
      { $group: {
        _id: null, total: { $sum: 1 }, totalAmount: { $sum: '$totalAmount' },
        draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
        converted: { $sum: { $cond: [{ $in: ['$status', ['converted', 'completed']] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'approved'] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $and: [{ $lt: ['$validUntil', new Date()] }, { $not: [{ $in: ['$status', ['converted', 'cancelled']] }] }] }, 1, 0] } },
      } },
    ]);
    return res.json({ success: true, data: row || { total: 0, totalAmount: 0, draft: 0, pending: 0, sent: 0, confirmed: 0, converted: 0, approved: 0, expired: 0 } });
  } catch (error) { return next(error); }
};

// ── Create / update / delete ──────────────────────────────────────────────

const salePersonOf = (user) => [user.firstName, user.lastName].filter(Boolean).join(' ');

const create = async (req, res, next) => {
  try {
    const kind = kindOf(req);
    const lines = resolveLines(req.body);
    const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(req.body, requireCustomer);
    const totals = documentTotals(req.body, lines);
    const number = await nextDocNumber(kind.Model, kind.numberField, kind.prefix);
    const base = {
      [kind.numberField]: number,
      customer: customer._id, walkIn, walkInName, walkInPhone,
      title: String(req.body.title || '').trim(),
      lineItems: lines,
      ...totals,
      notes: req.body.notes || '',
      termsAndConditions: req.body.termsAndConditions || '',
      salePerson: salePersonOf(req.user),
      seller: req.user.id,
      createdBy: req.user.id,
    };
    let doc;
    if (req.params.kind === 'quotations') {
      const validity = Math.max(1, num(req.body.validityDays, 7));
      doc = await CustomQuotation.create({ ...base, status: 'draft', validityDays: validity, validUntil: new Date(Date.now() + validity * 864e5) });
    } else if (req.params.kind === 'bookings') {
      const bookingAmount = round2(num(req.body.bookingAmount));
      if (bookingAmount > totals.totalAmount) throw new AppError('Booking amount cannot exceed the total', 400);
      doc = await CustomBooking.create({
        ...base, status: 'pending', priority: req.body.priority || 'normal',
        quotation: sanitizeId(req.body.quotationId),
        bookingAmount, paidAmount: bookingAmount, balanceAmount: round2(totals.totalAmount - bookingAmount),
        expectedDeliveryDate: req.body.expectedDeliveryDate ? new Date(req.body.expectedDeliveryDate) : null,
      });
    } else {
      doc = await createInvoiceRecord({ base, totals, body: req.body, user: req.user });
    }
    logger.info(`${kind.label} ${number} created by user ${req.user.id}`);
    res.status(201).json({ success: true, data: MAPPERS[req.params.kind](await kind.Model.findById(doc._id).populate(POPULATE).lean()), message: `${kind.label} ${number} created` });
  } catch (error) { next(error); }
};

/** Paid at the counter or issued on credit — the same rule as every invoice. */
async function createInvoiceRecord({ base, totals, body, user }) {
  const isCredit = String(body.paymentTerm || 'paid').toLowerCase() === 'credit';
  const paymentMethod = await resolvePaymentMethod(body.paymentMethodId, { required: !isCredit });
  const tendered = isCredit ? 0 : round2(num(body.paidAmount));
  if (!isCredit && tendered + 0.009 < totals.totalAmount) throw new AppError('A paid invoice needs the full amount; switch to Credit to issue it unpaid', 400);
  const changeDue = isCredit ? 0 : round2(Math.max(0, tendered - totals.totalAmount));
  const paidAmount = isCredit ? 0 : totals.totalAmount;
  const now = new Date();
  const dueDate = new Date(now.getTime() + Math.max(0, num(body.dueDays, 30)) * 864e5);
  const creditDueDate = isCredit ? (body.creditDueDate ? new Date(body.creditDueDate) : dueDate) : null;
  if (isCredit && Number.isNaN(creditDueDate.getTime())) throw new AppError('Credit due date is invalid', 400);
  const invoice = await CustomInvoice.create({
    ...base,
    quotation: sanitizeId(body.quotationId), booking: sanitizeId(body.bookingId),
    status: isCredit ? 'sent' : 'paid', invoiceDate: now, dueDate: isCredit ? creditDueDate : dueDate,
    paidAmount, balanceAmount: round2(totals.totalAmount - paidAmount),
    paymentTerm: isCredit ? 'credit' : 'paid', creditDueDate,
    amountTendered: changeDue > 0 ? tendered : 0, changeDue,
    paymentMethod: paymentMethod.id, paymentMode: paymentMethod.name,
  });
  if (!isCredit) {
    await Payment.create({
      paymentNumber: await nextDocNumber(Payment, 'paymentNumber', 'PAY'),
      invoice: invoice._id, customer: base.customer,
      methodRef: paymentMethod.id, method: { name: paymentMethod.name, code: paymentMethod.code, type: paymentMethod.type },
      amount: totals.totalAmount, paymentDate: now, notes: `Payment in full with custom invoice ${base.invoiceNumber}`, status: 'completed', createdBy: user.id,
    });
  }
  return invoice;
}

const update = async (req, res, next) => {
  try {
    const kind = kindOf(req);
    const doc = await kind.Model.findById(sanitizeId(req.params.id));
    if (!doc) throw new AppError(`${kind.label} not found`, 404);
    if (['cancelled', 'converted', 'completed', 'paid'].includes(doc.status)) throw new AppError(`A ${doc.status} ${kind.label.toLowerCase()} cannot be edited`, 400);
    if (req.body.lineItems || req.body.items) {
      const lines = resolveLines(req.body);
      const totals = documentTotals(req.body, lines);
      Object.assign(doc, { lineItems: lines, ...totals });
      if (req.params.kind === 'bookings') doc.balanceAmount = round2(doc.totalAmount - num(doc.paidAmount));
      if (req.params.kind === 'invoices') doc.balanceAmount = round2(doc.totalAmount - num(doc.paidAmount));
    }
    if (req.body.customerId !== undefined || req.body.walkIn !== undefined) {
      const resolved = await resolveDocumentCustomer(req.body, requireCustomer);
      Object.assign(doc, { customer: resolved.customer._id, walkIn: resolved.walkIn, walkInName: resolved.walkInName, walkInPhone: resolved.walkInPhone });
    }
    ['title', 'notes', 'termsAndConditions', 'priority'].forEach((field) => { if (req.body[field] !== undefined) doc[field] = req.body[field]; });
    if (req.body.status && !['cancelled', 'converted', 'completed'].includes(req.body.status)) doc.status = req.body.status;
    if (req.params.kind === 'quotations' && req.body.validityDays !== undefined) {
      doc.validityDays = Math.max(1, num(req.body.validityDays, doc.validityDays || 7));
      doc.validUntil = new Date(doc.createdAt.getTime() + doc.validityDays * 864e5);
    }
    if (req.params.kind === 'bookings' && req.body.expectedDeliveryDate !== undefined) doc.expectedDeliveryDate = req.body.expectedDeliveryDate ? new Date(req.body.expectedDeliveryDate) : null;
    if (req.params.kind === 'invoices' && req.body.paymentTerm !== undefined && canDo(req.user, 'custom_invoices', 'changePaymentTerm')) {
      doc.paymentTerm = req.body.paymentTerm === 'credit' ? 'credit' : 'paid';
      if (req.body.creditDueDate) doc.creditDueDate = new Date(req.body.creditDueDate);
    }
    doc.updatedBy = req.user.id;
    await doc.save();
    res.json({ success: true, data: MAPPERS[req.params.kind](await kind.Model.findById(doc._id).populate(POPULATE).lean()), message: `${kind.label} updated` });
  } catch (error) { next(error); }
};

const updateStatus = async (req, res, next) => {
  try {
    const kind = kindOf(req);
    const doc = await kind.Model.findById(sanitizeId(req.params.id));
    if (!doc) throw new AppError(`${kind.label} not found`, 404);
    const status = String(req.body.status || '').trim();
    if (!status) throw new AppError('Status is required', 400);
    doc.status = status;
    if (status === 'cancelled') doc.cancelledAt = new Date();
    doc.updatedBy = req.user.id;
    await doc.save();
    res.json({ success: true, message: 'Status updated', data: { id: doc._id, status: doc.status } });
  } catch (error) { next(error); }
};

const remove = async (req, res, next) => {
  try {
    const kind = kindOf(req);
    const doc = await kind.Model.findById(sanitizeId(req.params.id));
    if (!doc) throw new AppError(`${kind.label} not found`, 404);
    // Documents with money against them are cancelled, not erased.
    if (req.params.kind === 'invoices' && num(doc.paidAmount) > 0) {
      doc.status = 'cancelled'; doc.cancelledAt = new Date(); doc.updatedBy = req.user.id; await doc.save();
      return res.json({ success: true, message: 'Invoice cancelled' });
    }
    await kind.Model.deleteOne({ _id: doc._id });
    return res.json({ success: true, message: `${kind.label} deleted` });
  } catch (error) { return next(error); }
};

// ── Approve / convert / payments ──────────────────────────────────────────

const approve = async (req, res, next) => {
  try {
    if (req.params.kind !== 'quotations') throw new AppError('Only quotations are approved', 400);
    const doc = await CustomQuotation.findById(sanitizeId(req.params.id));
    if (!doc) throw new AppError('Custom quotation not found', 404);
    const decision = req.body.decision === 'rejected' ? 'rejected' : 'approved';
    doc.approvalStatus = decision; doc.approvedBy = req.user.id; doc.approvedAt = new Date(); doc.approvalNotes = req.body.notes || '';
    if (decision === 'approved' && doc.status === 'draft') doc.status = 'sent';
    if (decision === 'rejected') doc.status = 'rejected';
    doc.updatedBy = req.user.id;
    await doc.save();
    res.json({ success: true, message: `Quotation ${decision}`, data: mapQuotation(await CustomQuotation.findById(doc._id).populate(POPULATE).lean()) });
  } catch (error) { next(error); }
};

/**
 * quotation → booking (default) or → invoice (`?to=invoice`);
 * booking → invoice. The source's lines, customer and service charges carry
 * over untouched, so a conversion can never quietly change the deal.
 */
const convert = async (req, res, next) => {
  try {
    const kind = kindOf(req);
    if (req.params.kind === 'invoices') throw new AppError('An invoice is the end of the line', 400);
    const source = await kind.Model.findById(sanitizeId(req.params.id)).lean();
    if (!source) throw new AppError(`${kind.label} not found`, 404);
    if (source.status === 'cancelled') throw new AppError('Cancelled documents cannot be converted', 400);
    if (req.params.kind === 'quotations' && source.approvalStatus !== 'approved') throw new AppError('Approve the quotation before converting it', 400);
    if (source.convertedInvoice) throw new AppError('Already converted', 400);
    const target = req.params.kind === 'bookings' ? 'invoice' : (req.body.to === 'invoice' || req.query.to === 'invoice' ? 'invoice' : 'booking');

    const body = {
      ...req.body,
      customerId: source.customer ? String(source.customer) : undefined,
      walkIn: source.walkIn, walkInName: source.walkInName, walkInPhone: source.walkInPhone,
      title: source.title,
      lineItems: (source.lineItems || []).map((line) => ({ description: line.description, unit: line.unit, quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: line.discountAmount, taxPercent: line.taxPercent, taxAmount: line.taxAmount })),
      discountAmount: 0, taxAmount: 0, additionalCharges: source.additionalCharges,
      hasServiceCharges: source.hasServiceCharges === true,
      serviceCharges: (source.serviceCharges || []).map((row) => ({ serviceTypeId: row.serviceType ? String(row.serviceType) : null, name: row.name, description: row.description, quantity: row.quantity, amount: row.amount, taxPercent: row.taxPercent })),
      notes: req.body.notes || source.notes, termsAndConditions: source.termsAndConditions,
    };
    const lines = resolveLines(body);
    const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(body, requireCustomer);
    const totals = documentTotals(body, lines);
    const targetKind = target === 'invoice' ? KINDS.invoices : KINDS.bookings;
    const number = await nextDocNumber(targetKind.Model, targetKind.numberField, targetKind.prefix);
    const base = {
      [targetKind.numberField]: number,
      customer: customer._id, walkIn, walkInName, walkInPhone, title: source.title, lineItems: lines, ...totals,
      notes: body.notes || '', termsAndConditions: body.termsAndConditions || '',
      salePerson: salePersonOf(req.user), seller: req.user.id, createdBy: req.user.id,
    };
    let created;
    if (target === 'invoice') {
      const paidBefore = req.params.kind === 'bookings' ? num(source.paidAmount) : 0;
      // What was taken at booking counts as already paid.
      created = await createInvoiceRecord({ base: { ...base, quotation: source.quotation || (req.params.kind === 'quotations' ? source._id : null), booking: req.params.kind === 'bookings' ? source._id : null }, totals, body: { ...body, paidAmount: num(body.paidAmount) + paidBefore }, user: req.user });
      if (paidBefore > 0 && created.paymentTerm !== 'credit') { /* already recorded on the booking */ }
    } else {
      const bookingAmount = round2(num(body.bookingAmount));
      created = await CustomBooking.create({ ...base, quotation: source._id, status: 'pending', priority: body.priority || 'normal', bookingAmount, paidAmount: bookingAmount, balanceAmount: round2(totals.totalAmount - bookingAmount), expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null });
    }
    const patch = { status: req.params.kind === 'bookings' ? 'completed' : 'converted', updatedBy: req.user.id };
    if (target === 'invoice') patch.convertedInvoice = created._id; else patch.convertedBooking = created._id;
    await kind.Model.updateOne({ _id: source._id }, { $set: patch });
    res.status(201).json({ success: true, message: `${kind.label} converted to ${target} ${number}`, data: { id: created._id, number, target } });
  } catch (error) { next(error); }
};

const recordPayment = async (req, res, next) => {
  try {
    if (req.params.kind !== 'invoices') throw new AppError('Payments are recorded against invoices', 400);
    const invoice = await CustomInvoice.findById(sanitizeId(req.params.id));
    if (!invoice) throw new AppError('Custom invoice not found', 404);
    if (invoice.status === 'cancelled') throw new AppError('Cannot record payment on a cancelled invoice', 400);
    const outstanding = round2(num(invoice.balanceAmount));
    const amount = round2(num(req.body.amount));
    if (amount <= 0) throw new AppError('Payment amount must be greater than zero', 400);
    if (amount > outstanding + 0.009) throw new AppError(`Payment exceeds the outstanding balance of ${outstanding}`, 400);
    const method = await resolvePaymentMethod(req.body.paymentMethodId, { required: true });
    await Payment.create({
      paymentNumber: await nextDocNumber(Payment, 'paymentNumber', 'PAY'),
      invoice: invoice._id, customer: invoice.customer, methodRef: method.id,
      method: { name: method.name, code: method.code, type: method.type },
      amount, paymentDate: new Date(), referenceNumber: req.body.referenceNumber || '', notes: req.body.notes || '', status: 'completed', createdBy: req.user.id,
    });
    invoice.paidAmount = round2(num(invoice.paidAmount) + amount);
    invoice.balanceAmount = round2(num(invoice.totalAmount) - invoice.paidAmount);
    invoice.status = invoice.balanceAmount <= 0.009 ? 'paid' : 'partial';
    invoice.paymentMethod = method.id; invoice.paymentMode = method.name;
    invoice.updatedBy = req.user.id;
    await invoice.save();
    res.status(201).json({ success: true, message: 'Payment recorded', data: mapInvoice(await CustomInvoice.findById(invoice._id).populate(POPULATE).lean()) });
  } catch (error) { next(error); }
};

// ── E-mail ────────────────────────────────────────────────────────────────

/** The same customer e-mail the vehicle and parts documents send, per kind. */
const EMAIL_DOCUMENTS = {
  quotations: { usageKey: 'quotation_customer', documentKey: 'quotation', build: (d) => ({ number: d.quotationNumber, date: d.createdAt, validUntil: d.validUntil, amount: d.totalAmount, status: d.status }) },
  bookings: { usageKey: 'booking_customer', documentKey: 'booking', build: (d) => ({ number: d.bookingNumber, date: d.bookingDate || d.createdAt, deliveryDate: d.expectedDeliveryDate, amount: d.bookingAmount, totalAmount: d.totalAmount, status: d.status }) },
  invoices: { usageKey: 'invoice_customer', documentKey: 'invoice', build: (d) => ({ number: d.invoiceNumber, date: d.invoiceDate || d.createdAt, dueDate: d.dueDate, amount: d.totalAmount, paidAmount: d.paidAmount, balanceAmount: d.balanceAmount, status: d.status }) },
};

const sendEmail = async (req, res, next) => {
  try {
    const kind = kindOf(req);
    const entry = EMAIL_DOCUMENTS[req.params.kind];
    const { recipient } = await sendCustomerDocumentEmail({
      Model: kind.Model, id: req.params.id, usageKey: entry.usageKey, documentKey: entry.documentKey, buildDocument: entry.build, userId: req.user.id,
    });
    res.json({ success: true, message: `Email sent to ${recipient}` });
  } catch (error) { next(error); }
};

module.exports = { KINDS, list, getOne, summary, create, update, updateStatus, remove, approve, convert, recordPayment, sendEmail, mapQuotation, mapBooking, mapInvoice };
