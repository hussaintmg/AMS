/**
 * The shared counter customer.
 *
 * A walk-in buyer is not worth a customer record of their own — creating one
 * per sale fills the customer list with single-use entries nobody ever searches
 * for again. Instead every walk-in document points at one permanent
 * "Walk-in Customer", and the buyer's real name/phone are written onto the
 * document (models/walkIn.fields.js).
 *
 * Ledger, outstanding balance and sales history therefore keep working exactly
 * as they do for a named customer — they simply aggregate on this one record.
 */
const Customer = require('../models/Customer.model');

const WALK_IN_CODE = 'WALK-IN';

let cachedId = null;

/**
 * Find — or create once — the walk-in customer. Safe to call on every request:
 * the id is cached after the first lookup, and the upsert is idempotent.
 */
async function getWalkInCustomer() {
  if (cachedId) {
    const cached = await Customer.findById(cachedId).lean();
    if (cached && !cached.deletedAt) return cached;
    cachedId = null;
  }

  const existing = await Customer.findOne({ isWalkIn: true, deletedAt: null }).lean();
  if (existing) {
    cachedId = existing._id;
    return existing;
  }

  // findOneAndUpdate rather than create: two counters ringing up their first
  // walk-in at the same moment must not end up with two of these.
  const created = await Customer.findOneAndUpdate(
    { customerCode: WALK_IN_CODE },
    {
      $setOnInsert: {
        customerCode: WALK_IN_CODE,
        firstName: 'Walk-in',
        lastName: 'Customer',
        customerType: 'individual',
        isWalkIn: true,
        isActive: true,
        description: 'Shared record for counter sales to unregistered buyers.',
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();

  cachedId = created._id;
  return created;
}

/**
 * Resolve the customer for a sales document.
 *
 * `walkIn` on the request body wins over any customerId the client sent, so a
 * form that leaves its customer picker populated cannot quietly bill a real
 * customer for a counter sale.
 *
 * Returns { customer, walkIn, walkInName, walkInPhone } ready to spread onto
 * the document.
 */
async function resolveDocumentCustomer(body = {}, requireCustomer) {
  const isWalkIn = body.walkIn === true || body.walkIn === 'true' || body.isWalkIn === true;
  if (!isWalkIn) {
    return { customer: await requireCustomer(body.customerId), walkIn: false, walkInName: '', walkInPhone: '' };
  }
  return {
    customer: await getWalkInCustomer(),
    walkIn: true,
    walkInName: String(body.walkInName || '').trim(),
    walkInPhone: String(body.walkInPhone || '').trim(),
  };
}

module.exports = { getWalkInCustomer, resolveDocumentCustomer, WALK_IN_CODE };
