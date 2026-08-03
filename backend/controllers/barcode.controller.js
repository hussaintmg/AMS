/**
 * Barcodes for inventory: assign one to a part or vehicle, download it as an
 * SVG or a printable label, and resolve a scanned code back to the product.
 *
 * The scan endpoint is what the Barcode Scan page calls: it returns a ready-made
 * line item so the caller can push the product straight onto a quotation,
 * booking, sales order or invoice without retyping anything.
 */
const Part = require('../models/Part.model');
const Vehicle = require('../models/Vehicle.model');
const { AppError } = require('../middleware/errorHandler');
const {
  renderBarcodeSvg, renderBarcodeLabelHtml, nextBarcode, backfillBarcodes, isEncodable,
} = require('../utils/barcode');
const { canonicalStatus } = require('../utils/vehicleLifecycle');
const logger = require('../utils/logger');

const clean = (value) => String(value == null ? '' : value).trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const MODELS = { part: Part, vehicle: Vehicle };

const vehicleLabel = (vehicle) => [
  vehicle.make?.name, vehicle.model?.name, vehicle.variant?.name,
  vehicle.color?.name ? `(${vehicle.color.name})` : '',
].filter(Boolean).join(' ') || vehicle.chassisNumber || vehicle.vehicleCode || 'Vehicle';

/** Give a record a barcode if it has none, and return it. */
async function ensureBarcode(kind, id) {
  const Model = MODELS[kind];
  if (!Model) throw new AppError('Barcode kind must be part or vehicle', 400);
  const record = await Model.findById(id);
  if (!record) throw new AppError(`${kind === 'part' ? 'Part' : 'Vehicle'} not found`, 404);
  if (!clean(record.barcode)) {
    record.barcode = await nextBarcode(Model, kind);
    await record.save();
  }
  return record;
}

/** POST /api/barcode/:kind/:id — assign (or return) this record's barcode. */
exports.assign = async (req, res, next) => {
  try {
    const record = await ensureBarcode(req.params.kind, req.params.id);
    res.json({ success: true, data: { id: String(record._id), barcode: record.barcode } });
  } catch (error) { next(error); }
};

/** GET /api/barcode/:kind/:id/svg — the barcode image itself. */
exports.svg = async (req, res, next) => {
  try {
    const record = await ensureBarcode(req.params.kind, req.params.id);
    const svg = renderBarcodeSvg(record.barcode, {
      height: num(req.query.height, 70),
      moduleWidth: num(req.query.moduleWidth, 2),
      showText: req.query.text !== 'false',
    });
    res.set({
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': `${req.query.download === 'true' ? 'attachment' : 'inline'}; filename="${record.barcode}.svg"`,
      'Cache-Control': 'no-cache',
    }).send(svg);
  } catch (error) { next(error); }
};

/** GET /api/barcode/:kind/:id/label — printable label with name and price. */
exports.label = async (req, res, next) => {
  try {
    const kind = req.params.kind;
    const record = await ensureBarcode(kind, req.params.id);
    const isPart = kind === 'part';
    const html = renderBarcodeLabelHtml(record.barcode, {
      title: isPart ? record.name : vehicleLabel(record),
      subtitle: isPart
        ? [record.partCode || record.sku, record.brand].filter(Boolean).join(' · ')
        : [record.chassisNumber, record.year].filter(Boolean).join(' · '),
      price: isPart
        ? (record.sellingPrice ? `PKR ${Number(record.sellingPrice).toLocaleString('en-PK')}` : '')
        : (record.salePrice ? `PKR ${Number(record.salePrice).toLocaleString('en-PK')}` : ''),
    });
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  } catch (error) { next(error); }
};

/** The shape every lookup returns: a product plus a ready-made line item. */
const partPayload = (part) => ({
  kind: 'part',
  id: String(part._id),
  barcode: part.barcode || '',
  name: part.name,
  code: part.partCode || part.sku || '',
  available: num(part.currentStock),
  inStock: num(part.currentStock) > 0,
  unitPrice: num(part.sellingPrice),
  // Ready to append to a document's lineItems.
  lineItem: {
    itemType: 'part',
    partId: String(part._id),
    quantity: 1,
    unitPrice: num(part.sellingPrice),
    description: `${part.name}${part.partCode ? ` (${part.partCode})` : ''}`,
  },
});

/**
 * A vehicle that has been sold, dispatched or delivered has left the yard and
 * can never go onto a new document. Anything still `available` or `booked` can.
 */
const SELLABLE_VEHICLE_STATUSES = ['available', 'booked'];
const isSellableVehicle = (vehicle) => SELLABLE_VEHICLE_STATUSES.includes(canonicalStatus(vehicle.status));

const vehiclePayload = (vehicle) => {
  const status = canonicalStatus(vehicle.status);
  const sellable = isSellableVehicle(vehicle);
  return {
    kind: 'vehicle',
    id: String(vehicle._id),
    barcode: vehicle.barcode || '',
    name: vehicleLabel(vehicle),
    code: vehicle.chassisNumber || vehicle.vehicleCode || '',
    status: vehicle.status,
    available: sellable ? 1 : 0,
    inStock: sellable,
    unitPrice: num(vehicle.salePrice),
    lineItem: {
      itemType: 'vehicle',
      vehicleId: String(vehicle._id),
      quantity: 1,
      unitPrice: num(vehicle.salePrice),
      description: vehicleLabel(vehicle),
    },
  };
};

