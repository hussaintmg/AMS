/**
 * Gate passes — /api/gatepasses. See models/GatePass.model.js for the flow.
 *
 *   logistic IN  → items received; parts flagged addToInventory go into stock
 *   logistic OUT → issued against the IN entry, with a Goods Receiving Note
 *   customer IN  → entry acknowledgement
 *   customer OUT → against the customer's invoice / estimate + the entry
 *   verify       → the guard confirms an OUT pass and the gate opens
 *
 * No pass moves stock on its own except the logistic IN receipt; an OUT pass
 * only evidences that what the invoice already sold has left.
 */
const mongoose = require('mongoose');
const GatePass = require('../models/GatePass.model');
const GoodsReceivingNote = require('../models/GoodsReceivingNote.model');
const { Part, Customer, Invoice, PartInvoice, CustomInvoice, Quotation, PartQuotation, CustomQuotation, FileUpload } = require('../models');
const AppError = require('../utils/AppError');
const { nextDocNumber } = require('../utils/docNumber');
const { nextBarcode, renderBarcodeSvg } = require('../utils/barcode');
const { logStockMovements } = require('../services/partMovementLog.service');
const { allowedOwnerIds } = require('../utils/roleJobs');
const { resolveDocumentCustomer } = require('../utils/walkInCustomer');
const logger = require('../utils/logger');

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const sanitizeId = (value) => (mongoose.Types.ObjectId.isValid(value) ? value : null);
const getUserId = (req) => req.user?.id || req.user?._id;
const customerName = (customer) => (customer ? ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.companyName || '') : '');

const INVOICE_MODELS = { Invoice, PartInvoice, CustomInvoice };
const ESTIMATE_MODELS = { Quotation, PartQuotation, CustomQuotation };

// ── Mapping ───────────────────────────────────────────────────────────────

const mapItem = (item) => ({
  id: item._id, description: item.description, item_type: item.itemType,
  part_id: item.part?._id || item.part || null, part_number: item.partNumber || item.part?.partNumber || item.part?.sku || '',
  part_name: item.part?.name || '', quantity: num(item.quantity), unit: item.unit || '',
  add_to_inventory: item.addToInventory === true, stock_applied: item.stockApplied === true, notes: item.notes || '',
});
const mapPass = (pass) => ({
  id: pass._id,
  gate_pass_number: pass.gatePassNumber,
  direction: pass.direction,
  entry_type: pass.entryType,
  status: pass.status,
  date: pass.createdAt,
  issued_at: pass.issuedAt,
  // logistic
  ro_number: pass.roNumber || '', co_number: pass.coNumber || '', invoice_number: pass.invoiceNumber || '',
  transporter: pass.transporter || '', truck_number: pass.truckNumber || '', driver_name: pass.driverName || '', driver_phone: pass.driverPhone || '',
  items: (pass.items || []).map(mapItem),
  item_count: (pass.items || []).length,
  // customer
  customer_id: pass.customer?._id || pass.customer || null,
  customer_name: pass.walkInName || customerName(pass.customer),
  customer_phone: pass.walkInPhone || pass.customer?.phone || '',
  walk_in_name: pass.walkInName || '', walk_in_phone: pass.walkInPhone || '',
  vehicle_number: pass.customerVehicleNumber || pass.truckNumber || '',
  customer_vehicle_number: pass.customerVehicleNumber || '',
  engine_number: pass.engineNumber || '', chassis_number: pass.chassisNumber || '', pbo_number: pass.pboNumber || '', purpose: pass.purpose || '',
  // the "party" column: who came / which truck
  party: pass.entryType === 'customer' ? (pass.walkInName || customerName(pass.customer)) : (pass.transporter || pass.driverName || pass.truckNumber || ''),
  attachments: (pass.attachments || []).map((file) => (typeof file === 'object' && file ? { id: file._id, name: file.originalName || file.fileName, url: file.filePath ? `/api/uploads/${String(file.filePath).replace(/^.*[\\/]uploads[\\/]/, '')}` : '', mime: file.mimeType } : { id: file })),
  linked_gate_pass_id: pass.linkedGatePass?._id || pass.linkedGatePass || null,
  linked_gate_pass_number: pass.linkedGatePass?.gatePassNumber || '',
  linked_invoice_id: pass.linkedInvoice?._id || pass.linkedInvoice || null,
  linked_invoice_model: pass.linkedInvoiceModel || '',
  linked_invoice_number: pass.linkedInvoiceNumber || '',
  linked_estimate_id: pass.linkedEstimate?._id || pass.linkedEstimate || null,
  linked_estimate_number: pass.linkedEstimateNumber || '',
  grn_id: pass.grn?._id || pass.grn || null,
  grn_number: pass.grn?.grnNumber || '',
  barcode: pass.barcode || '',
  verified_by: pass.verifiedBy ? ({ id: pass.verifiedBy._id || pass.verifiedBy, name: pass.verifiedBy.firstName ? `${pass.verifiedBy.firstName} ${pass.verifiedBy.lastName || ''}`.trim() : '' }) : null,
  verified_at: pass.verifiedAt, verification_notes: pass.verificationNotes || '',
  closed_at: pass.closedAt,
  notes: pass.notes || '',
  created_by: pass.createdBy?._id || pass.createdBy || null,
  created_at: pass.createdAt, updated_at: pass.updatedAt,
});
const POPULATE = [
  { path: 'customer', select: 'firstName lastName companyName phone email customerCode' },
  { path: 'linkedGatePass', select: 'gatePassNumber entryType direction' },
  { path: 'grn', select: 'grnNumber' },
  { path: 'items.part', select: 'name partNumber sku' },
  { path: 'attachments', select: 'originalName fileName filePath mimeType' },
  { path: 'verifiedBy', select: 'firstName lastName' },
];
const load = (id) => POPULATE.reduce((query, pop) => query.populate(pop), GatePass.findById(id)).lean();

