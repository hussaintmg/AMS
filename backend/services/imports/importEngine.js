const mongoose = require('mongoose');
const Customer = require('../../models/Customer.model');
const Vehicle = require('../../models/Vehicle.model');
const Booking = require('../../models/Booking.model');
const SalesOrder = require('../../models/SalesOrder.model');
const Invoice = require('../../models/Invoice.model');
const Payment = require('../../models/Payment.model');
const {
  VehicleMake,
  VehicleModel,
  VehicleVariant,
  VehicleColor,
} = require('../../models/VehicleMaster.model');
const { nextDocNumber } = require('../../utils/docNumber');
const { createInvoiceForOrder } = require('../../utils/invoiceFactory');
const { recordCustomerActivity } = require('../../utils/customerSync');
const { applyVehicleLifecycle, canonicalStatus } = require('../../utils/vehicleLifecycle');
const { CustomerIndex, isGeneratedEmail } = require('./customerResolver');
const { SellerIndex, normalizeSellerKey } = require('./sellerResolver');
const { MasterDataIndex, MasterResolutionError } = require('./masterDataResolver');
const { VehicleIndex, normalizeVehicleIdentifier } = require('./vehicleResolver');
const { OrderIndex } = require('./orderResolver');
const { BookingIndex } = require('./bookingResolver');
const {
  normalizeBusinessReference,
  normalizeRecord,
  rawPresent,
} = require('./valueNormalizer');
const { FILE_TYPE_ORDER, normalizeText } = require('./spreadsheetMapper');
const { runAtomicRow, supportsTransactions } = require('./atomicImport');
const { currentAudit, debugEvent, importTrace } = require('./importDebugAudit');

const clean = (value) => normalizeText(value);
const lower = (value) => clean(value).toLowerCase();
const DEBUG_SINGLE_CHAIN = process.env.IMPORT_DEBUG_SINGLE_CHAIN === 'true';
const DEBUG_PBO = normalizeBusinessReference(process.env.IMPORT_DEBUG_PBO || '');

// validateSync() is deprecated and printed a Node warning for every single
// document an import created — thousands of stderr lines per batch. validate()
// raises the same ValidationError; the console.error stays for real failures.
async function assertValidDocument(document) {
  try {
    await document.validate();
  } catch (validationError) {
    console.error("[MODEL_VALIDATION_FAILED]", {
      model: document.constructor.modelName,
      errors: validationError.errors,
      document: document.toObject(),
    });
    throw validationError;
  }
}

class ImportRowError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ImportRowError';
    this.code = details.code || 'RELATIONSHIP_RESOLUTION';
    this.details = details;
  }
}

const ENTITY_TEMPLATE = {
  customers: { created: 0, reused: 0, updated: 0 },
  sellers: { created: 0, resolved: 0 },
  makes: { created: 0, reused: 0 },
  models: { created: 0, reused: 0 },
  variants: { created: 0, reused: 0 },
  colors: { created: 0, reused: 0 },
  vehicles: { created: 0, reused: 0, updated: 0 },
  bookings: { created: 0, updated: 0, reused: 0 },
  salesOrders: { created: 0, updated: 0, reused: 0 },
  invoices: { created: 0, updated: 0, reused: 0 },
  payments: { created: 0, skipped: 0 },
  dispatchRecords: { created: 0, updated: 0, reused: 0 },
};

function newEntityDelta() {
  return Object.fromEntries(Object.entries(ENTITY_TEMPLATE).map(([entity, values]) => [entity, { ...values }]));
}

function mergeEntityDelta(target, delta) {
  Object.entries(delta).forEach(([entity, values]) => {
    Object.entries(values).forEach(([key, value]) => { target[entity][key] += value; });
  });
}

function comparable(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparable);
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId' || value.constructor?.name === 'ObjectId') return String(value);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, comparable(entry)]));
  }
  return value;
}

function changedFields(existing, desired) {
  const changed = {};
  Object.entries(desired).forEach(([field, value]) => {
    if (value === undefined) return;
    if (JSON.stringify(comparable(existing?.[field])) !== JSON.stringify(comparable(value))) changed[field] = value;
  });
  return changed;
}

function sourceIssue(record, overrides = {}) {
  const meta = record._meta || {};
  return {
    fileType: meta.logicalType || '',
    fileName: meta.fileName || '',
    sheetName: meta.sheetName || '',
    row: meta.rowNumber || null,
    sourceIdentifier: meta.sourceIdentifier || '',
    errorType: 'IMPORT',
    field: '',
    value: '',
    missingField: '',
    relatedEntity: '',
    message: '',
    ...overrides,
  };
}

function errorToIssue(record, error) {
  if (error instanceof MasterResolutionError) {
    return sourceIssue(record, {
      errorType: error.code,
      field: lower(error.details?.stage),
      value: clean(error.details?.value || record.vehicleDescription),
      relatedEntity: error.details?.stage ? `Vehicle${error.details.stage === 'Brand' ? 'Make' : error.details.stage}` : 'VehicleMaster',
      message: error.message,
    });
  }
  if (error instanceof ImportRowError) {
    return sourceIssue(record, {
      errorType: error.code,
      field: error.details.field || '',
      value: clean(error.details.value),
      missingField: error.details.missingField || '',
      relatedEntity: error.details.relatedEntity || '',
      message: error.message,
    });
  }
  if (error?.code === 11000) {
    return sourceIssue(record, {
      errorType: 'DUPLICATE_KEY',
      field: Object.keys(error.keyPattern || error.keyValue || {})[0] || '',
      value: Object.values(error.keyValue || {})[0] || '',
      message: `A unique database value already exists: ${error.message}`,
    });
  }
  return sourceIssue(record, {
    errorType: error?.name || 'IMPORT_ERROR',
    message: error?.rollbackError
      ? `${error.message} Rollback also failed: ${error.rollbackError.message}`
      : error?.message || 'Unknown import error.',
  });
}

function rowWarning(record, message, details = {}) {
  return sourceIssue(record, { errorType: details.errorType || 'WARNING', message, ...details });
}
function recordRelationship(row, chain, missing = []) {
  const payload = {
    _meta: row._meta,
    sourceIdentifiers: {
      customerName: row.customerName || '',
      bookingNumber: row.pboNo || '',
      orderNumber: row.externalOrderNumber || '',
      invoiceNumber: row.externalInvoiceNumber || '',
      dispatchNumber: row.dispatchNumber || '',
      chassisNumber: row.chassisNumber || '',
      engineNumber: row.engineNumber || '',
      sellerText: row.sellerName || '',
    },
    chain,
    missingRelationships: missing,
    complete: missing.length === 0,
  };
  const audit = currentAudit();
  if (audit) audit.relationship(payload, missing.length ? 'warn' : 'info');
  else debugEvent('relationship.verification', payload, { level: missing.length ? 'warn' : 'info' });
}

class ImportContext {
  static async load() {
    const [customers, sellers, masterData, vehicles, bookings, orders] = await Promise.all([
      CustomerIndex.load(),
      SellerIndex.load(),
      MasterDataIndex.load(),
      VehicleIndex.load(),
      BookingIndex.load(),
      OrderIndex.load(),
    ]);
    return {
      customers,
      sellers,
      masterData,
      vehicles,
      bookings,
      orders,
      customersByIdentity: customers.byField,
      bookingsByPbo: bookings.byPboNo,
      salesOrdersByOrderNumber: orders.byField.externalOrderNumber,
      salesOrdersByPbo: orders.byField.pboNo,
      vehiclesByChassis: vehicles.byChassis,
      vehiclesByEngine: vehicles.byEngine,
      invoicesByExternalNumber: orders.byField.invoiceNumber,
    };
  }
}

function customerData(row) {
  return {
    _meta: row._meta,
    customerCode: row.customerCode,
    customerName: row.customerName,
    customerType: row.customerType,
    explicitPersonal: ['personal', 'individual', 'person', 'retail'].includes(lower(row.customerType)),
    relation: row.relation,
    dob: row.dob,
    cnic: row.cnic,
    ntn: row.ntn,
    phone: row.phone,
    alternatePhone: row.alternatePhone,
    email: row.email,
    address: row.address,
    city: row.city,
    atlStatus: row.atlStatus,
    bookingNumber: row.bookingNumber || row.pboNo,
    externalOrderNumber: row.externalOrderNumber,
    externalInvoiceNumber: row.externalInvoiceNumber,
    invoiceNumber: row.invoiceNumber,
    chassisNumber: row.chassisNumber,
    engineNumber: row.engineNumber,
  };
}

function vehicleInput(row) {
  return {
    vehicleDescription: row.vehicleDescription,
    brandName: row.brandName,
    modelName: row.modelName,
    variantName: row.variantName,
    colorName: row.colorName,
    modelYear: row.modelYear,
    basePrice: row.exFactoryPrice,
  };
}

function incrementMasterCounts(delta, hierarchy, colorResult) {
  ['makes', 'models', 'variants'].forEach((key) => {
    const wasCreated = Boolean(hierarchy.created[key]);
    delta[key][wasCreated ? 'created' : 'reused'] += hierarchy[key === 'makes' ? 'make' : key === 'models' ? 'model' : 'variant'] ? 1 : 0;
  });
  if (colorResult?.color) delta.colors[colorResult.created ? 'created' : 'reused'] += 1;
}

function trackMasterCreates(journal, hierarchy, colorResult) {
  if (hierarchy.created.makes) journal.trackCreate(VehicleMake, hierarchy.make._id);
  if (hierarchy.created.models) journal.trackCreate(VehicleModel, hierarchy.model._id);
  if (hierarchy.created.variants && hierarchy.variant) journal.trackCreate(VehicleVariant, hierarchy.variant._id);
  if (colorResult?.created && colorResult.color) journal.trackCreate(VehicleColor, colorResult.color._id);
}

async function resolveMasterData(row, context, session, journal, delta, { createMissing = true } = {}) {
  const hierarchy = await context.masterData.resolveHierarchy(vehicleInput(row), {
    createMissing,
    session,
    modelYear: row.modelYear,
    basePrice: row.exFactoryPrice,
  });
  const colorResult = await context.masterData.resolveColor(row.colorName, { createMissing, session });
  if (hierarchy.model?._id && Number(row.modelYear) >= 1900 && !Number(hierarchy.model.year)) {
    journal.trackUpdate(VehicleModel, hierarchy.model);
    let modelQuery = VehicleModel.findByIdAndUpdate(
      hierarchy.model._id,
      { $set: { year: Number(row.modelYear) } },
      { returnDocument: 'after' },
    );
    if (session) modelQuery = modelQuery.session(session);
    hierarchy.model = await modelQuery.lean();
  }
  hierarchy.color = colorResult.color;
  incrementMasterCounts(delta, hierarchy, colorResult);
  trackMasterCreates(journal, hierarchy, colorResult);
  return hierarchy;
}

function embeddedMake(hierarchy) {
  return {
    name: hierarchy.make?.name || '',
    code: hierarchy.make?.code || '',
    country: hierarchy.make?.country || '',
  };
}

function embeddedModel(hierarchy, modelYear) {
  const year = Number(modelYear || hierarchy.model?.year || 0) || null;
  return {
    name: hierarchy.model?.name || '',
    code: hierarchy.model?.code || '',
    yearFrom: hierarchy.model?.year || year,
    yearTo: hierarchy.model?.year || year,
  };
}

function embeddedVariant(hierarchy) {
  return {
    name: hierarchy.variant?.name || '',
    code: hierarchy.variant?.code || '',
    engineType: hierarchy.model?.fuel_type || '',
    transmission: hierarchy.model?.transmission || '',
    fuelType: hierarchy.model?.fuel_type || '',
    price: Number(hierarchy.variant?.base_price || 0),
  };
}

function embeddedColor(hierarchy, sourceColor) {
  return {
    name: hierarchy.color?.name || clean(sourceColor),
    code: hierarchy.color?.code || '',
    hexCode: hierarchy.color?.hex_code || '',
  };
}

async function enrichExistingVehicle(vehicle, row, hierarchy, context, session, journal, delta) {
  if (!vehicle?._id) return { vehicle, updated: false };
  const patch = {};
  if (!clean(vehicle.chassisNumber || vehicle.vin) && rawPresent(row.chassisNumber)) {
    patch.chassisNumber = clean(row.chassisNumber);
    patch.vin = clean(row.chassisNumber);
  }
  if (!clean(vehicle.engineNumber) && rawPresent(row.engineNumber)) patch.engineNumber = clean(row.engineNumber);
  if (!vehicle.make?.name && hierarchy.make) patch.make = embeddedMake(hierarchy);
  if (!vehicle.model?.name && hierarchy.model) patch.model = embeddedModel(hierarchy, row.modelYear);
  if (!vehicle.variant?.name && hierarchy.variant) patch.variant = embeddedVariant(hierarchy);
  if (!vehicle.color?.name && (hierarchy.color || rawPresent(row.colorName))) {
    patch.color = embeddedColor(hierarchy, row.colorName);
  }
  if (!Number(vehicle.year) && Number(row.modelYear) >= 1900) patch.year = Number(row.modelYear);
  if (!Object.keys(patch).length) return { vehicle, updated: false };
  journal.trackUpdate(Vehicle, vehicle);
  let query = Vehicle.findByIdAndUpdate(vehicle._id, { $set: patch }, { returnDocument: 'after' });
  if (session) query = query.session(session);
  const updated = await query.lean();
  Object.assign(vehicle, updated);
  context.vehicles.add(vehicle);
  delta.vehicles.updated += 1;
  return { vehicle, updated: true, changedFields: Object.keys(patch) };
}

function masterReferences(hierarchy) {
  const references = {};
  if (hierarchy.make?._id) references.vehicleMake = hierarchy.make._id;
  if (hierarchy.model?._id) references.vehicleModel = hierarchy.model._id;
  if (hierarchy.variant?._id) references.vehicleVariant = hierarchy.variant._id;
  if (hierarchy.color?._id) references.vehicleColor = hierarchy.color._id;
  return references;
}

async function enrichCustomer(customer, data, context, session, journal, delta) {
  const desired = {};
  const mappings = {
    email: clean(data.email).toLowerCase(),
    phone: clean(data.phone),
    alternatePhone: clean(data.alternatePhone),
    relation: clean(data.relation),
    dob: data.dob || null,
    cnic: clean(data.cnic),
    ntn: clean(data.ntn),
    atlStatus: clean(data.atlStatus),
    address: clean(data.address),
    city: clean(data.city),
    customerType: data.customerType || '',
  };
  Object.entries(mappings).forEach(([field, value]) => {
    if (!rawPresent(value)) return;
    // A real source email may replace an import-generated placeholder email.
    const replaceable = !rawPresent(customer[field])
      || (field === 'email' && isGeneratedEmail(customer[field]) && !isGeneratedEmail(value));
    if (replaceable && String(customer[field] || '') !== String(value)) desired[field] = value;
  });
  if (!Object.keys(desired).length) return customer;
  journal.trackUpdate(Customer, customer);
  let query = Customer.findByIdAndUpdate(customer._id, { $set: desired }, { returnDocument: 'after' });
  if (session) query = query.session(session);
  const updated = await query.lean();
  context.customers.add(updated);
  delta.customers.updated += 1;
  return updated;
}

async function resolveSalesCustomer(row, context, session, journal, delta, userId) {
  const data = customerData(row);
  const resolution = await context.customers.resolveOrCreate(data, {
    userId,
    session,
    allowCreate: true,
    related: {
      customers: context.customers.customers,
      bookings: context.bookings.bookings,
      orders: context.orders.orders,
      invoices: context.orders.invoices,
      vehicles: context.orders.vehicles,
    },
  });
  if (resolution.ambiguous) {
    throw new ImportRowError(`Customer could not be resolved because ${resolution.matchBy} matches ${resolution.count} records.`, {
      field: resolution.matchBy,
      value: row[resolution.matchBy] || row.customerName,
      relatedEntity: 'Customer',
    });
  }
  if (!resolution.customer) {
    throw new ImportRowError(`Customer could not be created because required field '${resolution.missingField || 'customer identifier'}' is missing.`, {
      field: resolution.missingField || 'customer',
      missingField: resolution.missingField || 'customer',
      relatedEntity: 'Customer',
    });
  }
  if (resolution.created) {
    journal.trackCreate(Customer, resolution.customer._id);
    delta.customers.created += 1;
  } else delta.customers.reused += 1;
  const customer = await enrichCustomer(resolution.customer, data, context, session, journal, delta);
  // Surfaced by the caller: a shared phone/email pointed at a different customer
  // than the tax number did, and the tax number won.
  if (resolution.weakConflicts?.length) customer._weakIdentityConflicts = resolution.weakConflicts;
  return customer;
}

function resolveSeller(row, context, delta) {
  if (!rawPresent(row.sellerName)) return { user: null, employee: null };
  const resolved = context.sellers.resolve({ sellerName: row.sellerName, sellerRole: row.sellerRole, _meta: row._meta });
  if (resolved.ambiguous || resolved.roleMismatch || (!resolved.user && !resolved.employee)) return resolved;
  delta.sellers.resolved += 1;
  return resolved;
}

async function resolveSellerForImport(row, context, session, journal, delta, userId) {
  return resolveSeller(row, context, delta);
}

// A sales person who has no User/Employee record is normal on this paperwork —
// the name off the report is what the dealer works with, and it is stored on the
// order either way. No warning is raised for it; the seller lookup outcome stays
// in the debug audit for anyone who needs it.
function sellerWarnings() {
  return [];
}

function previewSeller(row, context, plannedSellerKeys, entities) {
  if (!rawPresent(row.sellerName)) return { user: null, employee: null };
  const resolved = context.sellers.resolve({ sellerName: row.sellerName, sellerRole: row.sellerRole, _meta: row._meta });
  if (resolved.user || resolved.employee) entities.sellers.resolved += 1;
  return resolved;
}

async function updateVehicleLifecycle(vehicle, nextStatus, session, journal, delta, source = {}) {
  if (!vehicle?._id) return false;
  journal.trackUpdate(Vehicle, vehicle);
  const result = await applyVehicleLifecycle(vehicle, nextStatus, {
    session,
    userId: source.userId || null,
    sourceType: source.sourceType || '',
    sourceId: source.sourceId || null,
    reference: source.reference || '',
  });
  debugEvent('vehicle.lifecycle.evaluated', {
    vehicleId: String(vehicle._id),
    beforeStatus: vehicle.status || '',
    requestedStatus: nextStatus,
    changed: Boolean(result.changed),
    afterStatus: result.vehicle?.status || vehicle.status || '',
    isStockOut: Boolean(result.vehicle?.isStockOut),
    stockOutDate: result.vehicle?.stockOutDate || null,
    source,
  });
  if (!result.changed) {
    journal.entries.pop();
    return false;
  }
  Object.assign(vehicle, result.vehicle);
  delta.vehicles.updated += 1;
  return true;
}

