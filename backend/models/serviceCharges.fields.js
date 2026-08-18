const mongoose = require('mongoose');

/**
 * Service charges on a sales document — quotation, booking, order or invoice,
 * vehicle, parts or custom alike.
 *
 * A tick box on the form ("Add service charges") reveals a block of rows:
 * a service type from Service Master Data (its base price prefills the
 * amount), a free description, the amount, and a tax rate — per line, as the
 * client asked. The rows ride on the document in their own array rather than
 * as product lines, because a service is not stock: it moves nothing, it has
 * no part or vehicle behind it, and the printed page lists it under its own
 * heading. The totals are added to `totalAmount` (and to `balanceAmount` where
 * the document has one) so the figures still reconcile.
 *
 * Every document schema spreads `serviceChargeFields`; every create/update
 * path passes `req.body` through `serviceChargeValues()` and spreads the
 * result into the record. One place decides the arithmetic.
 */
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const serviceChargeLineSchema = new mongoose.Schema({
  serviceType: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceType', default: null },
  name: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  quantity: { type: Number, default: 1, min: 0 },
  amount: { type: Number, default: 0 },          // per unit
  taxPercent: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },           // quantity × amount + tax
}, { _id: true });

const serviceChargeFields = {
  hasServiceCharges: { type: Boolean, default: false },
  serviceCharges: { type: [serviceChargeLineSchema], default: [] },
  // Net of tax, and the tax on top; the document's totalAmount includes both.
  serviceChargesTotal: { type: Number, default: 0 },
  serviceTaxTotal: { type: Number, default: 0 },
};

/** Normalise what a form sends into stored rows and their totals. */
function parseServiceCharges(body = {}) {
  const enabled = body.hasServiceCharges === true || body.hasServiceCharges === 'true'
    || (Array.isArray(body.serviceCharges) && body.serviceCharges.length > 0);
  const raw = enabled && Array.isArray(body.serviceCharges) ? body.serviceCharges : [];
  const rows = raw
    .map((row) => {
      const quantity = Math.max(0, num(row.quantity, 1));
      const amount = round2(num(row.amount ?? row.unitPrice ?? row.price));
      const taxPercent = Math.max(0, num(row.taxPercent ?? row.tax_percent));
      const net = round2(quantity * amount);
      const taxAmount = row.taxAmount != null && row.taxAmount !== '' ? round2(num(row.taxAmount)) : round2(net * taxPercent / 100);
      return {
        serviceType: mongoose.Types.ObjectId.isValid(row.serviceTypeId || row.serviceType || row.service_type_id) ? (row.serviceTypeId || row.serviceType || row.service_type_id) : null,
        name: String(row.name || row.serviceTypeName || row.service_type_name || '').trim(),
        description: String(row.description || '').trim(),
        quantity,
        amount,
        taxPercent,
        taxAmount,
        total: round2(net + taxAmount),
      };
    })
    .filter((row) => row.name || row.description || row.amount > 0);
  const serviceChargesTotal = round2(rows.reduce((sum, row) => sum + row.quantity * row.amount, 0));
  const serviceTaxTotal = round2(rows.reduce((sum, row) => sum + row.taxAmount, 0));
  return {
    rows,
    serviceChargesTotal,
    serviceTaxTotal,
    grand: round2(serviceChargesTotal + serviceTaxTotal),
  };
}

/**
 * The fields to spread into a record. `baseTotal` is the document total
 * before service charges; the returned `totalAmount` includes them. Pass
 * `basePaid` to get a matching `balanceAmount`.
 */
function serviceChargeValues(body = {}, { baseTotal = null, basePaid = null } = {}) {
  const parsed = parseServiceCharges(body);
  const values = {
    hasServiceCharges: parsed.rows.length > 0,
    serviceCharges: parsed.rows,
    serviceChargesTotal: parsed.serviceChargesTotal,
    serviceTaxTotal: parsed.serviceTaxTotal,
  };
  if (baseTotal !== null) {
    values.totalAmount = round2(num(baseTotal) + parsed.grand);
    if (basePaid !== null) values.balanceAmount = round2(Math.max(0, values.totalAmount - num(basePaid)));
  }
  return values;
}

/** The rows shaped for the API / the printed page. */
const mapServiceCharges = (doc = {}) => (Array.isArray(doc.serviceCharges) ? doc.serviceCharges : []).map((row) => ({
  id: row._id || null,
  service_type_id: row.serviceType?._id || row.serviceType || null,
  name: row.name || row.serviceType?.name || '',
  description: row.description || '',
  quantity: num(row.quantity, 1),
  amount: num(row.amount),
  tax_percent: num(row.taxPercent),
  tax_amount: num(row.taxAmount),
  total: num(row.total),
}));

const serviceChargeSummary = (doc = {}) => ({
  has_service_charges: doc.hasServiceCharges === true || (doc.serviceCharges || []).length > 0,
  service_charges: mapServiceCharges(doc),
  service_charges_total: num(doc.serviceChargesTotal),
  service_tax_total: num(doc.serviceTaxTotal),
});

module.exports = { serviceChargeLineSchema, serviceChargeFields, parseServiceCharges, serviceChargeValues, mapServiceCharges, serviceChargeSummary };
