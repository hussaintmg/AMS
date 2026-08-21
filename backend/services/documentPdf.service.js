/**
 * One sales document, rendered to a PDF buffer.
 *
 * The download route already did this inline; e-mail needs exactly the same
 * bytes on the message, so the steps live here and both callers share them.
 * Vehicle, parts and custom documents all resolve through
 * services/pdfData.service.js, so a custom quotation attaches just as readily
 * as a vehicle one.
 */
const { TYPES, findDocument, buildDataBag, companyInfo } = require('./pdfData.service');
const { renderDocumentPdf } = require('./pdfKitRenderer.service');
const { resolveCustomerEmail } = require('../utils/customerEmail.util');

/** The document and its resolved data bag, or null when nothing matches. */
async function loadDocumentData(type, id) {
  const config = TYPES[type];
  if (!config) return null;
  const found = await findDocument(type, id, [
    { path: 'customer' },
    { path: 'createdBy', select: 'firstName lastName fullName email phone designation employeeId' },
    { path: 'vehicle' },
  ]);
  if (!found) return null;
  const record = found.record;
  const company = await companyInfo();
  const customerEmail = record.walkIn ? '' : await resolveCustomerEmail(record.customer);
  return {
    record,
    isCustom: found.isCustom === true,
    name: record[config.number] || String(id),
    data: buildDataBag(type, record, { companyName: company.name, company, customerEmail, isCustom: found.isCustom === true }),
  };
}

/**
 * @returns {Promise<{buffer: Buffer, fileName: string, record: object}|null>}
 */
async function buildDocumentPdf(type, id) {
  const loaded = await loadDocumentData(type, id);
  if (!loaded) return null;
  return {
    buffer: await renderDocumentPdf(type, loaded.data),
    fileName: `${loaded.name}.pdf`,
    record: loaded.record,
    data: loaded.data,
  };
}

module.exports = { loadDocumentData, buildDocumentPdf };