function paymentEmbedded(row) {
  return (row.payments || []).map((payment) => ({
    importKey: `installment:${lower(row.externalOrderNumber)}:${payment.installmentNo}`,
    installmentNo: payment.installmentNo,
    transactionDate: payment.transactionDate,
    amountReceived: payment.amountReceived,
    instrumentNo: payment.instrumentNumber,
    instrumentDate: payment.instrumentDate,
    instrumentBank: payment.instrumentBank,
    instrumentBranchCity: payment.instrumentBranchCity,
    depositBank: payment.depositBank,
    depositBankBranchName: payment.depositBankBranchName,
    depositBankBranchCode: payment.depositBankBranchCode,
    paymentStatusDate: payment.paymentStatusDate,
    paymentStatus: payment.paymentStatus,
  }));
}

function bookingFields(row, hierarchy, customer, seller, vehicle, stage) {
  const financials = row.financials;
  const fields = {
    externalBookingNumber: normalizeBusinessReference(row.pboNo),
    pboNo: normalizeBusinessReference(row.pboNo),
    importKey: `booking:${lower(row.pboNo)}`,
    externalOrderNumber: clean(row.externalOrderNumber),
    customer: customer._id,
    ...masterReferences(hierarchy),
    preferredColor: hierarchy.color?._id || null,
    saleType: 'vehicle',
    itemDescription: [hierarchy.make?.name, hierarchy.model?.name, hierarchy.variant?.name].filter(Boolean).join(' '),
    status: stage === 'orderSales' ? 'completed' : 'pending',
    // MSRP is the booking total; "On Booking" is the down payment and
    // "Balance Payments" are later instalments — together they are paidAmount.
    bookingAmount: Number(financials.bookingAmount ?? row.onBooking ?? financials.paidAmount ?? 0),
    subsequentPayments: Number(financials.subsequentPayments || 0),
    paidAmount: Number(financials.paidAmount || 0),
    balanceAmount: Number(
      financials.balanceAmount != null
        ? financials.balanceAmount
        : Math.max(0, Number(financials.totalAmount || 0) - Number(financials.paidAmount || 0)),
    ),
    totalAmount: Number(financials.totalAmount || 0),
    taxAmount: Number(financials.taxAmount || 0),
    bookingDate: row.orderDate || row.bookingDate || null,
    deliveryDate: row.deliveryMonth || null,
  };
  if (vehicle?._id) fields.vehicle = vehicle._id;
  if (rawPresent(row.sellerName)) fields.salePerson = clean(row.sellerName);
  if (seller?.user?._id) fields.seller = seller.user._id;
  if (seller?.employee?._id) fields.sellerEmployee = seller.employee._id;
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== ''));
}

async function createOrUpdateBooking(row, hierarchy, customer, seller, vehicle, context, session, journal, delta, userId, stage) {
  const bookingNumber = normalizeBusinessReference(row.pboNo);
  if (!bookingNumber) {
    throw new ImportRowError('A Booking Number/PBO is required to create or link the Booking.', {
      field: 'pboNo', missingField: 'pboNo', relatedEntity: 'Booking',
    });
  }
  const resolution = context.bookings.resolve({
    bookingNumber,
    externalBookingNumber: bookingNumber,
    pboNo: bookingNumber,
    externalOrderNumber: row.externalOrderNumber,
  });
  debugEvent('booking.lookup', {
    _meta: row._meta,
    importStage: stage,
    bookingNumber,
    externalOrderNumber: row.externalOrderNumber || '',
    matchMethod: resolution.matchBy || null,
    existing: Boolean(resolution.booking),
    bookingId: resolution.booking?._id ? String(resolution.booking._id) : null,
    ambiguous: Boolean(resolution.ambiguous),
    candidateCount: resolution.count || (resolution.booking ? 1 : 0),
    existingDetails: resolution.booking || null,
  }, resolution.ambiguous
    ? { section: 'bookings', bucket: 'failed', level: 'error' }
    : (resolution.booking ? { section: 'bookings', bucket: 'existing' } : {}));
  if (resolution.ambiguous) {
    throw new ImportRowError(`Booking references conflict or match ${resolution.count} records (${resolution.matchBy}).`, {
      field: resolution.matchBy, value: bookingNumber, relatedEntity: 'Booking',
    });
  }

  const desired = bookingFields(row, hierarchy, customer, seller, vehicle, stage);
  importTrace("[BOOKING_CREATE_ATTEMPT]", {
    customerId: customer._id,
    pboNo: bookingNumber,
    bookingPayload: {
      bookingNumber,
      ...desired,
      createdBy: userId,
    },
  });
  let booking = resolution.booking;
  if (!booking) {
    const document = {
      bookingNumber,
      ...desired,
      createdBy: userId,
    };
    const bookingDocument = new Booking(document);
    await assertValidDocument(bookingDocument);
    await bookingDocument.save({ session });
    importTrace("[BOOKING_SAVE_SUCCESS]", {
      bookingId: bookingDocument._id,
    });
    let verificationQuery = Booking.findById(bookingDocument._id).lean();
    if (session) verificationQuery = verificationQuery.session(session);
    const verifiedBooking = await verificationQuery;
    importTrace("[BOOKING_DB_VERIFY]", {
      exists: Boolean(verifiedBooking),
      verifiedBooking,
    });
    if (!verifiedBooking) {
      throw new Error(`Booking ${bookingDocument._id} was not found after save.`);
    }
    booking = verifiedBooking;
    journal.trackCreate(Booking, booking._id);
    context.bookings.add(booking);
    delta.bookings.created += 1;
    await customerSnapshotForJournal(customer._id, session, journal);
    await recordCustomerActivity({
      customerId: customer._id,
      docType: 'booking',
      docId: booking._id,
      number: bookingNumber,
      amount: booking.totalAmount || booking.bookingAmount,
      description: `Imported booking ${bookingNumber} — ${booking.itemDescription}`,
      userId,
      session,
    });
    debugEvent('booking.created', {
      _meta: row._meta,
      importStage: stage,
      bookingId: String(booking._id),
      bookingNumber: booking.bookingNumber,
      customerId: booking.customer ? String(booking.customer) : null,
      vehicleId: booking.vehicle ? String(booking.vehicle) : null,
      vehicleVariantId: booking.vehicleVariant ? String(booking.vehicleVariant) : null,
      sellerUserId: booking.seller ? String(booking.seller) : null,
      sellerEmployeeId: booking.sellerEmployee ? String(booking.sellerEmployee) : null,
      sourceSellerText: booking.salePerson || row.sellerName || '',
      status: booking.status,
      existing: false,
      newlyCreated: true,
      conversionStatus: stage === 'orderSales' ? 'converted-by-import' : 'not-converted',
      hasActualVehicleReference: Boolean(booking.vehicle),
    }, { section: 'bookings', bucket: 'newlyCreated' });
    return { booking, changed: true, created: true };
  }

  let effectiveDesired = desired;
  if (stage === 'orderIntake' && ['completed', 'converted'].includes(lower(booking.status))) {
    effectiveDesired = { ...desired, status: booking.status };
  } else if (stage === 'orderSales') {
    const salesLinkFields = new Set([
      'importKey', 'externalOrderNumber', 'customer', 'vehicle', 'status',
      'salePerson', 'seller', 'sellerEmployee',
    ]);
    effectiveDesired = Object.fromEntries(Object.entries(desired).filter(([field]) => salesLinkFields.has(field)));
  }
  const changes = changedFields(booking, effectiveDesired);
  if (!Object.keys(changes).length) {
    delta.bookings.reused += 1;
    debugEvent('booking.reused', {
      _meta: row._meta,
      importStage: stage,
      bookingId: String(booking._id),
      bookingNumber: booking.bookingNumber,
      customerId: booking.customer ? String(booking.customer) : null,
      vehicleId: booking.vehicle ? String(booking.vehicle) : null,
      vehicleVariantId: booking.vehicleVariant ? String(booking.vehicleVariant) : null,
      sellerUserId: booking.seller ? String(booking.seller) : null,
      sellerEmployeeId: booking.sellerEmployee ? String(booking.sellerEmployee) : null,
      sourceSellerText: booking.salePerson || row.sellerName || '',
      status: booking.status,
      existing: true,
      newlyCreated: false,
      conversionStatus: booking.status,
      hasActualVehicleReference: Boolean(booking.vehicle),
    }, { section: 'bookings', bucket: 'existing' });
    return { booking, changed: false, created: false };
  }
  if (userId) changes.updatedBy = userId;
  journal.trackUpdate(Booking, booking);
  let query = Booking.findByIdAndUpdate(booking._id, { $set: changes }, { returnDocument: 'after' });
  if (session) query = query.session(session);
  booking = await query.lean();
  context.bookings.add(booking);
  delta.bookings.updated += 1;
  debugEvent('booking.updated', {
    _meta: row._meta,
    importStage: stage,
    bookingId: String(booking._id),
    bookingNumber: booking.bookingNumber,
    customerId: booking.customer ? String(booking.customer) : null,
    vehicleId: booking.vehicle ? String(booking.vehicle) : null,
    vehicleVariantId: booking.vehicleVariant ? String(booking.vehicleVariant) : null,
    sellerUserId: booking.seller ? String(booking.seller) : null,
    sellerEmployeeId: booking.sellerEmployee ? String(booking.sellerEmployee) : null,
    sourceSellerText: booking.salePerson || row.sellerName || '',
    status: booking.status,
    existing: true,
    newlyCreated: false,
    conversionStatus: booking.status,
    hasActualVehicleReference: Boolean(booking.vehicle),
    changedFields: Object.keys(changes),
  }, { section: 'bookings', bucket: 'existing' });
  return { booking, changed: true, created: false };
}

function salesOrderFields(row, hierarchy, customer, seller, vehicle, booking) {
  const financials = row.financials;
  const description = [hierarchy.make?.name, hierarchy.model?.name, hierarchy.variant?.name].filter(Boolean).join(' ');
  const fields = {
    importKey: `sales-order:${lower(row.externalOrderNumber)}`,
    externalOrderNumber: clean(row.externalOrderNumber),
    customer: customer._id,
    booking: booking._id,
    ...masterReferences(hierarchy),
    saleType: 'vehicle',
    status: 'confirmed',
    subtotal: financials.subtotal,
    taxAmount: financials.taxAmount,
    discountAmount: financials.discountAmount,
    otherCharges: financials.otherCharges + Number(row.adminCharges || 0) + Number(row.premium || 0),
    totalAmount: financials.totalAmount,
    minPartialPayment: Number(row.minPartialPayment || 0),
    deferredPayment: Number(row.deferredPayment || 0),
    adminChargesPercent: Number(row.adminChargesPercent || 0),
    adminCharges: Number(row.adminCharges || 0),
    premium: Number(row.premium || 0),
    items: [{ description, quantity: 1, unitPrice: financials.subtotal, totalPrice: financials.subtotal, type: 'vehicle' }],
  };
  fields.pboNo = normalizeBusinessReference(row.pboNo);
  fields.bookingNo = clean(row.pboNo);
  if (rawPresent(row.externalInvoiceNumber)) fields.invoiceNo = clean(row.externalInvoiceNumber);
  if (vehicle?._id) fields.vehicle = vehicle._id;
  if (row.bookingDate) {
    fields.orderDate = row.bookingDate;
    fields.bookingDate = row.bookingDate;
  }
  if (row.deliveryMonth) fields.deliveryDate = row.deliveryMonth;
  if (row.purchaseOrderDate) fields.poDate = row.purchaseOrderDate;
  if (rawPresent(row.purchaseOrderNumber)) fields.poNo = clean(row.purchaseOrderNumber);
  if (rawPresent(row.dealerName)) fields.dealerName = clean(row.dealerName);
  if (rawPresent(row.dealerCity)) fields.dealerCity = clean(row.dealerCity);
  if (rawPresent(row.sellerName)) fields.salePerson = clean(row.sellerName);
  if (seller.user?._id) fields.seller = seller.user._id;
  if (seller.employee?._id) fields.sellerEmployee = seller.employee._id;
  if (rawPresent(row.buyerType)) fields.buyerType = clean(row.buyerType);
  if (rawPresent(row.orderCategory)) fields.orderCategory = clean(row.orderCategory);
  if (rawPresent(row.unitType)) fields.unitType = clean(row.unitType);
  if ((row.payments || []).length) fields.payments = paymentEmbedded(row);
  return fields;
}

async function createOrUpdateOrder(row, desired, context, session, journal, delta, userId, resolutionData, stage) {
  const resolution = context.orders.resolve(resolutionData);
  debugEvent('salesOrder.lookup', {
    _meta: row._meta,
    importStage: stage,
    sourceOrderNumber: row.externalOrderNumber || '',
    sourceBookingNumber: row.pboNo || '',
    matchMethod: resolution.matchBy || null,
    salesOrderId: resolution.order?._id ? String(resolution.order._id) : null,
    existing: Boolean(resolution.order),
    ambiguous: Boolean(resolution.ambiguous),
    candidateCount: resolution.count || (resolution.order ? 1 : 0),
    existingDetails: resolution.order || null,
  }, resolution.ambiguous
    ? { section: 'salesOrders', bucket: 'failed', level: 'error' }
    : (resolution.order ? { section: 'salesOrders', bucket: 'existing' } : {}));
  if (resolution.ambiguous) {
    throw new ImportRowError(`Sales order references conflict or match ${resolution.count} records (${resolution.matchBy}).`, {
      field: resolution.matchBy, value: row._meta.sourceIdentifier, relatedEntity: 'SalesOrder',
    });
  }
  let order = resolution.order;
  if (order && ['cancelled', 'canceled'].includes(lower(order.status))) {
    throw new ImportRowError(`Sales order ${order.orderNumber} is cancelled and cannot be changed by import.`, {
      field: 'status', value: order.status, relatedEntity: 'SalesOrder',
    });
  }
  if (!order) {
    const orderNumber = await nextDocNumber(SalesOrder, 'orderNumber', 'SO', 6, { session });
    const document = {
      orderNumber,
      ...desired,
      importStages: [stage],
      createdBy: userId,
    };
    order = session
      ? (await SalesOrder.create([document], { session }))[0].toObject()
      : (await SalesOrder.create(document)).toObject();
    journal.trackCreate(SalesOrder, order._id);
    context.orders.addOrder(order);
    delta.salesOrders.created += 1;
    debugEvent('salesOrder.created', {
      _meta: row._meta,
      importStage: stage,
      salesOrderId: String(order._id),
      sourceOrderNumber: order.externalOrderNumber || row.externalOrderNumber || '',
      internalOrderNumber: order.orderNumber || '',
      bookingId: order.booking ? String(order.booking) : null,
      customerId: order.customer ? String(order.customer) : null,
      vehicleId: order.vehicle ? String(order.vehicle) : null,
      sellerText: order.salePerson || row.sellerName || '',
      sellerUserId: order.seller ? String(order.seller) : null,
      sellerEmployeeId: order.sellerEmployee ? String(order.sellerEmployee) : null,
      invoiceId: order.invoice ? String(order.invoice) : null,
      totalAmount: order.totalAmount,
      discount: order.discountAmount,
      paidAmount: order.paidAmount,
      balance: order.balanceAmount,
      status: order.status,
      existing: false,
      newlyCreated: true,
    }, { section: 'salesOrders', bucket: 'newlyCreated' });
    return { order, changed: true, created: true };
  }

  const importStages = [...new Set([...(order.importStages || []), stage].filter(Boolean))];
  let effectiveDesired = { ...desired, importStages };
  if (stage === 'orderSales' && ['dispatched', 'delivered', 'completed'].includes(lower(order.status))) {
    effectiveDesired.status = order.status;
  }
  const hasSalesData = (order.importStages || []).includes('orderSales')
    || rawPresent(order.invoiceNo)
    || rawPresent(order.vehicle)
    || (Array.isArray(order.payments) && order.payments.length > 0);
  if (stage === 'orderIntake' && hasSalesData) {
    const intakeSafeFields = new Set([
      'importKey', 'externalOrderNumber', 'pboNo', 'financeCompany', 'orderDate',
      'deliveryDate', 'orderCategory', 'importStages',
    ]);
    effectiveDesired = Object.fromEntries(Object.entries(effectiveDesired).filter(([field]) => intakeSafeFields.has(field)));
  }
  const changes = changedFields(order, effectiveDesired);
  if (!Object.keys(changes).length) {
    delta.salesOrders.reused += 1;
    debugEvent('salesOrder.reused', {
      _meta: row._meta,
      importStage: stage,
      salesOrderId: String(order._id),
      sourceOrderNumber: order.externalOrderNumber || row.externalOrderNumber || '',
      internalOrderNumber: order.orderNumber || '',
      bookingId: order.booking ? String(order.booking) : null,
      customerId: order.customer ? String(order.customer) : null,
      vehicleId: order.vehicle ? String(order.vehicle) : null,
      sellerText: order.salePerson || row.sellerName || '',
      sellerUserId: order.seller ? String(order.seller) : null,
      sellerEmployeeId: order.sellerEmployee ? String(order.sellerEmployee) : null,
      invoiceId: order.invoice ? String(order.invoice) : null,
      totalAmount: order.totalAmount,
      discount: order.discountAmount,
      paidAmount: order.paidAmount,
      balance: order.balanceAmount,
      status: order.status,
      existing: true,
      newlyCreated: false,
    }, { section: 'salesOrders', bucket: 'existing' });
    return { order, changed: false, created: false };
  }
  if (userId) changes.updatedBy = userId;
  journal.trackUpdate(SalesOrder, order);
  let query = SalesOrder.findByIdAndUpdate(order._id, { $set: changes }, { returnDocument: 'after' });
  if (session) query = query.session(session);
  order = await query.lean();
  context.orders.addOrder(order);
  delta.salesOrders.updated += 1;
  debugEvent('salesOrder.updated', {
    _meta: row._meta,
    importStage: stage,
    salesOrderId: String(order._id),
    sourceOrderNumber: order.externalOrderNumber || row.externalOrderNumber || '',
    internalOrderNumber: order.orderNumber || '',
    bookingId: order.booking ? String(order.booking) : null,
    customerId: order.customer ? String(order.customer) : null,
    vehicleId: order.vehicle ? String(order.vehicle) : null,
    sellerText: order.salePerson || row.sellerName || '',
    sellerUserId: order.seller ? String(order.seller) : null,
    sellerEmployeeId: order.sellerEmployee ? String(order.sellerEmployee) : null,
    invoiceId: order.invoice ? String(order.invoice) : null,
    totalAmount: order.totalAmount,
    discount: order.discountAmount,
    paidAmount: order.paidAmount,
    balance: order.balanceAmount,
    status: order.status,
    existing: true,
    newlyCreated: false,
    changedFields: Object.keys(changes),
  }, { section: 'salesOrders', bucket: 'existing' });
  return { order, changed: true, created: false };
}

async function customerSnapshotForJournal(customerId, session, journal) {
  if (!customerId) return;
  let query = Customer.findById(customerId).lean();
  if (session) query = query.session(session);
  const before = await query;
  if (before) journal.trackUpdate(Customer, before);
}

