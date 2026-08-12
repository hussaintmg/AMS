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

module.exports = { GENERATED_EMAIL_DOMAIN, isGeneratedEmail, realCustomerEmail };