// ── Items ─────────────────────────────────────────────────────────────────

async function resolveItems(rawItems = []) {
  const items = [];
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    if (!raw) continue;
    const partId = sanitizeId(raw.partId || raw.part_id || raw.part);
    let part = null;
    if (partId) { part = await Part.findById(partId).select('name partNumber sku').lean(); if (!part) throw new AppError('Part not found', 404); }
    const description = String(raw.description || part?.name || '').trim();
    if (!description) continue;
    items.push({
      description,
      itemType: part ? 'part' : (['consumable', 'other'].includes(raw.itemType || raw.item_type) ? (raw.itemType || raw.item_type) : 'other'),
      part: part ? part._id : null,
      partNumber: part ? (part.partNumber || part.sku || '') : String(raw.partNumber || raw.part_number || ''),
      quantity: Math.max(0, num(raw.quantity, 1)),
      unit: String(raw.unit || '').trim(),
      addToInventory: Boolean(part) && (raw.addToInventory === true || raw.add_to_inventory === true || raw.addToInventory === 'true'),
      notes: String(raw.notes || '').trim(),
    });
  }
  return items;
}

/** Receive the flagged parts into stock — once — and leave a movement trail. */
async function receiveIntoStock(pass, userId) {
  const movements = [];
  let applied = 0;
  for (const item of pass.items) {
    if (!item.addToInventory || !item.part || item.stockApplied || !(item.quantity > 0)) continue;
    const updated = await Part.findOneAndUpdate({ _id: item.part }, { $inc: { currentStock: item.quantity, quantity: item.quantity } }, { returnDocument: 'after' }).lean();
    if (!updated) continue;
    item.stockApplied = true;
    applied += 1;
    movements.push({
      part: item.part, partCode: updated.partNumber || updated.sku || '', partName: updated.name || '',
      direction: 'in', quantity: item.quantity, stockAfter: num(updated.currentStock),
      source: 'gate_receipt', reference: pass.gatePassNumber, sourceId: pass._id, createdBy: userId || null,
    });
  }
  if (movements.length) await logStockMovements(movements);
  return applied;
}

// ── Links (customer OUT against invoice / estimate) ───────────────────────