function invoiceStatus(total, paid) {
  if (Number(paid) >= Number(total) && Number(total) > 0) return 'paid';
  if (Number(paid) > 0) return 'partial';
  return 'draft';
}

async function ensureInvoice(row, order, seller, context, session, journal, delta, userId) {
  await customerSnapshotForJournal(order.customer, session, journal);
  if (!order.invoice) journal.trackUpdate(SalesOrder, order);
  const result = await createInvoiceForOrder(order, {
    userId,
    session,
    invoiceDate: row.invoiceDate || row.bookingDate || null,
    externalInvoiceNumber: clean(row.externalInvoiceNumber),
    seller: seller?.user?._id || null,
    sellerEmployee: seller?.employee?._id || null,
    salePerson: clean(row.sellerName),
    importKey: `invoice:${order._id}`,
  });
  debugEvent('invoice.lookup_or_create', {
    _meta: row._meta,
    sourceInvoiceNumber: row.externalInvoiceNumber || '',
    salesOrderId: String(order._id),
    existingOrNew: result.created ? 'new' : 'existing',
    invoiceId: result.invoice?._id ? String(result.invoice._id) : null,
  }, { section: 'invoices', bucket: result.created ? 'newlyCreated' : 'existing' });
  let invoice = result.invoice.toObject ? result.invoice.toObject() : result.invoice;
  if (result.created) {
    journal.trackCreate(Invoice, invoice._id);
    delta.invoices.created += 1;
  } else delta.invoices.reused += 1;

  const desired = {
    importKey: invoice.importKey || `invoice:${order._id}`,
    externalInvoiceNumber: clean(row.externalInvoiceNumber) || invoice.externalInvoiceNumber || '',
    seller: seller?.user?._id || invoice.seller || null,
    sellerEmployee: seller?.employee?._id || invoice.sellerEmployee || null,
    salePerson: clean(row.sellerName) || invoice.salePerson || order.salePerson || '',
    invoiceDate: row.invoiceDate || invoice.invoiceDate,
    subtotal: order.subtotal,
    taxAmount: order.taxAmount,
    discountAmount: order.discountAmount,
    totalAmount: order.totalAmount,
    paidAmount: order.paidAmount,
    balanceAmount: order.balanceAmount,
    status: invoiceStatus(order.totalAmount, order.paidAmount),
  };
  if (clean(row.externalInvoiceNumber) && clean(invoice.externalInvoiceNumber)
    && lower(row.externalInvoiceNumber) !== lower(invoice.externalInvoiceNumber)) {
    throw new ImportRowError(`Order already has external invoice "${invoice.externalInvoiceNumber}", not "${row.externalInvoiceNumber}".`, {
      field: 'externalInvoiceNumber', value: row.externalInvoiceNumber, relatedEntity: 'Invoice',
    });
  }
  const changes = changedFields(invoice, desired);
  if (Object.keys(changes).length) {
    if (!result.created) journal.trackUpdate(Invoice, invoice);
    let query = Invoice.findByIdAndUpdate(invoice._id, { $set: changes }, { returnDocument: 'after' });
    if (session) query = query.session(session);
    invoice = await query.lean();
    if (!result.created) delta.invoices.updated += 1;
  }
  order.invoice = invoice._id;
  context.orders.addInvoice(order._id, invoice);
  debugEvent('invoice.resolved', {
    _meta: row._meta,
    invoiceId: String(invoice._id),
    internalInvoiceNumber: invoice.invoiceNumber || '',
    sourceInvoiceNumber: invoice.externalInvoiceNumber || row.externalInvoiceNumber || '',
    salesOrderId: invoice.salesOrder ? String(invoice.salesOrder) : String(order._id),
    bookingId: order.booking ? String(order.booking) : null,
    customerId: invoice.customer ? String(invoice.customer) : (order.customer ? String(order.customer) : null),
    vehicleId: order.vehicle ? String(order.vehicle) : null,
    directInvoiceVehicleId: invoice.vehicle ? String(invoice.vehicle) : null,
    sellerUserId: invoice.seller ? String(invoice.seller) : null,
    sellerEmployeeId: invoice.sellerEmployee ? String(invoice.sellerEmployee) : null,
    sellerText: invoice.salePerson || order.salePerson || row.sellerName || '',
    total: invoice.totalAmount,
    discount: invoice.discountAmount,
    paid: invoice.paidAmount,
    balance: invoice.balanceAmount,
    paymentTransactionIds: [],
    status: invoice.status,
    existing: !result.created,
    newlyCreated: Boolean(result.created),
    changedFields: Object.keys(changes),
    schemaObservation: invoice.vehicle == null
      ? 'Invoice schema has no direct vehicle field; vehicle is reachable through Invoice.salesOrder -> SalesOrder.vehicle.'
      : '',
  }, { section: 'invoices', bucket: result.created ? 'newlyCreated' : 'existing' });
  return { invoice, changed: result.created || Object.keys(changes).length > 0 };
}

function normalizedPaymentStatus(value) {
  const status = lower(value);
  if (!status || ['received', 'realized', 'cleared', 'paid', 'complete', 'completed'].includes(status)) return 'completed';
  if (['pending', 'processing', 'deposited'].includes(status)) return 'pending';
  if (['failed', 'rejected', 'cancelled', 'canceled', 'bounced'].includes(status)) return 'failed';
  return status;
}

async function importPayments(row, invoice, customer, context, session, journal, delta, userId) {
  const sources = row.payments?.length
    ? row.payments
    : (() => {
      const amount = ['totalAmountReceived', 'advancePayment', 'depositAmount', 'receiptAmount']
        .map((field) => Number(row[field]))
        .find((value) => Number.isFinite(value) && value > 0);
      return amount ? [{ installmentNo: null, amountReceived: amount, paymentStatus: 'completed' }] : [];
    })();
  debugEvent('payment.evidence.evaluated', {
    _meta: row._meta,
    invoiceId: String(invoice._id),
    salesOrderId: invoice.salesOrder ? String(invoice.salesOrder) : null,
    sourceFields: row.payments?.length
      ? ['installment payment cells']
      : ['totalAmountReceived', 'advancePayment', 'depositAmount', 'receiptAmount']
        .filter((field) => Number(row[field]) > 0),
    installmentEvidenceCount: row.payments?.length || 0,
    selectedPaymentCount: sources.length,
    customerSalePriceTreatedAsPayment: false,
    selectedPayments: sources,
  });
  let changed = false;
  for (const source of sources) {
    const reference = lower(source.instrumentNumber || source.depositBankBranchCode || (source.installmentNo == null ? 'aggregate' : 'none'));
    const paymentDateKey = source.transactionDate instanceof Date
      ? source.transactionDate.toISOString().slice(0, 10)
      : lower(source.transactionDate || source.paymentStatusDate);
    const importKey = [
      'payment',
      String(invoice.salesOrder || invoice._id),
      source.installmentNo == null ? 'aggregate' : source.installmentNo,
      Number(source.amountReceived),
      paymentDateKey || 'no-date',
      reference,
    ].join(':');
    const duplicateConditions = [
      { importKey },
      { invoice: invoice._id, installmentNo: source.installmentNo },
    ];
    if (rawPresent(source.instrumentNumber)) {
      duplicateConditions.push({
        invoice: invoice._id,
        referenceNumber: clean(source.instrumentNumber),
        amount: source.amountReceived,
      });
    }
    let query = Payment.findOne({ $or: duplicateConditions });
    if (session) query = query.session(session);
    const existing = await query.lean();
    if (existing) {
      if (Number(existing.amount) !== Number(source.amountReceived)) {
        throw new ImportRowError(`Payment reference already exists with amount ${existing.amount}, not ${source.amountReceived}.`, {
          field: source.installmentNo == null ? 'totalAmountReceived' : `payments.${source.installmentNo}.amountReceived`,
          value: source.amountReceived,
          relatedEntity: 'Payment',
          code: 'CONFLICTING_REFERENCE',
        });
      }
      delta.payments.skipped += 1;
      debugEvent('payment.duplicate_prevented', {
        _meta: row._meta,
        paymentId: String(existing._id),
        invoiceId: String(invoice._id),
        salesOrderId: invoice.salesOrder ? String(invoice.salesOrder) : null,
        amount: existing.amount,
        date: existing.paymentDate || null,
        method: existing.method || null,
        sourceField: source.installmentNo == null ? 'aggregate explicit received amount' : `installment ${source.installmentNo}`,
        importKey,
        existing: true,
        newlyCreated: false,
      }, { section: 'payments', bucket: 'duplicatesPrevented' });
      continue;
    }
    const paymentNumber = await nextDocNumber(Payment, 'paymentNumber', 'PAY', 6, { session });
    const notes = [
      source.instrumentBank && `Instrument bank: ${source.instrumentBank}`,
      source.instrumentBranchCity && `Instrument branch/city: ${source.instrumentBranchCity}`,
      source.depositBank && `Deposit bank: ${source.depositBank}`,
      source.depositBankBranchName && `Deposit branch: ${source.depositBankBranchName}`,
      source.depositBankBranchCode && `Deposit branch code: ${source.depositBankBranchCode}`,
      source.installmentNo == null && 'Source evidence: aggregate amount received',
    ].filter(Boolean).join('; ');
    const document = {
      paymentNumber,
      importKey,
      installmentNo: source.installmentNo,
      invoice: invoice._id,
      customer: customer._id,
      amount: source.amountReceived,
      paymentDate: source.transactionDate || source.paymentStatusDate || null,
      referenceNumber: clean(source.instrumentNumber) || (source.installmentNo == null ? `aggregate:${invoice.externalInvoiceNumber || invoice.invoiceNumber}` : ''),
      notes,
      status: normalizedPaymentStatus(source.paymentStatus),
      createdBy: userId,
    };
    const payment = session
      ? (await Payment.create([document], { session }))[0]
      : await Payment.create(document);
    journal.trackCreate(Payment, payment._id);
    delta.payments.created += 1;
    changed = true;
    debugEvent('payment.created', {
      _meta: row._meta,
      paymentId: String(payment._id),
      invoiceId: String(invoice._id),
      salesOrderId: invoice.salesOrder ? String(invoice.salesOrder) : null,
      amount: source.amountReceived,
      date: source.transactionDate || source.paymentStatusDate || null,
      method: payment.method || null,
      sourceField: source.installmentNo == null ? 'aggregate explicit received amount' : `installment ${source.installmentNo}`,
      importKey,
      existing: false,
      newlyCreated: true,
    }, { section: 'payments', bucket: 'newlyCreated' });

    await customerSnapshotForJournal(customer._id, session, journal);
    await recordCustomerActivity({
      customerId: customer._id,
      docType: 'payment',
      docId: payment._id,
      number: paymentNumber,
      amount: source.amountReceived,
      description: `Imported ${source.installmentNo == null ? 'aggregate payment' : `installment ${source.installmentNo}`} for invoice ${invoice.invoiceNumber}`,
      userId,
      paidDelta: source.amountReceived,
      outstandingDelta: 0,
      session,
    });
  }

  let paymentsQuery = Payment.find({ invoice: invoice._id }).select('amount').lean();
  if (session) paymentsQuery = paymentsQuery.session(session);
  const payments = await paymentsQuery;
  const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const invoiceChanges = {
    paidAmount,
    balanceAmount: Math.max(0, Number(invoice.totalAmount || 0) - paidAmount),
    status: invoiceStatus(invoice.totalAmount, paidAmount),
  };
  const invoiceDelta = changedFields(invoice, invoiceChanges);
  if (Object.keys(invoiceDelta).length) {
    journal.trackUpdate(Invoice, invoice);
    let invoiceQuery = Invoice.findByIdAndUpdate(invoice._id, { $set: invoiceDelta }, { returnDocument: 'after' });
    if (session) invoiceQuery = invoiceQuery.session(session);
    Object.assign(invoice, await invoiceQuery.lean());
    changed = true;
  }
  if (invoice.salesOrder) {
    let orderQuery = SalesOrder.findById(invoice.salesOrder).lean();
    if (session) orderQuery = orderQuery.session(session);
    const order = await orderQuery;
    if (order) {
      const orderDelta = changedFields(order, {
        paidAmount,
        balanceAmount: Math.max(0, Number(order.totalAmount || invoice.totalAmount || 0) - paidAmount),
      });
      if (Object.keys(orderDelta).length) {
        journal.trackUpdate(SalesOrder, order);
        let updateQuery = SalesOrder.findByIdAndUpdate(order._id, { $set: orderDelta }, { returnDocument: 'after' });
        if (session) updateQuery = updateQuery.session(session);
        await updateQuery;
      }
    }
  }
  debugEvent('payment.ledger.reconciled', {
    _meta: row._meta,
    invoiceId: String(invoice._id),
    salesOrderId: invoice.salesOrder ? String(invoice.salesOrder) : null,
    paymentTransactionIds: payments.map((payment) => String(payment._id)),
    paymentCount: payments.length,
    paymentSum: paidAmount,
    invoiceTotal: invoice.totalAmount,
    invoicePaid: invoice.paidAmount,
    invoiceBalance: invoice.balanceAmount,
    invoiceStatus: invoice.status,
  });
  return changed;
}

async function resolveIntakeCustomer(row, context, session, journal, delta, userId) {
  const data = customerData(row);
  const resolution = await context.customers.resolveOrCreate(data, {
    userId,
    session,
    allowCreate: true,
    allowNameOnly: true,
    related: {
      customers: context.customers.customers,
      bookings: context.bookings.bookings,
      orders: context.orders.orders,
      invoices: context.orders.invoices,
      vehicles: context.orders.vehicles,
    },
  });
  if (resolution.ambiguous) {
    throw new ImportRowError(`Customer could not be resolved because ${resolution.matchBy} matches conflicting records.`, {
      field: resolution.matchBy,
      value: row.customerName,
      relatedEntity: 'Customer',
      code: resolution.conflict ? 'CONFLICTING_CUSTOMER_IDENTITY' : 'AMBIGUOUS_CUSTOMER_IDENTITY',
    });
  }
  if (!resolution.customer) {
    throw new ImportRowError(`Order Intake customer could not be created because '${resolution.missingField || 'customer identity'}' is missing.`, {
      field: resolution.missingField || 'customer',
      missingField: resolution.missingField || 'customer',
      relatedEntity: 'Customer',
    });
  }
  if (resolution.created) {
    journal.trackCreate(Customer, resolution.customer._id);
    delta.customers.created += 1;
  } else {
    delta.customers.reused += 1;
  }
  return resolution.customer;
}
function buildSalesDependencyIndex(parsedFiles) {
  const index = new Map();
  parsedFiles
    .filter((parsed) => parsed.logicalType === 'orderSales')
    .flatMap((parsed) => parsed.records.map((record) => normalizeRecord(record, 'orderSales').value))
    .forEach((row) => {
      [
        row.pboNo && `pbo:${lower(row.pboNo)}`,
        row.externalOrderNumber && `order:${lower(row.externalOrderNumber)}`,
      ].filter(Boolean).forEach((key) => index.set(key, row));
    });
  return index;
}

function salesDependencyFor(row, dependencyIndex) {
  return dependencyIndex.get(`pbo:${lower(row.pboNo)}`)
    || dependencyIndex.get(`order:${lower(row.externalOrderNumber)}`)
    || null;
}

// Order Intake rows carry only the applicant name; the matching Order Sales
// row (same PBO/order number) holds the full customer identity. Borrow the
// missing identity fields so Intake creates the same, richer customer the
// Sales stage would otherwise have to reconcile.
const INTAKE_DEPENDENCY_FIELDS = [
  'customerType', 'customerCode', 'cnic', 'ntn', 'phone', 'alternatePhone',
  'email', 'relation', 'dob', 'address', 'city', 'atlStatus',
  'sellerName', 'sellerRole',
];

/**
 * `normalized` may be the row itself or the { value, errors, warnings } wrapper.
 * Passing the wrapper also clears warnings the borrowed values just satisfied.
 */
function mergeIntakeDependency(normalized, dependencyIndex) {
  const row = normalized?.value || normalized;
  if (!row || !dependencyIndex) return row;
  const dependency = salesDependencyFor(row, dependencyIndex);
  if (!dependency) return row;
  const filled = [];
  INTAKE_DEPENDENCY_FIELDS.forEach((field) => {
    const value = dependency[field];
    const present = value instanceof Date ? true : rawPresent(value);
    if (present && !rawPresent(row[field]) && !(row[field] instanceof Date)) {
      row[field] = value;
      filled.push(field);
    }
  });
  if (filled.length && Array.isArray(normalized?.warnings)) {
    normalized.warnings = normalized.warnings.filter((warning) => !(
      warning.errorType === 'MISSING_OPTIONAL_VALUE' && filled.includes(warning.field)
    ));
  }
  return row;
}


async function processIntakeRow(row, context, atomicOptions, userId, dependencyIndex) {
  mergeIntakeDependency(row, dependencyIndex);
  return runAtomicRow(async ({ session, journal }) => {
    const delta = newEntityDelta();
    const hierarchy = await resolveMasterData(row, context, session, journal, delta);
    const customer = await resolveIntakeCustomer(row, context, session, journal, delta, userId);
    const seller = await resolveSellerForImport(row, context, session, journal, delta, userId);
    const bookingResult = await createOrUpdateBooking(
      row,
      hierarchy,
      customer,
      seller,
      null,
      context,
      session,
      journal,
      delta,
      userId,
      'orderIntake',
    );
    const identifiers = {
      customerId: String(customer._id),
      bookingId: String(bookingResult.booking._id),
      vehicleId: bookingResult.booking.vehicle ? String(bookingResult.booking.vehicle) : null,
      salesOrderId: null,
      invoiceId: null,
      paymentIds: [],
      dispatchId: null,
    };
    recordRelationship(row, {
      customer: identifiers.customerId,
      booking: identifiers.bookingId,
      vehicle: bookingResult.booking?.vehicle ? String(bookingResult.booking.vehicle) : null,
      salesOrder: null,
      invoice: null,
      payments: [],
      dispatch: null,
      sellerSourceText: row.sellerName || '',
      sellerUser: seller.user?._id ? String(seller.user._id) : null,
      sellerEmployee: seller.employee?._id ? String(seller.employee._id) : null,
    }, [
      ...(bookingResult.booking?.customer ? [] : ['Booking.customer is missing.']),
      ...(bookingResult.booking?.vehicle ? [] : ['Order Intake has no actual Vehicle allocation; only the variant hierarchy may be present until Sales import.']),
      ...((seller.user || seller.employee || !row.sellerName) ? [] : [`Source seller "${row.sellerName}" has no active existing User/Employee match; text is preserved and auto-creation is disabled.`]),
    ]);
    return {
      classification: bookingResult.changed ? (bookingResult.created ? 'created' : 'updated') : 'duplicate',
      delta,
      warnings: sellerWarnings(row, seller),
      identifiers,
    };
  }, atomicOptions);
}

