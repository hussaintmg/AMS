/**
 * Multi-product line items for Quotations, Bookings, Sales Orders and Invoices.
 *
 * One document may now mix inventory Vehicles and Parts freely. This module is
 * the single place that turns a request payload into validated, priced lines,
 * and the single place that keeps the older single-item fields
 * (saleType/vehicle/part/partQuantity/items[]) in step with them — reports, the
 * Dealer Pro import and existing PDF variables still read those.
 */
const Vehicle = require('../models/Vehicle.model');
const Part = require('../models/Part.model');
const ServiceType = require('../models/ServiceType.model');
const { VehicleVariant, VehicleColor } = require('../models/VehicleMaster.model');
const { AppError } = require('../middleware/errorHandler');
const { canonicalStatus } = require('../utils/vehicleLifecycle');

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const oid = (value) => {
  const id = clean(value?._id || value);
  return /^[0-9a-fA-F]{24}$/.test(id) ? id : null;
};
const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

const vehicleLabel = (vehicle) => [
  vehicle.make?.name, vehicle.model?.name, vehicle.variant?.name,
  vehicle.color?.name ? `(${vehicle.color.name})` : '',
].filter(Boolean).join(' ') || vehicle.chassisNumber || vehicle.vin || vehicle.vehicleCode || 'Vehicle';

/**
 * Accept the several shapes the clients send:
 *   - lineItems: [{ itemType, vehicleId, partId, quantity, unitPrice, ... }]
 *   - legacy single item: { saleType, vehicleId, partId, partQuantity, vehiclePrice }
 * Returns the raw (unresolved) list so callers can hand one array to resolve().
 */
function readRequestedItems(body = {}) {
  const requested = Array.isArray(body.lineItems) ? body.lineItems
    : Array.isArray(body.items) && body.items.some((item) => item?.itemType || item?.partId || item?.vehicleId)
      ? body.items
      : null;
  if (requested && requested.length) return requested;

  const saleType = ['parts', 'part', 'service'].includes(clean(body.saleType).toLowerCase())
    ? clean(body.saleType).toLowerCase()
    : 'vehicle';
  if (saleType === 'parts' || saleType === 'part') {
    if (!oid(body.partId)) return [];
    return [{
      itemType: 'part',
      partId: body.partId,
      quantity: Math.max(1, num(body.partQuantity, 1)),
      unitPrice: body.unitPrice,
    }];
  }
  if (saleType === 'service') {
    if (!oid(body.serviceTypeId)) return [];
    return [{
      itemType: 'service',
      serviceTypeId: body.serviceTypeId,
      quantity: Math.max(1, num(body.partQuantity, 1)),
      unitPrice: body.unitPrice,
    }];
  }
  if (!oid(body.vehicleId) && !oid(body.vehicleVariantId)) return [];
  return [{
    itemType: 'vehicle',
    vehicleId: body.vehicleId,
    vehicleVariantId: body.vehicleVariantId,
    vehicleColorId: body.vehicleColorId,
    quantity: 1,
    unitPrice: body.vehiclePrice,
  }];
}

async function resolveVehicleLine(raw, { requireInventoryVehicle, checkAvailability }) {
  const vehicleId = oid(raw.vehicleId ?? raw.vehicle);
  const variantId = oid(raw.vehicleVariantId ?? raw.vehicleVariant);
  const colorId = oid(raw.vehicleColorId ?? raw.vehicleColor);

  if (!vehicleId && !variantId) {
    throw new AppError('Each vehicle line needs an inventory Vehicle or a vehicle variant', 400);
  }
  if (requireInventoryVehicle && !vehicleId) {
    throw new AppError('An inventory Vehicle must be allocated to each vehicle line at this stage', 400);
  }

  const line = {
    itemType: 'vehicle',
    vehicle: null, vehicleVariant: variantId, vehicleColor: colorId,
    part: null, serviceType: null,
    // A vehicle is one physical unit; quantity is always 1 so totals and stock
    // can never claim two of the same chassis.
    quantity: 1,
  };

  if (vehicleId) {
    const vehicle = await Vehicle.findById(vehicleId).lean();
    if (!vehicle) throw new AppError('Vehicle not found', 404);
    if (checkAvailability) {
      const status = canonicalStatus(vehicle.status);
      if (!checkAvailability.includes(status)) {
        throw new AppError(`Vehicle ${vehicle.chassisNumber || vehicle.vehicleCode} is not available (status: ${vehicle.status})`, 400);
      }
    }
    line.vehicle = vehicle._id;
    line.vehicleVariant = variantId || null;
    line.code = vehicle.chassisNumber || vehicle.vin || vehicle.vehicleCode || '';
    line.barcode = vehicle.barcode || '';
    line.name = vehicleLabel(vehicle);
    line.description = clean(raw.description) || line.name;
    line.unitPrice = num(raw.unitPrice, null) ?? null;
    if (line.unitPrice == null || !Number.isFinite(num(raw.unitPrice, NaN))) {
      line.unitPrice = num(vehicle.salePrice) || num(vehicle.variant?.price);
    }
    return line;
  }

  const variant = await VehicleVariant.findById(variantId).populate({
    path: 'model_id', select: 'name make_id', populate: { path: 'make_id', select: 'name' },
  }).lean();
  if (!variant) throw new AppError('Vehicle variant not found', 404);
  let colorName = '';
  if (colorId) {
    const color = await VehicleColor.findById(colorId).select('name').lean();
    if (!color) throw new AppError('Vehicle colour not found', 404);
    colorName = color.name;
  }
  line.name = [variant.model_id?.make_id?.name, variant.model_id?.name, variant.name, colorName ? `(${colorName})` : '']
    .filter(Boolean).join(' ');
  line.description = clean(raw.description) || line.name;
  line.code = variant.code || '';
  line.unitPrice = Number.isFinite(num(raw.unitPrice, NaN)) ? num(raw.unitPrice) : num(variant.base_price);
  return line;
}