async function resolveInvoiceLink(body) {
  const id = sanitizeId(body.invoiceId || body.linkedInvoiceId);
  if (!id) return { linkedInvoice: null, linkedInvoiceModel: '', linkedInvoiceNumber: String(body.linkedInvoiceNumber || '').trim() };
  const preferred = INVOICE_MODELS[body.invoiceModel] ? [body.invoiceModel] : [];
  for (const name of [...preferred, ...Object.keys(INVOICE_MODELS).filter((n) => !preferred.includes(n))]) {
    const doc = await INVOICE_MODELS[name].findById(id).select('invoiceNumber customer').lean();
    if (doc) return { linkedInvoice: doc._id, linkedInvoiceModel: name, linkedInvoiceNumber: doc.invoiceNumber, invoiceCustomer: doc.customer };
  }
  throw new AppError('Invoice not found', 404);
}
async function resolveEstimateLink(body) {
  const id = sanitizeId(body.estimateId || body.quotationId);
  if (!id) return { linkedEstimate: null, linkedEstimateModel: '', linkedEstimateNumber: '' };
  for (const name of Object.keys(ESTIMATE_MODELS)) {
    const doc = await ESTIMATE_MODELS[name].findById(id).select('quotationNumber').lean();
    if (doc) return { linkedEstimate: doc._id, linkedEstimateModel: name, linkedEstimateNumber: doc.quotationNumber };
  }
  throw new AppError('Estimate not found', 404);
}

// ── CRUD ──────────────────────────────────────────────────────────────────

const pageFor = (direction) => (direction === 'out' ? 'gatepass_out' : 'gatepass_in');

exports.list = async (req, res, next) => {
  try {
    const { direction, entryType, status, search, dateFrom, dateTo, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
    const filter = {};
    if (direction === 'in' || direction === 'out') filter.direction = direction;
    if (entryType) filter.entryType = entryType;
    if (status) filter.status = status;
    if (filter.direction) {
      const ownerIds = await allowedOwnerIds(req.user, pageFor(filter.direction));
      if (ownerIds !== null) filter.createdBy = { $in: ownerIds };
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); filter.createdAt.$lte = end; }
    }
    if (search) {
      const re = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const customers = await Customer.find({ $or: [{ firstName: re }, { lastName: re }, { companyName: re }, { phone: re }] }).select('_id').lean();
      filter.$or = [{ gatePassNumber: re }, { roNumber: re }, { coNumber: re }, { invoiceNumber: re }, { transporter: re }, { truckNumber: re }, { driverName: re }, { walkInName: re }, { customerVehicleNumber: re }, { engineNumber: re }, { pboNumber: re }, { linkedInvoiceNumber: re }, { barcode: re }, { customer: { $in: customers.map((c) => c._id) } }];
    }
    const sortField = { created_at: 'createdAt', number: 'gatePassNumber', status: 'status' }[sortBy] || 'createdAt';
    const pageNum = Math.max(1, num(page, 1)); const size = Math.max(1, num(limit, 20));
    const query = POPULATE.reduce((q, pop) => q.populate(pop), GatePass.find(filter));
    const [rows, total] = await Promise.all([
      query.sort({ [sortField]: String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1 }).skip((pageNum - 1) * size).limit(size).lean(),
      GatePass.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows.map(mapPass), pagination: { page: pageNum, limit: size, total, totalPages: Math.ceil(total / size) } });
  } catch (error) { next(error); }
};