function orderMatchesBusinessReference(order, row) {
  if (!order) return false;
  const incomingPbo = normalizeBusinessReference(row.pboNo);
  const storedPbo = normalizeBusinessReference(order.pboNo || order.bookingNo);
  return Boolean(
    (incomingPbo && storedPbo === incomingPbo)
    || (clean(row.externalOrderNumber) && lower(order.externalOrderNumber) === lower(row.externalOrderNumber))
  );
}

function assertVehicleAvailableForSale(vehicle, row, context, resolvedOrder = null) {
  if (!vehicle?._id) return;
  const linkedOrders = [...context.orders.orders.values()]
    .filter((order) => order.vehicle && String(order.vehicle) === String(vehicle._id));
  const sameOrder = linkedOrders.find((order) => (
    (resolvedOrder && String(order._id) === String(resolvedOrder._id))
    || orderMatchesBusinessReference(order, row)
  ));
  const conflictingOrder = linkedOrders.find((order) => !sameOrder || String(order._id) !== String(sameOrder._id));
  const unavailable = ['sold', 'dispatched', 'delivered'].includes(
    String(vehicle.status || '').trim().toLowerCase(),
  ) || Boolean(vehicle.isStockOut || vehicle.stockOut);
  // A stock dispatch marks the unit dispatched without any order behind it. If a
  // Sales row for that very PBO shows up later it owns the unit, so the earlier
  // stock dispatch must not read as "already sold to someone else".
  const incomingPbo = normalizeBusinessReference(row.pboNo);
  const stockDispatchPbo = normalizeBusinessReference(vehicle.dispatch?.pboNo);
  const claimedByOwnStockDispatch = !linkedOrders.length
    && vehicle.dispatch?.source === 'stock_dispatch'
    && Boolean(incomingPbo)
    && stockDispatchPbo === incomingPbo;
  if (conflictingOrder || (unavailable && !sameOrder && !claimedByOwnStockDispatch)) {
    const existing = conflictingOrder || linkedOrders[0] || null;
    throw new ImportRowError(
      `Vehicle already sold/dispatched and cannot be sold again. Vehicle ${vehicle._id}; chassis ${vehicle.chassisNumber || vehicle.vin || ''}; engine ${vehicle.engineNumber || ''}; existing SalesOrder ${existing?._id || 'unknown'}; existing customer ${existing?.customer || 'unknown'}; incoming order ${row.externalOrderNumber || ''}.`,
      {
        field: 'vehicle',
        value: String(vehicle._id),
        relatedEntity: 'Vehicle/SalesOrder',
        code: 'VEHICLE_ALREADY_SOLD_OR_DISPATCHED',
      },
    );
  }
}

async function processSalesRow(row, context, atomicOptions, userId) {
  return runAtomicRow(async ({ session, journal }) => {
    const delta = newEntityDelta();
    const hierarchy = await resolveMasterData(row, context, session, journal, delta);
    const existingBooking = context.bookings.resolve({
      bookingNumber: row.pboNo,
      externalBookingNumber: row.pboNo,
      pboNo: row.pboNo,
      externalOrderNumber: row.externalOrderNumber,
    });
    if (existingBooking.ambiguous) {
      throw new ImportRowError(`Booking references conflict or match ${existingBooking.count} records.`, {
        field: existingBooking.matchBy,
        value: row.pboNo,
        relatedEntity: 'Booking',
        code: existingBooking.conflict ? 'CONFLICTING_REFERENCE' : 'AMBIGUOUS_REFERENCE',
      });
    }

    let customer = null;
    if (existingBooking.booking?.customer) {
      customer = context.customers.customers.get(String(existingBooking.booking.customer)) || null;
      if (customer) {
        delta.customers.reused += 1;
        customer = await enrichCustomer(customer, customerData(row), context, session, journal, delta);
      }
    }
    if (!customer) customer = await resolveSalesCustomer(row, context, session, journal, delta, userId);
    const seller = await resolveSellerForImport(row, context, session, journal, delta, userId);

    let vehicle = null;
    let vehicleChanged = false;
    if ([row.chassisNumber, row.engineNumber].some(rawPresent)) {
      const vehicleResult = await context.vehicles.resolveOrCreate({
        _meta: row._meta,
        stage: 'orderSales',
        chassisNumber: row.chassisNumber,
        engineNumber: row.engineNumber,
        modelYear: row.modelYear,
        colorName: row.colorName,
        purchasePrice: row.exFactoryPrice,
        salePrice: row.financials.totalAmount,
        bookingDate: row.bookingDate,
      }, hierarchy, { session, userId, allowCreate: true });
      if (vehicleResult.ambiguous) {
        throw new ImportRowError(`Vehicle identifiers conflict or match ${vehicleResult.count} records (${vehicleResult.matchBy}).`, {
          field: vehicleResult.matchBy,
          value: row.chassisNumber || row.engineNumber,
          relatedEntity: 'Vehicle',
          code: vehicleResult.conflict ? 'VEHICLE_IDENTITY_CONFLICT' : 'AMBIGUOUS_VEHICLE_IDENTITY',
        });
      }
      if (!vehicleResult.vehicle) {
        throw new ImportRowError(`Vehicle could not be resolved because '${vehicleResult.missingField || 'vehicle identity'}' is missing.`, {
          field: vehicleResult.missingField || 'vehicle',
          missingField: vehicleResult.missingField || 'vehicle',
          relatedEntity: 'Vehicle',
        });
      }
      vehicle = vehicleResult.vehicle;
      if (vehicleResult.created) {
        journal.trackCreate(Vehicle, vehicle._id);
        delta.vehicles.created += 1;
        vehicleChanged = true;
      } else {
        delta.vehicles.reused += 1;
        const enrichment = await enrichExistingVehicle(vehicle, row, hierarchy, context, session, journal, delta);
        vehicle = enrichment.vehicle;
        vehicleChanged = enrichment.updated;
      }
    }

    const preexistingOrder = context.orders.resolve({
      externalOrderNumber: row.externalOrderNumber,
      pboNo: row.pboNo,
      externalInvoiceNumber: row.externalInvoiceNumber,
    });
    if (preexistingOrder.ambiguous) {
      throw new ImportRowError(`Sales order references conflict or match ${preexistingOrder.count} records.`, {
        field: preexistingOrder.matchBy,
        value: row.externalOrderNumber || row.pboNo,
        relatedEntity: 'SalesOrder',
        code: preexistingOrder.conflict ? 'CONFLICTING_REFERENCE' : 'AMBIGUOUS_REFERENCE',
      });
    }
    assertVehicleAvailableForSale(vehicle, row, context, preexistingOrder.order);

    const bookingResult = await createOrUpdateBooking(
      row,
      hierarchy,
      customer,
      seller,
      vehicle,
      context,
      session,
      journal,
      delta,
      userId,
      'orderSales',
    );
    const desired = salesOrderFields(row, hierarchy, customer, seller, vehicle, bookingResult.booking);
    if (!preexistingOrder.order) {
      // Seed from the source columns (Total Amount Received / Balance Amount);
      // importPayments then re-derives both from the real Payment ledger once
      // an invoice exists, so the ledger stays the final authority.
      desired.paidAmount = Number(row.financials.paidAmount || 0);
      desired.balanceAmount = Number(
        row.financials.balanceAmount != null
          ? row.financials.balanceAmount
          : Math.max(0, Number(row.financials.totalAmount || 0) - Number(row.financials.paidAmount || 0)),
      );
    }
    const orderResult = await createOrUpdateOrder(
      row,
      desired,
      context,
      session,
      journal,
      delta,
      userId,
      {
        externalOrderNumber: row.externalOrderNumber,
        pboNo: row.pboNo,
        externalInvoiceNumber: row.externalInvoiceNumber,
        chassisNumber: row.chassisNumber,
        engineNumber: row.engineNumber,
      },
      'orderSales',
    );

    let vehicleStatusChanged = false;
    if (vehicle) {
      // A unit already dispatched/delivered (e.g. by an earlier stock dispatch)
      // must not be regressed back to "sold" by the Sales stage.
      if (!['sold', 'dispatched', 'delivered'].includes(canonicalStatus(vehicle.status))) {
        vehicleStatusChanged = await updateVehicleLifecycle(
          vehicle,
          'sold',
          session,
          journal,
          delta,
          {
            userId,
            sourceType: 'sales_order',
            sourceId: orderResult.order._id,
            reference: orderResult.order.orderNumber,
          },
        );
      }
      context.orders.addVehicle(orderResult.order._id, vehicle);
      // A unit stock-dispatched under this same PBO now has a known owner, so
      // bind that dispatch evidence to the Sales Order.
      const stockPbo = normalizeBusinessReference(vehicle.dispatch?.pboNo);
      if (vehicle.dispatch?.source === 'stock_dispatch'
        && stockPbo && stockPbo === normalizeBusinessReference(row.pboNo)) {
        journal.trackUpdate(Vehicle, vehicle);
        let linkQuery = Vehicle.findByIdAndUpdate(
          vehicle._id,
          { $set: { 'dispatch.salesOrder': orderResult.order._id, 'dispatch.source': 'sales_order' } },
          { returnDocument: 'after' },
        );
        if (session) linkQuery = linkQuery.session(session);
        Object.assign(vehicle, await linkQuery.lean());
        context.vehicles.add(vehicle);
        vehicleChanged = true;
      }
    }

    const existingInvoice = orderResult.order.invoice
      || [...context.orders.invoices.values()].find(
        (invoice) => String(invoice.salesOrder) === String(orderResult.order._id),
      )?._id;
    let invoiceResult = null;
    let paymentsChanged = false;
    const warnings = sellerWarnings(row, seller);
    // A shared desk phone/email pointing at a different customer is normal on
    // this paperwork; the stronger identifier already decided the link, so the
    // overruled match is audit detail rather than a per-row warning.
    (customer?._weakIdentityConflicts || []).forEach((conflict) => {
      debugEvent('customer.weak_identity_overruled', {
        _meta: row._meta,
        field: conflict.field,
        value: conflict.value || '',
        overruledCustomerId: conflict.customerId || '',
        keptCustomerId: String(customer._id),
      });
    });
    // Money received against a confirmed order is a receivable, so it needs an
    // Invoice to hold it even when Dealer Pro left the "Invoice No" cell empty
    // (an internal INV-… number is generated; externalInvoiceNumber stays blank).
    const hasPaymentEvidence = (row.payments || []).length > 0
      || Number(row.financials?.paidAmount) > 0
      || Number(row.totalAmountReceived) > 0;
    const orderTotal = Number(orderResult.order.totalAmount || 0);
    if (rawPresent(row.externalInvoiceNumber) || existingInvoice || (hasPaymentEvidence && orderTotal > 0)) {
      if (existingInvoice && !orderResult.order.invoice) orderResult.order.invoice = existingInvoice;
      invoiceResult = await ensureInvoice(row, orderResult.order, seller, context, session, journal, delta, userId);
      paymentsChanged = await importPayments(
        row,
        invoiceResult.invoice,
        customer,
        context,
        session,
        journal,
        delta,
        userId,
      );
    } else if (hasPaymentEvidence) {
      warnings.push(rowWarning(row, `Payment evidence was preserved but no Invoice or Payment was created because the Sales Order total is ${orderTotal}.`, {
        errorType: 'INVOICE_EVIDENCE_REQUIRED',
        field: 'totalReceivable',
        relatedEntity: 'Invoice/Payment',
      }));
    }

    let paymentIds = [];
    if (invoiceResult?.invoice?._id) {
      let paymentIdsQuery = Payment.find({ invoice: invoiceResult.invoice._id }).select('_id').lean();
      if (session) paymentIdsQuery = paymentIdsQuery.session(session);
      paymentIds = (await paymentIdsQuery).map((payment) => String(payment._id));
    }
    const missing = [
      ...(!customer?._id ? ['SalesOrder customer could not be resolved.'] : []),
      ...(!bookingResult.booking?._id ? ['SalesOrder booking relationship is missing.'] : []),
      ...((seller.user || seller.employee || !row.sellerName) ? [] : [`Source seller "${row.sellerName}" has no active existing User/Employee match; text is preserved.`]),
      ...(!vehicle ? ['Physical Vehicle allocation is pending; Dispatch must attach chassis/engine before dispatching.'] : []),
      ...(!invoiceResult ? ['Invoice is pending because no source invoice evidence exists.'] : []),
    ];
    const identifiers = {
      customerId: String(customer._id),
      bookingId: String(bookingResult.booking._id),
      vehicleId: vehicle?._id ? String(vehicle._id) : null,
      salesOrderId: String(orderResult.order._id),
      invoiceId: invoiceResult?.invoice?._id ? String(invoiceResult.invoice._id) : null,
      paymentIds,
      dispatchId: null,
    };
    recordRelationship(row, {
      customer: identifiers.customerId,
      booking: identifiers.bookingId,
      vehicle: identifiers.vehicleId,
      salesOrder: identifiers.salesOrderId,
      invoice: identifiers.invoiceId,
      payments: paymentIds,
      dispatch: null,
      sellerSourceText: row.sellerName || '',
      sellerUser: seller.user?._id ? String(seller.user._id) : null,
      sellerEmployee: seller.employee?._id ? String(seller.employee._id) : null,
    }, missing);
    const changed = bookingResult.changed || orderResult.changed || invoiceResult?.changed || paymentsChanged
      || vehicleStatusChanged || vehicleChanged || delta.customers.created || delta.customers.updated
      || delta.vehicles.created || delta.makes.created || delta.models.created
      || delta.variants.created || delta.colors.created;
    return {
      classification: changed ? (orderResult.created ? 'created' : 'updated') : 'duplicate',
      delta,
      warnings,
      identifiers,
    };
  }, atomicOptions);
}

function dispatchInfoFields(row, { salesOrder = null, source = '' } = {}) {
  const fields = {
    dispatchNo: clean(row.dispatchNumber),
    dispatchDate: row.dispatchDate || null,
    pboNo: normalizeBusinessReference(row.pboNo),
    invoiceNo: clean(row.externalInvoiceNumber),
    invoiceDate: row.invoiceDate || null,
    sapOrderNo: clean(row.sapOrderNumber),
    transportCompany: clean(row.transportCompany),
    builtyNo: clean(row.builtyNumber),
    shipFrom: clean(row.shipFrom),
    shipTo: clean(row.shipTo),
    salesOrder: salesOrder || null,
    source,
  };
  // Keep whatever the source actually provided; blanks must not erase earlier data.
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => (
    value !== '' && value !== null && value !== undefined
  )));
}

/**
 * Persist the physical dispatch evidence (dispatch no/date, invoice, transport,
 * ship from/to) on the Vehicle so inventory shows a dispatch status regardless
 * of whether a Sales Order could be resolved.
 */
async function recordVehicleDispatch(vehicle, row, context, session, journal, options = {}) {
  if (!vehicle?._id) return false;
  const existing = vehicle.dispatch || {};
  const existingNo = clean(existing.dispatchNo);
  const incomingNo = clean(row.dispatchNumber);
  if (existingNo && incomingNo && lower(existingNo) !== lower(incomingNo)) {
    throw new ImportRowError(
      `Vehicle ${vehicle.chassisNumber || vehicle.vin || vehicle._id} is already dispatched under "${existingNo}", not "${incomingNo}".`,
      {
        field: 'dispatchNumber',
        value: incomingNo,
        relatedEntity: 'Vehicle/Dispatch',
        code: 'CONFLICTING_REFERENCE',
      },
    );
  }
  const nextDispatch = { ...existing, ...dispatchInfoFields(row, options) };
  if (JSON.stringify(comparable(existing)) === JSON.stringify(comparable(nextDispatch))) return false;
  journal.trackUpdate(Vehicle, vehicle);
  let query = Vehicle.findByIdAndUpdate(
    vehicle._id,
    { $set: { dispatch: nextDispatch, updatedBy: options.userId || null } },
    { returnDocument: 'after' },
  );
  if (session) query = query.session(session);
  const updated = await query.lean();
  Object.assign(vehicle, updated);
  context.vehicles.add(vehicle);
  return true;
}

/**
 * Dispatch rows whose PBO/invoice/chassis matches no Sales Order still describe a
 * real physical unit leaving stock. Import the Vehicle and its dispatch evidence
 * only — Customer, Booking, Sales Order and Seller are never invented.
 */
