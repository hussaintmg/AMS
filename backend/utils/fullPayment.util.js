/**
 * An invoice is never raised against a balance.
 *
 * The rule the business runs on: a price is negotiated on the quotation, and it
 * can be adjusted there as often as it needs to be. The moment an invoice
 * exists, the money is in — so an invoice may only be created when the amount
 * collected covers its total. Nothing here is a credit sale, and no invoice
 * leaves the counter carrying a balance for someone to chase later.
 *
 * Handing over more than the total stays legal: the surplus is change, which
 * the callers already work out and print on the receipt.
 *
 * This is deliberately a check the request paths make rather than something
 * buried in the invoice factory, because the Dealer Pro import replays years of
 * historical documents — many of them genuinely part-paid — and re-writing that
 * history is not what the rule is for.
 */
const { AppError } = require('../middleware/errorHandler');

const round2 = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;

/** Money the customer would still owe. Tolerates float dust from tax splits. */
const shortfallOf = (totalAmount, paidAmount) => {
  const short = round2(round2(totalAmount) - round2(paidAmount));
  return short > 0.009 ? short : 0;
};

/**
 * Throw unless `paidAmount` covers `totalAmount`.
 *
 * @param {number} totalAmount what the document comes to
 * @param {number} paidAmount  what the customer has actually handed over
 * @param {object} [options]
 * @param {string} [options.document] what is being raised, for the message
 * @param {string} [options.currency]
 */
function assertFullPayment(totalAmount, paidAmount, { document = 'invoice', currency = 'PKR' } = {}) {
  const total = round2(totalAmount);
  const paid = round2(paidAmount);
  const shortfall = shortfallOf(total, paid);
  if (!shortfall) return { total, paid, shortfall: 0 };

  const money = (value) => `${currency} ${Number(value).toLocaleString('en-PK')}`;
  throw new AppError(
    `An ${document} can only be created once it is paid in full. `
    + `Total ${money(total)}, received ${money(paid)} — ${money(shortfall)} still outstanding. `
    + 'Adjust the price on the quotation if the customer is paying less.',
    400,
  );
}

module.exports = { assertFullPayment, shortfallOf, round2 };