async function resolvePartLine(raw, { checkStock }) {
  const partId = oid(raw.partId ?? raw.part);
  if (!partId) throw new AppError('Each part line needs a part', 400);
  const part = await Part.findById(partId).lean();
  if (!part) throw new AppError('Part not found', 404);

  const quantity = Math.max(1, num(raw.quantity ?? raw.partQuantity, 1));
  if (checkStock && num(part.currentStock) < quantity) {
    throw new AppError(`Insufficient stock for ${part.name}. Available: ${num(part.currentStock)}, requested: ${quantity}`, 400);
  }
  return {
    itemType: 'part',
    vehicle: null, vehicleVariant: null, vehicleColor: null,
    part: part._id, serviceType: null,
    code: part.partCode || part.sku || '',
    barcode: part.barcode || '',
    name: part.name || 'Part',
    description: clean(raw.description) || `${part.name || 'Part'}${part.partCode ? ` (${part.partCode})` : ''}`,
    quantity,
    unitPrice: Number.isFinite(num(raw.unitPrice, NaN)) ? num(raw.unitPrice) : num(part.sellingPrice),
  };
}

async function resolveServiceLine(raw) {
  const serviceTypeId = oid(raw.serviceTypeId ?? raw.serviceType);
  if (!serviceTypeId) throw new AppError('Each service line needs a service type', 400);
  const service = await ServiceType.findOne({ _id: serviceTypeId, isActive: true }).lean();
  if (!service) throw new AppError('Active service not found', 404);
  return {
    itemType: 'service',
    vehicle: null, vehicleVariant: null, vehicleColor: null,
    part: null, serviceType: service._id,
    code: service.code || '',
    barcode: '',
    name: service.name || 'Service',
    description: clean(raw.description) || service.name || 'Service',
    quantity: Math.max(1, num(raw.quantity, 1)),
    unitPrice: Number.isFinite(num(raw.unitPrice, NaN)) ? num(raw.unitPrice) : num(service.basePrice),
  };
}

/**
 * Validate and price every requested line.
 *
 * @param {object[]} requested        raw lines from the request
 * @param {object}   options
 * @param {boolean}  options.checkStock            reject part lines exceeding stock
 * @param {string[]} options.vehicleStatuses       canonical statuses a vehicle may be in
 * @param {boolean}  options.requireInventoryVehicle
 * @param {string[]} options.allowedTypes          itemTypes this document accepts
 */
async function resolveLineItems(requested = [], options = {}) {
  const {
    checkStock = false,
    vehicleStatuses = null,
    requireInventoryVehicle = false,
    allowedTypes = null,
  } = options;

  if (!Array.isArray(requested) || !requested.length) {
    throw new AppError('At least one product line is required', 400);
  }

  const lines = [];
  const seenVehicles = new Set();
  const partQuantities = new Map();

  for (const raw of requested) {
    const itemType = clean(raw.itemType || raw.type).toLowerCase();
    const kind = itemType === 'part' || itemType === 'parts' ? 'part'
      : itemType === 'service' ? 'service'
        : itemType === 'vehicle' ? 'vehicle'
          : (oid(raw.partId ?? raw.part) ? 'part' : oid(raw.serviceTypeId ?? raw.serviceType) ? 'service' : 'vehicle');

    // Vehicle and parts documents live in separate collections now, so a
    // document rejects the other side's products outright rather than storing a
    // line its own screens cannot render.
    if (allowedTypes && !allowedTypes.includes(kind)) {
      throw new AppError(
        `A ${kind} cannot be added here — use the ${kind === 'part' ? 'Parts' : 'Vehicles'} screens for that`,
        400,
      );
    }

    let line;
    if (kind === 'part') line = await resolvePartLine(raw, { checkStock: false });
    else if (kind === 'service') line = await resolveServiceLine(raw);
    else line = await resolveVehicleLine(raw, { requireInventoryVehicle, checkAvailability: vehicleStatuses });

    if (line.itemType === 'vehicle' && line.vehicle) {
      const key = String(line.vehicle);
      // The same physical unit twice on one document would sell it twice.
      if (seenVehicles.has(key)) throw new AppError(`Vehicle ${line.code || line.name} is listed more than once`, 400);
      seenVehicles.add(key);
    }
    if (line.itemType === 'part' && line.part) {
      const key = String(line.part);
      partQuantities.set(key, (partQuantities.get(key) || 0) + line.quantity);
    }

    const gross = round2(num(line.unitPrice) * num(line.quantity, 1));
    line.discountAmount = round2(raw.discountAmount);
    line.taxAmount = round2(raw.taxAmount);
    line.totalPrice = round2(gross - line.discountAmount + line.taxAmount);
    if (line.unitPrice < 0) throw new AppError(`Unit price for ${line.name} cannot be negative`, 400);
    lines.push(line);
  }

  // Stock is checked against the combined quantity, so two lines of the same
  // part cannot each pass on their own and together overdraw the shelf.
  if (checkStock && partQuantities.size) {
    const parts = await Part.find({ _id: { $in: [...partQuantities.keys()] } }).select('name partCode currentStock').lean();
    for (const part of parts) {
      const wanted = partQuantities.get(String(part._id)) || 0;
      if (num(part.currentStock) < wanted) {
        throw new AppError(`Insufficient stock for ${part.name}. Available: ${num(part.currentStock)}, requested: ${wanted}`, 400);
      }
    }
  }

  return lines;
}