async function processDispatchStockRow(row, context, atomicOptions, userId, unresolvedReason) {
  return runAtomicRow(async ({ session, journal }) => {
    const delta = newEntityDelta();
    // A dispatch with no Sales Order is a unit arriving into stock — the normal
    // path for anything not yet sold, not a problem to report. The outcome is
    // visible on the vehicle itself (dispatch.source = stock_dispatch) and in the
    // debug audit; it is deliberately not raised as a per-row warning.
    debugEvent('dispatch.stock_only', {
      _meta: row._meta,
      dispatchNumber: row.dispatchNumber,
      pboNo: row.pboNo || '',
      unresolvedReason,
    });
    const warnings = [];
    if (![row.chassisNumber, row.engineNumber].some(rawPresent)) {
      throw new ImportRowError('Dispatch row matches no Sales Order and carries no chassis/engine evidence, so no physical vehicle can be recorded.', {
        field: 'chassisNumber',
        missingField: 'chassisNumber/engineNumber',
        relatedEntity: 'Vehicle',
      });
    }

    const hierarchy = await resolveMasterData(row, context, session, journal, delta);
    const maxYear = new Date().getFullYear() + 1;
    const dispatchYear = row.dispatchDate instanceof Date ? row.dispatchDate.getUTCFullYear() : null;
    let modelYear = Number(row.modelYear) || Number(hierarchy.model?.year) || null;
    if (!modelYear && dispatchYear) {
      modelYear = Math.min(dispatchYear, maxYear);
      warnings.push(rowWarning(row, `Dispatch Report carries no Model Year; ${modelYear} was inferred from the dispatch date for the physical vehicle record.`, {
        errorType: 'INFERRED_VALUE',
        field: 'modelYear',
        value: String(modelYear),
        relatedEntity: 'Vehicle',
      }));
    }

    const vehicleResult = await context.vehicles.resolveOrCreate({
      _meta: row._meta,
      stage: 'dispatch',
      chassisNumber: row.chassisNumber,
      engineNumber: row.engineNumber,
      modelYear,
      colorName: row.colorName,
      salePrice: row.financials?.totalAmount || row.totalAmount || 0,
      purchasePrice: row.exFactoryPrice || 0,
      bookingDate: row.dispatchDate,
    }, hierarchy, { session, userId, allowCreate: true });
    if (vehicleResult.ambiguous) {
      throw new ImportRowError(`Dispatch vehicle identifiers conflict or match ${vehicleResult.count} Vehicles (${vehicleResult.matchBy}).`, {
        field: vehicleResult.matchBy,
        value: row.chassisNumber || row.engineNumber,
        relatedEntity: 'Vehicle',
        code: vehicleResult.conflict ? 'VEHICLE_IDENTITY_CONFLICT' : 'AMBIGUOUS_VEHICLE_IDENTITY',
      });
    }
    if (!vehicleResult.vehicle) {
      throw new ImportRowError(`Dispatch Vehicle could not be created because '${vehicleResult.missingField || 'vehicle identity'}' is missing.`, {
        field: vehicleResult.missingField || 'vehicle',
        missingField: vehicleResult.missingField || 'vehicle',
        relatedEntity: 'Vehicle',
      });
    }
    let vehicle = vehicleResult.vehicle;
    let vehicleChanged = false;
    if (vehicleResult.created) {
      journal.trackCreate(Vehicle, vehicle._id);
      delta.vehicles.created += 1;
      vehicleChanged = true;
    } else {
      delta.vehicles.reused += 1;
      const enrichment = await enrichExistingVehicle(
        vehicle,
        { ...row, modelYear },
        hierarchy,
        context,
        session,
        journal,
        delta,
      );
      vehicle = enrichment.vehicle;
      vehicleChanged = enrichment.updated;
    }

    // If the unit is already committed to a Sales Order, this dispatch row must
    // not silently re-point it: surface the conflict with both sides' evidence.
    const linkedOrder = [...context.orders.orders.values()]
      .find((order) => order.vehicle && String(order.vehicle) === String(vehicle._id));
    if (linkedOrder) {
      throw new ImportRowError(
        `Vehicle already sold/dispatched and cannot be stock-dispatched. Vehicle ${vehicle._id}; chassis ${vehicle.chassisNumber || vehicle.vin || ''}; engine ${vehicle.engineNumber || ''}; existing SalesOrder ${linkedOrder._id}; existing customer ${linkedOrder.customer || 'unknown'}; incoming dispatch ${row.dispatchNumber || ''}.`,
        {
          field: 'vehicle',
          value: String(vehicle._id),
          relatedEntity: 'Vehicle/SalesOrder',
          code: 'VEHICLE_ALREADY_SOLD_OR_DISPATCHED',
        },
      );
    }

    const firstDispatch = !rawPresent(vehicle.dispatch?.dispatchNo);
    const dispatchChanged = await recordVehicleDispatch(vehicle, row, context, session, journal, {
      source: 'stock_dispatch',
      userId,
    });
    let statusChanged = false;
    if (!['dispatched', 'delivered'].includes(canonicalStatus(vehicle.status))) {
      statusChanged = await updateVehicleLifecycle(vehicle, 'dispatched', session, journal, delta, {
        userId,
        sourceType: 'stock_dispatch',
        reference: clean(row.dispatchNumber),
      });
    }
    if (dispatchChanged || statusChanged) delta.dispatchRecords[firstDispatch ? 'created' : 'updated'] += 1;
    else delta.dispatchRecords.reused += 1;

    const identifiers = {
      customerId: null,
      bookingId: null,
      vehicleId: String(vehicle._id),
      salesOrderId: null,
      invoiceId: null,
      paymentIds: [],
      dispatchId: clean(row.dispatchNumber) || null,
    };
    recordRelationship(row, {
      customer: null,
      booking: null,
      vehicle: identifiers.vehicleId,
      salesOrder: null,
      invoice: null,
      payments: [],
      dispatch: clean(row.dispatchNumber),
      dispatchType: 'stock_dispatch',
    }, [`No Sales Order matched this dispatch (${unresolvedReason}); only the physical Vehicle and its dispatch evidence were imported.`]);
    const changed = vehicleChanged || dispatchChanged || statusChanged;
    return {
      classification: changed ? (vehicleResult.created || firstDispatch ? 'created' : 'updated') : 'duplicate',
      delta,
      warnings,
      identifiers,
    };
  }, atomicOptions);
}

async function resolveDispatchHierarchy(row, order, booking, context, session, journal, delta) {
  const hierarchy = context.masterData.resolveReferencedHierarchy({
    vehicleMake: order.vehicleMake || booking?.vehicleMake,
    vehicleModel: order.vehicleModel || booking?.vehicleModel,
    vehicleVariant: order.vehicleVariant || booking?.vehicleVariant,
    variantName: row.variantName || row.vehicleDescription,
  });
  if (!hierarchy?.make || !hierarchy?.model || !hierarchy?.variant) {
    throw new ImportRowError('Dispatch could not resolve the stored Make -> Model -> Variant requirement for this SalesOrder/Booking.', {
      field: 'variantName',
      value: row.variantName || row.vehicleDescription,
      missingField: 'vehicle hierarchy',
      relatedEntity: 'VehicleMaster/Booking/SalesOrder',
      code: 'MASTER_DATA_RESOLUTION',
    });
  }
  const colorResult = await context.masterData.resolveColor(row.colorName, {
    createMissing: true,
    session,
  });
  hierarchy.color = colorResult.color;
  incrementMasterCounts(delta, hierarchy, colorResult);
  trackMasterCreates(journal, hierarchy, colorResult);
  return hierarchy;
}

function dispatchLookupSummary(row) {
  return [
    rawPresent(row.pboNo) && `PBO ${clean(row.pboNo)}`,
    rawPresent(row.externalOrderNumber) && `order ${clean(row.externalOrderNumber)}`,
    rawPresent(row.externalInvoiceNumber) && `invoice ${clean(row.externalInvoiceNumber)}`,
    rawPresent(row.chassisNumber) && `chassis ${clean(row.chassisNumber)}`,
    rawPresent(row.engineNumber) && `engine ${clean(row.engineNumber)}`,
  ].filter(Boolean).join(', ') || 'no business references';
}

/**
 * Dispatch entry point. Resolution order: PBO → invoice → SAP/dispatch number →
 * chassis/engine. A resolved Sales Order takes the full chain path; an
 * unresolved row is imported as a stock dispatch on the physical vehicle.
 */
async function processDispatchRow(row, context, atomicOptions, userId) {
  const resolution = context.orders.resolve({
    externalOrderNumber: row.externalOrderNumber,
    pboNo: row.pboNo,
    externalInvoiceNumber: row.externalInvoiceNumber,
    sapOrderNumber: row.sapOrderNumber,
    dispatchNumber: row.dispatchNumber,
    chassisNumber: row.chassisNumber,
    engineNumber: row.engineNumber,
  });
  if (resolution.ambiguous) {
    throw new ImportRowError(`Dispatch references conflict or match ${resolution.count} SalesOrders (${resolution.matchBy}).`, {
      field: resolution.matchBy,
      value: row._meta.sourceIdentifier,
      relatedEntity: 'SalesOrder',
      code: resolution.conflict ? 'CONFLICTING_REFERENCE' : 'AMBIGUOUS_REFERENCE',
    });
  }
  if (!resolution.order) {
    return processDispatchStockRow(
      row,
      context,
      atomicOptions,
      userId,
      `searched by ${dispatchLookupSummary(row)}`,
    );
  }
  return processDispatchChainRow(row, context, atomicOptions, userId, resolution);
}

async function processDispatchChainRow(row, context, atomicOptions, userId, resolution) {
  return runAtomicRow(async ({ session, journal }) => {
    const delta = newEntityDelta();
    if (['cancelled', 'canceled'].includes(lower(resolution.order.status))) {
      throw new ImportRowError(`Dispatch cannot update cancelled SalesOrder ${resolution.order.orderNumber}.`, {
        field: 'status',
        value: resolution.order.status,
        relatedEntity: 'SalesOrder',
      });
    }
    if (!resolution.order.customer) {
      throw new ImportRowError('Dispatch SalesOrder has no Customer relationship.', {
        field: 'customer',
        missingField: 'SalesOrder.customer',
        relatedEntity: 'Customer/SalesOrder',
      });
    }

    let booking = resolution.order.booking
      ? context.bookings.bookings.get(String(resolution.order.booking))
      : null;
    if (!booking) {
      const bookingResolution = context.bookings.resolve({
        bookingNumber: row.pboNo,
        externalBookingNumber: row.pboNo,
        pboNo: row.pboNo,
        externalOrderNumber: resolution.order.externalOrderNumber,
      });
      if (bookingResolution.ambiguous) {
        throw new ImportRowError(`Dispatch Booking reference is ambiguous (${bookingResolution.count} records).`, {
          field: bookingResolution.matchBy,
          value: row.pboNo,
          relatedEntity: 'Booking',
          code: 'AMBIGUOUS_REFERENCE',
        });
      }
      booking = bookingResolution.booking;
    }
    if (!booking) {
      throw new ImportRowError('Dispatch SalesOrder has no resolvable Booking relationship.', {
        field: 'pboNo',
        value: row.pboNo,
        missingField: 'Booking',
        relatedEntity: 'Booking/SalesOrder',
      });
    }
    if (booking.customer && String(booking.customer) !== String(resolution.order.customer)) {
      throw new ImportRowError('Dispatch Booking and SalesOrder reference different Customers.', {
        field: 'customer',
        relatedEntity: 'Customer/Booking/SalesOrder',
        code: 'CONFLICTING_CUSTOMER_IDENTITY',
      });
    }

    const hierarchy = await resolveDispatchHierarchy(
      row,
      resolution.order,
      booking,
      context,
      session,
      journal,
      delta,
    );
    let vehicleResult = context.vehicles.resolve({
      _meta: row._meta,
      stage: 'dispatch',
      chassisNumber: row.chassisNumber,
      engineNumber: row.engineNumber,
    });
    if (vehicleResult.ambiguous) {
      throw new ImportRowError(`Dispatch vehicle identifiers conflict or match ${vehicleResult.count} Vehicles (${vehicleResult.matchBy}).`, {
        field: vehicleResult.matchBy,
        value: row.chassisNumber || row.engineNumber,
        relatedEntity: 'Vehicle',
        code: vehicleResult.conflict ? 'VEHICLE_IDENTITY_CONFLICT' : 'AMBIGUOUS_VEHICLE_IDENTITY',
      });
    }
    if (!vehicleResult.vehicle && !resolution.order.vehicle) {
      vehicleResult = await context.vehicles.resolveOrCreate({
        _meta: row._meta,
        stage: 'dispatch',
        chassisNumber: row.chassisNumber,
        engineNumber: row.engineNumber,
        modelYear: hierarchy.model.year,
        colorName: row.colorName,
        salePrice: resolution.order.totalAmount,
        bookingDate: booking.bookingDate,
      }, hierarchy, { session, userId, allowCreate: true });
      if (!vehicleResult.vehicle) {
        throw new ImportRowError(`Dispatch Vehicle could not be created because '${vehicleResult.missingField || 'vehicle identity'}' is missing.`, {
          field: vehicleResult.missingField || 'vehicle',
          missingField: vehicleResult.missingField || 'vehicle',
          relatedEntity: 'Vehicle',
        });
      }
      if (vehicleResult.created) {
        journal.trackCreate(Vehicle, vehicleResult.vehicle._id);
        delta.vehicles.created += 1;
      }
    }

    let vehicle = vehicleResult.vehicle || null;
    if (resolution.order.vehicle) {
      const linkedVehicle = context.vehicles.vehicles.find(
        (candidate) => String(candidate._id) === String(resolution.order.vehicle),
      );
      if (!linkedVehicle) {
        throw new ImportRowError('SalesOrder references a Vehicle document that does not exist.', {
          field: 'vehicle',
          missingField: 'Vehicle document',
          relatedEntity: 'Vehicle/SalesOrder',
        });
      }
      const incomingChassis = normalizeVehicleIdentifier(row.chassisNumber);
      const incomingEngine = normalizeVehicleIdentifier(row.engineNumber);
      const linkedChassis = normalizeVehicleIdentifier(linkedVehicle.chassisNumber || linkedVehicle.vin);
      const linkedEngine = normalizeVehicleIdentifier(linkedVehicle.engineNumber);
      if ((incomingChassis && linkedChassis && incomingChassis !== linkedChassis)
        || (incomingEngine && linkedEngine && incomingEngine !== linkedEngine)) {
        throw new ImportRowError('Dispatch chassis/engine does not match SalesOrder.vehicle.', {
          field: incomingChassis && incomingChassis !== linkedChassis ? 'chassisNumber' : 'engineNumber',
          value: row.chassisNumber || row.engineNumber,
          relatedEntity: 'Vehicle/SalesOrder',
          code: 'VEHICLE_IDENTITY_CONFLICT',
        });
      }
      if (vehicle && String(vehicle._id) !== String(linkedVehicle._id)) {
        throw new ImportRowError('Dispatch chassis/engine belongs to a different Vehicle than SalesOrder.vehicle.', {
          field: 'chassisNumber',
          value: row.chassisNumber || row.engineNumber,
          relatedEntity: 'Vehicle/SalesOrder',
          code: 'VEHICLE_IDENTITY_CONFLICT',
        });
      }
      vehicle = linkedVehicle;
    }
    if (!vehicle) {
      throw new ImportRowError('Dispatch requires chassis/VIN or engine evidence for its physical Vehicle.', {
        field: 'vehicle',
        missingField: 'chassisNumber/engineNumber',
        relatedEntity: 'Vehicle',
      });
    }
    if (!vehicleResult.created) {
      delta.vehicles.reused += 1;
      const enrichment = await enrichExistingVehicle(vehicle, {
        ...row,
        modelYear: row.modelYear || hierarchy.model.year,
      }, hierarchy, context, session, journal, delta);
      vehicle = enrichment.vehicle;
    }
    assertVehicleAvailableForSale(vehicle, row, context, resolution.order);

    if (booking.vehicle && String(booking.vehicle) !== String(vehicle._id)) {
      throw new ImportRowError('Booking.vehicle conflicts with the Dispatch physical Vehicle.', {
        field: 'vehicle',
        value: String(vehicle._id),
        relatedEntity: 'Vehicle/Booking',
        code: 'VEHICLE_IDENTITY_CONFLICT',
      });
    }
    if (!booking.vehicle) {
      journal.trackUpdate(Booking, booking);
      let bookingQuery = Booking.findByIdAndUpdate(
        booking._id,
        { $set: { vehicle: vehicle._id, updatedBy: userId || null } },
        { returnDocument: 'after' },
      );
      if (session) bookingQuery = bookingQuery.session(session);
      booking = await bookingQuery.lean();
      context.bookings.add(booking);
      delta.bookings.updated += 1;
    }

    let invoice = null;
    if (rawPresent(row.externalInvoiceNumber)) {
      let query = Invoice.findOne({
        externalInvoiceNumber: clean(row.externalInvoiceNumber),
        status: { $ne: 'cancelled' },
      }).lean();
      if (session) query = query.session(session);
      invoice = await query;
      if (invoice?.salesOrder && String(invoice.salesOrder) !== String(resolution.order._id)) {
        throw new ImportRowError(`Invoice "${row.externalInvoiceNumber}" belongs to a different SalesOrder.`, {
          field: 'externalInvoiceNumber',
          value: row.externalInvoiceNumber,
          relatedEntity: 'Invoice/SalesOrder',
          code: 'CONFLICTING_REFERENCE',
        });
      }
    }
    if (!invoice && resolution.order.invoice) {
      let query = Invoice.findById(resolution.order.invoice).lean();
      if (session) query = query.session(session);
      invoice = await query;
    }
    if (!invoice) {
      let query = Invoice.findOne({ salesOrder: resolution.order._id, status: { $ne: 'cancelled' } }).lean();
      if (session) query = query.session(session);
      invoice = await query;
    }
    if (!invoice) {
      if (!rawPresent(row.externalInvoiceNumber)) {
        throw new ImportRowError('Dispatch cannot create an Invoice without source invoice evidence.', {
          field: 'externalInvoiceNumber',
          missingField: 'externalInvoiceNumber',
          relatedEntity: 'Invoice',
          code: 'INVOICE_EVIDENCE_REQUIRED',
        });
      }
      if (!(Number(resolution.order.totalAmount) > 0)) {
        throw new ImportRowError('Dispatch SalesOrder has no positive total for Invoice creation.', {
          field: 'totalAmount',
          missingField: 'SalesOrder.totalAmount',
          relatedEntity: 'Invoice/SalesOrder',
        });
      }
      const ensured = await ensureInvoice(row, resolution.order, null, context, session, journal, delta, userId);
      invoice = ensured.invoice;
    } else {
      const invoiceChanges = {};
      if (!invoice.salesOrder) invoiceChanges.salesOrder = resolution.order._id;
      if (!invoice.customer) invoiceChanges.customer = resolution.order.customer;
      if (rawPresent(row.externalInvoiceNumber) && !rawPresent(invoice.externalInvoiceNumber)) {
        invoiceChanges.externalInvoiceNumber = clean(row.externalInvoiceNumber);
      }
      if (Object.keys(invoiceChanges).length) {
        journal.trackUpdate(Invoice, invoice);
        let invoiceQuery = Invoice.findByIdAndUpdate(invoice._id, { $set: invoiceChanges }, { returnDocument: 'after' });
        if (session) invoiceQuery = invoiceQuery.session(session);
        invoice = await invoiceQuery.lean();
        delta.invoices.updated += 1;
      } else {
        delta.invoices.reused += 1;
      }
    }
    if (invoice.salesOrder && String(invoice.salesOrder) !== String(resolution.order._id)) {
      throw new ImportRowError('Resolved Invoice belongs to a different SalesOrder.', {
        field: 'invoice',
        relatedEntity: 'Invoice/SalesOrder',
        code: 'CONFLICTING_REFERENCE',
      });
    }

    const firstDispatch = !rawPresent(resolution.order.dispatchNo);
    if (!firstDispatch && lower(resolution.order.dispatchNo) !== lower(row.dispatchNumber)) {
      throw new ImportRowError(`SalesOrder is already assigned to dispatch "${resolution.order.dispatchNo}".`, {
        field: 'dispatchNumber',
        value: row.dispatchNumber,
        relatedEntity: 'SalesOrder',
        code: 'CONFLICTING_REFERENCE',
      });
    }
    const desired = {
      dispatchNo: clean(row.dispatchNumber),
      dispatchDate: row.dispatchDate,
      status: ['delivered', 'completed'].includes(lower(resolution.order.status))
        ? resolution.order.status
        : 'dispatched',
      importStages: [...new Set([...(resolution.order.importStages || []), 'dispatch'])],
      vehicle: vehicle._id,
      booking: booking._id,
      invoice: invoice._id,
      invoiceNo: clean(row.externalInvoiceNumber) || invoice.externalInvoiceNumber || invoice.invoiceNumber,
    };
    if (rawPresent(row.sapOrderNumber)) desired.sapOrderNo = clean(row.sapOrderNumber);
    if (row.sapOrderDate) desired.sapOrderDate = row.sapOrderDate;
    if (rawPresent(row.transportCompany)) desired.transportCompany = clean(row.transportCompany);
    if (rawPresent(row.builtyNumber)) desired.builtyNo = clean(row.builtyNumber);
    if (rawPresent(row.shipFrom)) desired.shipFrom = clean(row.shipFrom);
    if (rawPresent(row.shipTo)) desired.shipTo = clean(row.shipTo);
    const changes = changedFields(resolution.order, desired);
    if (Object.keys(changes).length && userId) changes.updatedBy = userId;
    let order = resolution.order;
    if (Object.keys(changes).length) {
      journal.trackUpdate(SalesOrder, order);
      let query = SalesOrder.findByIdAndUpdate(order._id, { $set: changes }, { returnDocument: 'after' });
      if (session) query = query.session(session);
      order = await query.lean();
      context.orders.addOrder(order);
      context.orders.addVehicle(order._id, vehicle);
      context.orders.addInvoice(order._id, invoice);
      delta.dispatchRecords[firstDispatch ? 'created' : 'updated'] += 1;
    } else {
      delta.dispatchRecords.reused += 1;
    }

    if (!['sold', 'dispatched', 'delivered'].includes(canonicalStatus(vehicle.status))) {
      await updateVehicleLifecycle(vehicle, 'sold', session, journal, delta, {
        userId,
        sourceType: 'sales_order',
        sourceId: order._id,
        reference: order.orderNumber,
      });
    }
    const vehicleStatusChanged = await updateVehicleLifecycle(vehicle, 'dispatched', session, journal, delta, {
      userId,
      sourceType: 'dispatch',
      sourceId: order._id,
      reference: row.dispatchNumber,
    });
    // Mirror the dispatch onto the vehicle so inventory shows the same evidence
    // whether the row resolved a Sales Order or arrived as a stock dispatch.
    const vehicleDispatchChanged = await recordVehicleDispatch(vehicle, row, context, session, journal, {
      salesOrder: order._id,
      source: 'sales_order',
      userId,
    });
    let paymentsQuery = Payment.find({ invoice: invoice._id }).select('_id amount').lean();
    if (session) paymentsQuery = paymentsQuery.session(session);
    const payments = await paymentsQuery;
    const identifiers = {
      customerId: String(order.customer),
      bookingId: String(booking._id),
      vehicleId: String(vehicle._id),
      salesOrderId: String(order._id),
      invoiceId: String(invoice._id),
      paymentIds: payments.map((payment) => String(payment._id)),
      dispatchId: String(order._id),
    };
    recordRelationship(row, {
      customer: identifiers.customerId,
      booking: identifiers.bookingId,
      vehicle: identifiers.vehicleId,
      salesOrder: identifiers.salesOrderId,
      invoice: identifiers.invoiceId,
      payments: identifiers.paymentIds,
      paymentSum: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      dispatch: order.dispatchNo,
      sellerSourceText: order.salePerson || '',
      sellerUser: order.seller ? String(order.seller) : null,
      sellerEmployee: order.sellerEmployee ? String(order.sellerEmployee) : null,
    }, []);
    const changed = Object.keys(changes).length > 0 || vehicleStatusChanged || vehicleDispatchChanged;
    return {
      classification: changed ? (firstDispatch ? 'created' : 'updated') : 'duplicate',
      delta,
      warnings: [],
      identifiers,
    };
  }, atomicOptions);
}

