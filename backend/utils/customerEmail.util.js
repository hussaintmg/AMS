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
 * The email to print on a customer's document.
 *
 * A printed document shows the address the customer's record holds — that is
 * what the dealer has on file for them and what they expect to see on their
 * quotation. The only cleverness is preferring a *better* address when one
 * exists: a customer converted from a lead often gave their address there and
 * never again, and if the import had already created their record they carry
 * only its generated placeholder. In that case the lead's address is the real
 * one and wins.
 *
 * Note this is deliberately more generous than `realCustomerEmail`, which is
 * about whether an address can be *written to*. Printing and sending are
 * different questions: a document shows what is on file, while sending has to
 * refuse an address that goes nowhere.
 *
 * @param {object} customer  a populated Customer document (lean or hydrated)
 * @returns {Promise<string>} the address to print, '' if the record has none
 */
async function resolveCustomerEmail(customer) {
  const stored = String(customer?.email || '').trim();
  if (realCustomerEmail(stored)) return stored;

  const leadId = customer?.leadRef;
  if (leadId) {
    try {
      // Required lazily: this util is loaded by services that must not drag the
      // whole model graph in with them.
      const Lead = require('../models/Lead.model');
      const lead = await Lead.findById(leadId).select('email').lean();
      const fromLead = realCustomerEmail(lead?.email);
      if (fromLead) return fromLead;
    } catch { /* fall through to whatever the customer record holds */ }
  }
  return stored;
}

module.exports = {
  GENERATED_EMAIL_DOMAIN, isGeneratedEmail, realCustomerEmail, resolveCustomerEmail,
};
