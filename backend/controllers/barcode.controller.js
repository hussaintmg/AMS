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

/**
 * POST /api/barcode/scan { code }
 * Resolve a scanned (or typed) code to a product and hand back a line item the
 * sales screens can drop straight into a document.
 *
 * A scanner may send the barcode itself, and a human may type a part code or a
 * chassis number — all three resolve here so the page behaves the same either
 * way.
 */
exports.scan = async (req, res, next) => {
  try {
    const code = clean(req.body?.code || req.query?.code);
    if (!code) throw new AppError('Scan a barcode or enter a code', 400);
    if (!isEncodable(code)) throw new AppError('That code contains characters a barcode cannot hold', 400);
    const exact = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    const part = await Part.findOne({
      isActive: { $ne: false },
      $or: [{ barcode: exact }, { partCode: exact }, { sku: exact }],
    }).lean();

    if (part) {
      return res.json({
        success: true,
        data: {
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
        },
      });
    }

    const vehicle = await Vehicle.findOne({
      $or: [{ barcode: exact }, { chassisNumber: exact }, { vin: exact }, { vehicleCode: exact }, { engineNumber: exact }],
    }).lean();

    if (vehicle) {
      const status = canonicalStatus(vehicle.status);
      return res.json({
        success: true,
        data: {
          kind: 'vehicle',
          id: String(vehicle._id),
          barcode: vehicle.barcode || '',
          name: vehicleLabel(vehicle),
          code: vehicle.chassisNumber || vehicle.vehicleCode || '',
          status: vehicle.status,
          available: ['available', 'booked'].includes(status) ? 1 : 0,
          inStock: ['available', 'booked'].includes(status),
          unitPrice: num(vehicle.salePrice),
          lineItem: {
            itemType: 'vehicle',
            vehicleId: String(vehicle._id),
            quantity: 1,
            unitPrice: num(vehicle.salePrice),
            description: vehicleLabel(vehicle),
          },
        },
      });
    }

    res.status(404).json({ success: false, message: `Nothing matches "${code}"` });
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