exports.summary = async (req, res, next) => {
  try {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const [row] = await GatePass.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        in_total: { $sum: { $cond: [{ $eq: ['$direction', 'in'] }, 1, 0] } },
        out_total: { $sum: { $cond: [{ $eq: ['$direction', 'out'] }, 1, 0] } },
        in_today: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'in'] }, { $gte: ['$createdAt', startOfDay] }] }, 1, 0] } },
        out_today: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'out'] }, { $gte: ['$createdAt', startOfDay] }] }, 1, 0] } },
        logistic_in: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'in'] }, { $eq: ['$entryType', 'logistic'] }] }, 1, 0] } },
        customer_in: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'in'] }, { $eq: ['$entryType', 'customer'] }] }, 1, 0] } },
        awaiting_verify: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'out'] }, { $eq: ['$status', 'issued'] }] }, 1, 0] } },
        verified: { $sum: { $cond: [{ $in: ['$status', ['verified', 'closed']] }, 1, 0] } },
      } },
    ]);
    // Entries still inside: an IN pass with no OUT pass linked to it.
    const linkedIds = await GatePass.distinct('linkedGatePass', { direction: 'out', status: { $ne: 'cancelled' }, linkedGatePass: { $ne: null } });
    const open = await GatePass.countDocuments({ direction: 'in', status: { $nin: ['cancelled', 'closed'] }, _id: { $nin: linkedIds } });
    res.json({ success: true, data: { ...(row || { total: 0, in_total: 0, out_total: 0, in_today: 0, out_today: 0, logistic_in: 0, customer_in: 0, awaiting_verify: 0, verified: 0 }), open } });
  } catch (error) { next(error); }
};

exports.openEntries = async (req, res, next) => {
  try {
    // IN entries that no OUT pass has closed yet — what the OUT form offers.
    const linkedIds = await GatePass.distinct('linkedGatePass', { direction: 'out', status: { $ne: 'cancelled' }, linkedGatePass: { $ne: null } });
    const filter = { direction: 'in', status: { $nin: ['cancelled', 'closed'] }, _id: { $nin: linkedIds } };
    if (req.query.entryType) filter.entryType = req.query.entryType;
    const rows = await GatePass.find(filter).populate('customer', 'firstName lastName companyName phone').sort({ createdAt: -1 }).limit(300).lean();
    res.json({ success: true, data: rows.map(mapPass) });
  } catch (error) { next(error); }
};