function sourceDuplicateKey(row, logicalType) {
  if (logicalType === 'dispatch') return lower(row.dispatchNumber);
  return lower(row.externalOrderNumber);
}

function fileResult(parsed) {
  return {
    fileKey: parsed.fileKey || parsed.logicalType,
    logicalType: parsed.logicalType,
    label: parsed.definition.label,
    fileName: parsed.fileName,
    fileType: parsed.mimeType,
    size: parsed.size,
    checksum: parsed.checksum,
    sheetNames: parsed.sheetNames,
    status: 'queued',
    progress: 0,
    totalRows: parsed.records.length,
    successful: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    duplicates: 0,
    failed: 0,
    errors: [],
    warnings: [],
    records: [],
    mappingReport: parsed.mappingReport,
  };
}

async function auditExistingRelationship(row, logicalType, context) {
  if (!currentAudit()) return;
  try {
    const customerResolution = context.customers.resolve(customerData(row));
    const bookingResolution = context.bookings.resolve({
      bookingNumber: row.pboNo,
      externalOrderNumber: row.externalOrderNumber,
    });
    const orderResolution = context.orders.resolve({
      externalOrderNumber: row.externalOrderNumber,
      pboNo: row.pboNo,
      externalInvoiceNumber: row.externalInvoiceNumber,
      sapOrderNumber: row.sapOrderNumber,
      dispatchNumber: row.dispatchNumber,
      chassisNumber: row.chassisNumber,
      engineNumber: row.engineNumber,
    });
    const vehicleResolution = context.vehicles.resolve({
      _meta: row._meta,
      stage: logicalType,
      chassisNumber: row.chassisNumber,
      engineNumber: row.engineNumber,
    });
    const seller = rawPresent(row.sellerName)
      ? context.sellers.resolve({ sellerName: row.sellerName, sellerRole: row.sellerRole, _meta: row._meta })
      : { user: null, employee: null };
    const sourceBooking = bookingResolution.booking || null;
    const order = orderResolution.order || null;
    const invoice = (order?.invoice && context.orders.invoices.get(String(order.invoice)))
      || [...context.orders.invoices.values()].find((candidate) => (
        (order?._id && String(candidate.salesOrder) === String(order._id))
        || (row.externalInvoiceNumber && lower(candidate.externalInvoiceNumber) === lower(row.externalInvoiceNumber))
      ))
      || null;
    const referencedBookingId = sourceBooking?._id || order?.booking || null;
    const linkedBooking = order?.booking
      ? context.bookings.bookings.get(String(order.booking)) || null
      : null;
    const booking = sourceBooking || linkedBooking;
    const sourceVehicle = vehicleResolution.vehicle || null;
    const linkedVehicle = context.vehicles.vehicles.find(
      (candidate) => order?.vehicle && String(candidate._id) === String(order.vehicle),
    ) || null;
    const vehicle = sourceVehicle || linkedVehicle;
    const customerReferences = [
      ['direct customer match', customerResolution.customer?._id],
      ['Booking.customer', booking?.customer],
      ['SalesOrder.customer', order?.customer],
      ['Invoice.customer', invoice?.customer],
    ].filter(([, id]) => id);
    const customerReferenceIds = [...new Set(customerReferences.map(([, id]) => String(id)))];
    const linkedCustomerId = customerReferenceIds[0] || null;
    const customer = customerResolution.customer
      || (linkedCustomerId ? context.customers.customers.get(linkedCustomerId) : null)
      || null;
    const customerId = customer?._id || null;
    const conflictingCustomerLinks = customerReferenceIds.length > 1;
    const normalizeVehicleId = (value) => String(value || '').replace(/\s+/g, '').toLowerCase();
    const sourceVehicleMismatch = Boolean(linkedVehicle && (
      (rawPresent(row.chassisNumber)
        && normalizeVehicleId(linkedVehicle.chassisNumber || linkedVehicle.vin) !== normalizeVehicleId(row.chassisNumber))
      || (rawPresent(row.engineNumber)
        && normalizeVehicleId(linkedVehicle.engineNumber) !== normalizeVehicleId(row.engineNumber))
    ));
    const conflictingVehicleLinks = Boolean(sourceVehicle && linkedVehicle
      && String(sourceVehicle._id) !== String(linkedVehicle._id));
    const referencedInvoiceId = order?.invoice || null;
    const referencedSellerUserId = order?.seller || invoice?.seller || booking?.seller || null;
    const referencedSellerEmployeeId = order?.sellerEmployee || invoice?.sellerEmployee || booking?.sellerEmployee || null;
    const sellerUserDocument = referencedSellerUserId
      ? context.sellers.users.find((candidate) => String(candidate._id) === String(referencedSellerUserId)) || null
      : null;
    const sellerEmployeeDocument = referencedSellerEmployeeId
      ? context.sellers.employees.find((candidate) => String(candidate._id) === String(referencedSellerEmployeeId)) || null
      : null;
    const payments = invoice
      ? await Payment.find({ invoice: invoice._id }).select('_id invoice customer amount paymentDate method referenceNumber importKey status').lean()
      : [];

    if (customer) {
      debugEvent('customer.audit.existing', {
        _meta: row._meta,
        customerId: String(customer._id),
        customerName: customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(' '),
        customerType: customer.customerType || '',
        matchStrategy: customerResolution.customer
          ? customerResolution.matchBy
          : customerReferences.find(([, id]) => String(id) === String(customer._id))?.[0] || null,
        existing: true,
        newlyCreated: false,
        finalCustomerIdAssigned: String(customer._id),
      }, { section: 'customers', bucket: 'existing' });
    }
    if (linkedVehicle && !sourceVehicle) {
      debugEvent('vehicle.audit.sales_order_reference', {
        _meta: row._meta,
        sourceChassisVin: row.chassisNumber || '',
        sourceEngineNumber: row.engineNumber || '',
        matchMethod: 'SalesOrder.vehicle',
        existingVehicleId: String(linkedVehicle._id),
        existingVehicleCompleteDetails: linkedVehicle,
        reused: true,
        created: false,
        sourceVehicleMismatch,
      }, { section: 'vehicles', bucket: 'existingReused', level: sourceVehicleMismatch ? 'warn' : 'info' });
    }
    if (conflictingCustomerLinks) {
      debugEvent('customer.audit.relationship_conflict', {
        _meta: row._meta,
        references: customerReferences.map(([source, id]) => ({ source, customerId: String(id) })),
        exactReason: 'Direct and/or related records reference different Customer ObjectIds.',
      }, { section: 'customers', bucket: 'ambiguous', level: 'error' });
    }
    if (linkedCustomerId && !customer) {
      debugEvent('customer.audit.orphan_reference', {
        _meta: row._meta,
        referencedCustomerId: String(linkedCustomerId),
        referencedBy: booking?.customer ? 'Booking.customer' : 'SalesOrder.customer',
        customerDocumentFound: false,
        exactReason: 'The relationship stores an ObjectId whose Customer document does not exist.',
        allCustomerReferences: customerReferences.map(([source, id]) => ({ source, customerId: String(id) })),
      }, { section: 'customers', bucket: 'failed', level: 'error' });
    }
    if (sourceVehicleMismatch || conflictingVehicleLinks) {
      debugEvent('vehicle.audit.relationship_conflict', {
        _meta: row._meta,
        sourceChassisVin: row.chassisNumber || '',
        sourceEngineNumber: row.engineNumber || '',
        sourceResolvedVehicleId: sourceVehicle?._id ? String(sourceVehicle._id) : null,
        salesOrderVehicleId: linkedVehicle?._id ? String(linkedVehicle._id) : null,
        salesOrderVehicleDetails: linkedVehicle,
        sourceVehicleMismatch,
        conflictingVehicleLinks,
      }, { section: 'vehicles', bucket: 'conflicts', level: 'error' });
    }
    if (referencedBookingId && !booking) {
      debugEvent('booking.audit.orphan_reference', {
        _meta: row._meta,
        referencedBookingId: String(referencedBookingId),
        referencedBy: order?.booking ? 'SalesOrder.booking' : 'source booking/order reference',
        bookingDocumentFound: false,
        exactReason: 'The relationship stores a Booking ObjectId whose document does not exist.',
      }, { section: 'bookings', bucket: 'failed', level: 'error' });
    }
    if (referencedInvoiceId && !invoice) {
      debugEvent('invoice.audit.orphan_reference', {
        _meta: row._meta,
        referencedInvoiceId: String(referencedInvoiceId),
        referencedBy: 'SalesOrder.invoice',
        invoiceDocumentFound: false,
        exactReason: 'SalesOrder.invoice stores an ObjectId whose Invoice document does not exist.',
      }, { section: 'invoices', bucket: 'failed', level: 'error' });
    }
    if ((referencedSellerUserId && !sellerUserDocument)
      || (referencedSellerEmployeeId && !sellerEmployeeDocument)) {
      debugEvent('seller.audit.orphan_reference', {
        _meta: row._meta,
        sourceSellerText: row.sellerName || '',
        referencedSellerUserId: referencedSellerUserId ? String(referencedSellerUserId) : null,
        sellerUserDocumentFound: Boolean(sellerUserDocument),
        referencedSellerEmployeeId: referencedSellerEmployeeId ? String(referencedSellerEmployeeId) : null,
        sellerEmployeeDocumentFound: Boolean(sellerEmployeeDocument),
        exactReason: 'A related record stores a seller User/Employee ObjectId whose document does not exist.',
      }, { section: 'sellers', bucket: 'unresolved', level: 'error' });
    }
    if (booking) {
      debugEvent('booking.audit.existing', {
        _meta: row._meta,
        bookingId: String(booking._id),
        bookingNumber: booking.bookingNumber,
        customerId: booking.customer ? String(booking.customer) : null,
        vehicleId: booking.vehicle ? String(booking.vehicle) : null,
        vehicleVariantId: booking.vehicleVariant ? String(booking.vehicleVariant) : null,
        sellerUserId: booking.seller ? String(booking.seller) : null,
        sellerEmployeeId: booking.sellerEmployee ? String(booking.sellerEmployee) : null,
        sourceSellerText: booking.salePerson || '',
        status: booking.status,
        existing: true,
        newlyCreated: false,
        matchMethod: sourceBooking ? bookingResolution.matchBy : 'SalesOrder.booking',
        hasActualVehicleReference: Boolean(booking.vehicle),
      }, { section: 'bookings', bucket: 'existing' });
    }
    if (order) {
      debugEvent('salesOrder.audit.existing', {
        _meta: row._meta,
        salesOrderId: String(order._id),
        sourceOrderNumber: order.externalOrderNumber || '',
        internalOrderNumber: order.orderNumber || '',
        bookingId: order.booking ? String(order.booking) : null,
        customerId: order.customer ? String(order.customer) : null,
        vehicleId: order.vehicle ? String(order.vehicle) : null,
        sellerText: order.salePerson || '',
        sellerUserId: order.seller ? String(order.seller) : null,
        sellerEmployeeId: order.sellerEmployee ? String(order.sellerEmployee) : null,
        invoiceId: order.invoice ? String(order.invoice) : null,
        totalAmount: order.totalAmount,
        discount: order.discountAmount,
        paidAmount: order.paidAmount,
        balance: order.balanceAmount,
        status: order.status,
        dispatchNumber: order.dispatchNo || '',
        existing: true,
        newlyCreated: false,
      }, { section: 'salesOrders', bucket: 'existing' });
    }
    if (invoice) {
      debugEvent('invoice.audit.existing', {
        _meta: row._meta,
        invoiceId: String(invoice._id),
        internalInvoiceNumber: invoice.invoiceNumber || '',
        sourceInvoiceNumber: invoice.externalInvoiceNumber || '',
        salesOrderId: invoice.salesOrder ? String(invoice.salesOrder) : null,
        bookingId: order?.booking ? String(order.booking) : null,
        customerId: invoice.customer ? String(invoice.customer) : null,
        vehicleIdViaSalesOrder: order?.vehicle ? String(order.vehicle) : null,
        directInvoiceVehicleId: invoice.vehicle ? String(invoice.vehicle) : null,
        sellerUserId: invoice.seller ? String(invoice.seller) : null,
        sellerEmployeeId: invoice.sellerEmployee ? String(invoice.sellerEmployee) : null,
        sellerText: invoice.salePerson || '',
        total: invoice.totalAmount,
        discount: invoice.discountAmount,
        paid: invoice.paidAmount,
        balance: invoice.balanceAmount,
        paymentTransactionIds: payments.map((payment) => String(payment._id)),
        paymentTransactionSum: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        paymentLedgerMatchesPaidAmount: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
          === Number(invoice.paidAmount || 0),
        status: invoice.status,
        existing: true,
        newlyCreated: false,
        schemaObservation: invoice.vehicle == null
          ? 'Invoice schema has no direct vehicle field; vehicle is reachable through Invoice.salesOrder -> SalesOrder.vehicle.'
          : '',
      }, { section: 'invoices', bucket: 'existing' });
    }
    payments.forEach((payment) => debugEvent('payment.audit.existing', {
      _meta: row._meta,
      paymentId: String(payment._id),
      invoiceId: payment.invoice ? String(payment.invoice) : null,
      salesOrderId: invoice?.salesOrder ? String(invoice.salesOrder) : null,
      amount: payment.amount,
      date: payment.paymentDate || null,
      method: payment.method || null,
      sourceField: payment.importKey || payment.referenceNumber || '',
      importKey: payment.importKey || '',
      existing: true,
      newlyCreated: false,
    }, { section: 'payments', bucket: 'existing' }));

    const missing = [];
    if (!customerId) {
      missing.push(linkedCustomerId
        ? `Customer ObjectId ${linkedCustomerId} is referenced but the Customer document does not exist.`
        : 'No Customer resolved from direct identity, Booking, or SalesOrder references.');
    }
    if (conflictingCustomerLinks) {
      missing.push(`Related records reference different Customers: ${customerReferences.map(([source, id]) => `${source}=${id}`).join(', ')}.`);
    }
    if (!booking) {
      missing.push(referencedBookingId
        ? `Booking ObjectId ${referencedBookingId} is referenced but the Booking document does not exist.`
        : 'No Booking resolved from booking/order references.');
    }
    if (logicalType !== 'orderIntake' && !vehicle) missing.push('No Vehicle resolved from chassis/engine or SalesOrder.vehicle.');
    if (logicalType !== 'orderIntake' && sourceVehicleMismatch) {
      missing.push('Source chassis/engine does not match the Vehicle referenced by SalesOrder.vehicle.');
    }
    if (logicalType !== 'orderIntake' && conflictingVehicleLinks) {
      missing.push('Source chassis/engine resolves to a different Vehicle than SalesOrder.vehicle.');
    }
    if (logicalType !== 'orderIntake' && !order) missing.push('No SalesOrder resolved from source references.');
    if (logicalType !== 'orderIntake' && !invoice) {
      missing.push(referencedInvoiceId
        ? `Invoice ObjectId ${referencedInvoiceId} is referenced by SalesOrder.invoice but the Invoice document does not exist.`
        : 'No Invoice resolved through SalesOrder.invoice or source invoice number.');
    }
    if (row.sellerName && !seller.user && !seller.employee) {
      missing.push(`Source seller "${row.sellerName}" has no active existing User/Employee match; source text is preserved and auto-creation is disabled.`);
    }
    if (referencedSellerUserId && !sellerUserDocument) {
      missing.push(`Seller User ObjectId ${referencedSellerUserId} is referenced but the User document does not exist.`);
    }
    if (referencedSellerEmployeeId && !sellerEmployeeDocument) {
      missing.push(`Seller Employee ObjectId ${referencedSellerEmployeeId} is referenced but the Employee document does not exist.`);
    }
    if (booking && !booking.customer) missing.push('Booking exists but Booking.customer is null.');
    if (logicalType !== 'orderIntake' && order && !order.customer) missing.push('SalesOrder exists but SalesOrder.customer is null.');
    if (logicalType !== 'orderIntake' && order && !order.booking) missing.push('SalesOrder exists but SalesOrder.booking is null.');
    if (logicalType !== 'orderIntake' && order && !order.vehicle) missing.push('SalesOrder exists but SalesOrder.vehicle is null.');
    if (invoice && !invoice.salesOrder) missing.push('Invoice exists but Invoice.salesOrder is null.');
    if (invoice && !invoice.customer) missing.push('Invoice exists but Invoice.customer is null.');

    recordRelationship(row, {
      customer: customerId ? String(customerId) : null,
      directCustomer: customerResolution.customer?._id ? String(customerResolution.customer._id) : null,
      referencedCustomerObjectId: linkedCustomerId ? String(linkedCustomerId) : null,
      customerDocumentExists: Boolean(customer),
      customerReferences: customerReferences.map(([source, id]) => ({ source, customerId: String(id) })),
      conflictingCustomerLinks,
      referencedBookingObjectId: referencedBookingId ? String(referencedBookingId) : null,
      bookingDocumentExists: Boolean(booking),
      booking: booking?._id ? String(booking._id) : null,
      bookingCustomer: booking?.customer ? String(booking.customer) : null,
      bookingVehicle: booking?.vehicle ? String(booking.vehicle) : null,
      bookingVehicleVariant: booking?.vehicleVariant ? String(booking.vehicleVariant) : null,
      sourceResolvedVehicle: sourceVehicle?._id ? String(sourceVehicle._id) : null,
      salesOrderLinkedVehicleDocument: linkedVehicle?._id ? String(linkedVehicle._id) : null,
      sourceVehicleMismatch,
      conflictingVehicleLinks,
      vehicle: vehicle?._id ? String(vehicle._id) : null,
      vehicleStatus: vehicle?.status || null,
      vehicleIsStockOut: Boolean(vehicle?.isStockOut || vehicle?.stockOut),
      salesOrder: order?._id ? String(order._id) : null,
      salesOrderCustomer: order?.customer ? String(order.customer) : null,
      salesOrderBooking: order?.booking ? String(order.booking) : null,
      salesOrderVehicle: order?.vehicle ? String(order.vehicle) : null,
      referencedInvoiceObjectId: referencedInvoiceId ? String(referencedInvoiceId) : null,
      invoiceDocumentExists: Boolean(invoice),
      invoice: invoice?._id ? String(invoice._id) : null,
      invoiceSalesOrder: invoice?.salesOrder ? String(invoice.salesOrder) : null,
      invoiceCustomer: invoice?.customer ? String(invoice.customer) : null,
      invoiceDirectVehicle: invoice?.vehicle ? String(invoice.vehicle) : null,
      invoiceVehicleViaSalesOrder: order?.vehicle ? String(order.vehicle) : null,
      payments: payments.map((payment) => String(payment._id)),
      paymentSum: payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      dispatch: order?.dispatchNo || null,
      sellerSourceText: row.sellerName || '',
      sellerUser: seller.user?._id ? String(seller.user._id) : null,
      sellerEmployee: seller.employee?._id ? String(seller.employee._id) : null,
      referencedSellerUser: referencedSellerUserId ? String(referencedSellerUserId) : null,
      referencedSellerUserDocumentExists: Boolean(sellerUserDocument),
      referencedSellerEmployee: referencedSellerEmployeeId ? String(referencedSellerEmployeeId) : null,
      referencedSellerEmployeeDocumentExists: Boolean(sellerEmployeeDocument),
    }, missing);

    if (logicalType === 'orderSales' && vehicle
      && ['sold', 'dispatched', 'delivered'].includes(String(vehicle.status || '').toLowerCase())) {
      debugEvent('vehicle.duplicate_sale_attempt.audit', {
        _meta: row._meta,
        vehicleId: String(vehicle._id),
        currentStatus: vehicle.status,
        isStockOut: Boolean(vehicle.isStockOut || vehicle.stockOut),
        resolvedSalesOrderId: order?._id ? String(order._id) : null,
        sourceOrderNumber: row.externalOrderNumber || '',
        currentBehavior: order && order.vehicle && String(order.vehicle) === String(vehicle._id)
          ? 'Existing sale resolves to the same SalesOrder and is classified as update/duplicate.'
          : 'No explicit pre-SalesOrder lifecycle rejection exists; vehicle reuse occurs before downstream order identity resolution.',
      }, { section: 'vehicles', bucket: 'duplicateAttempt', level: 'warn' });
    }
  } catch (error) {
    debugEvent('relationship.audit.failed', {
      _meta: row._meta,
      logicalType,
      exactReason: error.message,
      errorName: error.name,
    }, { level: 'error' });
  }
}

