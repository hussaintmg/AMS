/**
 * Paid vs credit, on every invoice model.
 *
 * A "paid" invoice is settled at the counter; a "credit" invoice is issued
 * unpaid and the money arrives later through Record Payment. Nothing else
 * changes — the same PDF, the same email, the same payment ledger — so the
 * fields live in one fragment that Invoice, PartInvoice and CustomInvoice all
 * spread in, exactly as they do with the walk-in fields.
 *
 * `creditStatus` follows the numbers rather than being set by hand (see
 * `applyCreditStatus`), so a fully paid credit invoice can never sit in the
 * "open" list and an unpaid one past its date is "overdue" without a job
 * running at midnight.
 */
const PAYMENT_TERMS = ['paid', 'credit'];
const CREDIT_STATUSES = ['open', 'partial', 'settled', 'overdue'];

const paymentTermFields = {
  paymentTerm: { type: String, enum: PAYMENT_TERMS, default: 'paid' },
  creditDueDate: { type: Date, default: null },
  creditStatus: { type: String, enum: CREDIT_STATUSES, default: 'open' },
};

/**
 * Recompute `creditStatus` from balance and due date. Call from a pre-save
 * hook and after any payment is recorded. Cancelled invoices are left alone.
 */
const applyCreditStatus = (doc, now = new Date()) => {
  if (!doc) return;
  if (doc.paymentTerm !== 'credit') { doc.creditStatus = 'settled'; return; }
  const total = Number(doc.totalAmount) || 0;
  const balance = Number(doc.balanceAmount ?? (total - (Number(doc.paidAmount) || 0))) || 0;
  if (balance <= 0.009) { doc.creditStatus = 'settled'; return; }
  const overdue = doc.creditDueDate && new Date(doc.creditDueDate) < now;
  if (overdue) { doc.creditStatus = 'overdue'; return; }
  doc.creditStatus = balance < total ? 'partial' : 'open';
};

/** Attach the pre-save hook to a schema that spreads `paymentTermFields`. */
const installCreditStatus = (schema) => {
  // Synchronous hook (Mongoose 8 passes no `next` to a non-async pre hook).
  schema.pre('save', function creditStatusHook() {
    try { applyCreditStatus(this); } catch (error) { /* status is derived; never block a save on it */ }
  });
};

/**
 * Aggregate the card figures for an invoice collection under a filter:
 * total / paid / credit / outstanding / overdue, with counts and amounts.
 */
async function invoiceSummary(Model, filter = {}) {
  const now = new Date();
  const rows = await Model.aggregate([
    { $match: { ...filter, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
        paidCount: { $sum: { $cond: [{ $ne: ['$paymentTerm', 'credit'] }, 1, 0] } },
        paidAmount: { $sum: { $cond: [{ $ne: ['$paymentTerm', 'credit'] }, { $ifNull: ['$totalAmount', 0] }, 0] } },
        creditCount: { $sum: { $cond: [{ $eq: ['$paymentTerm', 'credit'] }, 1, 0] } },
        creditAmount: { $sum: { $cond: [{ $eq: ['$paymentTerm', 'credit'] }, { $ifNull: ['$totalAmount', 0] }, 0] } },
        creditOutstanding: { $sum: { $cond: [{ $eq: ['$paymentTerm', 'credit'] }, { $ifNull: ['$balanceAmount', 0] }, 0] } },
        overdueCount: {
          $sum: {
            $cond: [{
              $and: [
                { $eq: ['$paymentTerm', 'credit'] },
                { $gt: [{ $ifNull: ['$balanceAmount', 0] }, 0] },
                { $lt: ['$creditDueDate', now] },
              ],
            }, 1, 0],
          },
        },
        overdueAmount: {
          $sum: {
            $cond: [{
              $and: [
                { $eq: ['$paymentTerm', 'credit'] },
                { $gt: [{ $ifNull: ['$balanceAmount', 0] }, 0] },
                { $lt: ['$creditDueDate', now] },
              ],
            }, { $ifNull: ['$balanceAmount', 0] }, 0],
          },
        },
        collectedAmount: { $sum: { $ifNull: ['$paidAmount', 0] } },
      },
    },
  ]);
  const row = rows[0] || {};
  return {
    total: row.total || 0,
    totalAmount: row.totalAmount || 0,
    paidCount: row.paidCount || 0,
    paidAmount: row.paidAmount || 0,
    creditCount: row.creditCount || 0,
    creditAmount: row.creditAmount || 0,
    creditOutstanding: row.creditOutstanding || 0,
    overdueCount: row.overdueCount || 0,
    overdueAmount: row.overdueAmount || 0,
    collectedAmount: row.collectedAmount || 0,
  };
}

module.exports = { PAYMENT_TERMS, CREDIT_STATUSES, paymentTermFields, applyCreditStatus, installCreditStatus, invoiceSummary };
