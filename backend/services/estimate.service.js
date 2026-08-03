/**
 * The customer-facing Estimate for a quotation: a PDF to download and an email
 * to send, both listing every product on the quotation.
 *
 * If an active PDF template is assigned to the `quotation` usage it is used, so
 * the dealer's own branding wins. Otherwise the built-in layout below renders —
 * an estimate must never fail just because nobody has designed a template yet.
 */
const { PdfUsage } = require('../models');
const { renderPdf, renderHtmlPdf } = require('./pdfRenderer.service');
const { findDocument, buildDataBag, companyName, buildItemRows, buildItemsTable } = require('./pdfData.service');
const { resolveTokens } = require('./pdfFormat.cjs');
const { AppError } = require('../middleware/errorHandler');

const escape = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `PKR ${number.toLocaleString('en-PK')}` : 'PKR 0';
};
const day = (value) => (value ? new Date(value).toLocaleDateString('en-GB') : '');

/**
 * A parts quotation estimates from the same template as a vehicle one, so the
 * lookup covers both collections; the id says which it is.
 */
async function loadQuotation(id) {
  const found = await findDocument('quotation', id, [
    { path: 'customer', select: 'firstName lastName companyName email phone address city customerCode' },
    { path: 'createdBy', select: 'firstName lastName fullName email phone' },
  ]);
  if (!found) throw new AppError('Quotation not found', 404);
  return found.record;
}

/** The built-in estimate layout — used when no template is assigned. */
function defaultEstimateHtml(quotation, { company = '' } = {}) {
  const customer = quotation.customer || {};
  const customerLabel = customer.companyName
    || [customer.firstName, customer.lastName].filter(Boolean).join(' ')
    || 'Customer';
  const rows = buildItemRows(quotation);
  const preparer = quotation.createdBy || {};
  const preparerName = preparer.fullName || [preparer.firstName, preparer.lastName].filter(Boolean).join(' ');

  const itemRows = rows.map((row) => `<tr>
    <td>${row.number}</td>
    <td><strong>${escape(row.description)}</strong>${row.code ? `<br><span class="muted">${escape(row.code)}</span>` : ''}</td>
    <td class="center">${escape(row.type)}</td>
    <td class="right">${row.quantity}</td>
    <td class="right">${row.unitPriceText}</td>
    <td class="right">${row.totalPriceText}</td>
  </tr>`).join('');

  const line = (label, value, strong = false) => `<tr><td class="right label">${label}</td><td class="right ${strong ? 'grand' : ''}">${value}</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Estimate ${escape(quotation.quotationNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 34px 38px; font-size: 12px; }
  h1 { font-size: 26px; margin: 0 0 2px; letter-spacing: 0.5px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
  .company { font-size: 16px; font-weight: bold; }
  .muted { color: #64748b; font-size: 11px; }
  .meta { text-align: right; font-size: 11px; line-height: 1.7; }
  .panels { display: flex; gap: 18px; margin-bottom: 18px; }
  .panel { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 11px 13px; }
  .panel h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; }
  .items th { background: #0f172a; color: #fff; padding: 8px; font-size: 11px; text-align: left; }
  .items td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .right { text-align: right; } .center { text-align: center; }
  .totals { margin-top: 14px; margin-left: auto; width: 300px; }
  .totals td { padding: 5px 8px; }
  .totals .label { color: #475569; }
  .totals .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #0f172a; }
  .terms { margin-top: 22px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #475569; white-space: pre-wrap; }
  .foot { margin-top: 26px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
</style></head><body>
<div class="head">
  <div>
    <h1>ESTIMATE</h1>
    <div class="company">${escape(company)}</div>
  </div>
  <div class="meta">
    <div><strong>${escape(quotation.quotationNumber)}</strong></div>
    <div>Date: ${day(quotation.createdAt)}</div>
    ${quotation.validUntil ? `<div>Valid until: ${day(quotation.validUntil)}</div>` : ''}
    <div>Status: ${escape(quotation.approvalStatus || quotation.status || '')}</div>
  </div>
</div>

<div class="panels">
  <div class="panel">
    <h3>Prepared for</h3>
    <div><strong>${escape(customerLabel)}</strong></div>
    ${customer.customerCode ? `<div class="muted">${escape(customer.customerCode)}</div>` : ''}
    ${customer.phone ? `<div>${escape(customer.phone)}</div>` : ''}
    ${customer.email ? `<div>${escape(customer.email)}</div>` : ''}
    ${customer.address ? `<div class="muted">${escape(customer.address)}${customer.city ? `, ${escape(customer.city)}` : ''}</div>` : ''}
  </div>
  <div class="panel">
    <h3>Prepared by</h3>
    <div><strong>${escape(preparerName || company)}</strong></div>
    ${preparer.email ? `<div>${escape(preparer.email)}</div>` : ''}
    ${preparer.phone ? `<div>${escape(preparer.phone)}</div>` : ''}
    <div class="muted">${rows.length} product${rows.length === 1 ? '' : 's'} quoted</div>
  </div>
</div>

<table class="items">
  <thead><tr>
    <th style="width:32px">#</th><th>Description</th><th class="center" style="width:70px">Type</th>
    <th class="right" style="width:50px">Qty</th><th class="right" style="width:110px">Unit Price</th>
    <th class="right" style="width:120px">Amount</th>
  </tr></thead>
  <tbody>${itemRows || '<tr><td colspan="6" class="center muted">No products on this quotation</td></tr>'}</tbody>
</table>

<table class="totals">
  ${line('Subtotal', money(quotation.vehiclePrice ?? quotation.subtotal))}
  ${Number(quotation.discountAmount) ? line('Discount', `- ${money(quotation.discountAmount)}`) : ''}
  ${Number(quotation.taxAmount) ? line('Tax', money(quotation.taxAmount)) : ''}
  ${Number(quotation.additionalCharges) ? line('Additional charges', money(quotation.additionalCharges)) : ''}
  ${line('Total', money(quotation.totalAmount), true)}
</table>

${quotation.termsAndConditions ? `<div class="terms"><strong>Terms &amp; Conditions</strong>\n${escape(quotation.termsAndConditions)}</div>` : ''}
${quotation.notes ? `<div class="terms"><strong>Notes</strong>\n${escape(quotation.notes)}</div>` : ''}

<div class="foot">
  <div>This estimate is not an invoice. Prices are valid until the date shown above.</div>
  <div>${escape(quotation.quotationNumber)}</div>
</div>
</body></html>`;
}

