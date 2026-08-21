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
const logger = require('../utils/logger');
const { sendTemplateEmail } = require('./emailSender.service');
const { realCustomerEmail } = require('../utils/customerEmail.util');
const { buildDocumentPdf } = require('./documentPdf.service');

const sanitizeId = (id) => (mongoose.Types.ObjectId.isValid(id) ? id : null);

/**
 * @param {object}   opts
 * @param {Model}    opts.Model         collection the document lives in
 * @param {string}   opts.id
 * @param {string}   opts.usageKey      email usage, e.g. 'quotation_customer'
 * @param {string}   opts.documentKey   name the template refers to it by
 * @param {Function} opts.buildDocument maps the record to template context
 * @param {string}   opts.userId
 * @param {string}   [opts.to]         an address typed by the sender, which wins
 *                                     over the customer's own
 * @param {string}   [opts.pdfType]    'quotation' | 'booking' | 'order' | 'invoice';
 *                                     when given, that PDF is attached
 */
async function sendCustomerDocumentEmail({ Model, id, usageKey, documentKey, buildDocument, userId, to = null, pdfType = null }) {
  const document = await Model.findById(sanitizeId(id))
    .populate('customer', 'firstName lastName companyName email phone customerCode')
    .lean();
  if (!document) throw new AppError('Document not found', 404);
  // A typed address is a deliberate instruction and beats everything else — it
  // is also the only way to email a walk-in sale or a customer whose record
  // carries the placeholder address the import invented for them.
  const typed = String(to || '').trim();
  if (!typed && document.walkIn) {
    throw new AppError('This is a walk-in sale — type the address to send it to', 400);
  }
  // An imported customer without a source email carries an invented one. Sending
  // there reports success for a message that goes nowhere, so it is treated as
  // the missing address it really is.
  const recipient = typed || realCustomerEmail(document.customer?.email);
  if (!recipient) {
    throw new AppError(
      'This customer has no email address — add one on their record, or type an address to send to',
      400,
    );
  }

  // The document itself goes on the message. A covering letter with no
  // attachment is what the client was getting: the PDF was never built, and
  // even a built one was dropped before it reached nodemailer.
  const attachments = [];
  if (pdfType) {
    try {
      const pdf = await buildDocumentPdf(pdfType, id);
      if (pdf) attachments.push({ filename: pdf.fileName, content: pdf.buffer, contentType: 'application/pdf' });
    } catch (error) {
      // A template or rendering problem must not swallow the message itself.
      logger.error(`[DocumentEmail] Could not attach the ${pdfType} PDF for ${id}: ${error.message}`);
    }
  }

  const result = await sendTemplateEmail({
    usageKey,
    to: recipient,
    sentBy: userId,
    attachments,
    context: {
      customer: { ...document.customer, email: recipient },
      [documentKey]: buildDocument(document),
    },
  });
  if (result.status !== 'sent') throw new AppError(result.errorMessage || 'Email could not be sent', 502);
  return { document, recipient, attached: attachments.length > 0 };
}

module.exports = { sendCustomerDocumentEmail };