function previewCustomerKey(row) {
  const data = customerData(row);
  const strong = [data.customerCode, data.ntn, data.cnic]
    .map((value) => lower(value))
    .find(Boolean);
  if (strong) return strong;
  // Mirror importIdentityKey: a shared phone/email alone is not identity, so a
  // weak key carries the name — otherwise preview undercounts planned customers
  // for buyers sharing one desk phone.
  const weak = [data.email, data.phone].map((value) => lower(value)).find(Boolean);
  const name = lower(data.customerName).replace(/[^a-z0-9]+/g, '');
  return weak ? `${weak}|${name}` : name;
}

function previewEntityTotals(entities) {
  return Object.fromEntries(Object.entries(entities).map(([entity, counts]) => [
    entity,
    {
      plannedCreate: Number(counts.created || 0),
      plannedUpdate: Number(counts.updated || 0),
      plannedReuse: Number(counts.reused || counts.resolved || counts.skipped || 0),
    },
  ]));
}

// Some warnings are one fact restated on every row — an unmapped source column, a
// sales person with no matching employee. A 1,349-row workbook produced 32k such
// warnings, a ~28 MB response and a FileUpload summary near Mongo's 16 MB document
// limit. Warnings whose message is byte-identical within a file describe the same
// fact, so they fold into a single entry carrying the row count and a sample row;
// anything row-specific (amounts, references) has a distinct message and survives
// untouched. Per-row detail stays in the debug audit file.
function collapseWarningList(warnings = []) {
  const collapsed = [];
  const groups = new Map();
  warnings.forEach((warning) => {
    if (!warning?.message) {
      collapsed.push(warning);
      return;
    }
    const key = [
      warning.errorType || '',
      warning.fileKey || warning.fileName || '',
      warning.sheetName || '',
      warning.field || '',
      warning.message,
    ].join('|');
    const existing = groups.get(key);
    if (existing) {
      existing.occurrences += 1;
      return;
    }
    const entry = { ...warning, occurrences: 1, sampleRow: warning.row ?? null };
    groups.set(key, entry);
    collapsed.push(entry);
  });
  groups.forEach((entry) => {
    if (entry.occurrences > 1) {
      entry.row = null;
      entry.sourceIdentifier = '';
      entry.message = `${entry.message} (${entry.occurrences} rows; sample row ${entry.sampleRow}${entry.value ? `: "${String(entry.value).slice(0, 60)}"` : ''})`;
    }
  });
  return collapsed;
}

function collapseRepeatedWarnings(result) {
  if (Array.isArray(result?.warnings)) result.warnings = collapseWarningList(result.warnings);
  (result?.files || []).forEach((file) => {
    if (Array.isArray(file.warnings)) file.warnings = collapseWarningList(file.warnings);
  });
  return result;
}

async function previewBatchInternal(parsedFiles) {
  const ordered = [...parsedFiles].sort(
    (left, right) => FILE_TYPE_ORDER.indexOf(left.logicalType) - FILE_TYPE_ORDER.indexOf(right.logicalType),
  );
  const context = await ImportContext.load();
  const result = {
    mode: 'preview',
    status: 'preview_ready',
    totals: {
      totalRows: 0,
      successful: 0,
      plannedCreate: 0,
      plannedUpdate: 0,
      plannedReuse: 0,
      duplicates: 0,
      failed: 0,
    },
    entities: newEntityDelta(),
    files: [],
    errors: [],
    warnings: [],
    mappingReport: ordered.flatMap((parsed) => parsed.mappingReport.map((mapping) => ({
      logicalType: parsed.logicalType,
      fileName: parsed.fileName,
      ...mapping,
    }))),
  };
  const plannedCustomers = new Set();
  const plannedBookings = new Map();
  const plannedOrdersByPbo = new Map();
  const plannedOrdersByExternal = new Map();
  const plannedOrdersByInvoice = new Map();
  const plannedSellerKeys = new Set();
  const salesDependencies = buildSalesDependencyIndex(ordered);
  // Batch-wide (matching commit): the same business row repeated across two
  // files of the same type is one record, counted once.
  const seen = new Set();

  for (const parsed of ordered) {
    const output = {
      ...fileResult(parsed),
      status: 'preview_ready',
      plannedCreate: 0,
      plannedUpdate: 0,
      plannedReuse: 0,
    };
    delete output.created;
    delete output.updated;
    delete output.skipped;
    for (const record of parsed.records) {
      const normalized = normalizeRecord(record, parsed.logicalType);
      if (parsed.logicalType === 'orderIntake') mergeIntakeDependency(normalized, salesDependencies);
      const row = normalized.value;
      output.warnings.push(...normalized.warnings);
      result.warnings.push(...normalized.warnings);
      await auditExistingRelationship(row, parsed.logicalType, context);
      const duplicateKey = sourceDuplicateKey(row, parsed.logicalType);
      const seenKey = duplicateKey ? `${parsed.logicalType}:${duplicateKey}` : '';
      if (seenKey && seen.has(seenKey)) {
        const duplicate = sourceIssue(row, {
          errorType: 'DUPLICATE_SOURCE_ROW',
          field: parsed.logicalType === 'dispatch' ? 'dispatchNumber' : 'externalOrderNumber',
          value: duplicateKey,
          message: `Duplicate ${parsed.definition.label} source identifier "${duplicateKey}" in the same import batch.`,
        });
        output.duplicates += 1;
        output.plannedReuse += 1;
        output.warnings.push(duplicate);
        result.warnings.push(duplicate);
        continue;
      }
      if (seenKey) seen.add(seenKey);
      if (normalized.errors.length) {
        output.failed += 1;
        output.errors.push(...normalized.errors);
        result.errors.push(...normalized.errors);
        continue;
      }

      try {
        let classification = 'plannedCreate';
        if (parsed.logicalType === 'orderIntake') {
          const customerResolution = context.customers.resolve(customerData(row));
          if (customerResolution.ambiguous) {
            throw new ImportRowError(`Customer identity is ambiguous (${customerResolution.count} records).`, {
              field: customerResolution.matchBy,
              value: row.customerName,
              relatedEntity: 'Customer',
              code: customerResolution.conflict ? 'CONFLICTING_CUSTOMER_IDENTITY' : 'AMBIGUOUS_CUSTOMER_IDENTITY',
            });
          }
          const customerKey = previewCustomerKey(row);
          if (!customerResolution.customer && (!customerKey || !row.customerType)) {
            throw new ImportRowError('Order Intake customer requires a verified name and safely resolved customer type.', {
              field: !customerKey ? 'customerName' : 'customerType',
              missingField: !customerKey ? 'customerName' : 'customerType',
              relatedEntity: 'Customer',
            });
          }
          if (customerResolution.customer || plannedCustomers.has(customerKey)) {
            result.entities.customers.reused += 1;
          } else {
            plannedCustomers.add(customerKey);
            result.entities.customers.created += 1;
          }
          const seller = previewSeller(row, context, plannedSellerKeys, result.entities);
          const sellerIssues = sellerWarnings(row, seller);
          output.warnings.push(...sellerIssues);
          result.warnings.push(...sellerIssues);
          const bookingResolution = context.bookings.resolve({
            bookingNumber: row.pboNo,
            externalBookingNumber: row.pboNo,
            pboNo: row.pboNo,
            externalOrderNumber: row.externalOrderNumber,
          });
          if (bookingResolution.ambiguous) {
            throw new ImportRowError(`Booking reference is ambiguous (${bookingResolution.count} records).`, {
              field: bookingResolution.matchBy,
              value: row.pboNo,
              relatedEntity: 'Booking',
            });
          }
          classification = bookingResolution.booking ? 'plannedUpdate' : 'plannedCreate';
          result.entities.bookings[bookingResolution.booking ? 'updated' : 'created'] += 1;
          plannedBookings.set(normalizeBusinessReference(row.pboNo), {
            existing: bookingResolution.booking || null,
            customerKey,
            hasHierarchy: true,
          });
        } else if (parsed.logicalType === 'orderSales') {
          const pboKey = normalizeBusinessReference(row.pboNo);
          const bookingResolution = context.bookings.resolve({
            bookingNumber: row.pboNo,
            externalBookingNumber: row.pboNo,
            pboNo: row.pboNo,
            externalOrderNumber: row.externalOrderNumber,
          });
          if (bookingResolution.ambiguous) {
            throw new ImportRowError(`Booking reference is ambiguous (${bookingResolution.count} records).`, {
              field: bookingResolution.matchBy,
              value: row.pboNo,
              relatedEntity: 'Booking',
            });
          }
          const plannedBooking = plannedBookings.get(pboKey);
          const customerResolution = context.customers.resolve(customerData(row));
          if (customerResolution.ambiguous) {
            throw new ImportRowError(`Customer identity is ambiguous (${customerResolution.count} records).`, {
              field: customerResolution.matchBy,
              value: row.customerName,
              relatedEntity: 'Customer',
            });
          }
          const customerKey = previewCustomerKey(row);
          if (customerResolution.customer || plannedCustomers.has(customerKey) || plannedBooking) {
            result.entities.customers.reused += 1;
          } else {
            plannedCustomers.add(customerKey);
            result.entities.customers.created += 1;
          }
          const seller = previewSeller(row, context, plannedSellerKeys, result.entities);
          const sellerIssues = sellerWarnings(row, seller);
          output.warnings.push(...sellerIssues);
          result.warnings.push(...sellerIssues);

          let hasVehicle = false;
          if ([row.chassisNumber, row.engineNumber].some(rawPresent)) {
            const vehicleResolution = context.vehicles.resolve({
              _meta: row._meta,
              stage: 'orderSales',
              chassisNumber: row.chassisNumber,
              engineNumber: row.engineNumber,
            });
            if (vehicleResolution.ambiguous) {
              throw new ImportRowError(`Vehicle identity conflicts or is ambiguous (${vehicleResolution.count} records).`, {
                field: vehicleResolution.matchBy,
                value: row.chassisNumber || row.engineNumber,
                relatedEntity: 'Vehicle',
                code: vehicleResolution.conflict ? 'VEHICLE_IDENTITY_CONFLICT' : 'AMBIGUOUS_VEHICLE_IDENTITY',
              });
            }
            if (vehicleResolution.vehicle) {
              result.entities.vehicles.reused += 1;
            } else {
              if (!Number(row.modelYear)) {
                throw new ImportRowError('Vehicle creation requires modelYear when chassis/engine is supplied.', {
                  field: 'modelYear',
                  missingField: 'modelYear',
                  relatedEntity: 'Vehicle',
                });
              }
              result.entities.vehicles.created += 1;
            }
            hasVehicle = true;
          }

          if (bookingResolution.booking || plannedBooking) result.entities.bookings.reused += 1;
          else result.entities.bookings.created += 1;
          plannedBookings.set(pboKey, {
            existing: bookingResolution.booking || null,
            customerKey,
            hasHierarchy: true,
          });
          const orderResolution = context.orders.resolve({
            externalOrderNumber: row.externalOrderNumber,
            pboNo: row.pboNo,
            externalInvoiceNumber: row.externalInvoiceNumber,
          });
          if (orderResolution.ambiguous) {
            throw new ImportRowError(`SalesOrder reference conflicts or is ambiguous (${orderResolution.count} records).`, {
              field: orderResolution.matchBy,
              value: row.externalOrderNumber || row.pboNo,
              relatedEntity: 'SalesOrder',
            });
          }
          classification = orderResolution.order ? 'plannedUpdate' : 'plannedCreate';
          result.entities.salesOrders[orderResolution.order ? 'updated' : 'created'] += 1;
          const existingInvoice = Boolean(
            orderResolution.order?.invoice
            || [...context.orders.invoices.values()].find(
              (invoice) => orderResolution.order
                && String(invoice.salesOrder) === String(orderResolution.order._id),
            ),
          );
          // Mirrors processSalesRow: payment evidence on a positive-total order
          // also triggers invoice creation, even without a source invoice number.
          const paymentCount = row.payments?.length
            || (Number(row.financials?.paidAmount) > 0 || Number(row.totalAmountReceived) > 0 ? 1 : 0);
          const hasInvoice = existingInvoice
            || rawPresent(row.externalInvoiceNumber)
            || (paymentCount > 0 && Number(row.financials?.totalAmount) > 0);
          if (hasInvoice) {
            result.entities.invoices[existingInvoice ? 'reused' : 'created'] += 1;
            result.entities.payments.created += paymentCount;
          }
          const plannedOrder = {
            existing: orderResolution.order || null,
            pboNo: pboKey,
            externalOrderNumber: lower(row.externalOrderNumber),
            invoiceNumber: lower(row.externalInvoiceNumber),
            customerKey,
            hasBooking: true,
            hasHierarchy: true,
            hasVehicle: hasVehicle || Boolean(orderResolution.order?.vehicle),
            modelYear: Number(row.modelYear || 0) || null,
            hasInvoice,
          };
          plannedOrdersByPbo.set(pboKey, plannedOrder);
          plannedOrdersByExternal.set(plannedOrder.externalOrderNumber, plannedOrder);
          if (plannedOrder.invoiceNumber) plannedOrdersByInvoice.set(plannedOrder.invoiceNumber, plannedOrder);
        } else {
          const pboKey = normalizeBusinessReference(row.pboNo);
          const orderResolution = context.orders.resolve({
            externalOrderNumber: row.externalOrderNumber,
            pboNo: row.pboNo,
            externalInvoiceNumber: row.externalInvoiceNumber,
            sapOrderNumber: row.sapOrderNumber,
            dispatchNumber: row.dispatchNumber,
            chassisNumber: row.chassisNumber,
            engineNumber: row.engineNumber,
          });
          if (orderResolution.ambiguous) {
            throw new ImportRowError(`Dispatch SalesOrder reference conflicts or is ambiguous (${orderResolution.count} records).`, {
              field: orderResolution.matchBy,
              value: row._meta.sourceIdentifier,
              relatedEntity: 'SalesOrder',
            });
          }
          const plannedOrder = plannedOrdersByPbo.get(pboKey)
            || plannedOrdersByExternal.get(lower(row.externalOrderNumber))
            || plannedOrdersByInvoice.get(lower(row.externalInvoiceNumber));
          const order = orderResolution.order || plannedOrder?.existing || null;
          if (!order && !plannedOrder) {
            // Stock dispatch: physical vehicle + dispatch evidence only.
            if (![row.chassisNumber, row.engineNumber].some(rawPresent)) {
              throw new ImportRowError('Dispatch row matches no Sales Order and carries no chassis/engine evidence, so no physical vehicle can be recorded.', {
                field: 'chassisNumber',
                missingField: 'chassisNumber/engineNumber',
                relatedEntity: 'Vehicle',
              });
            }
            const stockVehicle = context.vehicles.resolve({
              _meta: row._meta,
              stage: 'dispatch',
              chassisNumber: row.chassisNumber,
              engineNumber: row.engineNumber,
            });
            if (stockVehicle.ambiguous) {
              throw new ImportRowError(`Dispatch Vehicle identity conflicts or is ambiguous (${stockVehicle.count} records).`, {
                field: stockVehicle.matchBy,
                value: row.chassisNumber || row.engineNumber,
                relatedEntity: 'Vehicle',
                code: stockVehicle.conflict ? 'VEHICLE_IDENTITY_CONFLICT' : 'AMBIGUOUS_VEHICLE_IDENTITY',
              });
            }
            // Stock arrival, not an anomaly — see processDispatchStockRow.
            debugEvent('dispatch.stock_only', {
              _meta: row._meta,
              dispatchNumber: row.dispatchNumber,
              pboNo: row.pboNo || '',
              unresolvedReason: dispatchLookupSummary(row),
            });
            result.entities.vehicles[stockVehicle.vehicle ? 'reused' : 'created'] += 1;
            const alreadyDispatched = rawPresent(stockVehicle.vehicle?.dispatch?.dispatchNo);
            result.entities.dispatchRecords[alreadyDispatched ? 'updated' : 'created'] += 1;
            output.successful += 1;
            output[alreadyDispatched ? 'plannedUpdate' : 'plannedCreate'] += 1;
            continue;
          }
          if (order && (!order.customer || !order.booking)) {
            throw new ImportRowError('Dispatch SalesOrder is missing Customer or Booking relationship.', {
              field: !order.customer ? 'customer' : 'booking',
              missingField: !order.customer ? 'SalesOrder.customer' : 'SalesOrder.booking',
              relatedEntity: 'SalesOrder',
            });
          }
          const vehicleResolution = context.vehicles.resolve({
            _meta: row._meta,
            stage: 'dispatch',
            chassisNumber: row.chassisNumber,
            engineNumber: row.engineNumber,
          });
          if (vehicleResolution.ambiguous) {
            throw new ImportRowError(`Dispatch Vehicle identity conflicts or is ambiguous (${vehicleResolution.count} records).`, {
              field: vehicleResolution.matchBy,
              value: row.chassisNumber || row.engineNumber,
              relatedEntity: 'Vehicle',
              code: vehicleResolution.conflict ? 'VEHICLE_IDENTITY_CONFLICT' : 'AMBIGUOUS_VEHICLE_IDENTITY',
            });
          }
          const hasVehicle = Boolean(order?.vehicle || plannedOrder?.hasVehicle || vehicleResolution.vehicle);
          if (!hasVehicle && ![row.chassisNumber, row.engineNumber].some(rawPresent)) {
            throw new ImportRowError('Dispatch requires a physical Vehicle or chassis/engine evidence.', {
              field: 'vehicle',
              missingField: 'chassisNumber/engineNumber',
              relatedEntity: 'Vehicle',
            });
          }
          const existingInvoice = Boolean(
            order?.invoice
            || (order && [...context.orders.invoices.values()].find(
              (invoice) => String(invoice.salesOrder) === String(order._id),
            )),
          );
          if (!existingInvoice && !plannedOrder?.hasInvoice && !rawPresent(row.externalInvoiceNumber)) {
            throw new ImportRowError('Dispatch cannot create an Invoice without source invoice evidence.', {
              field: 'externalInvoiceNumber',
              missingField: 'externalInvoiceNumber',
              relatedEntity: 'Invoice',
              code: 'INVOICE_EVIDENCE_REQUIRED',
            });
          }
          if (!hasVehicle && [row.chassisNumber, row.engineNumber].some(rawPresent)) {
            result.entities.vehicles.created += 1;
          }
          classification = order?.dispatchNo ? 'plannedUpdate' : 'plannedCreate';
          result.entities.dispatchRecords[order?.dispatchNo ? 'updated' : 'created'] += 1;
        }
        output.successful += 1;
        output[classification] += 1;
      } catch (error) {
        const entry = errorToIssue(row, error);
        output.failed += 1;
        output.errors.push(entry);
        result.errors.push(entry);
      }
    }
    output.progress = 100;
    result.files.push(output);
  }

  result.files.forEach((file) => {
    result.totals.totalRows += file.totalRows;
    result.totals.successful += file.successful;
    result.totals.plannedCreate += file.plannedCreate;
    result.totals.plannedUpdate += file.plannedUpdate;
    result.totals.plannedReuse += file.plannedReuse;
    result.totals.duplicates += file.duplicates;
    result.totals.failed += file.failed;
  });
  result.entities = previewEntityTotals(result.entities);
  collapseRepeatedWarnings(result);
  return result;
}

