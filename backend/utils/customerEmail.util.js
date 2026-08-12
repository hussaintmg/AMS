/**
 * Whether a customer record actually has an email address you could write to.
 *
 * Customers imported from the Dealer Pro paperwork rarely came with one, but
 * the schema needs every customer to be distinguishable, so the import invents
 * `<name>@import.amserp.local` for them (services/imports/customerResolver.js).
 * Those addresses are bookkeeping, not contact details: nothing is delivered to
 * that domain and it exists only inside this system.
 *
 * Treating them as real is how a printed invoice ended up with a made-up
 * address in the customer's Email field, and how "email the invoice" reported
 * success for a message nobody could ever receive. Everything customer-facing
 * asks here first.
 */
const GENERATED_EMAIL_DOMAIN = 'import.amserp.local';

/** True for an address the import invented rather than one a customer gave. */
const isGeneratedEmail = (value) =>
  String(value || '').trim().toLowerCase().endsWith(`@${GENERATED_EMAIL_DOMAIN}`);

/**
 * The customer's real email, or '' when there is not one worth showing or
 * sending to.
 */
const realCustomerEmail = (value) => {
  const email = String(value == null ? '' : value).trim();
  if (!email || isGeneratedEmail(email)) return '';
  return email;
};

/**
 * The best real email this system holds for a customer.
 *
 * A customer converted from a lead often gave their address on the lead and
 * never again — and if they were also seen by the import first, their customer
 * record carries only the invented placeholder, so the address they did give
 * never reaches a document. This looks past the placeholder to the lead the
 * customer was converted from.
 *
 * Returns '' when there is genuinely nothing on file, which is the honest
 * answer: a document should say nothing rather than invent an address.
 *
 * @param {object} customer  a populated Customer document (lean or hydrated)
 * @returns {Promise<string>}
 */
async function resolveCustomerEmail(customer) {
  const own = realCustomerEmail(customer?.email);
  if (own) return own;

  const leadId = customer?.leadRef;
  if (!leadId) return '';
  try {
    // Required lazily: this util is loaded by services that must not drag the
    // whole model graph in with them.
    const Lead = require('../models/Lead.model');
    const lead = await Lead.findById(leadId).select('email').lean();
    return realCustomerEmail(lead?.email);
  } catch {
    return '';
  }
}

module.exports = {
  GENERATED_EMAIL_DOMAIN, isGeneratedEmail, realCustomerEmail, resolveCustomerEmail,
};