/** Build the estimate PDF for a quotation. Returns { buffer, fileName, quotation }. */
async function buildEstimatePdf(quotationId) {
  const quotation = await loadQuotation(quotationId);
  const company = await companyName();

  const usage = await PdfUsage.findOne({ documentType: 'quotation' }).populate('template').lean();
  const template = usage?.template && usage.template.status === 'active' ? usage.template : null;

  let buffer;
  if (template) {
    const data = buildDataBag('quotation', quotation, { companyName: company });
    buffer = template.mode === 'html' && template.html
      ? await renderHtmlPdf(template.html, template.css || '', data, template.designData?.pages?.[0]?.config || {})
      : await renderPdf(template.designData?.pages || [], data, quotation.quotationNumber);
  } else {
    buffer = await renderHtmlPdf(defaultEstimateHtml(quotation, { company }), '', {}, { width: 794, height: 1123 });
  }

  return { buffer, fileName: `Estimate-${quotation.quotationNumber}.pdf`, quotation, usedTemplate: Boolean(template) };
}

/**
 * Context for the estimate email. Exposes the same `items` array the PDF uses,
 * so an email template can loop with `{{#each items}}` or drop in
 * `{{quotation.itemsTable}}` and get every product.
 */
function buildEstimateEmailContext(quotation, { company = '' } = {}) {
  const customer = quotation.customer || {};
  const rows = buildItemRows(quotation);
  return {
    company: { name: company },
    customer: {
      ...customer,
      fullName: customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(' '),
      name: customer.companyName || [customer.firstName, customer.lastName].filter(Boolean).join(' '),
    },
    items: rows,
    quotation: {
      number: quotation.quotationNumber,
      date: quotation.createdAt,
      validUntil: quotation.validUntil,
      status: quotation.status,
      approvalStatus: quotation.approvalStatus,
      itemCount: rows.length,
      subtotal: quotation.vehiclePrice ?? quotation.subtotal ?? 0,
      discountAmount: quotation.discountAmount || 0,
      taxAmount: quotation.taxAmount || 0,
      additionalCharges: quotation.additionalCharges || 0,
      amount: quotation.totalAmount || 0,
      totalAmount: quotation.totalAmount || 0,
      totalAmountText: money(quotation.totalAmount),
      itemsTable: buildItemsTable(rows),
      itemList: rows.map((row) => `${row.description} x${row.quantity}`).join(', '),
      termsAndConditions: quotation.termsAndConditions || '',
      notes: quotation.notes || '',
    },
  };
}

/** Plain HTML body used when no email template is assigned to the usage. */
function defaultEstimateEmailHtml(context) {
  const { quotation, customer, company } = context;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px">
  <h2 style="margin:0 0 4px">Estimate ${escape(quotation.number)}</h2>
  <p style="color:#475569;margin:0 0 16px">${escape(company.name)}</p>
  <p>Dear ${escape(customer.fullName || 'Customer')},</p>
  <p>Please find your estimate below${quotation.validUntil ? `, valid until <strong>${day(quotation.validUntil)}</strong>` : ''}. A PDF copy is attached.</p>
  ${quotation.itemsTable}
  <table style="margin-top:14px;margin-left:auto">
    <tr><td style="padding:4px 10px;color:#475569">Subtotal</td><td style="padding:4px 10px;text-align:right">${money(quotation.subtotal)}</td></tr>
    ${quotation.discountAmount ? `<tr><td style="padding:4px 10px;color:#475569">Discount</td><td style="padding:4px 10px;text-align:right">- ${money(quotation.discountAmount)}</td></tr>` : ''}
    ${quotation.taxAmount ? `<tr><td style="padding:4px 10px;color:#475569">Tax</td><td style="padding:4px 10px;text-align:right">${money(quotation.taxAmount)}</td></tr>` : ''}
    <tr><td style="padding:8px 10px;font-weight:bold;border-top:2px solid #0f172a">Total</td><td style="padding:8px 10px;text-align:right;font-weight:bold;border-top:2px solid #0f172a">${money(quotation.totalAmount)}</td></tr>
  </table>
  ${quotation.termsAndConditions ? `<p style="margin-top:18px;color:#475569;white-space:pre-wrap"><strong>Terms &amp; Conditions</strong><br>${escape(quotation.termsAndConditions)}</p>` : ''}
  <p style="margin-top:18px;color:#64748b;font-size:12px">This estimate is not an invoice.</p>
</div>`;
}

module.exports = {
  loadQuotation,
  buildEstimatePdf,
  buildEstimateEmailContext,
  defaultEstimateHtml,
  defaultEstimateEmailHtml,
};