async function previewBatch(parsedFiles, { audit = null } = {}) {
  if (audit) return audit.run(() => previewBatchInternal(parsedFiles));
  return previewBatchInternal(parsedFiles);
}

const COUNT_MODELS = Object.freeze({
  customers: Customer,
  bookings: Booking,
  salesOrders: SalesOrder,
  vehicles: Vehicle,
  invoices: Invoice,
  payments: Payment,
  makes: VehicleMake,
  models: VehicleModel,
  variants: VehicleVariant,
  colors: VehicleColor,
});

async function persistedCounts() {
  const entries = await Promise.all(
    Object.entries(COUNT_MODELS).map(async ([name, Model]) => [name, await Model.countDocuments({})]),
  );
  return Object.fromEntries(entries);
}

/**
 * Re-read up to `limit` committed chains with fresh (session-less) queries so
 * the report proves the relationships exist in MongoDB, not just in memory.
 */
async function verifySuccessfulChains(files, limit = 5) {
  const candidates = files
    .flatMap((file) => (file.records || []).map((record) => ({ ...record, logicalType: file.logicalType })))
    .filter((record) => record.customerId && record.classification !== 'duplicate');
  candidates.sort((left, right) => (
    Number(Boolean(right.dispatchId)) - Number(Boolean(left.dispatchId))
    || Number(Boolean(right.salesOrderId)) - Number(Boolean(left.salesOrderId))
    || Number(Boolean(right.invoiceId)) - Number(Boolean(left.invoiceId))
  ));
  const chains = [];
  const seen = new Set();
  for (const record of candidates) {
    if (chains.length >= limit) break;
    const key = record.salesOrderId || record.bookingId || record.customerId;
    if (seen.has(key)) continue;
    seen.add(key);
    const [customer, booking, salesOrder, vehicle, invoice] = await Promise.all([
      Customer.findById(record.customerId).select('customerCode firstName lastName companyName email phone cnic ntn').lean(),
      record.bookingId ? Booking.findById(record.bookingId).select('bookingNumber pboNo customer vehicle status').lean() : null,
      record.salesOrderId ? SalesOrder.findById(record.salesOrderId).select('orderNumber externalOrderNumber pboNo customer booking vehicle invoice status dispatchNo dispatchDate totalAmount paidAmount balanceAmount').lean() : null,
      record.vehicleId ? Vehicle.findById(record.vehicleId).select('vehicleCode chassisNumber vin engineNumber make model variant color year status').lean() : null,
      record.invoiceId ? Invoice.findById(record.invoiceId).select('invoiceNumber externalInvoiceNumber salesOrder customer totalAmount paidAmount balanceAmount status').lean() : null,
    ]);
    const payments = record.invoiceId
      ? await Payment.find({ invoice: record.invoiceId }).select('paymentNumber amount paymentDate status').lean()
      : [];
    chains.push({
      sourceIdentifier: record.sourceIdentifier || '',
      logicalType: record.logicalType,
      verifiedByFreshQuery: Boolean(customer),
      customer,
      booking,
      salesOrder,
      vehicle,
      invoice,
      payments,
      dispatch: salesOrder?.dispatchNo
        ? { dispatchNo: salesOrder.dispatchNo, dispatchDate: salesOrder.dispatchDate || null, salesOrder: String(salesOrder._id) }
        : null,
    });
  }
  return chains;
}

function entityCountsByAction(entities, action) {
  return Object.fromEntries(Object.entries(entities).map(([entity, counts]) => [
    entity,
    Number(counts[action] || (action === 'reused' ? counts.resolved || counts.skipped || 0 : 0)),
  ]));
}

async function importBatchInternal(parsedFiles, { userId = null, onProgress = null } = {}) {
  const ordered = [...parsedFiles]
    .sort((left, right) => FILE_TYPE_ORDER.indexOf(left.logicalType) - FILE_TYPE_ORDER.indexOf(right.logicalType))
    .map((parsed) => {
      if (!DEBUG_SINGLE_CHAIN) return parsed;
      if (!DEBUG_PBO) throw new Error('IMPORT_DEBUG_PBO is required when IMPORT_DEBUG_SINGLE_CHAIN=true.');
      const records = parsed.records.filter((record) => (
        normalizeBusinessReference(normalizeRecord(record, parsed.logicalType).value.pboNo) === DEBUG_PBO
      ));
      importTrace("[IMPORT_DEBUG_CHAIN_FILTER]", {
        logicalType: parsed.logicalType,
        debugPbo: DEBUG_PBO,
        sourceRows: parsed.records.length,
        matchingRows: records.length,
      });
      return { ...parsed, records };
    });
  const files = ordered.map(fileResult);
  const countsBefore = await persistedCounts();
  importTrace("[IMPORT_COUNTS_BEFORE]", countsBefore);
  const result = {
    mode: 'commit',
    countsBefore,
    status: 'processing',
    transactionMode: (await supportsTransactions()) ? 'mongodb_transaction' : 'compensating_rollback',
    totals: { totalRows: 0, successful: 0, created: 0, updated: 0, skipped: 0, duplicates: 0, failed: 0 },
    entities: newEntityDelta(),
    files,
    errors: [],
    warnings: [],
    mappingReport: ordered.flatMap((parsed) => parsed.mappingReport.map((mapping) => ({ logicalType: parsed.logicalType, fileName: parsed.fileName, ...mapping }))),
  };
  result.totals.totalRows = files.reduce((sum, file) => sum + file.totalRows, 0);
  const atomicOptions = { useTransactions: result.transactionMode === 'mongodb_transaction' };
  importTrace("[IMPORT_EXECUTION_MODE]", {
    requestedMode: 'commit',
    effectiveMode: 'commit',
    transactionMode: result.transactionMode,
  });
  let context = await ImportContext.load();
  const seen = new Set();
  const salesDependencies = buildSalesDependencyIndex(ordered);

  for (let fileIndex = 0; fileIndex < ordered.length; fileIndex += 1) {
    const parsed = ordered[fileIndex];
    const output = files[fileIndex];
    output.status = 'validating';
    if (onProgress) await onProgress({ fileKey: output.fileKey, logicalType: parsed.logicalType, status: output.status, progress: 0, result });

    const normalizedRows = parsed.records.map((record) => ({
      ...normalizeRecord(record, parsed.logicalType),
      rawRow: record,
    }));
    // Borrow identity/seller values from the matching Sales row before the
    // row's warnings are reported, so satisfied gaps are not surfaced.
    if (parsed.logicalType === 'orderIntake') {
      normalizedRows.forEach((normalized) => mergeIntakeDependency(normalized, salesDependencies));
    }
    output.status = 'importing';
    for (let rowIndex = 0; rowIndex < normalizedRows.length; rowIndex += 1) {
      const normalized = normalizedRows[rowIndex];
      const row = normalized.value;
      if (parsed.logicalType === 'orderIntake') {
        importTrace("[INTAKE_RAW_ROW]", {
          excelRowNumber: row._meta?.rowNumber || null,
          rawRow: normalized.rawRow,
        });
        importTrace("[INTAKE_NORMALIZED_ROW]", {
          excelRowNumber: row._meta?.rowNumber || null,
          customerName: row.customerName,
          pboNo: row.pboNo,
          orderNumber: row.externalOrderNumber,
          vehicleDescription: row.vehicleDescription,
          colorName: row.colorName,
          bookingDate: row.orderDate || row.bookingDate || null,
        });
      }
      output.warnings.push(...normalized.warnings);
      result.warnings.push(...normalized.warnings);
      await auditExistingRelationship(row, parsed.logicalType, context);

      const duplicateKey = sourceDuplicateKey(row, parsed.logicalType);
      const seenKey = duplicateKey ? `${parsed.logicalType}:${duplicateKey}` : '';
      if (seenKey && seen.has(seenKey)) {
        const duplicate = sourceIssue(row, {
          errorType: 'DUPLICATE_SOURCE_ROW',
          field: parsed.logicalType === 'dispatch' ? 'dispatchNumber' : 'externalOrderNumber',
          value: duplicateKey,
          message: `Duplicate ${parsed.definition.label} source identifier "${duplicateKey}" in the same import batch.`,
        });
        output.skipped += 1;
        output.duplicates += 1;
        output.warnings.push(duplicate);
        result.warnings.push(duplicate);
        debugEvent('row.import.duplicate', {
          _meta: row._meta,
          logicalType: parsed.logicalType,
          classification: 'duplicate',
          issue: duplicate,
        }, { level: 'warn' });
      } else if (normalized.errors.length) {
        output.failed += 1;
        output.errors.push(...normalized.errors);
        result.errors.push(...normalized.errors);
        if (seenKey) seen.add(seenKey);
        debugEvent('row.import.failed', {
          _meta: row._meta,
          logicalType: parsed.logicalType,
          classification: 'failed',
          errors: normalized.errors,
        }, { level: 'error' });
      } else {
        if (seenKey) seen.add(seenKey);
        try {
          let rowResult;
          if (parsed.logicalType === 'orderIntake') rowResult = await processIntakeRow(row, context, atomicOptions, userId, salesDependencies);
          else if (parsed.logicalType === 'orderSales') rowResult = await processSalesRow(row, context, atomicOptions, userId);
          else rowResult = await processDispatchRow(row, context, atomicOptions, userId);

          mergeEntityDelta(result.entities, rowResult.delta);
          output.warnings.push(...rowResult.warnings);
          result.warnings.push(...rowResult.warnings);
          if (rowResult.classification === 'duplicate') {
            output.skipped += 1;
            output.duplicates += 1;
          } else {
            output.successful += 1;
            output[rowResult.classification] += 1;
          }
          output.records.push({
            row: row._meta?.rowNumber || null,
            sourceIdentifier: row._meta?.sourceIdentifier || '',
            classification: rowResult.classification,
            ...rowResult.identifiers,
          });
          debugEvent('row.import.completed', {
            _meta: row._meta,
            logicalType: parsed.logicalType,
            classification: rowResult.classification,
            entityDelta: rowResult.delta,
            warnings: rowResult.warnings,
          }, rowResult.classification === 'duplicate' ? { level: 'warn' } : {});
        } catch (error) {
          const entry = errorToIssue(row, error);
          output.failed += 1;
          output.errors.push(entry);
          result.errors.push(entry);
          const related = String(entry.relatedEntity || '').toLowerCase();
          const section = related.includes('customer') ? 'customers'
            : related.includes('vehicle') ? 'vehicles'
              : related.includes('booking') ? 'bookings'
                : related.includes('invoice') ? 'invoices'
                  : related.includes('payment') ? 'payments'
                    : related.includes('seller') || related.includes('employee') || related.includes('user') ? 'sellers'
                      : related.includes('salesorder') ? 'salesOrders'
                        : null;
          debugEvent('row.import.failed', {
            _meta: row._meta,
            logicalType: parsed.logicalType,
            classification: 'failed',
            error: entry,
            rollback: 'Row mutations were rolled back by transaction or compensation.',
          }, {
            section,
            bucket: section === 'vehicles' ? 'failed' : section ? 'failed' : null,
            level: 'error',
          });
          if (DEBUG_SINGLE_CHAIN) {
            console.error("[IMPORT_FATAL_ERROR]", error);
            throw error;
          }
          context = await ImportContext.load();
        }
      }

      output.progress = Math.round(((rowIndex + 1) / normalizedRows.length) * 100);
      if (onProgress) await onProgress({ fileKey: output.fileKey, logicalType: parsed.logicalType, status: output.status, progress: output.progress, result });
    }
    output.status = output.failed ? (output.successful || output.skipped ? 'completed_with_errors' : 'failed') : 'completed';
    output.progress = 100;
  }

  files.forEach((file) => {
    result.totals.successful += file.successful;
    result.totals.created += file.created;
    result.totals.updated += file.updated;
    result.totals.skipped += file.skipped;
    result.totals.duplicates += file.duplicates;
    result.totals.failed += file.failed;
  });
  result.status = result.totals.failed ? (result.totals.successful || result.totals.skipped ? 'completed_with_errors' : 'failed') : 'completed';
  result.countsAfter = await persistedCounts();
  importTrace("[IMPORT_COUNTS_AFTER]", result.countsAfter);
  const databaseDiff = Object.fromEntries(
    Object.keys(COUNT_MODELS).map((name) => [name, result.countsAfter[name] - result.countsBefore[name]]),
  );
  importTrace("[IMPORT_DATABASE_DIFF]", databaseDiff);
  result.databaseDiff = databaseDiff;
  result.databaseName = mongoose.connection?.name || '';
  result.actualCreated = entityCountsByAction(result.entities, 'created');
  result.actualUpdated = entityCountsByAction(result.entities, 'updated');
  result.actualReused = entityCountsByAction(result.entities, 'reused');
  result.actualSkipped = Object.fromEntries(files.map((file) => [file.logicalType, file.skipped]));
  result.actualSkipped.total = result.totals.skipped;
  result.actualFailed = Object.fromEntries(files.map((file) => [file.logicalType, file.failed]));
  result.actualFailed.total = result.totals.failed;
  result.successfulChains = await verifySuccessfulChains(files, 5);
  result.changedCollections = Object.keys(COUNT_MODELS).filter((name) => (
    result.countsBefore[name] !== result.countsAfter[name]
    || Number(result.actualCreated[name] || 0) > 0
    || Number(result.actualUpdated[name] || 0) > 0
  ));
  result.databaseWritesObserved = result.changedCollections.length > 0;
  collapseRepeatedWarnings(result);
  // The commit report is part of the returned result and the audit file; printing
  // it again only adds to the console noise an import already produces.
  return result;
}

async function importBatch(parsedFiles, {
  mode,
  userId = null,
  onProgress = null,
  audit = null,
} = {}) {
  if (mode !== 'commit') {
    throw new ImportRowError('importBatch requires explicit mode="commit"; use previewBatch for read-only planning.', {
      field: 'mode',
      value: mode || '',
      missingField: 'mode=commit',
      relatedEntity: 'ImportBatch',
      code: 'IMPORT_MODE_REQUIRED',
    });
  }
  const options = { userId, onProgress };
  if (audit) return audit.run(() => importBatchInternal(parsedFiles, options));
  return importBatchInternal(parsedFiles, options);
}

module.exports = {
  ImportContext,
  ImportRowError,
  previewBatch,
  changedFields,
  importBatch,
};
