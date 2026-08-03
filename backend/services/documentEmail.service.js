/**
 * Sending a sales document to its customer.
 *
 * Vehicle and parts documents deliberately share one email template each: a
 * parts quotation goes out on the same `quotation_customer` template as a
 * vehicle quotation, so there is one template to design and keep in step. The
 * only difference is which collection the document was read from, which the
 * caller passes in.
 *
 * A walk-in sale is booked against the shared walk-in customer record, which
 * has no email of its own — those documents simply cannot be emailed, and say
 * so rather than sending to the wrong address.
 */
const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const { sendTemplateEmail } = require('./emailSender.service');

const sanitizeId = (id) => (mongoose.Types.ObjectId.isValid(id) ? id : null);

/**
 * @param {object}   opts
 * @param {Model}    opts.Model         collection the document lives in
 * @param {string}   opts.id
 * @param {string}   opts.usageKey      email usage, e.g. 'quotation_customer'
 * @param {string}   opts.documentKey   name the template refers to it by
 * @param {Function} opts.buildDocument maps the record to template context
 * @param {string}   opts.userId
 */
async function sendCustomerDocumentEmail({ Model, id, usageKey, documentKey, buildDocument, userId }) {
  const document = await Model.findById(sanitizeId(id))
    .populate('customer', 'firstName lastName companyName email phone customerCode')
    .lean();
  if (!document) throw new AppError('Document not found', 404);
  if (document.walkIn) {
    throw new AppError('This is a walk-in sale — there is no customer email address to send to', 400);
  }
  if (!document.customer?.email) throw new AppError('The selected customer does not have an email address', 400);

  const result = await sendTemplateEmail({
    usageKey,
    to: document.customer.email,
    sentBy: userId,
    context: { customer: document.customer, [documentKey]: buildDocument(document) },
  });
  if (result.status !== 'sent') throw new AppError(result.errorMessage || 'Email could not be sent', 502);
  return { document, recipient: document.customer.email };
}

module.exports = { sendCustomerDocumentEmail };