/**
 * POST /api/barcode/scan { code, kind }
 * Resolve a scanned (or typed) code to a product and hand back a line item the
 * sales screens can drop straight into a document.
 *
 * A scanner may send the barcode itself, and a human may type a part code or a
 * chassis number — all three resolve here so the page behaves the same either
 * way.
 *
 * `kind` narrows the lookup to 'part' or 'vehicle'. The parts counter and the
 * vehicle counter are separate screens building documents in separate
 * collections, so a code from the other side must not resolve: silently
 * basketing a vehicle on a parts sale is worse than saying it was not found.
 */
exports.scan = async (req, res, next) => {
  try {
    const code = clean(req.body?.code || req.query?.code);
    const kind = clean(req.body?.kind || req.query?.kind).toLowerCase();
    if (!code) throw new AppError('Scan a barcode or enter a code', 400);
    if (!isEncodable(code)) throw new AppError('That code contains characters a barcode cannot hold', 400);
    if (kind && !MODELS[kind]) throw new AppError('Barcode kind must be part or vehicle', 400);
    const exact = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    if (kind !== 'vehicle') {
      const part = await Part.findOne({
        isActive: { $ne: false },
        $or: [{ barcode: exact }, { partCode: exact }, { sku: exact }],
      }).lean();
      if (part) return res.json({ success: true, data: partPayload(part) });
    }

    if (kind !== 'part') {
      const vehicle = await Vehicle.findOne({
        $or: [{ barcode: exact }, { chassisNumber: exact }, { vin: exact }, { vehicleCode: exact }, { engineNumber: exact }],
      })
        .populate('make', 'name').populate('model', 'name')
        .populate('variant', 'name').populate('color', 'name')
        .lean();
      if (vehicle) return res.json({ success: true, data: vehiclePayload(vehicle) });
    }

    const scope = kind === 'part' ? ' in parts' : kind === 'vehicle' ? ' in vehicles' : '';
    res.status(404).json({ success: false, message: `Nothing matches "${code}"${scope}` });
  } catch (error) { next(error); }
};

/**
 * GET /api/barcode/search?q=&kind=&limit=&includeUnavailable=
 * Free-text product lookup for the counter screen: stock that has no barcode
 * printed yet — or that the operator simply cannot scan — is still one click
 * away. Results carry the same line item as a scan, so the caller treats a
 * picked product and a scanned one identically.
 *
 * By default only stock that can actually be sold comes back: a part with none
 * left on the shelf, or a vehicle already sold, dispatched or delivered, is not
 * something the counter can hand over, and offering it only produces a failed
 * document. Pass includeUnavailable=true to see everything anyway.
 */
exports.search = async (req, res, next) => {
  try {
    const q = clean(req.query?.q);
    const kind = clean(req.query?.kind).toLowerCase();
    const limit = Math.min(Math.max(num(req.query?.limit, 20), 1), 50);
    const includeUnavailable = clean(req.query?.includeUnavailable).toLowerCase() === 'true';
    // A blank query is not an error — it lists what is on the shelf.
    const like = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const results = [];

    if (kind !== 'vehicle') {
      const parts = await Part.find({
        isActive: { $ne: false },
        ...(includeUnavailable ? {} : { currentStock: { $gt: 0 } }),
        ...(like ? { $or: [{ name: like }, { partCode: like }, { sku: like }, { barcode: like }, { brand: like }] } : {}),
      }).sort({ name: 1 }).limit(limit).lean();
      results.push(...parts.map(partPayload));
    }

    if (kind !== 'part') {
      const vehicles = await Vehicle.find(
        like
          ? { $or: [{ chassisNumber: like }, { vin: like }, { vehicleCode: like }, { engineNumber: like }, { barcode: like }] }
          : {},
      )
        .populate('make', 'name').populate('model', 'name')
        .populate('variant', 'name').populate('color', 'name')
        .sort({ createdAt: -1 })
        // Status is stored in several spellings (canonicalStatus folds them), so
        // it is filtered in code rather than in the query. Over-fetching keeps a
        // page of results from collapsing to a handful once sold units drop out.
        .limit(includeUnavailable ? limit : limit * 4)
        .lean();
      const sellable = includeUnavailable ? vehicles : vehicles.filter(isSellableVehicle);
      results.push(...sellable.slice(0, limit).map(vehiclePayload));
    }

    // Sellable stock first: a counter mostly wants what it can actually hand
    // over, and this runs before the slice so those win the limited slots.
    results.sort((a, b) => Number(b.inStock) - Number(a.inStock));

    res.json({ success: true, data: results.slice(0, limit) });
  } catch (error) { next(error); }
};

/**
 * POST /api/barcode/:kind/backfill — give every existing part or vehicle that
 * has no barcode one, so stock entered before this feature becomes scannable.
 */
exports.backfill = async (req, res, next) => {
  try {
    const kind = req.params.kind;
    const Model = MODELS[kind];
    if (!Model) throw new AppError('Barcode kind must be part or vehicle', 400);
    const assigned = await backfillBarcodes(Model, kind);
    logger.info(`Barcodes backfilled for ${assigned} ${kind}(s) by ${req.user?.email || 'system'}`);
    res.json({ success: true, message: `${assigned} ${kind}(s) received a barcode`, data: { assigned } });
  } catch (error) { next(error); }
};