/** Sum the resolved lines into the document-level money fields. */
function summarizeLineItems(lines = []) {
  const subtotal = round2(lines.reduce((sum, line) => sum + num(line.unitPrice) * num(line.quantity, 1), 0));
  const discountAmount = round2(lines.reduce((sum, line) => sum + num(line.discountAmount), 0));
  const taxAmount = round2(lines.reduce((sum, line) => sum + num(line.taxAmount), 0));
  return {
    subtotal,
    lineDiscountAmount: discountAmount,
    lineTaxAmount: taxAmount,
    lineTotal: round2(lines.reduce((sum, line) => sum + num(line.totalPrice), 0)),
    itemCount: lines.length,
    totalQuantity: lines.reduce((sum, line) => sum + num(line.quantity, 1), 0),
  };
}

/**
 * Legacy projection: the first line drives saleType/vehicle/part/partQuantity so
 * every existing reader (reports, imports, PDF variables, list mappers) keeps
 * working while the document itself carries the full list.
 */
function legacyFieldsFromLines(lines = []) {
  const first = lines[0] || null;
  if (!first) return {};
  const vehicleLine = lines.find((line) => line.itemType === 'vehicle') || null;
  const saleType = first.itemType === 'part' ? 'parts' : first.itemType;
  return {
    saleType,
    vehicle: vehicleLine?.vehicle || null,
    vehicleVariant: vehicleLine?.vehicleVariant || null,
    vehicleColor: vehicleLine?.vehicleColor || null,
    part: lines.find((line) => line.itemType === 'part')?.part || null,
    serviceType: lines.find((line) => line.itemType === 'service')?.serviceType || null,
    partQuantity: first.quantity || 1,
    itemDescription: lines.map((line) => line.description).filter(Boolean).join(', '),
    items: lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxAmount: line.taxAmount,
      totalPrice: line.totalPrice,
      type: line.itemType === 'part' ? 'parts' : line.itemType,
    })),
  };
}

/** Copy a stored document's lines back into the raw shape resolve() accepts. */
function linesToRequested(lines = []) {
  return (lines || []).map((line) => ({
    itemType: line.itemType,
    vehicleId: line.vehicle ? String(line.vehicle) : undefined,
    vehicleVariantId: line.vehicleVariant ? String(line.vehicleVariant) : undefined,
    vehicleColorId: line.vehicleColor ? String(line.vehicleColor) : undefined,
    partId: line.part ? String(line.part) : undefined,
    serviceTypeId: line.serviceType ? String(line.serviceType) : undefined,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountAmount: line.discountAmount,
    taxAmount: line.taxAmount,
    description: line.description,
  }));
}

/** Client-facing shape for one line (snake_case to match the other mappers). */
const mapLineItem = (line) => ({
  id: line._id ? String(line._id) : undefined,
  item_type: line.itemType,
  vehicle_id: line.vehicle ? String(line.vehicle) : null,
  vehicle_variant_id: line.vehicleVariant ? String(line.vehicleVariant) : null,
  vehicle_color_id: line.vehicleColor ? String(line.vehicleColor) : null,
  part_id: line.part ? String(line.part) : null,
  service_type_id: line.serviceType ? String(line.serviceType) : null,
  code: line.code || '',
  barcode: line.barcode || '',
  name: line.name || '',
  description: line.description || '',
  quantity: num(line.quantity, 1),
  unit_price: num(line.unitPrice),
  discount_amount: num(line.discountAmount),
  tax_amount: num(line.taxAmount),
  total_price: num(line.totalPrice),
});

module.exports = {
  readRequestedItems,
  resolveLineItems,
  summarizeLineItems,
  legacyFieldsFromLines,
  linesToRequested,
  mapLineItem,
  round2,
};