exports.getOne = async (req, res, next) => {
  try {
    const pass = await load(sanitizeId(req.params.id));
    if (!pass) throw new AppError('Gate pass not found', 404);
    const data = mapPass(pass);
    if (pass.grn) data.grn = await GoodsReceivingNote.findById(pass.grn._id || pass.grn).lean();
    if (pass.linkedInvoice && pass.linkedInvoiceModel && INVOICE_MODELS[pass.linkedInvoiceModel]) {
      const inv = await INVOICE_MODELS[pass.linkedInvoiceModel].findById(pass.linkedInvoice).select('invoiceNumber totalAmount paidAmount balanceAmount status lineItems items paymentTerm').lean();
      if (inv) data.linked_invoice = { id: inv._id, number: inv.invoiceNumber, total: num(inv.totalAmount), paid: num(inv.paidAmount), balance: num(inv.balanceAmount), status: inv.status, payment_term: inv.paymentTerm || 'paid', lines: (inv.lineItems?.length ? inv.lineItems : inv.items || []).map((line) => ({ description: line.name || line.description || '', quantity: num(line.quantity, 1) })) };
    }
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

/** Look a pass up by number or barcode — the guard's screen. */
exports.lookup = async (req, res, next) => {
  try {
    const needle = String(req.params.number || '').trim();
    if (!needle) throw new AppError('Gate pass number is required', 400);
    const re = new RegExp(`^${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const found = await GatePass.findOne({ $or: [{ gatePassNumber: re }, { barcode: re }] }).select('_id').lean();
    if (!found) throw new AppError('No gate pass with that number', 404);
    req.params.id = String(found._id);
    return exports.getOne(req, res, next);
  } catch (error) { return next(error); }
};

exports.create = async (req, res, next) => {
  try {
    const direction = req.body.direction === 'out' ? 'out' : 'in';
    const entryType = req.body.entryType === 'customer' ? 'customer' : 'logistic';
    const fields = { direction, entryType, notes: req.body.notes || '', createdBy: getUserId(req) };

    if (entryType === 'logistic') {
      Object.assign(fields, {
        roNumber: String(req.body.roNumber || '').trim(), coNumber: String(req.body.coNumber || '').trim(), invoiceNumber: String(req.body.invoiceNumber || '').trim(),
        transporter: String(req.body.transporter || '').trim(), truckNumber: String(req.body.truckNumber || '').trim(),
        driverName: String(req.body.driverName || '').trim(), driverPhone: String(req.body.driverPhone || '').trim(),
        items: await resolveItems(req.body.items),
      });
    } else {
      // An OUT raised against an entry inherits the entry's customer unless
      // the form named one; an IN must name one (or be a walk-in).
      const linkedEntry = direction === 'out' && sanitizeId(req.body.linkedGatePassId || req.body.entryId)
        ? await GatePass.findById(req.body.linkedGatePassId || req.body.entryId).lean()
        : null;
      const customerBody = (!req.body.customerId && req.body.walkIn === undefined && linkedEntry)
        ? { customerId: linkedEntry.customer ? String(linkedEntry.customer) : undefined, walkIn: Boolean(linkedEntry.walkInName), walkInName: linkedEntry.walkInName, walkInPhone: linkedEntry.walkInPhone }
        : req.body;
      const { customer, walkIn, walkInName, walkInPhone } = await resolveDocumentCustomer(customerBody, async (id) => {
        if (!sanitizeId(id)) throw new AppError('Customer is required', 400);
        const found = await Customer.findOne({ _id: id, deletedAt: null }).lean();
        if (!found) throw new AppError('Customer not found', 404);
        return found;
      });
      Object.assign(fields, {
        customer: customer._id, walkInName: walkIn ? walkInName : '', walkInPhone: walkIn ? walkInPhone : '',
        customerVehicleNumber: String(req.body.vehicleNumber || req.body.customerVehicleNumber || '').trim(),
        engineNumber: String(req.body.engineNumber || '').trim(), chassisNumber: String(req.body.chassisNumber || '').trim(),
        pboNumber: String(req.body.pboNumber || '').trim(), purpose: String(req.body.purpose || '').trim(),
        items: await resolveItems(req.body.items),
      });
    }

    if (direction === 'out') {
      const entry = sanitizeId(req.body.linkedGatePassId || req.body.entryId);
      if (entry) {
        const linked = await GatePass.findById(entry).lean();
        if (!linked || linked.direction !== 'in') throw new AppError('The linked entry must be a gate pass IN', 400);
        if (linked.entryType !== entryType) throw new AppError(`The entry is a ${linked.entryType} entry`, 400);
        fields.linkedGatePass = linked._id;
        // Carry the entry's identity forward so the OUT pass stands on its own.
        if (entryType === 'logistic') Object.assign(fields, { roNumber: fields.roNumber || linked.roNumber, coNumber: fields.coNumber || linked.coNumber, invoiceNumber: fields.invoiceNumber || linked.invoiceNumber, transporter: fields.transporter || linked.transporter, truckNumber: fields.truckNumber || linked.truckNumber, driverName: fields.driverName || linked.driverName, items: fields.items.length ? fields.items : (linked.items || []).map((item) => ({ ...item, _id: undefined, addToInventory: false, stockApplied: false })) });
        else Object.assign(fields, { customer: fields.customer || linked.customer, walkInName: fields.walkInName || linked.walkInName, walkInPhone: fields.walkInPhone || linked.walkInPhone, customerVehicleNumber: fields.customerVehicleNumber || linked.customerVehicleNumber, engineNumber: fields.engineNumber || linked.engineNumber, chassisNumber: fields.chassisNumber || linked.chassisNumber, pboNumber: fields.pboNumber || linked.pboNumber });
      } else if (entryType === 'customer' && !fields.customer) {
        throw new AppError('A customer exit needs the entry it goes against, or the customer', 400);
      }
      if (entryType === 'customer') {
        Object.assign(fields, await resolveInvoiceLink(req.body));
        Object.assign(fields, await resolveEstimateLink(req.body));
        if (!fields.linkedInvoice && !fields.linkedEstimate && !fields.linkedInvoiceNumber) throw new AppError('A customer exit is raised against an invoice or an estimate', 400);
        delete fields.invoiceCustomer;
      }
    }

    fields.gatePassNumber = await nextDocNumber(GatePass, 'gatePassNumber', direction === 'in' ? 'GP-IN' : 'GP-OUT');
    fields.barcode = await nextBarcode(GatePass, 'gatepass');
    fields.status = 'draft';
    const pass = await GatePass.create(fields);
    logger.info(`Gate pass ${pass.gatePassNumber} (${direction}/${entryType}) created by ${getUserId(req)}`);
    res.status(201).json({ success: true, message: `Gate pass ${pass.gatePassNumber} created`, data: mapPass(await load(pass._id)) });
  } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const pass = await GatePass.findById(sanitizeId(req.params.id));
    if (!pass) throw new AppError('Gate pass not found', 404);
    if (['verified', 'closed', 'cancelled'].includes(pass.status)) throw new AppError(`A ${pass.status} gate pass cannot be edited`, 400);
    const text = ['roNumber', 'coNumber', 'invoiceNumber', 'transporter', 'truckNumber', 'driverName', 'driverPhone', 'engineNumber', 'chassisNumber', 'pboNumber', 'purpose', 'notes', 'walkInName', 'walkInPhone'];
    text.forEach((field) => { if (req.body[field] !== undefined) pass[field] = String(req.body[field] || '').trim(); });
    if (req.body.vehicleNumber !== undefined || req.body.customerVehicleNumber !== undefined) pass.customerVehicleNumber = String(req.body.vehicleNumber ?? req.body.customerVehicleNumber ?? '').trim();
    if (req.body.customerId !== undefined && sanitizeId(req.body.customerId)) pass.customer = req.body.customerId;
    if (req.body.items !== undefined) {
      // Keep the stockApplied flag of lines already received.
      const fresh = await resolveItems(req.body.items);
      const receivedParts = new Set(pass.items.filter((item) => item.stockApplied).map((item) => String(item.part)));
      pass.items = fresh.map((item) => ({ ...item, stockApplied: item.part ? receivedParts.has(String(item.part)) : false }));
    }
    if (pass.direction === 'out' && pass.entryType === 'customer' && (req.body.invoiceId !== undefined || req.body.estimateId !== undefined)) {
      Object.assign(pass, await resolveInvoiceLink(req.body), await resolveEstimateLink(req.body));
    }
    pass.updatedBy = getUserId(req);
    await pass.save();
    res.json({ success: true, message: 'Gate pass updated', data: mapPass(await load(pass._id)) });
  } catch (error) { next(error); }
};

exports.remove = async (req, res, next) => {
  try {
    const pass = await GatePass.findById(sanitizeId(req.params.id));
    if (!pass) throw new AppError('Gate pass not found', 404);
    if (pass.items.some((item) => item.stockApplied) || pass.status !== 'draft') {
      pass.status = 'cancelled'; pass.updatedBy = getUserId(req); await pass.save();
      return res.json({ success: true, message: 'Gate pass cancelled (it had been issued or had received stock, so it is kept for the record)' });
    }
    await GatePass.deleteOne({ _id: pass._id });
    return res.json({ success: true, message: 'Gate pass deleted' });
  } catch (error) { return next(error); }
};

// ── Lifecycle ─────────────────────────────────────────────────────────────

/** Issue: the printable document. A logistic IN also receives its parts now. */
exports.issue = async (req, res, next) => {
  try {
    const pass = await GatePass.findById(sanitizeId(req.params.id));
    if (!pass) throw new AppError('Gate pass not found', 404);
    if (pass.status !== 'draft') throw new AppError(`Gate pass is already ${pass.status}`, 400);
    let received = 0;
    if (pass.direction === 'in' && pass.entryType === 'logistic') received = await receiveIntoStock(pass, getUserId(req));
    pass.status = 'issued'; pass.issuedAt = new Date(); pass.updatedBy = getUserId(req);
    await pass.save();
    res.json({ success: true, message: received ? `Gate pass issued; ${received} part line(s) received into stock` : 'Gate pass issued', data: mapPass(await load(pass._id)) });
  } catch (error) { next(error); }
};

/** The guard confirms an OUT pass (or a customer IN acknowledgement). */
exports.verify = async (req, res, next) => {
  try {
    const pass = await GatePass.findById(sanitizeId(req.params.id));
    if (!pass) throw new AppError('Gate pass not found', 404);
    if (pass.status === 'cancelled') throw new AppError('Cancelled gate pass', 400);
    if (pass.status === 'draft') throw new AppError('The gate pass has not been issued yet', 400);
    if (['verified', 'closed'].includes(pass.status)) throw new AppError(`Already ${pass.status}`, 400);
    pass.status = 'verified'; pass.verifiedBy = getUserId(req); pass.verifiedAt = new Date();
    pass.verificationNotes = String(req.body.notes || '').trim();
    await pass.save();
    // Verifying an OUT closes the IN it went against.
    if (pass.direction === 'out' && pass.linkedGatePass) {
      await GatePass.updateOne({ _id: pass.linkedGatePass, status: { $in: ['issued', 'verified'] } }, { $set: { status: 'closed', closedAt: new Date() } });
    }
    res.json({ success: true, message: `Gate pass ${pass.gatePassNumber} verified — the gate may open`, data: mapPass(await load(pass._id)) });
  } catch (error) { next(error); }
};

exports.close = async (req, res, next) => {
  try {
    const pass = await GatePass.findById(sanitizeId(req.params.id));
    if (!pass) throw new AppError('Gate pass not found', 404);
    if (pass.status === 'cancelled') throw new AppError('Cancelled gate pass', 400);
    pass.status = 'closed'; pass.closedAt = new Date(); pass.updatedBy = getUserId(req);
    await pass.save();
    res.json({ success: true, message: 'Gate pass closed', data: mapPass(await load(pass._id)) });
  } catch (error) { next(error); }
};

// ── Goods Receiving Note ──────────────────────────────────────────────────

const mapGrn = (grn) => ({
  id: grn._id, grn_number: grn.grnNumber, gate_pass_id: grn.gatePass?._id || grn.gatePass, gate_pass_number: grn.gatePass?.gatePassNumber || '',
  out_gate_pass_id: grn.outGatePass?._id || grn.outGatePass || null, out_gate_pass_number: grn.outGatePass?.gatePassNumber || '',
  transporter: grn.transporter, truck_number: grn.truckNumber, driver_name: grn.driverName, ro_number: grn.roNumber, co_number: grn.coNumber, invoice_number: grn.invoiceNumber,
  items: (grn.items || []).map((item) => ({ id: item._id, description: item.description, part_id: item.part || null, part_number: item.partNumber, quantity_expected: num(item.quantityExpected), quantity_received: num(item.quantityReceived), quantity_rejected: num(item.quantityRejected), unit: item.unit, remarks: item.remarks })),
  received_by: grn.receivedBy ? { id: grn.receivedBy._id || grn.receivedBy, name: grn.receivedBy.firstName ? `${grn.receivedBy.firstName} ${grn.receivedBy.lastName || ''}`.trim() : '' } : null,
  received_at: grn.receivedAt, notes: grn.notes || '', created_at: grn.createdAt,
});

/** Issue a GRN against a logistic entry (and, when given, attach it to the OUT pass). */
exports.createGrn = async (req, res, next) => {
  try {
    const pass = await GatePass.findById(sanitizeId(req.params.id));
    if (!pass) throw new AppError('Gate pass not found', 404);
    const entry = pass.direction === 'in' ? pass : (pass.linkedGatePass ? await GatePass.findById(pass.linkedGatePass) : null);
    if (!entry || entry.entryType !== 'logistic') throw new AppError('A GRN is issued against a logistic entry', 400);
    if (entry.grn) throw new AppError('A GRN has already been issued for this entry', 400);
    const rawItems = Array.isArray(req.body.items) && req.body.items.length ? req.body.items : entry.items.map((item) => ({ id: item._id, quantityReceived: item.quantity }));
    const items = rawItems.map((raw) => {
      const source = entry.items.find((item) => String(item._id) === String(raw.id || raw.item_id)) || {};
      const expected = num(source.quantity, num(raw.quantityExpected));
      const receivedQty = raw.quantityReceived != null ? num(raw.quantityReceived) : expected;
      return { description: raw.description || source.description || '', part: source.part || null, partNumber: source.partNumber || raw.partNumber || '', quantityExpected: expected, quantityReceived: receivedQty, quantityRejected: Math.max(0, num(raw.quantityRejected, expected - receivedQty)), unit: source.unit || raw.unit || '', remarks: raw.remarks || '' };
    });
    const grn = await GoodsReceivingNote.create({
      grnNumber: await nextDocNumber(GoodsReceivingNote, 'grnNumber', 'GRN'),
      gatePass: entry._id, outGatePass: pass.direction === 'out' ? pass._id : null,
      transporter: entry.transporter, truckNumber: entry.truckNumber, driverName: entry.driverName,
      roNumber: entry.roNumber, coNumber: entry.coNumber, invoiceNumber: entry.invoiceNumber,
      items, receivedBy: getUserId(req), receivedAt: new Date(), notes: req.body.notes || '', createdBy: getUserId(req),
    });
    entry.grn = grn._id; await entry.save();
    if (pass.direction === 'out') { pass.grn = grn._id; await pass.save(); }
    res.status(201).json({ success: true, message: `GRN ${grn.grnNumber} issued`, data: mapGrn(grn.toObject()) });
  } catch (error) { next(error); }
};

exports.listGrns = async (req, res, next) => {
  try {
    const page = Math.max(1, num(req.query.page, 1)); const limit = Math.max(1, num(req.query.limit, 20));
    const [rows, total] = await Promise.all([
      GoodsReceivingNote.find({}).populate('gatePass', 'gatePassNumber').populate('outGatePass', 'gatePassNumber').populate('receivedBy', 'firstName lastName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      GoodsReceivingNote.countDocuments({}),
    ]);
    res.json({ success: true, data: rows.map(mapGrn), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
};

exports.getGrn = async (req, res, next) => {
  try {
    const grn = await GoodsReceivingNote.findById(sanitizeId(req.params.grnId)).populate('gatePass', 'gatePassNumber').populate('outGatePass', 'gatePassNumber').populate('receivedBy', 'firstName lastName').lean();
    if (!grn) throw new AppError('GRN not found', 404);
    res.json({ success: true, data: mapGrn(grn) });
  } catch (error) { next(error); }
};

// ── Attachments (photos of the goods) ─────────────────────────────────────

exports.addAttachments = async (req, res, next) => {
  try {
    const pass = await GatePass.findById(sanitizeId(req.params.id));
    if (!pass) throw new AppError('Gate pass not found', 404);
    const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    if (!files.length) throw new AppError('No files uploaded', 400);
    const created = await FileUpload.insertMany(files.map((file) => ({
      fileName: file.filename, originalName: file.originalname, filePath: file.path, mimeType: file.mimetype, size: file.size,
      module: 'gatepass', status: 'completed', progress: 100, uploadedBy: getUserId(req), notes: `Gate pass ${pass.gatePassNumber}`,
    })));
    pass.attachments.push(...created.map((file) => file._id));
    await pass.save();
    res.status(201).json({ success: true, message: `${created.length} file(s) attached`, data: mapPass(await load(pass._id)) });
  } catch (error) { next(error); }
};

exports.removeAttachment = async (req, res, next) => {
  try {
    const pass = await GatePass.findById(sanitizeId(req.params.id));
    if (!pass) throw new AppError('Gate pass not found', 404);
    pass.attachments = pass.attachments.filter((id) => String(id) !== String(req.params.fileId));
    await pass.save();
    res.json({ success: true, message: 'Attachment removed', data: mapPass(await load(pass._id)) });
  } catch (error) { next(error); }
};

/** The barcode as SVG, for the printed pass and the guard's screen. */
exports.barcodeSvg = async (req, res, next) => {
  try {
    const pass = await GatePass.findById(sanitizeId(req.params.id)).select('barcode gatePassNumber').lean();
    if (!pass) throw new AppError('Gate pass not found', 404);
    res.type('image/svg+xml').send(renderBarcodeSvg(pass.barcode || pass.gatePassNumber));
  } catch (error) { next(error); }
};

module.exports.mapPass = mapPass;
module.exports.mapGrn = mapGrn;
