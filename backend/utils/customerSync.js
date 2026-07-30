/**
 * Customer cross-model synchronization.
 *
 * Whenever a sales/service document (quotation, booking, sales order,
 * invoice, payment, appointment, job card) is created for a customer,
 * the customer's own document is updated with:
 *   - a salesHistory entry describing the transaction
 *   - salesSummary counters (documents, spent, paid, outstanding)
 *
 * These helpers never throw: a sync failure must not break the primary
 * operation. Failures are logged through the central logger.
 */
const Customer = require('../models/Customer.model');
const logger = require('./logger');

const COUNTER_BY_TYPE = {
  quotation: 'totalQuotations',
  booking: 'totalBookings',
  sales_order: 'totalOrders',
  invoice: 'totalInvoices',
  service_appointment: 'totalServiceVisits',
  job_card: 'totalServiceVisits',
};

const HISTORY_LIMIT = 300;

/**
 * Record an activity on the customer document.
 *
 * @param {Object} opts
 * @param {string|ObjectId} opts.customerId
 * @param {string} opts.docType        quotation | booking | sales_order | invoice | payment | service_appointment | job_card
 * @param {string|ObjectId} [opts.docId]
 * @param {string} [opts.number]       Human readable document number (QT-..., SO-..., INV-...)
 * @param {number} [opts.amount]       Document amount shown in history
 * @param {string} [opts.description]  Free text describing the transaction
 * @param {Date}   [opts.date]
 * @param {string|ObjectId} [opts.userId]
 * @param {boolean} [opts.countDocument=true]  Increment the per-type counter
 * @param {number} [opts.spentDelta=0]         Adds to salesSummary.totalSpent
 * @param {number} [opts.paidDelta=0]          Adds to salesSummary.totalPaid
 * @param {number} [opts.outstandingDelta=0]   Adds to salesSummary.outstandingBalance
 */
async function recordCustomerActivity({
  customerId,
  docType,
  docId = null,
  number = '',
  amount = 0,
  description = '',
  date = new Date(),
  userId = null,
  countDocument = true,
  spentDelta = 0,
  paidDelta = 0,
  outstandingDelta = 0,
  session = null,
}) {
  if (!customerId) return;
  try {
    const inc = {};
    const counterField = COUNTER_BY_TYPE[docType];
    if (countDocument && counterField) inc[`salesSummary.${counterField}`] = 1;
    if (spentDelta) inc['salesSummary.totalSpent'] = (inc['salesSummary.totalSpent'] || 0) + Number(spentDelta);
    if (paidDelta) inc['salesSummary.totalPaid'] = (inc['salesSummary.totalPaid'] || 0) + Number(paidDelta);
    if (outstandingDelta) inc['salesSummary.outstandingBalance'] = (inc['salesSummary.outstandingBalance'] || 0) + Number(outstandingDelta);

    const update = {
      $set: {
        'salesSummary.lastActivityAt': date,
        ...(number ? { 'salesSummary.lastDocumentNumber': number } : {}),
      },
      $push: {
        salesHistory: {
          $each: [{
            docType,
            docId,
            number,
            amount: Number(amount) || 0,
            description,
            date,
            createdBy: userId,
          }],
          $slice: -HISTORY_LIMIT,
        },
      },
    };
    if (Object.keys(inc).length) update.$inc = inc;

    await Customer.updateOne({ _id: customerId }, update, session ? { session } : {});
  } catch (error) {
    logger.error(`Customer sync failed for customer ${customerId} (${docType} ${number}):`, error);
  }
}

module.exports = { recordCustomerActivity };
