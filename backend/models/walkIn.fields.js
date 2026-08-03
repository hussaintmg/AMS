/**
 * Counter sales for someone who is not a registered customer.
 *
 * Every sales document still points at a real Customer so ledgers, outstanding
 * balances and history keep working — for a walk-in that is the single shared
 * "Walk-in Customer" record (utils/walkInCustomer.js) rather than a new record
 * per sale, which would fill the customer list with one-off entries.
 *
 * `walkIn` marks the document, and the name/phone the operator typed are held
 * here so the printed document still names the actual buyer.
 *
 * Spread into a schema definition: `{ ...walkInFields, otherField: … }`.
 */
module.exports = {
  walkIn: { type: Boolean, default: false },
  walkInName: { type: String, trim: true, default: '' },
  walkInPhone: { type: String, trim: true, default: '' },
};
