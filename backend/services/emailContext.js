/**
 * Central enrichment for email rendering context. Guarantees every template
 * gets:
 *   - context.company  (active Company / branding) so {{company.*}} resolves
 *   - context.document (derived from invoice/quotation/booking/order) so a
 *     generic body using {{document.*}} works for any sales document
 *   - context.customer normalized so {{customer.company}} maps to companyName
 * Callers therefore don't have to remember to pass these.
 */
const { Company, BrandingSetting } = require('../models');
const logger = require('../utils/logger');

let companyCache = null;
let companyCacheAt = 0;
const COMPANY_TTL = 60 * 1000; // 1 minute

async function loadCompany() {
  if (companyCache && Date.now() - companyCacheAt < COMPANY_TTL) return companyCache;
  let doc = null;
  try {
    doc = await Company.findOne({ isActive: true }).sort({ createdAt: 1 }).lean();
  } catch (error) {
    logger?.warn?.(`[emailContext] company load failed: ${error.message}`);
  }
  let branding = null;
  try { branding = await BrandingSetting.findOne().lean(); } catch { /* optional */ }

  companyCache = {
    name: doc?.companyName || branding?.applicationName || '',
    phone: doc?.phone || '',
    email: doc?.email || '',
    website: doc?.website || '',
    address: [doc?.address, doc?.city, doc?.state].filter(Boolean).join(', '),
  };
  companyCacheAt = Date.now();
  return companyCache;
}

const firstDefined = (...values) => values.find((v) => v !== undefined && v !== null && v !== '');
const currency = (v) => (v == null || v === '' ? '' : (Number.isFinite(Number(v)) ? `PKR ${Number(v).toLocaleString('en-PK')}` : String(v)));
const dateStr = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '');

// Build a generic, DISPLAY-READY document view from whichever sales document is
// in context. Values are pre-formatted here because nested context lookups take
// precedence over provider output during rendering.
function deriveDocument(context = {}) {
  if (context.document) return context.document;
  const src = context.invoice || context.quotation || context.booking || context.order || {};
  if (!src || Object.keys(src).length === 0) return {};
  return {
    number: firstDefined(src.number, src.invoiceNumber, src.quotationNumber, src.bookingNumber, src.orderNumber) || '',
    date: dateStr(firstDefined(src.date, src.invoiceDate, src.quotationDate, src.bookingDate, src.orderDate, src.createdAt)),
    totalAmount: currency(firstDefined(src.totalAmount, src.amount)),
    balanceAmount: currency(firstDefined(src.balanceAmount, src.dueAmount)),
    status: src.status || '',
  };
}

async function enrichContext(context = {}) {
  const company = context.company || await loadCompany();
  const customer = context.customer
    ? { ...context.customer, company: context.customer.company || context.customer.companyName || '' }
    : context.customer;
  const document = deriveDocument(context);
  return { ...context, company, customer, document };
}

module.exports = { enrichContext, loadCompany, deriveDocument };
